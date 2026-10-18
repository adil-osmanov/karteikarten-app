import React, { useEffect } from 'react';
import { X, CheckCircle2, RotateCcw, Clock, Target } from 'lucide-react';
import { getTodayCompletedCardsCount } from '@/hooks/useDayStats';

export interface StatsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  stats: any;
  language?: 'DE' | 'EN' | 'RU' | string;
  onReviewMistakes: () => void;
}

const STATS_I18N: Record<string, {
  title: string;
  resetSubtitle: string;
  inFocus: string;
  timeHours: (h: number, m: number) => string;
  timeMinutes: (m: number) => string;
  timeLessThanMin: string;
  timeZero: string;
  accuracy: string;
  cardsToday: string;
  mistakesLabel: string;
  noMistakes: string;
  reviewButton: string;
  closeTooltip: string;
}> = {
  DE: {
    title: "Tagesstatistik",
    resetSubtitle: "Reset um 00:00",
    inFocus: "Im Fokus",
    timeHours: (h, m) => `${h} Std. ${m} Min.`,
    timeMinutes: (m) => `${m} Min.`,
    timeLessThanMin: "< 1 Min.",
    timeZero: "0 Min.",
    accuracy: "Genauigkeit",
    cardsToday: "Karten",
    mistakesLabel: "Fehler:",
    noMistakes: "Keine Fehler",
    reviewButton: "Wiederholen",
    closeTooltip: "Schließen",
  },
  EN: {
    title: "Daily Statistics",
    resetSubtitle: "Resets at 00:00",
    inFocus: "Focus Time",
    timeHours: (h, m) => `${h} h ${m} min`,
    timeMinutes: (m) => `${m} min`,
    timeLessThanMin: "< 1 min",
    timeZero: "0 min",
    accuracy: "Accuracy",
    cardsToday: "Cards",
    mistakesLabel: "Mistakes:",
    noMistakes: "No mistakes",
    reviewButton: "Review",
    closeTooltip: "Close",
  },
  RU: {
    title: "Статистика дня",
    resetSubtitle: "Сброс в 00:00",
    inFocus: "В фокусе",
    timeHours: (h, m) => `${h} ч ${m} мин`,
    timeMinutes: (m) => `${m} мин`,
    timeLessThanMin: "< 1 мин",
    timeZero: "0 мин",
    accuracy: "Точность",
    cardsToday: "Карточки",
    mistakesLabel: "Ошибки:",
    noMistakes: "Ошибок нет",
    reviewButton: "Закрепить",
    closeTooltip: "Закрыть",
  }
};

export function StatsPopover({ isOpen, onClose, stats, language = 'DE', onReviewMistakes }: StatsPopoverProps) {
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalTouchAction = document.body.style.touchAction;
    
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    const preventDefault = (e: Event) => {
      e.preventDefault();
    };

    window.addEventListener('wheel', preventDefault, { passive: false });
    window.addEventListener('touchmove', preventDefault, { passive: false });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.touchAction = originalTouchAction;
      window.removeEventListener('wheel', preventDefault);
      window.removeEventListener('touchmove', preventDefault);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentLang = (language && STATS_I18N[language]) ? language : 'DE';
  const t = STATS_I18N[currentLang];

  const totalSeconds = typeof stats?.activeSeconds === 'number' ? stats.activeSeconds : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  
  let timeDisplay = t.timeZero;
  if (hours > 0) {
    timeDisplay = t.timeHours(hours, minutes % 60);
  } else if (minutes > 0) {
    timeDisplay = t.timeMinutes(minutes);
  } else if (totalSeconds > 0) {
    timeDisplay = t.timeLessThanMin;
  }

  const realCardsCount = getTodayCompletedCardsCount(currentLang);
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
            <h3 className="text-sm font-semibold tracking-tight text-zinc-100">{t.title}</h3>
            <p className="text-[11px] text-zinc-500 font-medium">{t.resetSubtitle}</p>
          </div>
          <button 
            onClick={onClose}
            type="button"
            className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition active:scale-95 cursor-pointer"
            title={t.closeTooltip}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 2 Главные метрики */}
        <div className="grid grid-cols-2 gap-3 my-5">
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex flex-col items-center text-center">
            <span className="text-xl font-bold tracking-tight text-white mb-0.5 font-mono">{timeDisplay}</span>
            <span className="text-[11px] text-zinc-400 font-medium flex items-center gap-1">
              <Clock className="w-3 h-3 text-zinc-500" /> {t.inFocus}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex flex-col items-center text-center">
            <span className={`text-xl font-bold tracking-tight mb-0.5 font-mono ${accuracyColor}`}>{accuracy}%</span>
            <span className="text-[11px] text-zinc-400 font-medium flex items-center gap-1">
              <Target className="w-3 h-3 text-zinc-500" /> {t.accuracy}
            </span>
          </div>
        </div>

        {/* Прогресс за день (например, 278 / 200) */}
        <div className="mb-5 p-4 rounded-2xl bg-white/[0.03] border border-white/5">
          <div className="flex justify-between items-center text-xs mb-2">
            <span className="text-zinc-400 font-medium">{t.cardsToday}</span>
            <span className="text-zinc-200 font-semibold font-mono">
              {totalDone}<span className="text-zinc-500 font-normal">/{target}</span>
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div 
              className="h-full bg-sky-500 rounded-full transition-all duration-500 shadow-sm shadow-sky-500/50" 
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Ошибки */}
        <div className="pt-2 border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400 font-medium">{t.mistakesLabel}</span>
            {mistakeCount > 0 ? (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono">
                {mistakeCount}
              </span>
            ) : (
              <span className="text-xs text-zinc-500 flex items-center gap-1 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> {t.noMistakes}
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
              <span>{t.reviewButton}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
