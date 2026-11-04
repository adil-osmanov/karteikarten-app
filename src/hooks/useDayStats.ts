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

export interface DayRecord {
  date: string; // 'YYYY-MM-DD'
  cardsReviewed: number;
  targetCards: number;
  focusMinutes: number;
  accuracy: number; // процент 0..100
  mistakesCount: number;
  wordsMastered: number; // сколько слов перешло в Stufe 4
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
      const history = getDailyStatsHistory(normLang, 30);
      const payload = {
        date: stats.date,
        activeSeconds: stats.activeSeconds || 0,
        cardsDone: stats.cardsDone || 0,
        correctCount: stats.correctCount || 0,
        mistakesCountToday: stats.mistakesCountToday || 0,
        mistakesPool: Array.isArray(stats.mistakesPool) ? stats.mistakesPool.map(cleanCardSnapshot).filter(Boolean) : [],
        history
      };
      await supabase.from('user_stats').upsert({
        language: `DAY_STATS_${normLang}`,
        daily_activity: payload
      }, { onConflict: 'language' });

      // Synchronize with user_daily_stats if authenticated and table exists
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const todayRecord = getDayRecord(normLang, stats.date);
          await supabase.from('user_daily_stats').upsert({
            user_id: user.id,
            language: normLang,
            date: stats.date,
            cards_reviewed: todayRecord.cardsReviewed,
            target_cards: todayRecord.targetCards,
            focus_minutes: todayRecord.focusMinutes,
            accuracy: todayRecord.accuracy,
            mistakes_count: todayRecord.mistakesCount,
            words_mastered: todayRecord.wordsMastered,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id,language,date' });
        }
      } catch {}
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

  // Reconcile multi-day history
  if (Array.isArray(cloudRaw.history)) {
    for (const hItem of cloudRaw.history) {
      if (hItem && hItem.date) {
        saveDayRecord(normLang, hItem);
      }
    }
  }

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
      localStorage.removeItem('cached_app_decks');
      localStorage.removeItem('app_daily_stats');
      if (key === 'cached_app_decks') return false;
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

// --- HISTORICAL MULTI-DAY TRACKING & STORAGE ---
export function getDayRecord(lang: string = 'DE', dateStr: string): DayRecord {
  const normLang = normalizeLanguage(lang);
  const targetCards = 200;

  // 1. Check daily_stats_history map in localStorage
  if (typeof window !== 'undefined') {
    try {
      const histKey = `daily_stats_history_${normLang}`;
      const histRaw = localStorage.getItem(histKey);
      if (histRaw) {
        const histMap: Record<string, DayRecord> = JSON.parse(histRaw);
        if (histMap && histMap[dateStr]) {
          return histMap[dateStr];
        }
      }
    } catch {}
  }

  // 2. Fallback: check scoped daily_stats_{lang}_{date}
  let cardsReviewed = 0;
  let focusMinutes = 0;
  let accuracy = 100;
  let mistakesCount = 0;
  let wordsMastered = 0;

  if (typeof window !== 'undefined') {
    try {
      const scopedKey = `daily_stats_${normLang.toLowerCase()}_${dateStr}`;
      const scopedRaw = localStorage.getItem(scopedKey);
      if (scopedRaw) {
        const parsed = JSON.parse(scopedRaw);
        if (typeof parsed?.learnedToday === 'number') cardsReviewed = parsed.learnedToday;
        if (typeof parsed?.focusSeconds === 'number') focusMinutes = Math.floor(parsed.focusSeconds / 60);
        if (typeof parsed?.accuracy === 'number') accuracy = parsed.accuracy;
        if (typeof parsed?.mistakesCount === 'number') mistakesCount = parsed.mistakesCount;
      }
    } catch {}

    // 3. Fallback: check daily_activity_{lang}
    if (cardsReviewed === 0) {
      try {
        const actRaw = localStorage.getItem(`daily_activity_${normLang}`);
        if (actRaw) {
          const parsed = JSON.parse(actRaw);
          const val = parsed?.[dateStr];
          const num = typeof val === 'number' ? val : (val?.total || (typeof val === 'string' ? parseInt(val, 10) || 0 : 0));
          if (num > cardsReviewed) cardsReviewed = num;
        }
      } catch {}
    }
  }

  // Fallback for focus minutes: ~4.5 seconds per card reviewed
  const effectiveFocusMinutes = Math.max(
    focusMinutes || 0,
    cardsReviewed > 0 ? Math.max(1, Math.round((cardsReviewed * 4.5) / 60)) : 0
  );

  return {
    date: dateStr,
    cardsReviewed,
    targetCards,
    focusMinutes: effectiveFocusMinutes,
    accuracy,
    mistakesCount,
    wordsMastered
  };
}

export function saveDayRecord(lang: string = 'DE', record: Partial<DayRecord> & { date: string }): DayRecord {
  const normLang = normalizeLanguage(lang);
  const current = getDayRecord(normLang, record.date);
  const reviewed = typeof record.cardsReviewed === 'number' ? record.cardsReviewed : current.cardsReviewed;
  const rawMinutes = typeof record.focusMinutes === 'number' ? record.focusMinutes : current.focusMinutes;
  const effectiveMinutes = Math.max(
    rawMinutes || 0,
    reviewed > 0 ? Math.max(1, Math.round((reviewed * 4.5) / 60)) : 0
  );

  const updated: DayRecord = {
    date: record.date,
    cardsReviewed: reviewed,
    targetCards: typeof record.targetCards === 'number' ? record.targetCards : (current.targetCards || 200),
    focusMinutes: effectiveMinutes,
    accuracy: typeof record.accuracy === 'number' ? record.accuracy : current.accuracy,
    mistakesCount: typeof record.mistakesCount === 'number' ? record.mistakesCount : current.mistakesCount,
    wordsMastered: typeof record.wordsMastered === 'number' ? record.wordsMastered : current.wordsMastered,
  };

  if (typeof window !== 'undefined') {
    try {
      const histKey = `daily_stats_history_${normLang}`;
      const histRaw = localStorage.getItem(histKey);
      const histMap: Record<string, DayRecord> = histRaw ? JSON.parse(histRaw) : {};
      histMap[record.date] = updated;
      safeSetStorage(histKey, JSON.stringify(histMap));

      // Synchronize with daily_activity map
      const actKey = `daily_activity_${normLang}`;
      const actRaw = localStorage.getItem(actKey);
      const actMap = actRaw ? JSON.parse(actRaw) : {};
      actMap[record.date] = Math.max(actMap[record.date] || 0, updated.cardsReviewed);
      safeSetStorage(actKey, JSON.stringify(actMap));

      // Synchronize with daily_stats_{lang}_{date}
      const scopedKey = `daily_stats_${normLang.toLowerCase()}_${record.date}`;
      const existingScoped = localStorage.getItem(scopedKey);
      const scopedParsed = existingScoped ? JSON.parse(existingScoped) : {};
      safeSetStorage(scopedKey, JSON.stringify({
        ...scopedParsed,
        date: record.date,
        learnedToday: updated.cardsReviewed,
        focusSeconds: updated.focusMinutes * 60,
        accuracy: updated.accuracy,
        mistakesCount: updated.mistakesCount
      }));
    } catch {}
  }

  return updated;
}

export function getDailyStatsHistory(lang: string = 'DE', daysCount: number = 7): DayRecord[] {
  const normLang = normalizeLanguage(lang);
  const todayKey = getTodayKey();
  const currentToday = statsByLang[normLang];

  const result: DayRecord[] = [];
  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    let record = getDayRecord(normLang, dateStr);

    if (dateStr === todayKey && currentToday) {
      const liveCards = Math.max(record.cardsReviewed, currentToday.cardsDone || 0, getTodayCompletedCardsCount(normLang));
      const liveSeconds = currentToday.activeSeconds || 0;
      const liveMinutes = Math.max(record.focusMinutes, Math.floor(liveSeconds / 60));
      const liveMistakes = typeof currentToday.mistakesCountToday === 'number'
        ? currentToday.mistakesCountToday
        : (currentToday.mistakesPool?.length || 0);
      const totalAttempts = liveCards + liveMistakes;
      const liveAccuracy = totalAttempts > 0 ? Math.round((liveCards / totalAttempts) * 100) : 100;

      record = {
        ...record,
        cardsReviewed: liveCards,
        focusMinutes: liveMinutes,
        accuracy: liveAccuracy,
        mistakesCount: liveMistakes
      };
      saveDayRecord(normLang, record);
    }

    const effectiveMinutes = Math.max(
      record.focusMinutes || 0,
      (record.cardsReviewed || 0) > 0 ? Math.max(1, Math.round(((record.cardsReviewed || 0) * 4.5) / 60)) : 0
    );

    result.push({
      ...record,
      focusMinutes: effectiveMinutes
    });
  }

  return result;
}

/**
 * Возвращает 7 дней текущей календарной недели строго с Понедельника по Воскресенье
 */
export function getCurrentWeekDailyStats(lang: string = 'DE'): DayRecord[] {
  const normLang = normalizeLanguage(lang);
  const todayKey = getTodayKey();
  const currentToday = statsByLang[normLang];

  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7; // 0 for Mo, 1 for Di, ..., 6 for So
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek);

  const result: DayRecord[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    let record = getDayRecord(normLang, dateStr);

    if (dateStr === todayKey && currentToday) {
      const liveCards = Math.max(record.cardsReviewed, currentToday.cardsDone || 0, getTodayCompletedCardsCount(normLang));
      const liveSeconds = currentToday.activeSeconds || 0;
      const liveMinutes = Math.max(record.focusMinutes, Math.floor(liveSeconds / 60));
      const liveMistakes = typeof currentToday.mistakesCountToday === 'number'
        ? currentToday.mistakesCountToday
        : (currentToday.mistakesPool?.length || 0);
      const totalAttempts = liveCards + liveMistakes;
      const liveAccuracy = totalAttempts > 0 ? Math.round((liveCards / totalAttempts) * 100) : 100;

      record = {
        ...record,
        cardsReviewed: liveCards,
        focusMinutes: liveMinutes,
        accuracy: liveAccuracy,
        mistakesCount: liveMistakes
      };
      saveDayRecord(normLang, record);
    }

    const effectiveMinutes = Math.max(
      record.focusMinutes || 0,
      (record.cardsReviewed || 0) > 0 ? Math.max(1, Math.round(((record.cardsReviewed || 0) * 4.5) / 60)) : 0
    );

    result.push({
      ...record,
      focusMinutes: effectiveMinutes
    });
  }

  return result;
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
    // Preserve completed yesterday stats in multi-day history
    try {
      const prevCards = current.cardsDone || 0;
      const prevMistakes = current.mistakesCountToday || 0;
      const prevAttempts = prevCards + prevMistakes;
      saveDayRecord(normLang, {
        date: current.date,
        cardsReviewed: prevCards,
        targetCards: 200,
        focusMinutes: Math.floor((current.activeSeconds || 0) / 60),
        accuracy: prevAttempts > 0 ? Math.round((prevCards / prevAttempts) * 100) : 100,
        mistakesCount: prevMistakes,
        wordsMastered: 0
      });
    } catch {}

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
        saveDayRecord(l, {
          date: s.date,
          cardsReviewed: s.cardsDone,
          focusMinutes: Math.floor((s.activeSeconds || 0) / 60),
          mistakesCount: s.mistakesCountToday || 0
        });
        safeSetStorage(getStorageKey(l), JSON.stringify(s));
        setStatsInIDB(l, s);
        syncStatsToSupabase(l, s, true);
      }
    });
  };
  window.addEventListener('pagehide', flushAll);
  window.addEventListener('beforeunload', flushAll);

  setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

    const today = getTodayKey();

    Object.keys(activeStudyCounts).forEach(rawLang => {
      const lang = normalizeLanguage(rawLang);
      if ((activeStudyCounts[lang] || 0) <= 0) return;

      const current = getOrCreateStats(lang);
      if (current.date !== today) {
        try {
          const prevCards = current.cardsDone || 0;
          const prevMistakes = current.mistakesCountToday || 0;
          const prevAttempts = prevCards + prevMistakes;
          saveDayRecord(lang, {
            date: current.date,
            cardsReviewed: prevCards,
            targetCards: 200,
            focusMinutes: Math.floor((current.activeSeconds || 0) / 60),
            accuracy: prevAttempts > 0 ? Math.round((prevCards / prevAttempts) * 100) : 100,
            mistakesCount: prevMistakes,
            wordsMastered: 0
          });
        } catch {}

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
        const nextSeconds = (current.activeSeconds || 0) + 1;
        const updated = {
          ...current,
          activeSeconds: nextSeconds
        };
        statsByLang[lang] = updated;

        // Periodically update focus minutes in DayRecord and sync to IndexedDB & Supabase every 30 seconds
        if (nextSeconds % 30 === 0) {
          const focusMins = Math.floor(nextSeconds / 60);
          saveDayRecord(lang, {
            date: today,
            focusMinutes: focusMins
          });
          setStatsInIDB(lang, updated);
          syncStatsToSupabase(lang, updated, false);
        }
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
        const current = statsByLang[lang];
        if (current) {
          const today = getTodayKey();
          const focusMins = Math.floor((current.activeSeconds || 0) / 60);
          saveDayRecord(lang, {
            date: today,
            focusMinutes: focusMins
          });
          setStatsInIDB(lang, current);
          syncStatsToSupabase(lang, current, false);
        }
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

    // Keep today's entry up-to-date in multi-day history
    const totalAttempts = newCardsDone + newMistakesToday;
    const currentAcc = totalAttempts > 0 ? Math.round((newCardsDone / totalAttempts) * 100) : 100;
    saveDayRecord(targetLang, {
      date: today,
      cardsReviewed: newCardsDone,
      targetCards: 200,
      focusMinutes: Math.floor((nextStats.activeSeconds || 0) / 60),
      accuracy: currentAcc,
      mistakesCount: newMistakesToday
    });

    statsByLang[targetLang] = nextStats;
    notifyLang(targetLang);
    // Instant sync to Supabase database so reload never loses anything
    syncStatsToSupabase(targetLang, nextStats, true);
  }, [lang]);

  return { stats, setStats, recordCardResult };
}
