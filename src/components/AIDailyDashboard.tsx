'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Check, RefreshCw, Zap, Target } from 'lucide-react';
import { DailyTask, UserDebtStats, generateAIDailyPlanAction } from '@/actions/dailyPlan';
import { useStore } from '@/lib/store';

interface AIDailyDashboardProps {
  className?: string;
  onStartTask?: (taskType: string) => void;
}

export function AIDailyDashboard({ className, onStartTask }: AIDailyDashboardProps) {
  const { decks, appLanguage } = useStore();
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [extraTasks, setExtraTasks] = useState<DailyTask[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [sessionLearnedCount, setSessionLearnedCount] = useState<number>(0);

  // Today's date string (e.g. "2026-10-11")
  const todayStr = useMemo(() => new Date().toLocaleDateString('en-CA'), []);

  // Compute live debts from the user's decks
  const debtStats: UserDebtStats = useMemo(() => {
    const now = Date.now();
    let dueCount = 0;
    let weakCount = 0;
    let newCount = 0;
    let totalCards = 0;

    decks.forEach((deck) => {
      if ((deck.language || 'DE') === appLanguage) {
        deck.cards.forEach((card: any) => {
          totalCards++;
          if (card.isArchived && card.nextReviewDate && card.nextReviewDate <= now) {
            dueCount++;
          } else if (!card.isArchived && (card.masteryLevel || 0) < 2) {
            weakCount++;
          }
          if (!card.isArchived && (!card.repetitions || card.repetitions === 0)) {
            newCount++;
          }
        });
      }
    });

    // Read today's activity from localStorage
    let todayCount = 0;
    try {
      const stored = localStorage.getItem(`daily_activity_${appLanguage}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        const raw = parsed[todayStr];
        todayCount = typeof raw === 'number' ? raw : (raw?.total || parseInt(raw) || 0);
      }
    } catch {}

    return {
      dueReviewsCount: dueCount,
      weakWordsCount: weakCount,
      newWordsCount: newCount,
      totalLearnedToday: todayCount,
      totalCards,
      appLanguage,
    };
  }, [decks, appLanguage, todayStr]);

  // Load or fetch daily plan
  const loadPlan = useCallback(async (forceRefresh = false) => {
    const cacheKey = `ai_daily_plan_${appLanguage}_${todayStr}`;

    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setTasks(parsed);
            setIsLoading(false);
            return;
          }
        }
      } catch (e) {
        console.warn('Cache read error:', e);
      }
    }

    if (forceRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      // Call Server Action
      const generated = await generateAIDailyPlanAction(debtStats);
      setTasks(generated);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(generated));
      } catch {}
    } catch (err) {
      console.error('Error fetching AI plan:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [appLanguage, todayStr, debtStats]);

  // Initial load
  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  // Real-time tracker: Listen to storage-update event (fired whenever a card is completed)
  useEffect(() => {
    const handleStorageUpdate = () => {
      try {
        const stored = localStorage.getItem(`daily_activity_${appLanguage}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          const raw = parsed[todayStr];
          const count = typeof raw === 'number' ? raw : (raw?.total || parseInt(raw) || 0);
          setSessionLearnedCount(count);
        }
      } catch {}
    };

    handleStorageUpdate();
    window.addEventListener('storage-update', handleStorageUpdate);
    return () => window.removeEventListener('storage-update', handleStorageUpdate);
  }, [appLanguage, todayStr]);

  // Update tasks' `current` and `is_completed` based on today's learning progress
  useEffect(() => {
    if (tasks.length === 0) return;

    setTasks((prevTasks) => {
      let remainingLearned = sessionLearnedCount;

      const updated = prevTasks.map((task) => {
        // Distribute learned cards across tasks
        const allocated = Math.min(task.target, remainingLearned);
        remainingLearned = Math.max(0, remainingLearned - allocated);
        const isDone = allocated >= task.target;

        return {
          ...task,
          current: allocated,
          is_completed: isDone,
        };
      });

      return updated;
    });

    // Overachiever Mode:
    // If all tasks are completed and user keeps learning beyond total target
    const totalTarget = tasks.reduce((acc, t) => acc + t.target, 0);
    const extraLearned = Math.max(0, sessionLearnedCount - totalTarget);

    if (totalTarget > 0 && extraLearned > 0) {
      const extraCount = Math.floor(extraLearned / 5); // 1 extra badge per 5 bonus words
      const newExtraList: DailyTask[] = [];

      for (let i = 1; i <= Math.max(1, extraCount); i++) {
        const bonusTarget = i * 5;
        if (extraLearned >= bonusTarget - 4) {
          newExtraList.push({
            id: `extra_task_${i}`,
            title: `Сверх плана: +${bonusTarget} карточек`,
            target: bonusTarget,
            current: Math.min(extraLearned, bonusTarget),
            type: 'extra',
            is_completed: extraLearned >= bonusTarget,
          });
        }
      }

      setExtraTasks(newExtraList);
    } else {
      setExtraTasks([]);
    }
  }, [sessionLearnedCount, tasks.length]);

  // Save progress changes to localStorage
  useEffect(() => {
    if (tasks.length > 0) {
      const cacheKey = `ai_daily_plan_${appLanguage}_${todayStr}`;
      try {
        localStorage.setItem(cacheKey, JSON.stringify(tasks));
      } catch {}
    }
  }, [tasks, appLanguage, todayStr]);

  // Stats calculation for the Apple-style header
  const totalCompleted = tasks.filter((t) => t.is_completed).length;
  const isAllPlannedCompleted = tasks.length > 0 && totalCompleted === tasks.length;
  const progressPercent = tasks.length > 0 ? Math.round((totalCompleted / tasks.length) * 100) : 0;

  return (
    <div
      className={`w-full bg-[#1C1C1E] text-white rounded-3xl p-5 md:p-6 border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.36)] backdrop-blur-xl relative overflow-hidden transition-all ${className || ''}`}
    >
      {/* Background Ambient Glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-emerald-400 border border-white/5 shadow-inner">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold tracking-tight text-white leading-none">
                Умный план на день
              </h3>
              <span className="text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-[#30D158] border border-emerald-500/20">
                AI Coach
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              {isAllPlannedCompleted ? (
                <span className="text-[#30D158] font-medium flex items-center gap-1">
                  План выполнен! Включен режим Overachiever ⚡️
                </span>
              ) : (
                `Выполнено ${totalCompleted} из ${tasks.length} целей`
              )}
            </p>
          </div>
        </div>

        <button
          onClick={() => loadPlan(true)}
          disabled={isRefreshing || isLoading}
          className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 active:scale-95 transition-all border border-white/5 cursor-pointer disabled:opacity-50"
          title="Сгенерировать новый план"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
        </button>
      </div>

      {/* Progress Bar (Apple HIG Style) */}
      <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden mb-5">
        <motion.div
          className="h-full bg-[#30D158] rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {/* Tasks List */}
      {isLoading ? (
        <div className="py-8 flex flex-col items-center justify-center gap-2.5 text-zinc-500">
          <RefreshCw className="w-5 h-5 animate-spin text-zinc-400" />
          <span className="text-xs font-medium tracking-wide">Формируем персональный план...</span>
        </div>
      ) : (
        <div className="divide-y divide-white/10">
          {tasks.map((task) => (
            <TaskItem key={task.id} task={task} onAction={onStartTask} />
          ))}

          {/* Overachiever Extra Tasks with Smooth Animation */}
          <AnimatePresence>
            {extraTasks.map((extraTask) => (
              <motion.div
                key={extraTask.id}
                initial={{ opacity: 0, height: 0, y: -8 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                <TaskItem task={extraTask} isExtra={true} onAction={onStartTask} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

interface TaskItemProps {
  task: DailyTask;
  isExtra?: boolean;
  onAction?: (type: string) => void;
}

function TaskItem({ task, isExtra, onAction }: TaskItemProps) {
  const isDone = task.is_completed;

  return (
    <div
      onClick={() => onAction && onAction(task.type)}
      className="py-3.5 first:pt-1 last:pb-1 flex items-center justify-between gap-3 group select-none transition-colors"
    >
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        {/* iOS-Style Circular Checkbox */}
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 shrink-0 ${
            isDone
              ? 'bg-[#30D158] border border-[#30D158] text-black shadow-[0_0_12px_rgba(48,209,88,0.4)]'
              : 'border border-white/20 bg-transparent group-hover:border-white/40'
          }`}
        >
          <AnimatePresence>
            {isDone && (
              <motion.div
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 28 }}
              >
                <Check className="w-3.5 h-3.5 stroke-[3] text-black" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Task Title & Details */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm tracking-tight transition-all duration-300 truncate ${
                isDone
                  ? 'text-white/50 line-through decoration-white/20'
                  : 'text-white/90 font-medium'
              }`}
            >
              {task.title}
            </span>

            {isExtra && (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0 flex items-center gap-1">
                <Zap className="w-2.5 h-2.5 fill-current" />
                Extra
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Progress Counter (e.g. 10 / 10) */}
      <div className="flex items-center gap-2 shrink-0">
        <span
          className={`text-xs tabular-nums tracking-wider font-medium ${
            isDone ? 'text-[#30D158]' : 'text-zinc-400'
          }`}
        >
          {task.current} / {task.target}
        </span>
      </div>
    </div>
  );
}
