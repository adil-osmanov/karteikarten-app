import React, { useEffect } from 'react';
import { X, CheckCircle2, RotateCcw, Clock, Target } from 'lucide-react';
import { getTodayCompletedCardsCount, normalizeLanguage } from '@/hooks/useDayStats';

export interface StatsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  stats: any;
  langStats?: any;
  language?: 'DE' | 'EN' | 'RU' | string;
  onReviewMistakes: () => void;
}

const STATS_I18N: Record<string, {
  title: string;
  resetSubtitle: string;
  inFocus: string;
  unitHour: string;
  unitMinute: string;
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
    unitHour: "Std.",
    unitMinute: "Min.",
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
    unitHour: "h",
    unitMinute: "min",
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
    unitHour: "ч",
    unitMinute: "мин",
    timeHours: (h, m) => `${h} ч ${m} мин`,
    timeMinutes: (m) => `${m} мин`,
    timeLessThanMin: "< 1 мин",
    timeZero: "0 мин",
    accuracy: "Точность",
    cardsToday: "Карточки",
    mistakesLabel: "Ошибки:",
    noMistakes: "Нет ошибок",
    reviewButton: "Повторить",
    closeTooltip: "Закрыть",
  }
};

export function StatsPopover({ isOpen, onClose, stats, langStats, language = 'DE', onReviewMistakes }: StatsPopoverProps) {
  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;
    const prevOverscroll = document.body.style.overscrollBehavior;

    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.body.style.overscrollBehavior = 'none';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    const blockScroll = (e: Event) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', blockScroll, { passive: false });
    window.addEventListener('touchmove', blockScroll, { passive: false });

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
      document.body.style.overscrollBehavior = prevOverscroll;
      window.removeEventListener('wheel', blockScroll);
      window.removeEventListener('touchmove', blockScroll);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const normalized = normalizeLanguage(language);
  const currentLang = STATS_I18N[normalized] ? normalized : 'DE';
  const t = STATS_I18N[currentLang];

  const currentLangStats = langStats || (() => {
    if (typeof window === 'undefined') return null;
    try {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const raw = localStorage.getItem(`daily_stats_${currentLang.toLowerCase()}_${today}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

  const totalDone = Math.max(
    typeof currentLangStats?.learnedToday === 'number' ? currentLangStats.learnedToday : 0,
    typeof stats?.cardsDone === 'number' ? stats.cardsDone : 0,
    getTodayCompletedCardsCount(currentLang)
  );

  const totalSeconds = Math.max(
    typeof currentLangStats?.focusSeconds === 'number' ? currentLangStats.focusSeconds : 0,
    typeof stats?.activeSeconds === 'number' ? stats.activeSeconds : 0
  );

  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  const target = 200;
  const progressPercent = Math.min(Math.round((totalDone / target) * 100), 100);

  const mistakesToday = typeof currentLangStats?.mistakesCount === 'number'
    ? currentLangStats.mistakesCount
    : (typeof stats?.mistakesCountToday === 'number'
        ? stats.mistakesCountToday
        : (Array.isArray(stats?.mistakesPool) ? stats.mistakesPool.length : 0));

  const totalAttempts = (currentLangStats?.totalCount && currentLangStats.totalCount > 0)
    ? currentLangStats.totalCount
    : (totalDone + mistakesToday);

  const accuracy = typeof currentLangStats?.accuracy === 'number'
    ? currentLangStats.accuracy
    : ((currentLangStats?.totalCount && currentLangStats.totalCount > 0)
        ? Math.round((currentLangStats.correctCount / currentLangStats.totalCount) * 100)
        : (totalAttempts > 0 ? Math.round((totalDone / totalAttempts) * 100) : 100));

  const accuracyColor = totalAttempts === 0
    ? 'text-zinc-900 dark:text-zinc-100'
    : accuracy >= 80 
      ? 'text-emerald-600 dark:text-emerald-400' 
      : accuracy >= 50 
        ? 'text-amber-600 dark:text-amber-400' 
        : 'text-rose-600 dark:text-rose-400';

  const mistakeCount = Array.isArray(stats?.mistakesPool) ? stats.mistakesPool.length : 0;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 dark:bg-black/60 backdrop-blur-md animate-in fade-in duration-150 select-none overscroll-contain touch-none"
      onClick={onClose}
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <div 
        className="stats-modal-content w-full max-w-sm rounded-[28px] bg-white/95 dark:bg-zinc-900/95 border border-black/[0.08] dark:border-white/10 p-6 shadow-2xl backdrop-blur-2xl text-zinc-900 dark:text-white relative animate-in zoom-in-95 duration-200 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка модалки */}
        <div className="flex items-center justify-between pb-4 border-b border-black/[0.06] dark:border-white/[0.08]">
          <div>
            <h3 className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 font-sans">
              {t.title}
            </h3>
            <p className="text-[11px] font-normal text-zinc-400 dark:text-zinc-500 mt-0.5">
              {t.resetSubtitle}
            </p>
          </div>
          <button 
            onClick={onClose}
            type="button"
            className="w-7 h-7 rounded-full bg-black/[0.05] hover:bg-black/[0.09] dark:bg-white/[0.08] dark:hover:bg-white/[0.14] border border-black/[0.04] dark:border-white/[0.06] flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-white transition active:scale-95 cursor-pointer"
            title={t.closeTooltip}
          >
            <X className="w-3.5 h-3.5"/>
          </button>
        </div>

        {/* 2 Карточки метрик (Время и Точность в стиле Apple) */}
        <div className="grid grid-cols-2 gap-3 my-5">
          <div className="p-4 rounded-[22px] bg-zinc-50/80 dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/[0.08] shadow-[0_2px_8px_rgba(0,0,0,0.02)] flex flex-col items-center justify-center min-h-[96px] backdrop-blur-sm">
            {hours > 0 ? (
              <div className="flex items-baseline justify-center whitespace-nowrap">
                <span className="text-[25px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {hours}
                </span>
                <span className="text-[12px] font-medium text-zinc-400 dark:text-zinc-500 ml-0.5 mr-1.5">
                  {t.unitHour}
                </span>
                {remainingMinutes > 0 && (
                  <>
                    <span className="text-[25px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 tabular-nums">
                      {remainingMinutes}
                    </span>
                    <span className="text-[12px] font-medium text-zinc-400 dark:text-zinc-500 ml-0.5">
                      {t.unitMinute}
                    </span>
                  </>
                )}
              </div>
            ) : minutes > 0 ? (
              <div className="flex items-baseline justify-center whitespace-nowrap">
                <span className="text-[25px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {minutes}
                </span>
                <span className="text-[12px] font-medium text-zinc-400 dark:text-zinc-500 ml-1">
                  {t.unitMinute}
                </span>
              </div>
            ) : totalSeconds > 0 ? (
              <div className="flex items-baseline justify-center whitespace-nowrap">
                <span className="text-[20px] font-semibold tracking-tight text-zinc-600 dark:text-zinc-300 tabular-nums">
                  &lt; 1
                </span>
                <span className="text-[12px] font-medium text-zinc-400 dark:text-zinc-500 ml-1">
                  {t.unitMinute}
                </span>
              </div>
            ) : (
              <div className="flex items-baseline justify-center whitespace-nowrap">
                <span className="text-[25px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 tabular-nums">
                  0
                </span>
                <span className="text-[12px] font-medium text-zinc-400 dark:text-zinc-500 ml-1">
                  {t.unitMinute}
                </span>
              </div>
            )}
            <span className="text-[11.5px] font-medium text-zinc-400 dark:text-zinc-500 mt-1 flex items-center gap-1.5 select-none tracking-normal">
              <Clock className="w-3 h-3 text-zinc-400 dark:text-zinc-500"/> {t.inFocus}
            </span>
          </div>

          <div className="p-4 rounded-[22px] bg-zinc-50/80 dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/[0.08] shadow-[0_2px_8px_rgba(0,0,0,0.02)] flex flex-col items-center justify-center min-h-[96px] backdrop-blur-sm">
            <div className="flex items-baseline justify-center whitespace-nowrap">
              <span className={`text-[25px] font-semibold tracking-tight ${accuracyColor} tabular-nums`}>
                {accuracy}
              </span>
              <span className={`text-[13px] font-medium ml-0.5 ${accuracyColor} opacity-75`}>
                %
              </span>
            </div>
            <span className="text-[11.5px] font-medium text-zinc-400 dark:text-zinc-500 mt-1 flex items-center gap-1.5 select-none tracking-normal">
              <Target className="w-3 h-3 text-zinc-400 dark:text-zinc-500"/> {t.accuracy}
            </span>
          </div>
        </div>

        {/* Блок прогресса карточек */}
        <div className="mb-5 p-4 rounded-[22px] bg-zinc-50/80 dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/[0.08] shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
          <div className="flex justify-between items-baseline mb-2.5">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{t.cardsToday}</span>
            <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums tracking-tight">
              {totalDone} <span className="font-normal text-zinc-400 dark:text-zinc-500">/ {target}</span>
            </div>
          </div>
          <div className="w-full h-1.5 rounded-full bg-black/[0.06] dark:bg-zinc-800 overflow-hidden">
            <div 
              className="h-full bg-sky-500 rounded-full transition-all duration-500 shadow-sm shadow-sky-500/20"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Блок ошибок */}
        <div className="pt-4 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <span>{t.mistakesLabel}</span>
            {mistakeCount > 0 ? (
              <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-600 border border-rose-500/20 dark:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/30 tabular-nums">
                {mistakeCount}
              </span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 text-xs font-medium">
                <CheckCircle2 className="w-3.5 h-3.5"/> {t.noMistakes}
              </span>
            )}
          </div>

          {mistakeCount > 0 && (
            <button
              onClick={() => { onClose(); onReviewMistakes(); }}
              type="button"
              className="h-8 px-3.5 rounded-xl bg-zinc-100 hover:bg-zinc-200/90 text-zinc-900 border border-black/[0.08] dark:bg-white/10 dark:hover:bg-white/15 dark:text-zinc-100 dark:border-white/10 active:scale-[0.98] text-xs font-medium transition-all duration-150 flex items-center gap-1.5 shadow-sm hover:shadow-md cursor-pointer select-none"
            >
              <RotateCcw className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400"/>
              <span>{t.reviewButton}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
