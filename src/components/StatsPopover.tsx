import React, { useEffect, useState, useMemo } from 'react';
import { X, CheckCircle2, RotateCcw, Clock, Target } from 'lucide-react';
import { 
  getTodayCompletedCardsCount, 
  normalizeLanguage, 
  getDailyStatsHistory, 
  getTodayKey, 
  DayRecord 
} from '@/hooks/useDayStats';

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
  thisWeek: string;
  cards: string;
  focus: string;
  inFocus: string;
  unitHour: string;
  unitMinute: string;
  timeHours: (h: number, m: number) => string;
  timeMinutes: (m: number) => string;
  timeLessThanMin: string;
  timeZero: string;
  accuracy: string;
  cardsToday: string;
  progressLabel: string;
  mistakesLabel: string;
  noMistakes: string;
  reviewButton: string;
  closeTooltip: string;
  days: string[];
  fullDays: string[];
  today: string;
}> = {
  DE: {
    title: "Aktivität & Statistik",
    resetSubtitle: "Reset um 00:00",
    thisWeek: "Diese Woche",
    cards: "Karten",
    focus: "Fokus",
    inFocus: "Im Fokus",
    unitHour: "Std.",
    unitMinute: "Min.",
    timeHours: (h, m) => `${h} Std. ${m} Min.`,
    timeMinutes: (m) => `${m} Min.`,
    timeLessThanMin: "< 1 Min.",
    timeZero: "0 Min.",
    accuracy: "Genauigkeit",
    cardsToday: "Karten",
    progressLabel: "Fortschritt",
    mistakesLabel: "Fehler:",
    noMistakes: "Keine Fehler",
    reviewButton: "Wiederholen",
    closeTooltip: "Schließen",
    days: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
    fullDays: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
    today: "Heute",
  },
  EN: {
    title: "Activity & Statistics",
    resetSubtitle: "Resets at 00:00",
    thisWeek: "This week",
    cards: "cards",
    focus: "focus",
    inFocus: "Focus Time",
    unitHour: "h",
    unitMinute: "min",
    timeHours: (h, m) => `${h} h ${m} min`,
    timeMinutes: (m) => `${m} min`,
    timeLessThanMin: "< 1 min",
    timeZero: "0 min",
    accuracy: "Accuracy",
    cardsToday: "Cards",
    progressLabel: "Progress",
    mistakesLabel: "Mistakes:",
    noMistakes: "No mistakes",
    reviewButton: "Review",
    closeTooltip: "Close",
    days: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    fullDays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    today: "Today",
  },
  RU: {
    title: "Активность и статистика",
    resetSubtitle: "Сброс в 00:00",
    thisWeek: "На этой неделе",
    cards: "карт",
    focus: "фокуса",
    inFocus: "В фокусе",
    unitHour: "ч",
    unitMinute: "мин",
    timeHours: (h, m) => `${h} ч ${m} мин`,
    timeMinutes: (m) => `${m} мин`,
    timeLessThanMin: "< 1 мин",
    timeZero: "0 мин",
    accuracy: "Точность",
    cardsToday: "Карточки",
    progressLabel: "Прогресс",
    mistakesLabel: "Ошибки:",
    noMistakes: "Нет ошибок",
    reviewButton: "Повторить",
    closeTooltip: "Закрыть",
    days: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
    fullDays: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
    today: "Сегодня",
  }
};

function getDayLabel(dateStr: string, daysList: string[]): string {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return daysList[d.getDay()] || '';
  }
  return '';
}

function getFormattedFullDate(dateStr: string, fullDaysList: string[]): string {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const dayName = fullDaysList[d.getDay()] || '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dayName}, ${dd}.${mm}`;
  }
  return dateStr;
}

export function StatsPopover({ isOpen, onClose, stats, langStats, language = 'DE', onReviewMistakes }: StatsPopoverProps) {
  const normalized = normalizeLanguage(language);
  const currentLang = STATS_I18N[normalized] ? normalized : 'DE';
  const t = STATS_I18N[currentLang];

  const todayKey = getTodayKey();
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);

  // Sync selectedDate on modal open
  useEffect(() => {
    if (isOpen) {
      setSelectedDate(getTodayKey());
    }
  }, [isOpen]);

  // Lock scroll while modal is open
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

  // Compute 7-day strip history
  const historyDays: DayRecord[] = useMemo(() => {
    if (!isOpen) return [];
    return getDailyStatsHistory(currentLang, 7);
  }, [isOpen, currentLang, stats?.cardsDone, stats?.activeSeconds, stats?.mistakesCountToday]);

  // Weekly momentum totals (sum over the 7 days)
  const { weekTotalCards, weekTotalHours } = useMemo(() => {
    const totalCards = historyDays.reduce((sum, d) => sum + (d.cardsReviewed || 0), 0);
    const totalMinutes = historyDays.reduce((sum, d) => sum + (d.focusMinutes || 0), 0);
    const hours = (totalMinutes / 60).toFixed(1).replace('.0', '');
    return {
      weekTotalCards: totalCards,
      weekTotalHours: hours
    };
  }, [historyDays]);

  if (!isOpen) return null;

  const isSelectedToday = selectedDate === todayKey;

  // Today's live calculation values
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

  const todayLiveCards = Math.max(
    typeof currentLangStats?.learnedToday === 'number' ? currentLangStats.learnedToday : 0,
    typeof stats?.cardsDone === 'number' ? stats.cardsDone : 0,
    getTodayCompletedCardsCount(currentLang)
  );

  const todayLiveSeconds = Math.max(
    typeof currentLangStats?.focusSeconds === 'number' ? currentLangStats.focusSeconds : 0,
    typeof stats?.activeSeconds === 'number' ? stats.activeSeconds : 0
  );

  const todayMistakesCount = typeof currentLangStats?.mistakesCount === 'number'
    ? currentLangStats.mistakesCount
    : (typeof stats?.mistakesCountToday === 'number'
        ? stats.mistakesCountToday
        : (Array.isArray(stats?.mistakesPool) ? stats.mistakesPool.length : 0));

  const todayAttempts = (currentLangStats?.totalCount && currentLangStats.totalCount > 0)
    ? currentLangStats.totalCount
    : (todayLiveCards + todayMistakesCount);

  const todayAccuracy = typeof currentLangStats?.accuracy === 'number'
    ? currentLangStats.accuracy
    : ((currentLangStats?.totalCount && currentLangStats.totalCount > 0)
        ? Math.round((currentLangStats.correctCount / currentLangStats.totalCount) * 100)
        : (todayAttempts > 0 ? Math.round((todayLiveCards / todayAttempts) * 100) : null));

  // Find the selected day record
  const selectedRecord = historyDays.find(d => d.date === selectedDate) || {
    date: selectedDate,
    cardsReviewed: 0,
    targetCards: 200,
    focusMinutes: 0,
    accuracy: 100,
    mistakesCount: 0,
    wordsMastered: 0
  };

  // Metrics for the currently selected date
  const displayCardsDone = isSelectedToday ? todayLiveCards : selectedRecord.cardsReviewed;
  const displayTarget = selectedRecord.targetCards || 200;
  const displayProgressPercent = Math.min(Math.round((displayCardsDone / displayTarget) * 100), 100);

  const displaySeconds = isSelectedToday ? todayLiveSeconds : (selectedRecord.focusMinutes * 60);
  const displayMinutes = Math.floor(displaySeconds / 60);
  const displayHours = Math.floor(displayMinutes / 60);
  const displayRemainingMinutes = displayMinutes % 60;

  const displayMistakes = isSelectedToday 
    ? (Array.isArray(stats?.mistakesPool) ? stats.mistakesPool.length : todayMistakesCount)
    : selectedRecord.mistakesCount;

  const displayAccuracy = isSelectedToday 
    ? todayAccuracy 
    : (displayCardsDone > 0 ? selectedRecord.accuracy : null);

  const accuracyColor = displayAccuracy === null
    ? 'text-zinc-400 dark:text-zinc-500'
    : displayAccuracy >= 80 
      ? 'text-emerald-600 dark:text-emerald-400' 
      : displayAccuracy >= 50 
        ? 'text-amber-600 dark:text-amber-400' 
        : 'text-rose-600 dark:text-rose-400';

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/60 animate-in fade-in duration-100 select-none overscroll-contain touch-none"
      onClick={onClose}
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <div 
        className="stats-modal-content w-full max-w-[400px] rounded-[28px] bg-white dark:bg-zinc-900 border border-black/[0.08] dark:border-white/10 p-5 sm:p-6 shadow-2xl text-zinc-900 dark:text-white relative animate-in zoom-in-95 duration-100 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка модалки */}
        <div className="flex items-center justify-between pb-3.5 border-b border-black/[0.06] dark:border-white/[0.08]">
          <div>
            <h3 className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 font-sans">
              {t.title}
            </h3>
            <p className="text-[11px] font-normal text-zinc-400 dark:text-zinc-500 mt-0.5">
              {isSelectedToday ? t.resetSubtitle : getFormattedFullDate(selectedDate, t.fullDays)}
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

        {/* Недельная сводка (Momentum Header) */}
        <div className="text-xs text-neutral-500 dark:text-neutral-400 font-medium mt-3.5 mb-3 select-none">
          {t.thisWeek}: <span className="text-zinc-900 dark:text-neutral-100 font-semibold">{weekTotalCards} {t.cards}</span> • <span className="text-zinc-900 dark:text-neutral-100 font-semibold">{weekTotalHours} {t.unitHour} {t.focus}</span>
        </div>

        {/* 7-дневный график активности в стиле Apple (Weekly Bar Strip) */}
        <div className="mb-4 p-2.5 rounded-2xl bg-zinc-50/90 dark:bg-white/[0.03] border border-black/[0.05] dark:border-white/[0.06]">
          <div className="flex items-center justify-between gap-1 sm:gap-1.5">
            {historyDays.map((day) => {
              const isSelected = day.date === selectedDate;
              const isToday = day.date === todayKey;
              const dayCards = isToday ? todayLiveCards : day.cardsReviewed;
              const dayTarget = day.targetCards || 200;
              const isGoalMet = dayCards >= dayTarget && dayTarget > 0;
              const dayLabel = getDayLabel(day.date, t.days);

              // Bar fill height (proportional to daily target)
              const fillHeight = dayCards > 0
                ? Math.min(100, Math.max(8, Math.round((dayCards / dayTarget) * 100)))
                : 0;

              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => setSelectedDate(day.date)}
                  className={`flex-1 flex flex-col items-center gap-1.5 py-2 px-1 rounded-xl transition-all duration-200 cursor-pointer outline-none select-none ${
                    isSelected
                      ? 'bg-black/[0.06] dark:bg-white/[0.1] shadow-sm ring-1 ring-black/10 dark:ring-white/15'
                      : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                  }`}
                  title={`${dayLabel}: ${dayCards} / ${dayTarget}`}
                >
                  {/* Вертикальный трек столбика */}
                  <div className="w-2.5 h-14 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden flex flex-col justify-end p-[1px]">
                    <div
                      className={`w-full rounded-full transition-all duration-500 ${
                        isGoalMet
                          ? 'bg-emerald-400 dark:bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                          : (isSelected || isToday)
                            ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]'
                            : 'bg-neutral-300 dark:bg-neutral-600'
                      }`}
                      style={{ height: `${fillHeight}%` }}
                    />
                  </div>

                  {/* Подпись дня недели */}
                  <span className={`text-[11px] font-medium tracking-tight ${
                    isSelected
                      ? 'text-blue-600 dark:text-blue-400 font-semibold'
                      : isToday
                        ? 'text-zinc-900 dark:text-zinc-100 font-semibold'
                        : 'text-zinc-400 dark:text-zinc-500'
                  }`}>
                    {dayLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2 Карточки метрик (Время и Точность в стиле Apple) для выбранного дня */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-4 rounded-[22px] bg-zinc-50/80 dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/[0.08] shadow-[0_2px_8px_rgba(0,0,0,0.02)] flex flex-col items-center justify-center min-h-[96px]">
            {displayHours > 0 ? (
              <div className="flex items-baseline justify-center whitespace-nowrap">
                <span className="text-[25px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {displayHours}
                </span>
                <span className="text-[12px] font-medium text-zinc-400 dark:text-zinc-500 ml-0.5 mr-1.5">
                  {t.unitHour}
                </span>
                {displayRemainingMinutes > 0 && (
                  <>
                    <span className="text-[25px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 tabular-nums">
                      {displayRemainingMinutes}
                    </span>
                    <span className="text-[12px] font-medium text-zinc-400 dark:text-zinc-500 ml-0.5">
                      {t.unitMinute}
                    </span>
                  </>
                )}
              </div>
            ) : displayMinutes > 0 ? (
              <div className="flex items-baseline justify-center whitespace-nowrap">
                <span className="text-[25px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {displayMinutes}
                </span>
                <span className="text-[12px] font-medium text-zinc-400 dark:text-zinc-500 ml-1">
                  {t.unitMinute}
                </span>
              </div>
            ) : displaySeconds > 0 ? (
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

          <div className="p-4 rounded-[22px] bg-zinc-50/80 dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/[0.08] shadow-[0_2px_8px_rgba(0,0,0,0.02)] flex flex-col items-center justify-center min-h-[96px]">
            <div className="flex items-baseline justify-center whitespace-nowrap">
              {displayAccuracy !== null ? (
                <>
                  <span className={`text-[25px] font-semibold tracking-tight ${accuracyColor} tabular-nums`}>
                    {displayAccuracy}
                  </span>
                  <span className={`text-[13px] font-medium ml-0.5 ${accuracyColor} opacity-75`}>
                    %
                  </span>
                </>
              ) : (
                <span className="text-[25px] font-semibold tracking-tight text-zinc-400 dark:text-zinc-500 tabular-nums">
                  —
                </span>
              )}
            </div>
            <span className="text-[11.5px] font-medium text-zinc-400 dark:text-zinc-500 mt-1 flex items-center gap-1.5 select-none tracking-normal">
              <Target className="w-3 h-3 text-zinc-400 dark:text-zinc-500"/> {t.accuracy}
            </span>
          </div>
        </div>

        {/* Блок прогресса карточек (Fortschritt / Progress) */}
        <div className="mb-4 p-4 rounded-[22px] bg-zinc-50/80 dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/[0.08] shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
          <div className="flex justify-between items-baseline mb-2.5">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {t.progressLabel} ({isSelectedToday ? t.today : getDayLabel(selectedDate, t.days)})
            </span>
            <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums tracking-tight">
              {displayCardsDone} <span className="font-normal text-zinc-400 dark:text-zinc-500">/ {displayTarget}</span>
            </div>
          </div>
          <div className="w-full h-1.5 rounded-full bg-black/[0.06] dark:bg-zinc-800 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                displayCardsDone >= displayTarget
                  ? 'bg-emerald-500 shadow-sm shadow-emerald-500/20'
                  : 'bg-sky-500 shadow-sm shadow-sky-500/20'
              }`}
              style={{ width: `${displayProgressPercent}%` }}
            />
          </div>
        </div>

        {/* Блок ошибок */}
        <div className="pt-3.5 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <span>{t.mistakesLabel}</span>
            {displayMistakes > 0 ? (
              <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-600 border border-rose-500/20 dark:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/30 tabular-nums">
                {displayMistakes}
              </span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 text-xs font-medium">
                <CheckCircle2 className="w-3.5 h-3.5"/> {t.noMistakes}
              </span>
            )}
          </div>

          {isSelectedToday && displayMistakes > 0 && (
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
