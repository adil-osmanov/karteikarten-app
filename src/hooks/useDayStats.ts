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

export const normalizeLanguage = (lang?: string | null): SupportedLanguage => {
  if (!lang) return 'DE';
  const clean = String(lang).trim().toUpperCase();
  if (clean === 'DE' || clean.startsWith('DE')) return 'DE';
  if (clean === 'EN' || clean.startsWith('EN')) return 'EN';
  if (clean === 'RU' || clean.startsWith('RU')) return 'RU';
  return clean || 'DE';
};

export const getTodayKey = (): string => {
  try {
    return new Date().toLocaleDateString('en-CA');
  } catch {
    return new Date().toISOString().split('T')[0];
  }
};

export const getStorageKey = (lang: string) => `app_daily_stats_${normalizeLanguage(lang)}`;

export const isSameCard = (a: any, b: any): boolean => {
  if (!a || !b) return false;
  
  const aId = a?.id || a?.card?.id;
  const bId = b?.id || b?.card?.id;
  if (aId && bId && String(aId) === String(bId)) return true;

  const aWord = (a?.targetWord || a?.card?.targetWord || '').trim().toLowerCase();
  const bWord = (b?.targetWord || b?.card?.targetWord || '').trim().toLowerCase();
  
  const aSentence = (a?.sentence || a?.card?.sentence || '').trim().toLowerCase();
  const bSentence = (b?.sentence || b?.card?.sentence || '').trim().toLowerCase();

  // If both have sentences, both word AND sentence must match
  if (aSentence && bSentence) {
    return aWord === bWord && aSentence === bSentence;
  }

  // If one or both lack sentences, check translations
  const aTrans = (a?.translation || a?.card?.translation || '').trim().toLowerCase();
  const bTrans = (b?.translation || b?.card?.translation || '').trim().toLowerCase();
  if (aWord && bWord && aWord === bWord) {
    if (aTrans && bTrans) {
      return aTrans === bTrans;
    }
    return !aSentence && !bSentence;
  }

  return false;
};

export const mergeMistakesPools = (poolA: any[] = [], poolB: any[] = []): any[] => {
  const result = [...(Array.isArray(poolA) ? poolA : [])];
  const incoming = Array.isArray(poolB) ? poolB : [];

  for (const item of incoming) {
    if (!item) continue;
    const exists = result.some(existing => isSameCard(existing, item));
    if (!exists) {
      result.push(item);
    }
  }
  return result;
};

export function getTodayCompletedCardsCount(lang: string = 'DE'): number {
  if (typeof window === 'undefined') return 0;
  try {
    const normLang = normalizeLanguage(lang);
    const todayStr = getTodayKey();
    const todayIso = new Date().toISOString().split('T')[0];
    const dateKeys = [todayStr, todayIso];

    let maxFound = 0;
    const activityKeys = [
      `daily_activity_${normLang}`,
      `daily_activity_${normLang.toLowerCase()}`
    ];
    for (const aKey of activityKeys) {
      const stored = localStorage.getItem(aKey);
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
    }

    const appKeys = [
      getStorageKey(normLang),
      `app_daily_stats_${normLang.toLowerCase()}`
    ];
    for (const sKey of appKeys) {
      const savedAppStats = localStorage.getItem(sKey);
      if (savedAppStats) {
        const parsed = JSON.parse(savedAppStats);
        if (parsed && typeof parsed?.cardsDone === 'number' && parsed.cardsDone > maxFound) {
          maxFound = parsed.cardsDone;
        }
      }
    }

    return maxFound;
  } catch (e) {
    return 0;
  }
}

function loadInitialStatsForLang(lang: string = 'DE'): DailyStats {
  const normLang = normalizeLanguage(lang);
  const todayKey = getTodayKey();
  const todayIso = new Date().toISOString().split('T')[0];
  const realTodayCards = getTodayCompletedCardsCount(normLang);

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

  // Check canonical key, lowercase key, and (for DE) legacy un-suffixed key
  const candidateKeys = [
    `app_daily_stats_${normLang}`,
    `app_daily_stats_${normLang.toLowerCase()}`
  ];
  if (normLang === 'DE') {
    candidateKeys.push('app_daily_stats');
  }

  let mergedPool: any[] = [];
  let bestDate = todayKey;
  let maxActiveSeconds = 0;
  let maxCardsDone = realTodayCards;
  let maxMistakesToday = 0;
  let maxCorrectCount = realTodayCards;
  let foundAnySaved = false;

  for (const key of candidateKeys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') continue;
      foundAnySaved = true;

      // Merge mistake cards safely
      if (Array.isArray(parsed.mistakesPool)) {
        mergedPool = mergeMistakesPools(mergedPool, parsed.mistakesPool);
      }

      const isCurrentDay = parsed.date === todayKey || parsed.date === todayIso;
      if (isCurrentDay) {
        bestDate = todayKey;
        if (typeof parsed.activeSeconds === 'number' && parsed.activeSeconds > maxActiveSeconds) {
          maxActiveSeconds = parsed.activeSeconds;
        }
        if (typeof parsed.cardsDone === 'number' && parsed.cardsDone > maxCardsDone) {
          maxCardsDone = parsed.cardsDone;
        }
        const parsedMistakesToday = typeof parsed.mistakesCountToday === 'number'
          ? parsed.mistakesCountToday
          : (Array.isArray(parsed.mistakesPool) ? parsed.mistakesPool.length : 0);
        if (parsedMistakesToday > maxMistakesToday) {
          maxMistakesToday = parsedMistakesToday;
        }
        if (typeof parsed.correctCount === 'number' && parsed.correctCount > maxCorrectCount) {
          maxCorrectCount = parsed.correctCount;
        }
      }
    } catch (e) {}
  }

  if (foundAnySaved) {
    const finalMistakesToday = Math.max(maxMistakesToday, mergedPool.length);
    const finalCardsDone = Math.max(maxCardsDone, realTodayCards);
    let finalCorrectCount = Math.max(maxCorrectCount, finalCardsDone - finalMistakesToday);
    if (finalCardsDone > 0 && finalCorrectCount + finalMistakesToday < finalCardsDone) {
      finalCorrectCount = Math.max(0, finalCardsDone - finalMistakesToday);
    }

    const result: DailyStats = {
      date: bestDate,
      activeSeconds: maxActiveSeconds,
      cardsDone: finalCardsDone,
      correctCount: finalCorrectCount,
      mistakesCountToday: finalMistakesToday,
      mistakesPool: mergedPool
    };

    // Keep storage consolidated and synchronized across both casings
    try {
      const serialized = JSON.stringify(result);
      localStorage.setItem(`app_daily_stats_${normLang}`, serialized);
      localStorage.setItem(`app_daily_stats_${normLang.toLowerCase()}`, serialized);
    } catch (e) {}

    return result;
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
  const normLang = normalizeLanguage(lang);
  if (!statsByLang[normLang]) {
    statsByLang[normLang] = loadInitialStatsForLang(normLang);
  }
  return statsByLang[normLang];
}

function notifyLang(lang: string) {
  const normLang = normalizeLanguage(lang);
  const current = getOrCreateStats(normLang);
  if (typeof window !== 'undefined') {
    try {
      const serialized = JSON.stringify(current);
      localStorage.setItem(`app_daily_stats_${normLang}`, serialized);
      localStorage.setItem(`app_daily_stats_${normLang.toLowerCase()}`, serialized);
      window.dispatchEvent(new CustomEvent('stats-update', { detail: { language: normLang } }));
    } catch (e) {}
  }
  if (listenersByLang[normLang]) {
    listenersByLang[normLang].forEach(fn => fn(current));
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
    if (document.hidden) return;
    if (Date.now() - lastActivityTime > 60000) return;

    const today = getTodayKey();

    Object.keys(activeStudyCounts).forEach(rawLang => {
      const lang = normalizeLanguage(rawLang);
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
  const lang = normalizeLanguage(options?.language || (typeof window !== 'undefined' ? (localStorage.getItem('selected_language') || 'DE') : 'DE'));

  const [stats, setLocalStats] = useState<DailyStats>(() => {
    return getOrCreateStats(lang);
  });

  // Synchronize on language change
  useEffect(() => {
    setLocalStats(getOrCreateStats(lang));
  }, [lang]);

  // Manage study activity timer & listener subscriptions
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

    const handleCustomUpdate = (e: any) => {
      const target = normalizeLanguage(e?.detail?.language);
      if (!target || target === lang) {
        setLocalStats(getOrCreateStats(lang));
      }
    };
    window.addEventListener('stats-update', handleCustomUpdate);

    return () => {
      if (listenersByLang[lang]) {
        listenersByLang[lang].delete(listener);
      }
      window.removeEventListener('stats-update', handleCustomUpdate);
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
    const targetLang = normalizeLanguage(callOptions?.language || lang);
    const current = getOrCreateStats(targetLang);
    let updatedPool = [...(current.mistakesPool || [])];

    // Ensure we sync with storage so no concurrent errors are lost
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(getStorageKey(targetLang));
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed?.mistakesPool)) {
            updatedPool = mergeMistakesPools(updatedPool, parsed.mistakesPool);
          }
        }
      } catch (e) {}
    }
    
    // Extract card identifiers reliably
    const cardId = card?.id || card?.card?.id || '';
    const targetWord = (card?.targetWord || card?.card?.targetWord || card?.sentence || '').trim();
    const sentence = card?.sentence || card?.card?.sentence || '';
    const translation = card?.translation || card?.card?.translation || '';

    const matchFn = (c: any) => isSameCard(c, { id: cardId, targetWord, sentence, translation });

    if (!isCorrect) {
      // Add to mistakes pool (deduplicating only exact card instances)
      if (!updatedPool.some(matchFn)) {
        const stableId = cardId || `${card?.deckId || 'deck'}::${targetWord}::${sentence}` || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now()));
        const fullCardSnapshot = {
          deckId: card?.deckId || '',
          id: stableId,
          targetWord: targetWord || card?.targetWord || '',
          sentence: sentence,
          translation: translation,
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
      // Remove ONLY if explicitly in mistakes review mode!
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
    const newMistakesToday = isCorrect ? prevMistakesToday : Math.max(prevMistakesToday + 1, updatedPool.length);

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
