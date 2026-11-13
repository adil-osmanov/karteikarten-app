import React, { useEffect, useState, useMemo } from 'react';
import { X, CheckCircle2, RotateCcw, Clock, Target } from 'lucide-react';
import { 
  getTodayCompletedCardsCount, 
  normalizeLanguage, 
  getCurrentWeekDailyStats, 
  getTodayKey,
  getLocalDateString,
  computeStrictAccuracy,
  sanitizeTodayMistakesCount,
  getKraftDailyStatsMap,
  normalizeFocusSeconds,
  normalizeFocusMinutes,
  syncPersistentMistakesFromCloud,
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
    days: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
    fullDays: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
    today: "Heute",
  },
  EN: {
    title: "Activity & Statistics",
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
    days: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
    fullDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    today: "Today",
  },
  RU: {
    title: "Активность и статистика",
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
    days: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
    fullDays: ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'],
    today: "Сегодня",
  }
};

function getDayLabel(dateStr: string, daysList: string[]): string {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const isoDay = (d.getDay() + 6) % 7; // 0: Mo, 1: Di, ..., 6: So
    return daysList[isoDay] || '';
  }
  return '';
}

function getFormattedFullDate(dateStr: string, fullDaysList: string[]): string {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const isoDay = (d.getDay() + 6) % 7; // 0: Mo, 1: Di, ..., 6: So
    const dayName = fullDaysList[isoDay] || '';
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

  // Sync selectedDate and pull fresh persistent mistakes & stats on modal open
  useEffect(() => {
    if (isOpen) {
      setSelectedDate(getTodayKey());
      syncPersistentMistakesFromCloud(currentLang).catch(() => {});
    }
  }, [isOpen, currentLang]);

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

  // Compute Monday..Sunday week history
  const historyDays: DayRecord[] = useMemo(() => {
    if (!isOpen) return [];
    return getCurrentWeekDailyStats(currentLang);
  }, [
    isOpen,
    currentLang,
    stats?.cardsDone,
    stats?.correctCount,
    stats?.activeSeconds,
    stats?.mistakesCountToday,
    langStats?.learnedToday,
    langStats?.mistakesCount,
    langStats?.focusSeconds,
  ]);

  // Weekly momentum totals (sum over the 7 days, using live count for today)
  const todayLiveForWeek = Math.max(
    getTodayCompletedCardsCount(currentLang),
    stats?.cardsDone || 0,
    typeof langStats?.learnedToday === 'number' ? langStats.learnedToday : 0
  );

  const { weekTotalCards, weekTotalHours } = useMemo(() => {
    const totalCards = historyDays.reduce((sum, d) => {
      const c = d.date === todayKey ? Math.max(d.cardsReviewed || 0, todayLiveForWeek) : (d.cardsReviewed || 0);
      return sum + c;
    }, 0);
    const totalMinutes = historyDays.reduce((sum, d) => {
      const c = d.date === todayKey ? Math.max(d.cardsReviewed || 0, todayLiveForWeek) : (d.cardsReviewed || 0);
      const eff = Math.max(
        d.focusMinutes || 0,
        c > 0 ? Math.max(1, Math.round((c * 4.5) / 60)) : 0
      );
      return sum + eff;
    }, 0);
    const hours = (totalMinutes / 60).toFixed(1).replace('.0', '');
    return {
      weekTotalCards: totalCards,
      weekTotalHours: hours
    };
  }, [historyDays, todayKey, todayLiveForWeek]);

  if (!isOpen) return null;

  const isSelectedToday = selectedDate === todayKey;

  // Today's live calculation values
  const kraftDailyMap = getKraftDailyStatsMap();
  const currentLangStats = langStats || (() => {
    if (typeof window === 'undefined') return null;
    try {
      const today = getLocalDateString(new Date());
      const raw = localStorage.getItem(`daily_stats_${currentLang.toLowerCase()}_${today}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

  const todayLiveCards = Math.max(
    getTodayCompletedCardsCount(currentLang),
    stats?.cardsDone || 0,
    typeof currentLangStats?.learnedToday === 'number' ? currentLangStats.learnedToday : 0,
    kraftDailyMap[todayKey]?.cardsDone || 0
  );

  const rawTodaySeconds = Math.max(
    typeof currentLangStats?.focusSeconds === 'number' ? currentLangStats.focusSeconds : 0,
    typeof stats?.activeSeconds === 'number' ? stats.activeSeconds : 0
  );
  const todayLiveSeconds = normalizeFocusSeconds(rawTodaySeconds, todayLiveCards, true);

  const poolLength = Array.isArray(stats?.mistakesPool) ? stats.mistakesPool.length : 0;
  const sanitizedCloudMistakes = sanitizeTodayMistakesCount(
    typeof currentLangStats?.mistakesCount === 'number' ? currentLangStats.mistakesCount : 0,
    Array.isArray(currentLangStats?.mistakes) ? currentLangStats.mistakes : null,
    poolLength
  );
  const sanitizedHookMistakes = sanitizeTodayMistakesCount(
    typeof stats?.mistakesCountToday === 'number' ? stats.mistakesCountToday : 0,
    null,
    poolLength
  );
  const todayMistakesCount = Math.max(sanitizedCloudMistakes, sanitizedHookMistakes);

  const correctAnswersToday = Math.max(
    todayLiveCards,
    typeof currentLangStats?.correctCount === 'number' ? currentLangStats.correctCount : 0,
    typeof stats?.correctCount === 'number' ? stats.correctCount : 0,
    kraftDailyMap[todayKey]?.correct || 0
  );
  const mistakesToday = Math.max(0, todayMistakesCount);
  const todayAccuracy = computeStrictAccuracy(correctAnswersToday, mistakesToday);

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
  const rawProgressPercent = displayTarget > 0 ? (displayCardsDone / displayTarget) * 100 : 0;
  const displayProgressPercent = Math.min(Math.round(rawProgressPercent), 100);

  const rawRecordMinutes = selectedRecord.focusMinutes || 0;
  const effectiveRecordMinutes = normalizeFocusMinutes(
    rawRecordMinutes,
    selectedRecord.cardsReviewed || 0,
    isSelectedToday
  );

  const displaySeconds = isSelectedToday 
    ? todayLiveSeconds 
    : (effectiveRecordMinutes * 60);
  const displayMinutes = Math.floor(displaySeconds / 60);
  const displayHours = Math.floor(displayMinutes / 60);
  const displayRemainingMinutes = displayMinutes % 60;

  // Persistent unreviewed mistakes pool (cross-browser, never resets daily)
  const persistentMistakesCount = poolLength;

  const displayAccuracy = isSelectedToday 
    ? todayAccuracy 
    : computeStrictAccuracy(selectedRecord.cardsReviewed || 0, selectedRecord.mistakesCount || 0);

  const weekCardCounts = historyDays.map((d) => {
    const kraftCount = kraftDailyMap[d.date]?.cardsDone || 0;
    return d.date === todayKey
      ? Math.max(d.cardsReviewed || 0, todayLiveCards, kraftCount)
      : Math.max(d.cardsReviewed || 0, kraftCount);
  });

  const accuracyColor = displayAccuracy >= 80 
    ? 'text-emerald-600 dark:text-emerald-400' 
    : displayAccuracy >= 60 
      ? 'text-amber-600 dark:text-amber-400' 
      : 'text-rose-600 dark:text-rose-500';

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 sm:bg-black/40 dark:bg-black/60 backdrop-blur-sm sm:backdrop-blur-none animate-in fade-in duration-150 select-none overscroll-contain touch-none"
      onClick={onClose}
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <div 
        className="stats-modal-content w-full sm:max-w-[400px] max-h-[90dvh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] bg-white dark:bg-[#121216] sm:dark:bg-zinc-900 border-t sm:border border-black/[0.08] dark:border-white/10 p-6 pb-[calc(env(safe-area-inset-bottom,16px)+24px)] sm:p-6 shadow-2xl text-zinc-900 dark:text-white relative animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1.5 bg-zinc-300 dark:bg-white/20 rounded-full mx-auto mb-5 sm:hidden" />
        {/* Шапка модалки */}
        <div className="flex items-center justify-between pb-3.5 border-b border-black/[0.06] dark:border-white/[0.08]">
          <div>
            <h3 className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 font-sans">
              {t.title}
            </h3>
            <p className="text-[11px] font-normal text-zinc-400 dark:text-zinc-500 mt-0.5">
              {getFormattedFullDate(selectedDate, t.fullDays)}
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

        {/* Солидная сводка недели (Premium Stats Pill) */}
        <div className="flex items-center justify-between p-3.5 mt-3.5 mb-4 rounded-2xl bg-black/[0.03] dark:bg-neutral-800/50 border border-black/5 dark:border-white/5 backdrop-blur-md select-none">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">{t.thisWeek}</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="font-semibold text-neutral-900 dark:text-neutral-100 bg-black/5 dark:bg-white/10 px-2.5 py-1 rounded-lg">
              {weekTotalCards} {t.cards}
            </span>
            <span className="font-semibold text-neutral-600 dark:text-neutral-300">
              {weekTotalHours} {t.unitHour} {t.focus}
            </span>
          </div>
        </div>

        {/* 7-дневный график активности в стиле Apple (Weekly Bar Strip) */}
        <div className="mb-4 p-2.5 rounded-2xl bg-zinc-50/90 dark:bg-white/[0.03] border border-black/[0.05] dark:border-white/[0.06]">
          <div className="flex items-center justify-between gap-1 sm:gap-1.5">
            {historyDays.map((day, idx) => {
              const isSelected = day.date === selectedDate;
              const isToday = day.date === todayKey;
              const dayCards = weekCardCounts[idx] ?? 0;
              const dayTarget = day.targetCards || 200;
              const dayLabel = getDayLabel(day.date, t.days);

              // Дневная цель по умолчанию 200 карточек:
              const GOAL = 200;

              // Если карточек 0 — высота строго 0% (пустой слот дня):
              const barHeightPercent = dayCards === 0
                ? 0
                : Math.min(100, Math.max(6, Math.round((dayCards / GOAL) * 100)));

              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => setSelectedDate(day.date)}
                  className={`flex-1 flex flex-col items-center gap-2 py-2 px-1 rounded-xl transition-all duration-200 cursor-pointer outline-none select-none ${
                    isSelected
                      ? 'bg-black/[0.06] dark:bg-white/[0.1] shadow-sm ring-1 ring-black/10 dark:ring-white/15'
                      : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                  }`}
                  title={`${dayLabel}: ${dayCards} / ${dayTarget}`}
                >
                  {/* Чистая цельная скругленная капсула (pill) без делений */}
                  <div className="w-3.5 h-28 bg-neutral-200 dark:bg-white/[0.04] rounded-full overflow-hidden flex flex-col justify-end p-0.5">
                    {dayCards > 0 && (
                      <div
                        className={`w-full rounded-full transition-all duration-500 bg-blue-500 ${
                          isToday ? 'shadow-[0_0_10px_rgba(59,130,246,0.55)]' : ''
                        }`}
                        style={{ height: `${barHeightPercent}%` }}
                      />
                    )}
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
              {displayCardsDone}{' '}
              <span className="font-normal text-zinc-400 dark:text-zinc-500">
                / {displayTarget}
              </span>
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

        {/* Блок ошибок (персистентные неповторённые ошибки из БД) */}
        <div className="pt-3.5 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <span>{t.mistakesLabel}</span>
            {persistentMistakesCount > 0 ? (
              <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-600 border border-rose-500/20 dark:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/30 tabular-nums">
                {persistentMistakesCount}
              </span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 text-xs font-medium">
                <CheckCircle2 className="w-3.5 h-3.5"/> {t.noMistakes}
              </span>
            )}
          </div>

          {persistentMistakesCount > 0 && (
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
