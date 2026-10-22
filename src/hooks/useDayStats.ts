import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

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

export function getLocalTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const getTodayKey = (): string => {
  try {
    return getLocalTodayDateString();
  } catch {
    return '2026-10-19';
  }
};

export const getStorageKey = (lang: string) => `app_daily_stats_${normalizeLanguage(lang)}`;

// --- CLEAN CARD SNAPSHOT ---
export function cleanCardSnapshot(card: any): any {
  if (!card) return null;
  const id = card.id || card.card?.id || '';
  const targetWord = (card.targetWord || card.card?.targetWord || card.sentence || '').trim();
  const sentence = card.sentence || card.card?.sentence || '';
  const translation = card.translation || card.card?.translation || '';
  const stableId = id || `${card?.deckId || 'deck'}::${targetWord}::${sentence}` || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now()));

  return {
    deckId: card.deckId || card.card?.deckId || '',
    id: stableId,
    targetWord: targetWord || card.targetWord || '',
    sentence,
    translation,
    options: Array.isArray(card.options) ? card.options : (Array.isArray(card.card?.options) ? card.card.options : []),
    masteryLevel: card.masteryLevel ?? card.card?.masteryLevel ?? 0,
    isArchived: Boolean(card.isArchived || card.card?.isArchived),
    baseWordInfo: card.baseWordInfo || card.card?.baseWordInfo || '',
    hint: card.hint || card.card?.hint || '',
    forms: card.forms || card.card?.forms || ''
  };
}

// --- INDEXEDDB STORAGE BACKUP (SAFARI PERSISTENCE) ---
const IDB_NAME = 'karten_db';
const IDB_VERSION = 2;
const IDB_STORE = 'day_stats';
const IDB_CACHE_STORE = 'app_cache';

function getDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'lang' });
        }
        if (!db.objectStoreNames.contains(IDB_CACHE_STORE)) {
          db.createObjectStore(IDB_CACHE_STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function setStatsInIDB(lang: string, stats: DailyStats): Promise<void> {
  try {
    const db = await getDB();
    if (!db) return;
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.put({ lang: normalizeLanguage(lang), ...stats });
  } catch (e) {}
}

export async function getStatsFromIDB(lang: string): Promise<DailyStats | null> {
  try {
    const db = await getDB();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req = store.get(normalizeLanguage(lang));
        req.onsuccess = () => {
          const res = req.result;
          if (res) {
            const { lang: _, ...stats } = res;
            resolve(stats as DailyStats);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

export async function setIDBItem<T>(key: string, value: T): Promise<void> {
  try {
    const db = await getDB();
    if (!db) return;
    const tx = db.transaction(IDB_CACHE_STORE, 'readwrite');
    const store = tx.objectStore(IDB_CACHE_STORE);
    store.put({ key, value });
  } catch (e) {}
}

export async function getIDBItem<T>(key: string): Promise<T | null> {
  try {
    const db = await getDB();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_CACHE_STORE, 'readonly');
        const store = tx.objectStore(IDB_CACHE_STORE);
        const req = store.get(key);
        req.onsuccess = () => {
          resolve(req.result ? (req.result.value as T) : null);
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

// --- SUPABASE CLOUD DATABASE STORAGE ---
let cloudSyncTimeout: ReturnType<typeof setTimeout> | null = null;

export async function syncStatsToSupabase(lang: string, stats: DailyStats, immediate: boolean = false): Promise<void> {
  const normLang = normalizeLanguage(lang);
  const performSync = async () => {
    try {
      const payload = {
        date: stats.date,
        activeSeconds: stats.activeSeconds || 0,
        cardsDone: stats.cardsDone || 0,
        correctCount: stats.correctCount || 0,
        mistakesCountToday: stats.mistakesCountToday || 0,
        mistakesPool: Array.isArray(stats.mistakesPool) ? stats.mistakesPool.map(cleanCardSnapshot).filter(Boolean) : []
      };
      await supabase.from('user_stats').upsert({
        language: `DAY_STATS_${normLang}`,
        daily_activity: payload
      }, { onConflict: 'language' });
    } catch (e) {
      console.warn('Supabase stats sync notice:', e);
    }
  };

  if (immediate) {
    if (cloudSyncTimeout) {
      clearTimeout(cloudSyncTimeout);
      cloudSyncTimeout = null;
    }
    await performSync();
  } else {
    if (cloudSyncTimeout) clearTimeout(cloudSyncTimeout);
    cloudSyncTimeout = setTimeout(() => {
      performSync();
      cloudSyncTimeout = null;
    }, 1500);
  }
}

export async function fetchStatsFromSupabase(lang: string): Promise<DailyStats | null> {
  try {
    const normLang = normalizeLanguage(lang);
    const { data, error } = await supabase
      .from('user_stats')
      .select('daily_activity')
      .eq('language', `DAY_STATS_${normLang}`)
      .maybeSingle();

    if (error || !data || !data.daily_activity) return null;
    const raw = data.daily_activity;
    if (raw && typeof raw === 'object') {
      return raw as DailyStats;
    }
    return null;
  } catch (e) {
    return null;
  }
}

export function reconcileStatsFromCloud(lang: string, cloudRaw: any): DailyStats {
  const normLang = normalizeLanguage(lang);
  const current = getOrCreateStats(normLang);
  if (!cloudRaw || typeof cloudRaw !== 'object') return current;

  const todayKey = getTodayKey();
  const cloudPool = Array.isArray(cloudRaw.mistakesPool) ? cloudRaw.mistakesPool.map(cleanCardSnapshot).filter(Boolean) : [];
  const mergedPool = mergeMistakesPools(current.mistakesPool || [], cloudPool);

  const isCloudToday = cloudRaw.date === todayKey;
  const todayActual = getTodayCompletedCardsCount(normLang);

  let maxActiveSeconds = current.date === todayKey ? (current.activeSeconds || 0) : 0;
  let maxCardsDone = current.date === todayKey ? (current.cardsDone || 0) : todayActual;
  let maxCorrectCount = current.date === todayKey ? (current.correctCount || 0) : todayActual;
  let maxMistakesToday = current.date === todayKey ? (current.mistakesCountToday || 0) : 0;

  if (isCloudToday) {
    if (typeof cloudRaw.activeSeconds === 'number' && cloudRaw.activeSeconds > maxActiveSeconds) {
      maxActiveSeconds = cloudRaw.activeSeconds;
    }
    const cloudDone = typeof cloudRaw.cardsDone === 'number' ? cloudRaw.cardsDone : 0;
    maxCardsDone = Math.max(maxCardsDone, cloudDone, todayActual);

    if (typeof cloudRaw.correctCount === 'number') {
      maxCorrectCount = Math.min(maxCardsDone, Math.max(maxCorrectCount, cloudRaw.correctCount));
    } else {
      maxCorrectCount = Math.max(maxCorrectCount, maxCardsDone);
    }
    const cloudMistakes = typeof cloudRaw.mistakesCountToday === 'number' ? cloudRaw.mistakesCountToday : cloudPool.length;
    maxMistakesToday = Math.max(maxMistakesToday, cloudMistakes, mergedPool.length);
  } else {
    maxMistakesToday = Math.max(maxMistakesToday, mergedPool.length);
  }

  try {
    const actKey = `daily_activity_${normLang}`;
    const existingAct = JSON.parse(localStorage.getItem(actKey) || '{}');
    existingAct[todayKey] = Math.max(existingAct[todayKey] || 0, maxCardsDone);
    localStorage.setItem(actKey, JSON.stringify(existingAct));
  } catch {}

  const updated: DailyStats = {
    date: todayKey,
    activeSeconds: maxActiveSeconds,
    cardsDone: maxCardsDone,
    correctCount: maxCorrectCount,
    mistakesCountToday: maxMistakesToday,
    mistakesPool: mergedPool
  };

  statsByLang[normLang] = updated;
  notifyLang(normLang, { skipCloudSync: true });
  return updated;
}

export function getMistakesPool(lang: string): any[] {
  const normLang = normalizeLanguage(lang);
  const current = getOrCreateStats(normLang);
  return current.mistakesPool || [];
}

// Robust localStorage writer with Safari Quota recovery
export function safeSetStorage(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    // Safari QuotaExceeded recovery: free up redundant cache keys
    try {
      localStorage.removeItem('cache_decks_v2');
      localStorage.removeItem('cache_books_v2');
      localStorage.removeItem('app_daily_stats');

      // Strip cards from cached decks to recover multiple megabytes immediately
      const rawDecks = localStorage.getItem('cached_app_decks');
      if (rawDecks) {
        try {
          const parsed = JSON.parse(rawDecks);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const lightweight = parsed.map((d: any) => ({ ...d, cards: [] }));
            localStorage.setItem('cached_app_decks', JSON.stringify(lightweight));
          }
        } catch {}
      }
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}

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
      result.push(cleanCardSnapshot(item));
    }
  }
  return result;
};

export function getTodayCompletedCardsCount(lang: string = 'DE'): number {
  if (typeof window === 'undefined') return 0;
  try {
    const normLang = normalizeLanguage(lang);
    const todayStr = getTodayKey();

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
          const raw = parsed[todayStr];
          const count = typeof raw === 'number' ? raw : (raw?.total || (typeof raw === 'string' ? parseInt(raw, 10) || 0 : 0));
          if (count > maxFound) maxFound = count;
        }
      }
    }

    const scopedKey = `daily_stats_${normLang.toLowerCase()}_${todayStr}`;
    const scopedRaw = localStorage.getItem(scopedKey);
    if (scopedRaw) {
      try {
        const parsed = JSON.parse(scopedRaw);
        if (typeof parsed?.learnedToday === 'number' && parsed.learnedToday > maxFound) {
          maxFound = parsed.learnedToday;
        }
      } catch {}
    }

    const appKeys = [
      getStorageKey(normLang),
      `app_daily_stats_${normLang.toLowerCase()}`
    ];
    for (const sKey of appKeys) {
      const savedAppStats = localStorage.getItem(sKey);
      if (savedAppStats) {
        const parsed = JSON.parse(savedAppStats);
        const isToday = parsed && parsed.date === todayStr;
        if (isToday && typeof parsed?.cardsDone === 'number' && parsed.cardsDone > maxFound) {
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

  // Canonical key and fallbacks
  const candidateKeys = [
    `app_daily_stats_${normLang}`,
    `app_daily_stats_${normLang.toLowerCase()}`
  ];
  if (normLang === 'DE') {
    candidateKeys.push('app_daily_stats');
  }

  let mergedPool: any[] = [];
  let maxActiveSeconds = 0;
  let maxCardsDone = realTodayCards;
  let maxMistakesToday = 0;
  let maxCorrectCount = realTodayCards;
  let foundTodaySaved = false;

  for (const key of candidateKeys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') continue;

      // Merge mistake cards safely
      if (Array.isArray(parsed.mistakesPool)) {
        mergedPool = mergeMistakesPools(mergedPool, parsed.mistakesPool);
      }

      const isCurrentDay = parsed.date === todayKey;
      if (isCurrentDay) {
        foundTodaySaved = true;
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

  // Clean up legacy non-namespaced key so it doesn't corrupt state on subsequent loads
  try {
    localStorage.removeItem('app_daily_stats');
  } catch (e) {}

  const finalMistakesToday = foundTodaySaved ? Math.max(maxMistakesToday, mergedPool.length) : mergedPool.length;
  const finalCardsDone = foundTodaySaved ? Math.max(maxCardsDone, realTodayCards) : realTodayCards;
  let finalCorrectCount = foundTodaySaved ? Math.max(maxCorrectCount, finalCardsDone - finalMistakesToday) : realTodayCards;
  if (finalCardsDone > 0 && finalCorrectCount + finalMistakesToday < finalCardsDone) {
    finalCorrectCount = Math.max(0, finalCardsDone - finalMistakesToday);
  }

  const result: DailyStats = {
    date: todayKey,
    activeSeconds: foundTodaySaved ? maxActiveSeconds : 0,
    cardsDone: finalCardsDone,
    correctCount: finalCorrectCount,
    mistakesCountToday: foundTodaySaved ? maxMistakesToday : 0,
    mistakesPool: mergedPool
  };

  // Save consolidated canonical state
  const serialized = JSON.stringify(result);
  safeSetStorage(`app_daily_stats_${normLang}`, serialized);
  setStatsInIDB(normLang, result);

  return result;
}

// In-memory cache & listeners per language
const statsByLang: Record<string, DailyStats> = {};
const listenersByLang: Record<string, Set<(stats: DailyStats) => void>> = {};
const activeStudyCounts: Record<string, number> = {};

let timerInitialized = false;
let lastActivityTime = Date.now();

export function resetDayStatsToZero(lang?: string) {
  if (typeof window === 'undefined') return;
  const todayKey = getTodayKey();
  const langs = lang ? [normalizeLanguage(lang)] : ['DE', 'EN', 'RU'];
  langs.forEach(l => {
    const cur = statsByLang[l] || { mistakesPool: [] };
    const resetStats: DailyStats = {
      date: todayKey,
      activeSeconds: 0,
      cardsDone: 0,
      correctCount: 0,
      mistakesCountToday: 0,
      mistakesPool: cur.mistakesPool || []
    };
    statsByLang[l] = resetStats;
    safeSetStorage(`app_daily_stats_${l}`, JSON.stringify(resetStats));
    safeSetStorage(`app_daily_stats_${l.toLowerCase()}`, JSON.stringify(resetStats));
    setStatsInIDB(l, resetStats);
    if (listenersByLang[l]) {
      listenersByLang[l].forEach(fn => fn(resetStats));
    }
  });
  window.dispatchEvent(new CustomEvent('stats-update'));
}

function getOrCreateStats(lang: string = 'DE'): DailyStats {
  const normLang = normalizeLanguage(lang);
  if (!statsByLang[normLang]) {
    statsByLang[normLang] = loadInitialStatsForLang(normLang);
  }
  const current = statsByLang[normLang];
  const today = getTodayKey();
  if (current.date !== today) {
    const realToday = getTodayCompletedCardsCount(normLang);
    statsByLang[normLang] = {
      date: today,
      activeSeconds: 0,
      cardsDone: realToday,
      correctCount: realToday,
      mistakesCountToday: 0,
      mistakesPool: current.mistakesPool || []
    };
    safeSetStorage(`app_daily_stats_${normLang}`, JSON.stringify(statsByLang[normLang]));
    safeSetStorage(`app_daily_stats_${normLang.toLowerCase()}`, JSON.stringify(statsByLang[normLang]));
    setStatsInIDB(normLang, statsByLang[normLang]);
  }
  return statsByLang[normLang];
}

function notifyLang(lang: string, options?: { skipCloudSync?: boolean }) {
  const normLang = normalizeLanguage(lang);
  const current = getOrCreateStats(normLang);
  if (typeof window !== 'undefined') {
    const serialized = JSON.stringify(current);
    safeSetStorage(`app_daily_stats_${normLang}`, serialized);
    safeSetStorage(`app_daily_stats_${normLang.toLowerCase()}`, serialized);
    setStatsInIDB(normLang, current);
    window.dispatchEvent(new CustomEvent('stats-update', { detail: { language: normLang } }));
  }
  if (!options?.skipCloudSync) {
    syncStatsToSupabase(normLang, current, false);
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

  // Safari unload/pagehide flush to local & Supabase
  const flushAll = () => {
    Object.keys(statsByLang).forEach(l => {
      const s = statsByLang[l];
      if (s) {
        safeSetStorage(getStorageKey(l), JSON.stringify(s));
        setStatsInIDB(l, s);
        syncStatsToSupabase(l, s, true);
      }
    });
  };
  window.addEventListener('pagehide', flushAll);
  window.addEventListener('beforeunload', flushAll);

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

  // Safari recovery: background check from IndexedDB
  useEffect(() => {
    let isCancelled = false;
    getStatsFromIDB(lang).then(idbStats => {
      if (isCancelled || !idbStats) return;
      const current = getOrCreateStats(lang);
      const mergedPool = mergeMistakesPools(current.mistakesPool || [], idbStats.mistakesPool || []);
      if (mergedPool.length > (current.mistakesPool?.length || 0)) {
        const mergedStats: DailyStats = {
          ...current,
          mistakesPool: mergedPool,
          mistakesCountToday: Math.max(current.mistakesCountToday || 0, idbStats.mistakesCountToday || 0, mergedPool.length)
        };
        statsByLang[lang] = mergedStats;
        notifyLang(lang, { skipCloudSync: true });
        setLocalStats(mergedStats);
      }
    });
    return () => { isCancelled = true; };
  }, [lang]);

  // Supabase Cloud recovery: fetch canonical database stats on mount, tab focus/visibility, and live Realtime
  useEffect(() => {
    let isCancelled = false;
    const syncFromCloud = () => {
      fetchStatsFromSupabase(lang).then(cloudStats => {
        if (isCancelled || !cloudStats) return;
        const updated = reconcileStatsFromCloud(lang, cloudStats);
        setLocalStats(updated);
      });
    };

    syncFromCloud();

    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        syncFromCloud();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    // Supabase Realtime channel for instant cross-browser and cross-device sync
    const channel = supabase
      .channel(`realtime-daystats-${lang}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_stats',
        filter: `language=eq.DAY_STATS_${normalizeLanguage(lang)}`
      }, (payload: any) => {
        if (payload?.new?.daily_activity && !isCancelled) {
          const updated = reconcileStatsFromCloud(lang, payload.new.daily_activity);
          setLocalStats(updated);
        }
      })
      .subscribe();

    return () => {
      isCancelled = true;
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
      supabase.removeChannel(channel);
    };
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
    syncStatsToSupabase(lang, next, true);
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
        const cleanCard = cleanCardSnapshot(card);
        if (cleanCard) {
          updatedPool.push(cleanCard);
        }
      }
    } else {
      // Remove ONLY if explicitly in mistakes review mode!
      if (callOptions?.isReviewingMistakes) {
        updatedPool = updatedPool.filter(c => !matchFn(c));
      }
    }

    const today = getTodayKey();
    const currentActivityCards = getTodayCompletedCardsCount(targetLang);
    const newCardsDone = isCorrect
      ? Math.max((current.cardsDone || 0) + 1, currentActivityCards)
      : Math.max(current.cardsDone || 0, currentActivityCards);

    const prevMistakesToday = typeof current.mistakesCountToday === 'number'
      ? current.mistakesCountToday
      : (current.mistakesPool?.length || 0);
    const newMistakesToday = isCorrect ? prevMistakesToday : Math.max(prevMistakesToday + 1, updatedPool.length);

    const newCorrectCount = isCorrect
      ? Math.max((current.correctCount || 0) + 1, newCardsDone)
      : Math.max(current.correctCount || 0, newCardsDone);

    const nextStats: DailyStats = {
      ...current,
      date: today,
      cardsDone: newCardsDone,
      correctCount: newCorrectCount,
      mistakesCountToday: newMistakesToday,
      mistakesPool: updatedPool
    };

    statsByLang[targetLang] = nextStats;
    notifyLang(targetLang);
    // Instant sync to Supabase database so reload never loses anything
    syncStatsToSupabase(targetLang, nextStats, true);
  }, [lang]);

  return { stats, setStats, recordCardResult };
}
