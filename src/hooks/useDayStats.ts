import { useState, useEffect, useRef, useCallback } from 'react';

export interface DailyStats {
  date: string;
  activeSeconds: number;
  cardsDone: number;
  correctCount: number;
  mistakesCountToday?: number;
  mistakesPool: any[];
}

export type SupportedLanguage = 'DE' | 'EN' | 'RU' | string;

const getTodayKey = () => new Date().toISOString().split('T')[0];
const getStorageKey = (lang: string) => `app_daily_stats_${lang}`;

export function getTodayCompletedCardsCount(lang: string = 'DE'): number {
  if (typeof window === 'undefined') return 0;
  try {
    const todayStr = new Date().toLocaleDateString('en-CA');
    const todayIso = new Date().toISOString().split('T')[0];
    const dateKeys = [todayStr, todayIso];

    let maxFound = 0;
    const stored = localStorage.getItem(`daily_activity_${lang}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') {
        for (const k of dateKeys) {
          const raw = parsed[k];
          const count = typeof raw === 'number' ? raw : (raw?.total || (typeof raw === 'string' ? parseInt(raw, 10) || 0 : 0));
          if (count > maxFound) maxFound = count;
        }
      }
    }

    const savedAppStats = localStorage.getItem(getStorageKey(lang));
    if (savedAppStats) {
      const parsed = JSON.parse(savedAppStats);
      if (parsed && typeof parsed?.cardsDone === 'number' && parsed.cardsDone > maxFound) {
        maxFound = parsed.cardsDone;
      }
    }

    return maxFound;
  } catch (e) {
    return 0;
  }
}

function loadInitialStatsForLang(lang: string = 'DE'): DailyStats {
  const todayKey = getTodayKey();
  const realTodayCards = getTodayCompletedCardsCount(lang);

  if (typeof window === 'undefined') {
    return { 
      date: todayKey, 
      activeSeconds: 0, 
      cardsDone: realTodayCards, 
      correctCount: realTodayCards, 
      mistakesCountToday: 0, 
      mistakesPool: [] 
    };
  }

  const key = getStorageKey(lang);
  let saved = localStorage.getItem(key);

  // Migration from legacy app_daily_stats for default German
  if (!saved && lang === 'DE') {
    try {
      const legacy = localStorage.getItem('app_daily_stats');
      if (legacy) {
        saved = legacy;
        localStorage.setItem(key, legacy);
      }
    } catch (e) {}
  }

  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        const mistakesPool = Array.isArray(parsed.mistakesPool) ? parsed.mistakesPool : [];
        if (parsed.date === todayKey) {
        const currentCards = Math.max(typeof parsed.cardsDone === 'number' ? parsed.cardsDone : 0, realTodayCards);
        
        const mistakesToday = typeof parsed.mistakesCountToday === 'number'
          ? Math.max(0, parsed.mistakesCountToday)
          : mistakesPool.length;

        let correctCount = typeof parsed.correctCount === 'number'
          ? parsed.correctCount
          : Math.max(0, currentCards - mistakesToday);

        if (currentCards > 0 && correctCount + mistakesToday < currentCards) {
          correctCount = Math.max(0, currentCards - mistakesToday);
        }

        return {
          date: todayKey,
          activeSeconds: typeof parsed.activeSeconds === 'number' ? parsed.activeSeconds : 0,
          cardsDone: currentCards,
          correctCount,
          mistakesCountToday: mistakesToday,
          mistakesPool
        };
      }

      // Новый день: сбрасываем дневные метрики, но сохраняем ошибки
      return {
        date: todayKey,
        activeSeconds: 0,
        cardsDone: realTodayCards,
        correctCount: realTodayCards,
        mistakesCountToday: 0,
        mistakesPool
      };
      }
    } catch (e) {}
  }

  return { 
    date: todayKey, 
    activeSeconds: 0, 
    cardsDone: realTodayCards, 
    correctCount: realTodayCards, 
    mistakesCountToday: 0, 
    mistakesPool: [] 
  };
}

// In-memory cache & listeners per language
const statsByLang: Record<string, DailyStats> = {};
const listenersByLang: Record<string, Set<(stats: DailyStats) => void>> = {};
const activeStudyCounts: Record<string, number> = {};

let timerInitialized = false;
let lastActivityTime = Date.now();

function getOrCreateStats(lang: string = 'DE'): DailyStats {
  if (!statsByLang[lang]) {
    statsByLang[lang] = loadInitialStatsForLang(lang);
  }
  return statsByLang[lang];
}

function notifyLang(lang: string) {
  const current = getOrCreateStats(lang);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(getStorageKey(lang), JSON.stringify(current));
    } catch (e) {}
  }
  if (listenersByLang[lang]) {
    listenersByLang[lang].forEach(fn => fn(current));
  }
}

function initGlobalTimer() {
  if (timerInitialized || typeof window === 'undefined') return;
  timerInitialized = true;

  const onActivity = () => { lastActivityTime = Date.now(); };
  window.addEventListener('pointerdown', onActivity, { passive: true });
  window.addEventListener('mousemove', onActivity, { passive: true });
  window.addEventListener('keydown', onActivity, { passive: true });
  window.addEventListener('touchstart', onActivity, { passive: true });
  window.addEventListener('scroll', onActivity, { passive: true });

  setInterval(() => {
    // 1. Вкладка не должна быть скрыта
    if (document.hidden) return;

    // 2. Защита от бездействия: пауза при простое > 60 секунд
    if (Date.now() - lastActivityTime > 60000) return;

    const today = getTodayKey();

    // Проверяем все языки, в которых сейчас активна учебная сессия
    Object.keys(activeStudyCounts).forEach(lang => {
      if ((activeStudyCounts[lang] || 0) <= 0) return;

      const current = getOrCreateStats(lang);
      if (current.date !== today) {
        const realCards = getTodayCompletedCardsCount(lang);
        statsByLang[lang] = {
          date: today,
          activeSeconds: 1,
          cardsDone: realCards,
          correctCount: realCards,
          mistakesCountToday: 0,
          mistakesPool: current.mistakesPool || []
        };
      } else {
        statsByLang[lang] = {
          ...current,
          activeSeconds: (current.activeSeconds || 0) + 1
        };
      }
      notifyLang(lang);
    });
  }, 1000);
}

export function useDayStats(options?: { isStudying?: boolean; language?: string }) {
  const isStudying = options?.isStudying ?? false;
  const lang = options?.language || (typeof window !== 'undefined' ? (localStorage.getItem('selected_language') || 'DE') : 'DE');

  const [stats, setLocalStats] = useState<DailyStats>(() => {
    return getOrCreateStats(lang);
  });

  // Синхронизация при смене языка
  useEffect(() => {
    setLocalStats(getOrCreateStats(lang));
  }, [lang]);

  // Управление активностью учебного таймера и подпиской на обновления языка
  useEffect(() => {
    initGlobalTimer();

    if (isStudying) {
      activeStudyCounts[lang] = (activeStudyCounts[lang] || 0) + 1;
      lastActivityTime = Date.now();
    }

    if (!listenersByLang[lang]) {
      listenersByLang[lang] = new Set();
    }

    const listener = (newStats: DailyStats) => setLocalStats(newStats);
    listenersByLang[lang].add(listener);

    return () => {
      if (listenersByLang[lang]) {
        listenersByLang[lang].delete(listener);
      }
      if (isStudying) {
        activeStudyCounts[lang] = Math.max(0, (activeStudyCounts[lang] || 0) - 1);
      }
    };
  }, [isStudying, lang]);

  const setStats = useCallback((updater: any) => {
    const current = getOrCreateStats(lang);
    const next = typeof updater === 'function' ? updater(current) : updater;
    statsByLang[lang] = next;
    notifyLang(lang);
  }, [lang]);

  const recordCardResult = useCallback((
    isCorrect: boolean, 
    card: any, 
    callOptions?: { isReviewingMistakes?: boolean; language?: string }
  ) => {
    const targetLang = callOptions?.language || lang;
    const current = getOrCreateStats(targetLang);
    let updatedPool = [...(current.mistakesPool || [])];
    
    // Извлекаем идентификаторы карточки надежно
    const cardId = card?.id || card?.card?.id || '';
    const targetWord = (card?.targetWord || card?.card?.targetWord || card?.sentence || '').trim();

    const matchFn = (c: any) => {
      const cId = c?.id || c?.card?.id || '';
      if (cardId && cId && cardId === cId) return true;
      const cWord = (c?.targetWord || c?.card?.targetWord || '').trim().toLowerCase();
      const tWord = (card?.targetWord || card?.card?.targetWord || '').trim().toLowerCase();
      if (tWord && cWord && tWord === cWord) return true;
      return false;
    };

    if (!isCorrect) {
      // Добавляем в банк ошибок (без дубликатов)
      if (!updatedPool.some(matchFn)) {
        const fullCardSnapshot = {
          deckId: card?.deckId || '',
          id: cardId || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now())),
          targetWord: targetWord || card?.targetWord || '',
          sentence: card?.sentence || card?.card?.sentence || '',
          translation: card?.translation || card?.card?.translation || '',
          options: Array.isArray(card?.options) ? card.options : (Array.isArray(card?.card?.options) ? card.card.options : []),
          masteryLevel: card?.masteryLevel ?? card?.card?.masteryLevel ?? 0,
          isArchived: Boolean(card?.isArchived || card?.card?.isArchived),
          baseWordInfo: card?.baseWordInfo || card?.card?.baseWordInfo || '',
          hint: card?.hint || card?.card?.hint || '',
          forms: card?.forms || card?.card?.forms || '',
          card: card?.card || card
        };
        updatedPool.push(fullCardSnapshot);
      }
    } else {
      // При правильном ответе удаляем ТОЛЬКО если находимся в режиме тренировки ошибок!
      if (callOptions?.isReviewingMistakes) {
        updatedPool = updatedPool.filter(c => !matchFn(c));
      }
    }

    const today = getTodayKey();
    const currentActivityCards = getTodayCompletedCardsCount(targetLang);
    const newCardsDone = Math.max((current.cardsDone || 0) + 1, currentActivityCards + (isCorrect ? 0 : 1));

    const prevMistakesToday = typeof current.mistakesCountToday === 'number'
      ? current.mistakesCountToday
      : (current.mistakesPool?.length || 0);
    const newMistakesToday = isCorrect ? prevMistakesToday : prevMistakesToday + 1;

    let newCorrectCount = (current.correctCount || 0) + (isCorrect ? 1 : 0);
    if (newCorrectCount + newMistakesToday > newCardsDone) {
      newCorrectCount = Math.max(0, newCardsDone - newMistakesToday);
    }

    statsByLang[targetLang] = {
      ...current,
      date: today,
      cardsDone: newCardsDone,
      correctCount: newCorrectCount,
      mistakesCountToday: newMistakesToday,
      mistakesPool: updatedPool
    };
    notifyLang(targetLang);
  }, [lang]);

  return { stats, setStats, recordCardResult };
}
