import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, safeUpsertUserStats, safeFetchUserStats, saveUserDayStats, loadDayProgress, saveDayProgress } from '@/lib/supabase';

export interface DailyStats {
  date: string;
  activeSeconds: number;
  cardsDone: number;
  correctCount: number;
  mistakesCountToday?: number;
  mistakesPool: any[];
  words_learned_today?: number;
  cards_reviewed_today?: number;
}

export interface DayRecord {
  date: string; // 'YYYY-MM-DD'
  cardsReviewed: number;
  targetCards: number;
  focusMinutes: number;
  accuracy: number; // процент 0..100
  mistakesCount: number;
  wordsMastered: number; // сколько слов перешло в Stufe 4
  words_learned_today?: number;
  cards_reviewed_today?: number;
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

export function getLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getLocalTodayDateString(): string {
  return getLocalDateString(new Date());
}

export function computeStrictAccuracy(correct: number, mistakes: number): number {
  const c = Math.max(0, correct || 0);
  const m = Math.max(0, mistakes || 0);
  const totalAnswers = c + m;
  if (totalAnswers === 0 || m === 0) return 100;
  return Math.max(0, Math.min(100, Math.round((c / totalAnswers) * 100)));
}

export interface KraftDailyStatEntry {
  cardsDone: number;
  correct: number;
  mistakes: number;
  focusMinutes?: number;
}

export function getKraftDailyStatsMap(): Record<string, KraftDailyStatEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem('kraft_daily_stats');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function syncKraftDailyStatEntry(
  dateStr: string,
  updates: Partial<KraftDailyStatEntry> & {
    incrementCards?: number;
    incrementCorrect?: number;
    incrementMistakes?: number;
  }
): Record<string, KraftDailyStatEntry> {
  if (typeof window === 'undefined' || !dateStr) return {};
  try {
    const map = getKraftDailyStatsMap();
    const prev = map[dateStr] || { cardsDone: 0, correct: 0, mistakes: 0 };
    const nextCardsDone = typeof updates.cardsDone === 'number'
      ? Math.max(prev.cardsDone || 0, updates.cardsDone)
      : (prev.cardsDone || 0) + (updates.incrementCards || 0);
    const nextCorrect = typeof updates.correct === 'number'
      ? Math.max(prev.correct || 0, updates.correct)
      : (prev.correct || 0) + (updates.incrementCorrect || 0);
    const nextMistakes = typeof updates.mistakes === 'number'
      ? Math.max(0, updates.mistakes)
      : Math.max(0, (prev.mistakes || 0) + (updates.incrementMistakes || 0));

    map[dateStr] = {
      cardsDone: Math.max(0, nextCardsDone),
      correct: Math.max(0, nextCorrect),
      mistakes: nextMistakes,
      ...(typeof updates.focusMinutes === 'number'
        ? { focusMinutes: updates.focusMinutes }
        : prev.focusMinutes !== undefined
          ? { focusMinutes: prev.focusMinutes }
          : {}),
    };
    localStorage.setItem('kraft_daily_stats', JSON.stringify(map));
    return map;
  } catch {
    return {};
  }
}

export function sanitizeTodayMistakesCount(
  rawMistakesCount: number | undefined | null,
  explicitIds?: string[] | null,
  poolLength?: number
): number {
  const count = typeof rawMistakesCount === 'number' && rawMistakesCount > 0 ? rawMistakesCount : 0;
  if (count === 0) return 0;

  const explicitLen = Array.isArray(explicitIds) ? explicitIds.length : null;
  const poolLen = typeof poolLength === 'number' ? poolLength : 0;

  // Reject clearly corrupt/unbacked inflated multi-day values when 0 mistakes are logged for today
  if (explicitLen === 0 && count >= 20 && (poolLen === 0 || count >= poolLen)) {
    return 0;
  }
  if (explicitLen === null && count >= 50) {
    return 0;
  }
  return explicitLen !== null ? Math.max(count, explicitLen) : count;
}

export const getTodayKey = (): string => {
  try {
    return getLocalTodayDateString();
  } catch {
    return '2026-10-19';
  }
};

export const getStorageKey = (lang: string) => `app_daily_stats_${normalizeLanguage(lang)}`;

export function purgeOldStaleActivityCounters(): void {
  if (typeof window === 'undefined') return;
  try {
    const purgeFlag = 'kraft_purge_reset_zero_v5';
    if (!localStorage.getItem(purgeFlag)) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (
          key.startsWith('kraft_day_count_') ||
          key.startsWith('daily_stats_') ||
          key.startsWith('day_stats_') ||
          key.startsWith('user_stats_') ||
          key.startsWith('app_daily_stats_') ||
          key.startsWith('kraft_cards_learned_') ||
          key.startsWith('daily_activity_') ||
          key === 'daily_learned_count' ||
          key === 'app_daily_counter_date' ||
          key === 'last_active_date'
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));

      const today = getTodayKey();
      localStorage.setItem(`kraft_cards_learned_${today}`, '0');
      ['DE', 'EN', 'RU'].forEach(lang => {
        localStorage.setItem(`daily_activity_${lang}`, JSON.stringify({ [today]: 0 }));
        statsByLang[lang] = {
          date: today,
          activeSeconds: 0,
          cardsDone: 0,
          correctCount: 0,
          mistakesCountToday: 0,
          mistakesPool: []
        };
      });

      localStorage.setItem(purgeFlag, 'true');
    }
  } catch (e) {}
}

if (typeof window !== 'undefined') {
  purgeOldStaleActivityCounters();
}

export const MAX_CARD_SECONDS = 30; // Максимальный лимит на 1 карточку (Anki Timebox Standard)
export const MEDIAN_CARD_SECONDS = 14; // Реалистичный медианный темп ввода карточки для коррекции аномалий

/**
 * Нормализует накрученное время фокуса:
 * - Если карточек 0 -> 0 секунд.
 * - Если среднее время на карточку > 60 секунд (или больше потолка 30 сек для сегодняшней миграции) -> cardsCount * 14 сек.
 */
export function normalizeFocusSeconds(rawSeconds: number, cardsCount: number, forceCap30: boolean = false): number {
  if (!rawSeconds || rawSeconds <= 0 || cardsCount <= 0) return 0;
  const threshold = forceCap30 ? MAX_CARD_SECONDS : 60;
  if (rawSeconds / cardsCount > threshold) {
    return Math.round(cardsCount * MEDIAN_CARD_SECONDS);
  }
  return Math.round(rawSeconds);
}

export function normalizeFocusMinutes(rawMinutes: number, cardsCount: number, forceCap30: boolean = false): number {
  if (!rawMinutes || rawMinutes <= 0 || cardsCount <= 0) return 0;
  const rawSeconds = rawMinutes * 60;
  const normSec = normalizeFocusSeconds(rawSeconds, cardsCount, forceCap30);
  return Math.floor(normSec / 60);
}

// --- CLEAN CARD SNAPSHOT ---
export function getMistakeCardKey(card: any): string {
  if (!card) return '';
  const raw = card.card || card;
  const id = card.id || raw.id;
  if (id) return `id:${String(id)}`;
  const word = String(raw.targetWord || '').trim().toLowerCase();
  const sentence = String(raw.sentence || '').trim().toLowerCase();
  if (word || sentence) return `w:${word}::s:${sentence}`;
  return '';
}

const RESOLVED_MISTAKES_KEY = (lang: string) => `kraft_resolved_mistakes_${normalizeLanguage(lang)}`;

export function getResolvedMistakesMap(lang: string = 'DE'): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(RESOLVED_MISTAKES_KEY(lang));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveResolvedMistakesMap(lang: string, map: Record<string, number>): void {
  if (typeof window === 'undefined') return;
  try {
    const entries = Object.entries(map)
      .filter(([, ts]) => typeof ts === 'number' && ts > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 1500);
    const trimmed = Object.fromEntries(entries);
    safeSetStorage(RESOLVED_MISTAKES_KEY(lang), JSON.stringify(trimmed));
  } catch {}
}

export function mergeResolvedMistakesMaps(
  localMap: Record<string, number> = {},
  remoteMap: Record<string, number> = {}
): Record<string, number> {
  const merged: Record<string, number> = { ...localMap };
  for (const [key, ts] of Object.entries(remoteMap || {})) {
    if (typeof ts === 'number' && ts > (merged[key] || 0)) {
      merged[key] = ts;
    }
  }
  return merged;
}

export function mergeMistakesPoolsWithTombstones(
  poolA: any[] = [],
  poolB: any[] = [],
  resolvedMap: Record<string, number> = {}
): any[] {
  const byKey = new Map<string, any>();
  const orderedKeys: string[] = [];

  const consider = (rawItem: any) => {
    const clean = cleanCardSnapshot(rawItem);
    if (!clean) return;
    const key = getMistakeCardKey(clean);
    if (!key) return;
    const resolvedAt = resolvedMap[key] || 0;
    const addedAt = typeof rawItem?.addedAt === 'number' ? rawItem.addedAt : 0;
    // If card was resolved at >= addedAt (note: legacy items have addedAt=0, so any resolvedAt>0 removes them)
    if (resolvedAt > 0 && addedAt <= resolvedAt) {
      return;
    }
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...clean, addedAt });
      orderedKeys.push(key);
    } else {
      const existingAdded = typeof existing.addedAt === 'number' ? existing.addedAt : 0;
      byKey.set(key, {
        ...existing,
        ...clean,
        addedAt: Math.max(existingAdded, addedAt),
      });
    }
  };

  for (const item of Array.isArray(poolA) ? poolA : []) consider(item);
  for (const item of Array.isArray(poolB) ? poolB : []) consider(item);

  return orderedKeys.map((k) => byKey.get(k)!);
}

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
    forms: card.forms || card.card?.forms || '',
    ...(typeof card.addedAt === 'number' ? { addedAt: card.addedAt } : {}),
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
let lastSupabaseSyncTime: Record<string, number> = {};
let cachedDayStatsUserId: string | null = null;

async function getDayStatsUserId(): Promise<string | null> {
  if (cachedDayStatsUserId) return cachedDayStatsUserId;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    cachedDayStatsUserId = user?.id || null;
  } catch {}
  return cachedDayStatsUserId;
}

const pendingMistakesDirtyByLang: Record<string, boolean> = {};
const pendingStatsSnapshotByLang: Record<string, { stats: DailyStats; mistakeMutation?: { action: 'add' | 'resolve'; card: any } }> = {};
const cloudSyncTimersByLang: Record<string, ReturnType<typeof setTimeout> | null> = {};
const STATS_SYNC_DEBOUNCE_MS = 30 * 1000; // 30s batch debounce during study (0 KB egress on card answers)

async function executeDayStatsCloudFlush(normLang: string): Promise<void> {
  const pending = pendingStatsSnapshotByLang[normLang];
  if (!pending) return;
  const { stats, mistakeMutation } = pending;
  const shouldPushMistakesPool = Boolean(pendingMistakesDirtyByLang[normLang]);
  delete pendingStatsSnapshotByLang[normLang];
  pendingMistakesDirtyByLang[normLang] = false;

  try {
    lastSupabaseSyncTime[normLang] = Date.now();
    // Compact 14-day history only; NEVER duplicate mistakesPool (~128 KB!) inside DAY_STATS_*
    const history = getDailyStatsHistory(normLang, 14);
    const payload = {
      date: stats.date,
      activeSeconds: stats.activeSeconds || 0,
      cardsDone: stats.cardsDone || 0,
      correctCount: stats.correctCount || 0,
      mistakesCountToday: stats.mistakesCountToday || 0,
      words_learned_today: stats.words_learned_today || 0,
      cards_reviewed_today: stats.cards_reviewed_today || 0,
      history,
    };
    const syncPayload: any = {
      language: `DAY_STATS_${normLang}`,
      daily_activity: payload,
    };

    try {
      const userId = await getDayStatsUserId();
      const todayRecord = getDayRecord(normLang, stats.date);
      syncPayload.user_id = userId || 'default';
      syncPayload.user_daily_stats = {
        user_id: userId || 'default',
        language: normLang,
        date: stats.date,
        cards_done: todayRecord.cardsReviewed,
        correct_count: stats.correctCount || todayRecord.cardsReviewed,
        mistakes_count: todayRecord.mistakesCount,
        focus_minutes: todayRecord.focusMinutes,
        words_learned_today: todayRecord.words_learned_today || 0,
        cards_reviewed_today: todayRecord.cards_reviewed_today || 0,
        updated_at: new Date().toISOString(),
      };
    } catch {}

    if (mistakeMutation?.card) {
      const snap = cleanCardSnapshot(mistakeMutation.card);
      syncPayload.mistake_action = mistakeMutation.action;
      syncPayload.mistake_lang = normLang;
      syncPayload.mistake_card_id = snap?.id || mistakeMutation.card?.id || getMistakeCardKey(mistakeMutation.card);
      syncPayload.mistake_deck_id = snap?.deckId || mistakeMutation.card?.deckId || null;
      syncPayload.mistake_target_word = snap?.targetWord || null;
      syncPayload.mistake_sentence = snap?.sentence || null;
      syncPayload.mistake_translation = snap?.translation || null;
      syncPayload.mistake_snapshot = snap || null;
    }

    const tasks: Promise<any>[] = [saveDayProgress(syncPayload)];

    // Only write MISTAKES_POOL_* when mistakes/tombstones actually changed
    if (shouldPushMistakesPool) {
      const resolvedMap = getResolvedMistakesMap(normLang);
      const cleanPool = Array.isArray(stats.mistakesPool)
        ? stats.mistakesPool.map(cleanCardSnapshot).filter(Boolean)
        : [];
      tasks.push(
        safeUpsertUserStats({
          language: `MISTAKES_POOL_${normLang}`,
          daily_activity: {
            mistakes: cleanPool,
            resolvedMap,
            updatedAt: Date.now(),
          },
        })
      );
    }

    await Promise.all(tasks);
  } catch {
    // Тихий fallback: данные остаются в localStorage & IndexedDB
  }
}

export async function flushPendingDayStatsSync(lang?: string): Promise<void> {
  const langs = lang ? [normalizeLanguage(lang)] : Object.keys(pendingStatsSnapshotByLang);
  await Promise.all(
    langs.map(async (normLang) => {
      if (cloudSyncTimersByLang[normLang]) {
        clearTimeout(cloudSyncTimersByLang[normLang]!);
        cloudSyncTimersByLang[normLang] = null;
      }
      await executeDayStatsCloudFlush(normLang);
    })
  );
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    flushPendingDayStatsSync().catch(() => {});
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushPendingDayStatsSync().catch(() => {});
    }
  });
}

export async function syncStatsToSupabase(
  lang: string,
  stats: DailyStats,
  immediate: boolean = false,
  mistakeMutation?: { action: 'add' | 'resolve'; card: any }
): Promise<void> {
  const normLang = normalizeLanguage(lang);
  if (mistakeMutation) {
    pendingMistakesDirtyByLang[normLang] = true;
  }
  const prevMutation = pendingStatsSnapshotByLang[normLang]?.mistakeMutation;
  pendingStatsSnapshotByLang[normLang] = {
    stats,
    mistakeMutation: mistakeMutation || prevMutation,
  };

  if (immediate) {
    if (cloudSyncTimersByLang[normLang]) {
      clearTimeout(cloudSyncTimersByLang[normLang]!);
      cloudSyncTimersByLang[normLang] = null;
    }
    await executeDayStatsCloudFlush(normLang);
  } else {
    if (cloudSyncTimersByLang[normLang]) {
      clearTimeout(cloudSyncTimersByLang[normLang]!);
    }
    cloudSyncTimersByLang[normLang] = setTimeout(() => {
      cloudSyncTimersByLang[normLang] = null;
      executeDayStatsCloudFlush(normLang).catch(() => {});
    }, STATS_SYNC_DEBOUNCE_MS);
  }
}

export async function fetchStatsFromSupabase(lang: string): Promise<(DailyStats & { resolvedMistakesMap?: Record<string, number>; history?: DayRecord[] }) | null> {
  try {
    const normLang = normalizeLanguage(lang);
    const rows = await safeFetchUserStats([`DAY_STATS_${normLang}`, `MISTAKES_POOL_${normLang}`]);
    const dayRow = Array.isArray(rows)
      ? rows.find((r: any) => r?.language === `DAY_STATS_${normLang}`)?.daily_activity
      : await loadDayProgress(`DAY_STATS_${normLang}`);
    const mistakesRow = Array.isArray(rows)
      ? rows.find((r: any) => r?.language === `MISTAKES_POOL_${normLang}`)?.daily_activity
      : null;

    if (!dayRow && !mistakesRow) return null;

    const base = dayRow && typeof dayRow === 'object' ? { ...dayRow } : ({} as any);
    if (mistakesRow && typeof mistakesRow === 'object') {
      const resolvedMap = mergeResolvedMistakesMaps(
        base.resolvedMistakesMap || {},
        mistakesRow.resolvedMap || {}
      );
      base.resolvedMistakesMap = resolvedMap;
      if (Array.isArray(mistakesRow.mistakes)) {
        base.mistakesPool = mergeMistakesPoolsWithTombstones(
          base.mistakesPool || [],
          mistakesRow.mistakes,
          resolvedMap
        );
      }
    }
    return base;
  } catch {
    return null;
  }
}

export async function syncPersistentMistakesFromCloud(lang: string = 'DE', force: boolean = false): Promise<any[]> {
  const normLang = normalizeLanguage(lang);
  const now = Date.now();
  const lastFetchMs = getPersistedDayStatsFetchMs(normLang);
  if (!force && lastFetchMs > 0 && now - lastFetchMs < STATS_FETCH_COOLDOWN_MS) {
    return getMistakesPool(normLang);
  }
  setPersistedDayStatsFetchMs(normLang, now);
  const cloudStats = await fetchStatsFromSupabase(normLang);
  if (cloudStats) {
    const updated = reconcileStatsFromCloud(normLang, cloudStats);
    return updated.mistakesPool || [];
  }
  return getMistakesPool(normLang);
}

export function reconcileStatsFromCloud(lang: string, cloudRaw: any): DailyStats {
  const normLang = normalizeLanguage(lang);
  const current = getOrCreateStats(normLang);
  if (!cloudRaw || typeof cloudRaw !== 'object') return current;

  // Reconcile multi-day history via max values per local YYYY-MM-DD
  if (Array.isArray(cloudRaw.history)) {
    for (const hItem of cloudRaw.history) {
      if (hItem && hItem.date) {
        const existingRec = getDayRecord(normLang, hItem.date);
        saveDayRecord(normLang, {
          ...hItem,
          cardsReviewed: Math.max(existingRec.cardsReviewed || 0, hItem.cardsReviewed || 0),
          focusMinutes: Math.max(existingRec.focusMinutes || 0, hItem.focusMinutes || 0),
          mistakesCount: Math.max(existingRec.mistakesCount || 0, hItem.mistakesCount || 0),
          wordsMastered: Math.max(existingRec.wordsMastered || 0, hItem.wordsMastered || 0),
        });
      }
    }
  }

  const todayKey = getTodayKey();
  const mergedResolvedMap = mergeResolvedMistakesMaps(
    getResolvedMistakesMap(normLang),
    cloudRaw.resolvedMistakesMap || {}
  );
  saveResolvedMistakesMap(normLang, mergedResolvedMap);

  const cloudPool = Array.isArray(cloudRaw.mistakesPool)
    ? cloudRaw.mistakesPool.map(cleanCardSnapshot).filter(Boolean)
    : [];
  const mergedPool = mergeMistakesPoolsWithTombstones(
    current.mistakesPool || [],
    cloudPool,
    mergedResolvedMap
  );

  const isCloudToday = cloudRaw.date === todayKey;
  const todayActual = getTodayCompletedCardsCount(normLang);

  let maxActiveSeconds = current.date === todayKey ? (current.activeSeconds || 0) : 0;
  let maxCardsDone = todayActual;
  let maxCorrectCount = todayActual;
  let maxMistakesToday = current.date === todayKey ? (current.mistakesCountToday || 0) : 0;

  if (isCloudToday) {
    const rawCloudDone = typeof cloudRaw.cardsDone === 'number' ? cloudRaw.cardsDone : 0;
    const cloudDone = rawCloudDone > 500 ? 0 : rawCloudDone;
    const rawCloudCorrect = typeof cloudRaw.correctCount === 'number' ? cloudRaw.correctCount : cloudDone;
    const cloudCorrect = rawCloudCorrect > 500 ? 0 : rawCloudCorrect;
    maxCardsDone = Math.max(maxCardsDone, cloudDone);
    maxCorrectCount = Math.max(maxCorrectCount, cloudCorrect, maxCardsDone);

    const normalizedLocalSecs = normalizeFocusSeconds(maxActiveSeconds, maxCardsDone, true);
    const rawCloudSecs = typeof cloudRaw.activeSeconds === 'number' ? cloudRaw.activeSeconds : 0;
    const normalizedCloudSecs = normalizeFocusSeconds(rawCloudSecs, maxCardsDone, true);
    maxActiveSeconds = Math.max(normalizedLocalSecs, normalizedCloudSecs);

    const rawCloudMistakes = typeof cloudRaw.mistakesCountToday === 'number' ? cloudRaw.mistakesCountToday : 0;
    const cloudMistakes = sanitizeTodayMistakesCount(
      rawCloudMistakes,
      Array.isArray(cloudRaw.mistakes) ? cloudRaw.mistakes : null,
      mergedPool.length
    );
    maxMistakesToday = Math.max(
      sanitizeTodayMistakesCount(maxMistakesToday, null, mergedPool.length),
      cloudMistakes
    );

    try {
      if (typeof window !== 'undefined') {
        const storedTodayCount = parseInt(localStorage.getItem(`kraft_cards_learned_${todayKey}`) || '0', 10);
        if (maxCardsDone > storedTodayCount) {
          localStorage.setItem(`kraft_cards_learned_${todayKey}`, String(maxCardsDone));
        }
      }
    } catch {}
  } else {
    maxActiveSeconds = normalizeFocusSeconds(maxActiveSeconds, maxCardsDone, true);
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
    const todayStr = getTodayKey();
    const stored = localStorage.getItem(`kraft_cards_learned_${todayStr}`);
    if (stored !== null) {
      const parsed = parseInt(stored, 10);
      return !isNaN(parsed) && parsed >= 0 ? parsed : 0;
    }
    // Если в localStorage по ключу сегодняшнего дня нет записи — значение строго равно 0!
    return 0;
  } catch {
    return 0;
  }
}

// --- HISTORICAL MULTI-DAY TRACKING & STORAGE ---
export function getDayRecord(lang: string = 'DE', dateStr: string): DayRecord {
  const normLang = normalizeLanguage(lang);
  const targetCards = 200;
  const isToday = dateStr === getTodayKey();
  const kraftEntry = getKraftDailyStatsMap()[dateStr];
  const kraftCards = kraftEntry && typeof kraftEntry.cardsDone === 'number' ? kraftEntry.cardsDone : 0;

  // 1. Check daily_stats_history map in localStorage
  if (typeof window !== 'undefined') {
    try {
      const histKey = `daily_stats_history_${normLang}`;
      const histRaw = localStorage.getItem(histKey);
      if (histRaw) {
        const histMap: Record<string, DayRecord> = JSON.parse(histRaw);
        if (histMap && histMap[dateStr]) {
          const rec = histMap[dateStr];
          let cardsReviewed = Math.max(rec.cardsReviewed || 0, kraftCards);
          try {
            const actRaw = localStorage.getItem(`daily_activity_${normLang}`);
            if (actRaw) {
              const actParsed = JSON.parse(actRaw);
              const actVal = actParsed?.[dateStr];
              const actNum = typeof actVal === 'number' ? actVal : (actVal?.total || (typeof actVal === 'string' ? parseInt(actVal, 10) || 0 : 0));
              if (actNum > cardsReviewed) cardsReviewed = actNum;
            }
            if (isToday) {
              const liveToday = getTodayCompletedCardsCount(normLang);
              if (liveToday > cardsReviewed) cardsReviewed = liveToday;
            }
          } catch {}
          const rawMistakes = typeof rec.mistakesCount === 'number' ? rec.mistakesCount : (kraftEntry?.mistakes || 0);
          const cleanMistakes = isToday ? sanitizeTodayMistakesCount(rawMistakes) : rawMistakes;
          const normMins = normalizeFocusMinutes(rec.focusMinutes || 0, cardsReviewed, isToday);
          return {
            ...rec,
            cardsReviewed,
            mistakesCount: cleanMistakes,
            accuracy: computeStrictAccuracy(cardsReviewed, cleanMistakes),
            focusMinutes: normMins
          };
        }
      }
    } catch {}
  }

  // 2. Fallback: check scoped daily_stats_{lang}_{date}
  let cardsReviewed = kraftCards;
  let focusMinutes = kraftEntry?.focusMinutes || 0;
  let mistakesCount = kraftEntry?.mistakes || 0;
  let wordsMastered = 0;

  if (typeof window !== 'undefined') {
    try {
      const scopedKey = `daily_stats_${normLang.toLowerCase()}_${dateStr}`;
      const scopedRaw = localStorage.getItem(scopedKey);
      if (scopedRaw) {
        const parsed = JSON.parse(scopedRaw);
        if (typeof parsed?.learnedToday === 'number') {
          cardsReviewed = Math.max(cardsReviewed, parsed.learnedToday);
        }
        if (typeof parsed?.focusSeconds === 'number') {
          const normSecs = normalizeFocusSeconds(parsed.focusSeconds, cardsReviewed, isToday);
          focusMinutes = Math.max(focusMinutes, Math.floor(normSecs / 60));
        }
        if (typeof parsed?.mistakesCount === 'number') {
          mistakesCount = isToday
            ? sanitizeTodayMistakesCount(
                parsed.mistakesCount,
                Array.isArray(parsed.mistakes) ? parsed.mistakes : null
              )
            : parsed.mistakesCount;
        }
      }
    } catch {}

    // 3. Fallback: check daily_activity_{lang} & today's live counter
    try {
      const actRaw = localStorage.getItem(`daily_activity_${normLang}`);
      if (actRaw) {
        const parsed = JSON.parse(actRaw);
        const val = parsed?.[dateStr];
        const num = typeof val === 'number' ? val : (val?.total || (typeof val === 'string' ? parseInt(val, 10) || 0 : 0));
        if (num > cardsReviewed) cardsReviewed = num;
      }
    } catch {}

    if (isToday) {
      const liveToday = getTodayCompletedCardsCount(normLang);
      if (liveToday > cardsReviewed) cardsReviewed = liveToday;
    }
  }

  const effectiveFocusMinutes = normalizeFocusMinutes(focusMinutes || 0, cardsReviewed, isToday);
  const accuracy = computeStrictAccuracy(cardsReviewed, mistakesCount);

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
  const isToday = record.date === getTodayKey();
  const effectiveMinutes = normalizeFocusMinutes(rawMinutes || 0, reviewed, isToday);
  const mistakes = typeof record.mistakesCount === 'number' ? record.mistakesCount : current.mistakesCount;

  const updated: DayRecord = {
    date: record.date,
    cardsReviewed: reviewed,
    targetCards: typeof record.targetCards === 'number' ? record.targetCards : (current.targetCards || 200),
    focusMinutes: effectiveMinutes,
    accuracy: computeStrictAccuracy(reviewed, mistakes),
    mistakesCount: mistakes,
    wordsMastered: typeof record.wordsMastered === 'number' ? record.wordsMastered : current.wordsMastered,
    words_learned_today: typeof record.words_learned_today === 'number' ? record.words_learned_today : (typeof record.wordsMastered === 'number' ? record.wordsMastered : current.words_learned_today || 0),
    cards_reviewed_today: typeof record.cards_reviewed_today === 'number' ? record.cards_reviewed_today : (current.cards_reviewed_today || 0),
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

      // Synchronize with unified kraft_daily_stats map
      syncKraftDailyStatEntry(record.date, {
        cardsDone: updated.cardsReviewed,
        correct: updated.cardsReviewed,
        mistakes: updated.mistakesCount,
        focusMinutes: updated.focusMinutes,
      });

      // Synchronize with daily_stats_{lang}_{date} preserving sub-minute activeSeconds
      const scopedKey = `daily_stats_${normLang.toLowerCase()}_${record.date}`;
      const existingScoped = localStorage.getItem(scopedKey);
      const scopedParsed = existingScoped ? JSON.parse(existingScoped) : {};
      const existingSecs = typeof scopedParsed?.focusSeconds === 'number'
        ? normalizeFocusSeconds(scopedParsed.focusSeconds, updated.cardsReviewed, isToday)
        : 0;
      const syncedFocusSeconds = isToday && statsByLang[normLang]?.date === record.date
        ? normalizeFocusSeconds(statsByLang[normLang].activeSeconds || 0, updated.cardsReviewed, true)
        : (Math.floor(existingSecs / 60) === updated.focusMinutes ? existingSecs : updated.focusMinutes * 60);
      safeSetStorage(scopedKey, JSON.stringify({
        ...scopedParsed,
        date: record.date,
        learnedToday: updated.cardsReviewed,
        focusSeconds: syncedFocusSeconds,
        focusMinutes: Math.floor(syncedFocusSeconds / 60),
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
    const dateStr = getLocalDateString(d);

    let record = getDayRecord(normLang, dateStr);

    if (dateStr === todayKey) {
      const liveCards = Math.max(record.cardsReviewed, currentToday?.cardsDone || 0, getTodayCompletedCardsCount(normLang));
      const liveSeconds = normalizeFocusSeconds(currentToday?.activeSeconds || 0, liveCards, true);
      const liveMinutes = Math.floor(liveSeconds / 60);
      const liveMistakes = sanitizeTodayMistakesCount(
        typeof currentToday?.mistakesCountToday === 'number' ? currentToday.mistakesCountToday : record.mistakesCount,
        null,
        Array.isArray(currentToday?.mistakesPool) ? currentToday.mistakesPool.length : 0
      );
      const liveCorrect = Math.max(
        liveCards,
        typeof currentToday?.correctCount === 'number' ? currentToday.correctCount : 0
      );
      const liveAccuracy = computeStrictAccuracy(liveCorrect, liveMistakes);

      record = {
        ...record,
        cardsReviewed: liveCards,
        focusMinutes: liveMinutes,
        accuracy: liveAccuracy,
        mistakesCount: liveMistakes
      };
    }

    const effectiveMinutes = normalizeFocusMinutes(record.focusMinutes || 0, record.cardsReviewed || 0, dateStr === todayKey);

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
    const dateStr = getLocalDateString(d);

    let record = getDayRecord(normLang, dateStr);

    if (dateStr === todayKey) {
      const liveCards = Math.max(record.cardsReviewed, currentToday?.cardsDone || 0, getTodayCompletedCardsCount(normLang));
      const liveSeconds = normalizeFocusSeconds(currentToday?.activeSeconds || 0, liveCards, true);
      const liveMinutes = Math.floor(liveSeconds / 60);
      const liveMistakes = sanitizeTodayMistakesCount(
        typeof currentToday?.mistakesCountToday === 'number' ? currentToday.mistakesCountToday : record.mistakesCount,
        null,
        Array.isArray(currentToday?.mistakesPool) ? currentToday.mistakesPool.length : 0
      );
      const liveCorrect = Math.max(
        liveCards,
        typeof currentToday?.correctCount === 'number' ? currentToday.correctCount : 0
      );
      const liveAccuracy = computeStrictAccuracy(liveCorrect, liveMistakes);

      record = {
        ...record,
        cardsReviewed: liveCards,
        focusMinutes: liveMinutes,
        accuracy: liveAccuracy,
        mistakesCount: liveMistakes
      };
    }

    const effectiveMinutes = normalizeFocusMinutes(record.focusMinutes || 0, record.cardsReviewed || 0, dateStr === todayKey);

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

  const resolvedMap = getResolvedMistakesMap(normLang);
  for (const key of candidateKeys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') continue;

      // Merge mistake cards safely with resolved tombstones
      if (Array.isArray(parsed.mistakesPool)) {
        mergedPool = mergeMistakesPoolsWithTombstones(mergedPool, parsed.mistakesPool, resolvedMap);
      }

      const isCurrentDay = parsed.date === todayKey;
      if (isCurrentDay) {
        foundTodaySaved = true;
        if (typeof parsed.activeSeconds === 'number' && parsed.activeSeconds > maxActiveSeconds) {
          maxActiveSeconds = parsed.activeSeconds;
        }
        if (typeof parsed.cardsDone === 'number' && parsed.cardsDone > maxCardsDone && parsed.cardsDone < 500) {
          maxCardsDone = parsed.cardsDone;
        }
        const parsedMistakesToday = typeof parsed.mistakesCountToday === 'number'
          ? parsed.mistakesCountToday
          : 0;
        if (parsedMistakesToday > maxMistakesToday) {
          maxMistakesToday = parsedMistakesToday;
        }
        if (typeof parsed.correctCount === 'number' && parsed.correctCount > maxCorrectCount && parsed.correctCount < 500) {
          maxCorrectCount = parsed.correctCount;
        }
      }
    } catch (e) {}
  }

  // Clean up legacy non-namespaced key so it doesn't corrupt state on subsequent loads
  try {
    localStorage.removeItem('app_daily_stats');
  } catch (e) {}

  // Сегодняшний счетчик берется строго из getTodayCompletedCardsCount (ключ kraft_cards_learned_{today})
  const finalCardsDone = realTodayCards;
  const finalCorrectCount = Math.max(realTodayCards, maxCorrectCount);

  // Разовая нормализация сегодняшнего накрученного времени (52 мин за 22 карточки -> ~5 мин)
  let finalActiveSeconds = foundTodaySaved ? normalizeFocusSeconds(maxActiveSeconds, finalCardsDone, true) : 0;
  try {
    const migKey = `focus_time_v2_normalized_${normLang}_${todayKey}`;
    if (!localStorage.getItem(migKey)) {
      if (finalCardsDone > 0 && finalActiveSeconds > finalCardsDone * MEDIAN_CARD_SECONDS) {
        finalActiveSeconds = Math.round(finalCardsDone * MEDIAN_CARD_SECONDS);
      } else if (finalCardsDone === 0) {
        finalActiveSeconds = 0;
      }
      localStorage.setItem(migKey, '1');
    }
  } catch {}

  // Санитаризация загрязнённого счётчика ошибок (если старый баг записал размер mistakesPool в mistakesCountToday)
  let healedMistakesToday = foundTodaySaved ? maxMistakesToday : 0;
  try {
    const scopedRaw = localStorage.getItem(`daily_stats_${normLang.toLowerCase()}_${todayKey}`);
    const scopedParsed = scopedRaw ? JSON.parse(scopedRaw) : null;
    const todayExplicitMistakeIds = Array.isArray(scopedParsed?.mistakes) ? scopedParsed.mistakes : null;
    healedMistakesToday = sanitizeTodayMistakesCount(
      healedMistakesToday,
      todayExplicitMistakeIds,
      mergedPool.length
    );
    if (scopedParsed && typeof scopedParsed.mistakesCount === 'number' && scopedParsed.mistakesCount !== healedMistakesToday) {
      const cleanedScoped = {
        ...scopedParsed,
        mistakesCount: healedMistakesToday,
        accuracy: computeStrictAccuracy(Math.max(finalCardsDone, scopedParsed.correctCount || 0), healedMistakesToday)
      };
      safeSetStorage(`daily_stats_${normLang.toLowerCase()}_${todayKey}`, JSON.stringify(cleanedScoped));
    }
  } catch {}

  const result: DailyStats = {
    date: todayKey,
    activeSeconds: finalActiveSeconds,
    cardsDone: finalCardsDone,
    correctCount: finalCorrectCount,
    mistakesCountToday: healedMistakesToday,
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

// --- SMART PER-CARD FOCUS TIME TRACKER (ANKI TIMEBOX STANDARD, MAX 30s/CARD) ---
interface CardFocusTimerState {
  cardStartTime: number;
  accumulatedMs: number;
  isPaused: boolean;
}
const cardTimerByLang: Record<string, CardFocusTimerState> = {};

export function startCardFocusTimer(lang: string = 'DE'): void {
  const normLang = normalizeLanguage(lang);
  const isHidden = typeof document !== 'undefined' && (document.hidden || document.visibilityState !== 'visible');
  cardTimerByLang[normLang] = {
    cardStartTime: isHidden ? 0 : Date.now(),
    accumulatedMs: 0,
    isPaused: isHidden,
  };
}

export function pauseCardFocusTimer(lang?: string): void {
  const now = Date.now();
  const keys = lang ? [normalizeLanguage(lang)] : Object.keys(cardTimerByLang);
  keys.forEach((k) => {
    const t = cardTimerByLang[k];
    if (t && !t.isPaused && t.cardStartTime > 0) {
      t.accumulatedMs += Math.max(0, now - t.cardStartTime);
      t.cardStartTime = 0;
      t.isPaused = true;
    }
  });
}

export function resumeCardFocusTimer(lang?: string): void {
  if (typeof document !== 'undefined' && (document.hidden || document.visibilityState !== 'visible')) return;
  const now = Date.now();
  const keys = lang ? [normalizeLanguage(lang)] : Object.keys(cardTimerByLang);
  keys.forEach((k) => {
    if ((activeStudyCounts[k] || 0) <= 0) return;
    const t = cardTimerByLang[k];
    if (t && t.isPaused) {
      t.cardStartTime = now;
      t.isPaused = false;
    } else if (!t) {
      cardTimerByLang[k] = { cardStartTime: now, accumulatedMs: 0, isPaused: false };
    }
  });
}

export function consumeCardFocusSeconds(lang: string = 'DE'): number {
  const normLang = normalizeLanguage(lang);
  const now = Date.now();
  const t = cardTimerByLang[normLang];
  let rawSeconds = 0;
  if (t) {
    const liveMs = !t.isPaused && t.cardStartTime > 0 ? Math.max(0, now - t.cardStartTime) : 0;
    rawSeconds = (t.accumulatedMs + liveMs) / 1000;
  }
  const isHidden = typeof document !== 'undefined' && (document.hidden || document.visibilityState !== 'visible');
  cardTimerByLang[normLang] = {
    cardStartTime: isHidden ? 0 : now,
    accumulatedMs: 0,
    isPaused: isHidden,
  };
  if (rawSeconds <= 0) return 0;
  return Math.min(Math.max(1, Math.round(rawSeconds)), MAX_CARD_SECONDS);
}

export function recordCardFocusTime(activeSeconds: number, lang: string = 'DE'): number {
  if (activeSeconds <= 0) return 0;
  const clamped = Math.min(Math.round(activeSeconds), MAX_CARD_SECONDS);
  const normLang = normalizeLanguage(lang);
  const current = getOrCreateStats(normLang);
  const today = getTodayKey();
  const nextSeconds = (current.activeSeconds || 0) + clamped;
  const nextStats: DailyStats = {
    ...current,
    date: today,
    activeSeconds: nextSeconds,
  };
  statsByLang[normLang] = nextStats;
  saveDayRecord(normLang, {
    date: today,
    focusMinutes: Math.floor(nextSeconds / 60),
  });
  notifyLang(normLang);
  return clamped;
}

let timerInitialized = false;
let lastActivityTime = Date.now();

export function resetDayStatsToZero(lang?: string) {
  if (typeof window === 'undefined') return;
  const todayKey = getTodayKey();
  try {
    localStorage.setItem(`kraft_cards_learned_${todayKey}`, '0');
    localStorage.removeItem(`kraft_day_count_${todayKey}`);
  } catch {}
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

function notifyLang(lang: string, _options?: { skipCloudSync?: boolean }) {
  const normLang = normalizeLanguage(lang);
  const current = getOrCreateStats(normLang);
  if (typeof window !== 'undefined') {
    const serialized = JSON.stringify(current);
    safeSetStorage(`app_daily_stats_${normLang}`, serialized);
    safeSetStorage(`app_daily_stats_${normLang.toLowerCase()}`, serialized);
    setStatsInIDB(normLang, current);
    window.dispatchEvent(new CustomEvent('stats-update', { detail: { language: normLang } }));
  }
  // No Supabase calls in notifyLang — purely local notification
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

  // Visibility & Window Focus Watchdog: мгновенная пауза таймера карточки при уходе со вкладки или потере фокуса окна
  const handleVisibilityWatchdog = () => {
    if (typeof document !== 'undefined' && (document.hidden || document.visibilityState !== 'visible')) {
      pauseCardFocusTimer();
    } else {
      resumeCardFocusTimer();
    }
  };
  const handleWindowBlur = () => pauseCardFocusTimer();
  const handleWindowFocus = () => resumeCardFocusTimer();

  document.addEventListener('visibilitychange', handleVisibilityWatchdog);
  window.addEventListener('blur', handleWindowBlur);
  window.addEventListener('focus', handleWindowFocus);

  // Safari unload/pagehide flush to local & pending dirty Supabase batches only (0 writes on clean reload)
  const flushAll = () => {
    pauseCardFocusTimer();
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
      }
    });
    flushPendingDayStatsSync().catch(() => {});
  };
  window.addEventListener('pagehide', flushAll);
}

function areDailyStatsEqual(a: DailyStats, b: DailyStats): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.date === b.date &&
    a.cardsDone === b.cardsDone &&
    a.activeSeconds === b.activeSeconds &&
    a.correctCount === b.correctCount &&
    a.mistakesCountToday === b.mistakesCountToday &&
    (a.mistakesPool?.length || 0) === (b.mistakesPool?.length || 0) &&
    (a.cards_reviewed_today ?? 0) === (b.cards_reviewed_today ?? 0) &&
    (a.words_learned_today ?? 0) === (b.words_learned_today ?? 0)
  );
}

const lastCloudStatsFetchTimeByLang: Record<string, number> = {};
const STATS_FETCH_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes hard cooldown across F5/focus/components
const DAY_STATS_FETCH_TS_PREFIX = 'kraft_day_stats_fetch_at_';

function getPersistedDayStatsFetchMs(lang: string): number {
  const norm = normalizeLanguage(lang);
  const mem = lastCloudStatsFetchTimeByLang[norm] || 0;
  if (typeof window === 'undefined') return mem;
  try {
    const raw = Number(localStorage.getItem(`${DAY_STATS_FETCH_TS_PREFIX}${norm}`) || '0');
    return Number.isFinite(raw) ? Math.max(mem, raw) : mem;
  } catch {
    return mem;
  }
}

function setPersistedDayStatsFetchMs(lang: string, ts: number): void {
  const norm = normalizeLanguage(lang);
  lastCloudStatsFetchTimeByLang[norm] = ts;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${DAY_STATS_FETCH_TS_PREFIX}${norm}`, String(ts));
  } catch {}
}

export function useDayStats(options?: { isStudying?: boolean; language?: string }) {
  const isStudying = options?.isStudying ?? false;
  const lang = normalizeLanguage(options?.language || (typeof window !== 'undefined' ? (localStorage.getItem('selected_language') || 'DE') : 'DE'));

  const [stats, setLocalStats] = useState<DailyStats>(() => {
    return getOrCreateStats(lang);
  });

  const updateLocalStatsIfChanged = useCallback((next: DailyStats) => {
    setLocalStats((prev) => (areDailyStatsEqual(prev, next) ? prev : next));
  }, []);

  // Synchronize on language change
  useEffect(() => {
    updateLocalStatsIfChanged(getOrCreateStats(lang));
  }, [lang, updateLocalStatsIfChanged]);

  // Safari recovery: background check from IndexedDB
  useEffect(() => {
    let isCancelled = false;
    getStatsFromIDB(lang).then(idbStats => {
      if (isCancelled || !idbStats) return;
      const current = getOrCreateStats(lang);
      const resolvedMap = getResolvedMistakesMap(lang);
      const mergedPool = mergeMistakesPoolsWithTombstones(current.mistakesPool || [], idbStats.mistakesPool || [], resolvedMap);
      const cleanIdbMistakesToday = idbStats.date === current.date
        ? sanitizeTodayMistakesCount(idbStats.mistakesCountToday, null, mergedPool.length)
        : 0;
      if (
        mergedPool.length !== (current.mistakesPool?.length || 0) ||
        cleanIdbMistakesToday > (current.mistakesCountToday || 0)
      ) {
        const mergedStats: DailyStats = {
          ...current,
          mistakesPool: mergedPool,
          mistakesCountToday: Math.max(current.mistakesCountToday || 0, cleanIdbMistakesToday),
        };
        statsByLang[lang] = mergedStats;
        notifyLang(lang, { skipCloudSync: true });
        updateLocalStatsIfChanged(mergedStats);
      }
    });
    return () => { isCancelled = true; };
  }, [lang, updateLocalStatsIfChanged]);

  // Supabase Cloud recovery: respect 5-min cooldown across F5 & study mounts; NO Realtime user_stats echo during study
  useEffect(() => {
    let isCancelled = false;
    const syncFromCloud = (force: boolean = false) => {
      const now = Date.now();
      const lastFetchMs = getPersistedDayStatsFetchMs(lang);
      if (!force && lastFetchMs > 0 && now - lastFetchMs < STATS_FETCH_COOLDOWN_MS) {
        return;
      }
      setPersistedDayStatsFetchMs(lang, now);
      fetchStatsFromSupabase(lang).then(cloudStats => {
        if (isCancelled || !cloudStats) return;
        const updated = reconcileStatsFromCloud(lang, cloudStats);
        updateLocalStatsIfChanged(updated);
      });
    };

    // During study mounts or F5 within 5 min, reuse cached state (0 KB read egress)
    if (!isStudying) {
      syncFromCloud(false);
    }

    let visibilityDebounce: ReturnType<typeof setTimeout> | null = null;
    const handleVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (isStudying || (activeStudyCounts[lang] || 0) > 0) return;
      if (typeof window !== 'undefined' && Number((window as any).__kraftActiveStudyCount || 0) > 0) return;
      if (visibilityDebounce) clearTimeout(visibilityDebounce);
      visibilityDebounce = setTimeout(() => {
        if (isStudying || (activeStudyCounts[lang] || 0) > 0) return;
        syncFromCloud(false);
      }, 1000);
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      isCancelled = true;
      if (visibilityDebounce) clearTimeout(visibilityDebounce);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [isStudying, lang, updateLocalStatsIfChanged]);

  // Manage study activity timer & listener subscriptions
  useEffect(() => {
    initGlobalTimer();

    if (isStudying) {
      activeStudyCounts[lang] = (activeStudyCounts[lang] || 0) + 1;
      if (typeof window !== 'undefined') {
        (window as any).__kraftActiveStudyCount = Number((window as any).__kraftActiveStudyCount || 0) + 1;
      }
      lastActivityTime = Date.now();
      startCardFocusTimer(lang);
    }

    if (!listenersByLang[lang]) {
      listenersByLang[lang] = new Set();
    }

    const listener = (newStats: DailyStats) => updateLocalStatsIfChanged(newStats);
    listenersByLang[lang].add(listener);

    const handleCustomUpdate = (e: any) => {
      const target = normalizeLanguage(e?.detail?.language);
      if (!target || target === lang) {
        updateLocalStatsIfChanged(getOrCreateStats(lang));
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
        if (typeof window !== 'undefined') {
          (window as any).__kraftActiveStudyCount = Math.max(
            0,
            Number((window as any).__kraftActiveStudyCount || 1) - 1
          );
        }
        if ((activeStudyCounts[lang] || 0) === 0) {
          pauseCardFocusTimer(lang);
        }
        const current = statsByLang[lang];
        if (current) {
          const today = getTodayKey();
          const focusMins = Math.floor((current.activeSeconds || 0) / 60);
          saveDayRecord(lang, {
            date: today,
            focusMinutes: focusMins
          });
          setStatsInIDB(lang, current);
          flushPendingDayStatsSync(lang).catch(() => {});
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
    callOptions?: { isReviewingMistakes?: boolean; language?: string; isReview?: boolean; isNewMastered?: boolean }
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
    let mistakeMutation: { action: 'add' | 'resolve'; card: any } | undefined;
    const resolvedMap = getResolvedMistakesMap(targetLang);

    if (!isCorrect) {
      const nowTs = Date.now();
      const cleanCard = cleanCardSnapshot({ ...card, addedAt: nowTs });
      if (cleanCard) {
        const key = getMistakeCardKey(cleanCard);
        if (key && resolvedMap[key]) {
          delete resolvedMap[key];
          saveResolvedMistakesMap(targetLang, resolvedMap);
        }
        const existingIdx = updatedPool.findIndex(matchFn);
        if (existingIdx >= 0) {
          updatedPool[existingIdx] = { ...updatedPool[existingIdx], ...cleanCard, addedAt: nowTs };
        } else {
          updatedPool.push(cleanCard);
        }
        mistakeMutation = { action: 'add', card: cleanCard };
      }
    } else {
      // Remove ONLY if explicitly in mistakes review mode!
      if (callOptions?.isReviewingMistakes) {
        const removedItems = updatedPool.filter(matchFn);
        updatedPool = updatedPool.filter(c => !matchFn(c));
        const resolveTs = Date.now();
        const selfKey = getMistakeCardKey({ id: cardId, targetWord, sentence, translation });
        if (selfKey) resolvedMap[selfKey] = resolveTs;
        removedItems.forEach((rm) => {
          const k = getMistakeCardKey(rm);
          if (k) resolvedMap[k] = resolveTs;
        });
        saveResolvedMistakesMap(targetLang, resolvedMap);
        mistakeMutation = { action: 'resolve', card: { id: cardId, deckId: card?.deckId, targetWord, sentence, translation } };
      }
    }

    const today = getTodayKey();
    // Инкремент счетчика уже выполнен в updateLanguageDailyStats при ответе на карточку (строго 1 повтор = 1 карточка)
    const currentActivityCards = getTodayCompletedCardsCount(targetLang);
    const newCardsDone = currentActivityCards;

    const prevMistakesToday = typeof current.mistakesCountToday === 'number'
      ? current.mistakesCountToday
      : 0;
    const newMistakesToday = isCorrect ? prevMistakesToday : prevMistakesToday + 1;

    const newCorrectCount = isCorrect
      ? Math.max((current.correctCount || 0) + 1, newCardsDone)
      : Math.max(current.correctCount || 0, newCardsDone);

    const isReview = Boolean(callOptions?.isReview || card?.isArchived);
    const isNewMastered = Boolean(callOptions?.isNewMastered);

    const prevCardsReviewed = current.cards_reviewed_today ?? 0;
    const newCardsReviewedToday = isReview ? prevCardsReviewed + 1 : prevCardsReviewed;

    const prevWordsLearned = current.words_learned_today ?? 0;
    const newWordsLearnedToday = isNewMastered ? prevWordsLearned + 1 : prevWordsLearned;

    // Чистое время фокуса на карточку с жестким потолком простоя (MAX_CARD_SECONDS = 30 сек)
    const activeCardSeconds = consumeCardFocusSeconds(targetLang);
    const baseActiveSeconds = normalizeFocusSeconds(current.activeSeconds || 0, Math.max(1, newCardsDone), true);
    const nextActiveSeconds = baseActiveSeconds + activeCardSeconds;

    const nextStats: DailyStats = {
      ...current,
      date: today,
      activeSeconds: nextActiveSeconds,
      cardsDone: newCardsDone,
      correctCount: newCorrectCount,
      mistakesCountToday: newMistakesToday,
      mistakesPool: updatedPool,
      cards_reviewed_today: newCardsReviewedToday,
      words_learned_today: newWordsLearnedToday
    };

    // Keep today's entry up-to-date in multi-day history & kraft_daily_stats
    const currentAcc = computeStrictAccuracy(newCorrectCount, newMistakesToday);
    const currentRecord = getDayRecord(targetLang, today);
    const nextFocusMins = Math.floor((nextStats.activeSeconds || 0) / 60);
    syncKraftDailyStatEntry(today, {
      cardsDone: newCardsDone,
      correct: newCorrectCount,
      mistakes: newMistakesToday,
      focusMinutes: nextFocusMins,
    });
    saveDayRecord(targetLang, {
      date: today,
      cardsReviewed: newCardsDone,
      targetCards: 200,
      focusMinutes: nextFocusMins,
      accuracy: currentAcc,
      mistakesCount: newMistakesToday,
      wordsMastered: isNewMastered ? (currentRecord.wordsMastered || 0) + 1 : (currentRecord.wordsMastered || 0),
      words_learned_today: newWordsLearnedToday,
      cards_reviewed_today: newCardsReviewedToday
    });

    statsByLang[targetLang] = nextStats;
    notifyLang(targetLang);
    // Batch both daily stats and mistake mutations with 30s debounce + flush on session exit/pagehide (0 KB egress per card answer)
    syncStatsToSupabase(targetLang, nextStats, false, mistakeMutation).catch(() => {});
  }, [lang]);

  return { stats, setStats, recordCardResult };
}
