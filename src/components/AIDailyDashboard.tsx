'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Check, RefreshCw, Zap } from 'lucide-react';
import { DailyTask, UserDebtStats, generateAIDailyPlanAction } from '@/actions/dailyPlan';

export interface AIDailyDashboardProps {
  decks?: any[];
  isDataLoaded?: boolean;
  appLanguage?: 'DE' | 'EN';
  className?: string;
  onStartTask?: (taskType: string) => void;
}

export function AIDailyDashboard({
  decks = [],
  isDataLoaded = true,
  appLanguage = 'DE',
  className,
  onStartTask,
}: AIDailyDashboardProps) {
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [extraTasks, setExtraTasks] = useState<DailyTask[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [sessionLearnedCount, setSessionLearnedCount] = useState<number>(0);

  const todayStr = useMemo(() => new Date().toLocaleDateString('en-CA'), []);

  // Calculate live user debts from loaded decks
  const debtStats: UserDebtStats = useMemo(() => {
    if (!isDataLoaded) {
      return {
        dueReviewsCount: 0,
        weakWordsCount: 0,
        newWordsCount: 0,
        totalLearnedToday: 0,
        totalCards: 0,
        appLanguage,
      };
    }

    const now = Date.now();
    let dueCount = 0;
    let weakCount = 0;
    let newCount = 0;
    let totalCards = 0;

    decks.forEach((deck) => {
      if ((deck.language || 'DE') === appLanguage && Array.isArray(deck.cards)) {
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
  }, [decks, isDataLoaded, appLanguage, todayStr]);

  // Read current today's progress from localStorage
  const readTodayLearnedCount = useCallback(() => {
    try {
      const stored = localStorage.getItem(`daily_activity_${appLanguage}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        const raw = parsed[todayStr];
        return typeof raw === 'number' ? raw : (raw?.total || parseInt(raw) || 0);
      }
    } catch {}
    return 0;
  }, [appLanguage, todayStr]);

  // Load plan from cache or server action (Race condition protection: only after isDataLoaded === true)
  const loadPlan = useCallback(async () => {
    if (!isDataLoaded) return;

    const cacheKey = `ai_daily_plan_${appLanguage}_${todayStr}`;

    // 1. Check local cache for today
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

    // 2. Fetch new plan from server action
    setIsLoading(true);
    try {
      const generated = await generateAIDailyPlanAction(debtStats);
      setTasks(generated);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(generated));
      } catch {}
    } catch (err) {
      console.error('Error generating AI Daily Plan:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isDataLoaded, appLanguage, todayStr, debtStats]);

  // Trigger loadPlan once data is ready
  useEffect(() => {
    if (isDataLoaded) {
      loadPlan();
    }
  }, [isDataLoaded, loadPlan]);

  // Real-time synchronization: listen for card completions
  useEffect(() => {
    const handleUpdate = () => {
      const count = readTodayLearnedCount();
      setSessionLearnedCount(count);
    };

    handleUpdate();
    window.addEventListener('storage-update', handleUpdate);
    return () => window.removeEventListener('storage-update', handleUpdate);
  }, [readTodayLearnedCount]);

  // Stable Refresh Button:
  // MUST NOT query LLM again if today is the same day!
  // Force-syncs local progress (current) with localStorage/DB without altering tasks or targets.
  const handleForceSyncProgress = useCallback(() => {
    setIsSyncing(true);
    const count = readTodayLearnedCount();
    setSessionLearnedCount(count);

    setTimeout(() => {
      setIsSyncing(false);
    }, 450);
  }, [readTodayLearnedCount]);

  // Dynamic progress allocation across tasks & Overachiever Mode calculation
  useEffect(() => {
    if (tasks.length === 0) return;

    setTasks((prevTasks) => {
      let remaining = sessionLearnedCount;
      const updated = prevTasks.map((task) => {
        const allocated = Math.min(task.target, remaining);
        remaining = Math.max(0, remaining - allocated);
        const isDone = allocated >= task.target;

        return {
          ...task,
          current: allocated,
          is_completed: isDone,
        };
      });

      return updated;
    });

    // Overachiever Mode
    const totalTarget = tasks.reduce((acc, t) => acc + t.target, 0);
    const extraLearned = Math.max(0, sessionLearnedCount - totalTarget);

    if (totalTarget > 0 && extraLearned > 0) {
      const extraBadgesCount = Math.floor(extraLearned / 5);
      const newExtras: DailyTask[] = [];

      for (let i = 1; i <= Math.max(1, extraBadgesCount); i++) {
        const badgeTarget = i * 5;
        if (extraLearned >= badgeTarget - 4) {
          newExtras.push({
            id: `extra_task_${i}`,
            title: `Сверх плана: +${badgeTarget} карточек`,
            target: badgeTarget,
            current: Math.min(extraLearned, badgeTarget),
            type: 'extra',
            is_completed: extraLearned >= badgeTarget,
          });
        }
      }
      setExtraTasks(newExtras);
    } else {
      setExtraTasks([]);
    }
  }, [sessionLearnedCount, tasks.length]);

  // Persist updated progress back to cache
  useEffect(() => {
    if (tasks.length > 0) {
      const cacheKey = `ai_daily_plan_${appLanguage}_${todayStr}`;
      try {
        localStorage.setItem(cacheKey, JSON.stringify(tasks));
      } catch {}
    }
  }, [tasks, appLanguage, todayStr]);

  // Header statistics
  const totalCompleted = tasks.filter((t) => t.is_completed).length;
  const isAllPlannedCompleted = tasks.length > 0 && totalCompleted === tasks.length;
  const progressPercent = tasks.length > 0 ? Math.round((totalCompleted / tasks.length) * 100) : 0;

  // Race condition protection: elegant minimalist iOS skeleton
  if (!isDataLoaded || isLoading) {
    return <AIDailyDashboardSkeleton className={className} />;
  }

  return (
    <div
      className={`w-full bg-[#1C1C1E] text-white rounded-2xl p-5 md:p-6 border border-white/[0.08] transition-all select-none ${className || ''}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-emerald-400 border border-white/5">
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
                  План выполнен! Режим Overachiever ⚡️
                </span>
              ) : (
                `Выполнено ${totalCompleted} из ${tasks.length} задач`
              )}
            </p>
          </div>
        </div>

        {/* Stable Sync Button (Force-syncs local progress without re-querying LLM) */}
        <button
          onClick={handleForceSyncProgress}
          disabled={isSyncing}
          className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 active:scale-95 transition-all border border-white/5 cursor-pointer disabled:opacity-50"
          title="Синхронизировать прогресс карточек"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-emerald-400' : ''}`} />
        </button>
      </div>

      {/* Progress Bar (Apple HIG Style) */}
      <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden mb-4">
        <motion.div
          className="h-full bg-[#30D158] rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {/* Tasks List */}
      <div className="divide-y divide-white/10">
        {tasks.map((task) => (
          <TaskItem key={task.id} task={task} onAction={onStartTask} />
        ))}

        {/* Overachiever Extra Tasks with smooth Framer Motion fade-in */}
        <AnimatePresence>
          {extraTasks.map((extraTask) => (
            <motion.div
              key={extraTask.id}
              initial={{ opacity: 0, height: 0, y: -6 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <TaskItem task={extraTask} isExtra={true} onAction={onStartTask} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
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
        {/* iOS Circular Checkbox */}
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 shrink-0 ${
            isDone
              ? 'bg-[#30D158] border border-[#30D158] text-black shadow-[0_0_10px_rgba(48,209,88,0.35)]'
              : 'border border-white/20 bg-transparent group-hover:border-white/40'
          }`}
        >
          <AnimatePresence>
            {isDone && (
              <motion.div
                initial={{ scale: 0, rotate: -25 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 28 }}
              >
                <Check className="w-3.5 h-3.5 stroke-[3] text-black" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Task Title */}
        <div className="flex items-center gap-2 truncate">
          <span
            className={`text-sm tracking-tight transition-all duration-300 truncate ${
              isDone ? 'text-white/50 line-through decoration-white/20' : 'text-white/90 font-medium'
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

      {/* Progress Counter (e.g. 150 / 150) */}
      <span
        className={`text-xs tabular-nums tracking-wider font-medium shrink-0 ${
          isDone ? 'text-[#30D158]' : 'text-zinc-400'
        }`}
      >
        {task.current} / {task.target}
      </span>
    </div>
  );
}

/**
 * Elegant minimalist iOS-style skeleton loader
 */
function AIDailyDashboardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`w-full bg-[#1C1C1E] text-white rounded-2xl p-5 md:p-6 border border-white/[0.08] select-none ${className || ''}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse" />
          <div className="space-y-1.5">
            <div className="w-36 h-3.5 bg-white/10 rounded-full animate-pulse" />
            <div className="w-24 h-2.5 bg-white/5 rounded-full animate-pulse" />
          </div>
        </div>
        <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse" />
      </div>

      <div className="w-full bg-white/5 h-1.5 rounded-full mb-4 animate-pulse" />

      <div className="divide-y divide-white/10">
        {[1, 2, 3].map((i) => (
          <div key={i} className="py-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3.5 flex-1">
              <div className="w-6 h-6 rounded-full bg-white/10 shrink-0 animate-pulse" />
              <div
                className="h-3.5 bg-white/10 rounded-full animate-pulse"
                style={{ width: `${50 + i * 15}%` }}
              />
            </div>
            <div className="w-10 h-3 bg-white/10 rounded-full animate-pulse shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
