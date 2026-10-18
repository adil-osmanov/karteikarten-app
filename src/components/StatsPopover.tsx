import React, { useEffect } from 'react';
import { X, CheckCircle2, RotateCcw, Clock, Target } from 'lucide-react';
import { getTodayCompletedCardsCount } from '@/hooks/useDayStats';

export interface StatsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  stats: any;
  onReviewMistakes: () => void;
}

export function StatsPopover({ isOpen, onClose, stats, onReviewMistakes }: StatsPopoverProps) {
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const totalSeconds = typeof stats?.activeSeconds === 'number' ? stats.activeSeconds : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const timeDisplay = hours > 0 ? `${hours} ч ${minutes % 60} мин` : `${minutes} мин`;

  const realCardsCount = getTodayCompletedCardsCount();
  const totalDone = Math.max(typeof stats?.cardsDone === 'number' ? stats.cardsDone : 0, realCardsCount);
  const target = 200;
  const progressPercent = Math.min(Math.round((totalDone / target) * 100), 100);

  const mistakesToday = typeof stats?.mistakesCountToday === 'number'
    ? stats.mistakesCountToday
    : (Array.isArray(stats?.mistakesPool) ? stats.mistakesPool.length : 0);

  const totalAttempts = Math.max(totalDone, totalDone + mistakesToday);
  const correctAttempts = Math.max(0, totalAttempts - mistakesToday);
  const accuracy = totalAttempts > 0 
    ? Math.min(100, Math.max(0, Math.round((correctAttempts / totalAttempts) * 100))) 
    : 100;

  const mistakeCount = Array.isArray(stats?.mistakesPool) ? stats.mistakesPool.length : 0;

  const accuracyColor = accuracy >= 80 
    ? "text-emerald-400" 
    : accuracy >= 60 
    ? "text-amber-400" 
    : "text-rose-400";

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overscroll-contain touch-none animate-in fade-in duration-150 select-none"
      onClick={onClose}
      onWheel={(e) => {
        e.stopPropagation();
      }}
      onTouchMove={(e) => {
        e.stopPropagation();
      }}
    >
      <div 
        className="w-full max-w-sm rounded-3xl bg-zinc-900/95 border border-white/10 p-6 shadow-2xl backdrop-blur-2xl text-white relative animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/5">
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-zinc-100">Статистика дня</h3>
            <p className="text-[11px] text-zinc-500 font-medium">Сброс в 00:00</p>
          </div>
          <button 
            onClick={onClose}
            type="button"
            className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition active:scale-95 cursor-pointer"
            title="Закрыть"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 2 Главные метрики */}
        <div className="grid grid-cols-2 gap-3 my-5">
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex flex-col items-center text-center">
            <span className="text-xl font-bold tracking-tight text-white mb-0.5">{timeDisplay}</span>
            <span className="text-[11px] text-zinc-400 font-medium flex items-center gap-1">
              <Clock className="w-3 h-3 text-zinc-500" /> В фокусе
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex flex-col items-center text-center">
            <span className={`text-xl font-bold tracking-tight mb-0.5 font-mono ${accuracyColor}`}>{accuracy}%</span>
            <span className="text-[11px] text-zinc-400 font-medium flex items-center gap-1">
              <Target className="w-3 h-3 text-zinc-500" /> Точность
            </span>
          </div>
        </div>

        {/* Прогресс за день (например, 278 / 200) */}
        <div className="mb-5 p-4 rounded-2xl bg-white/[0.03] border border-white/5">
          <div className="flex justify-between items-center text-xs mb-2">
            <span className="text-zinc-400 font-medium">Карточки сегодня</span>
            <span className="text-zinc-200 font-semibold font-mono">
              {totalDone} <span className="text-zinc-500 font-normal">/ {target}</span>
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div 
              className="h-full bg-sky-500 rounded-full transition-all duration-500 shadow-sm shadow-sky-500/50" 
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Банк ошибок */}
        <div className="pt-2 border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400 font-medium">Банк ошибок:</span>
            {mistakeCount > 0 ? (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono">
                {mistakeCount}
              </span>
            ) : (
              <span className="text-xs text-zinc-500 flex items-center gap-1 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Пуст
              </span>
            )}
          </div>

          {mistakeCount > 0 && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onReviewMistakes();
              }}
              className="h-8 px-3.5 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 text-xs font-medium text-white transition flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 text-sky-400" />
              <span>Закрепить</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
