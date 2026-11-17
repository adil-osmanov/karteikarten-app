import { supabase, safeUpsertUserStats } from '@/lib/supabase';
import { getIDBItem, setIDBItem } from '@/hooks/useDayStats';
import { normalizeLemmaKey } from '@/lib/utils/lemmaNormalizer';
import { getSchemaCapabilities, markSchemaCapabilityFalse } from '@/lib/sync/schemaCapabilities';

export type CloudSyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

let currentStatus: CloudSyncStatus = 'idle';
const statusListeners = new Set<(status: CloudSyncStatus) => void>();
let syncedTimeout: ReturnType<typeof setTimeout> | null = null;
let lastSyncTimestamp = 0;
let isSyncInProgress = false;

export function getCloudSyncStatus(): CloudSyncStatus {
  if (typeof window !== 'undefined' && !navigator.onLine) {
    return 'offline';
  }
  return currentStatus;
}

export function setCloudSyncStatus(status: CloudSyncStatus) {
  if (currentStatus === status) return;
  currentStatus = status;

  if (syncedTimeout) {
    clearTimeout(syncedTimeout);
    syncedTimeout = null;
  }

  // Auto-revert 'synced' to 'idle' after 3 seconds for clean Apple UI
  if (status === 'synced') {
    syncedTimeout = setTimeout(() => {
      if (currentStatus === 'synced') {
        currentStatus = 'idle';
        statusListeners.forEach((fn) => fn('idle'));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('cloud-sync-status', { detail: 'idle' }));
        }
      }
    }, 3000);
  }

  statusListeners.forEach((fn) => fn(status));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cloud-sync-status', { detail: status }));
  }
}

export function subscribeCloudSyncStatus(fn: (status: CloudSyncStatus) => void): () => void {
  statusListeners.add(fn);
  fn(getCloudSyncStatus());
  return () => {
    statusListeners.delete(fn);
  };
}

// ============================================================================
// BROADCASTCHANNEL API: INSTANT MULTI-WINDOW STATE BUS
// ============================================================================

const STATE_BUS_NAME = 'kraft_state_bus';

export function broadcastStateBus(type: 'REFRESH_DUE_COUNT' | 'STATE_SYNC') {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      const channel = new BroadcastChannel(STATE_BUS_NAME);
      channel.postMessage({ type, timestamp: Date.now() });
      channel.close();
    } catch {}
  }
}

export function subscribeStateBus(handler: (event: { type: string; timestamp: number }) => void): () => void {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
    return () => {};
  }
  try {
    const channel = new BroadcastChannel(STATE_BUS_NAME);
    channel.onmessage = (e) => {
      if (e.data) handler(e.data);
    };
    return () => {
      channel.close();
    };
  } catch {
    return () => {};
  }
}

// ============================================================================
// OFFLINE QUEUE (INDEXEDDB / LOCALSTORAGE PERSISTENT RETRY)
// ============================================================================

interface PendingCardUpdate {
  cardId: string;
  payload: Record<string, any>;
  timestamp: number;
}

const PENDING_QUEUE_KEY = 'pending_sync_cards_queue';
const inFlightCardWrites = new Set<string>();
let flushInFlightPromise: Promise<void> | null = null;

function sanitizeCardMutationPayload(payload: Record<string, any>, cardsHasMistake: boolean): Record<string, any> {
  const sanitized = { ...payload };
  delete sanitized.updated_at;
  delete sanitized.round;
  delete sanitized.interval_days;
  delete sanitized.mastery_level;
  if (!cardsHasMistake) delete sanitized.has_mistake;
  return sanitized;
}

function readPendingQueueFromLocalStorageSync(): PendingCardUpdate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PENDING_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingQueueToLocalStorageSync(queue: PendingCardUpdate[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (queue.length === 0) {
      localStorage.removeItem(PENDING_QUEUE_KEY);
    } else {
      localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue));
    }
  } catch {}
}

export function getPendingOrInFlightCardIds(): Set<string> {
  const ids = new Set<string>(inFlightCardWrites);
  for (const item of readPendingQueueFromLocalStorageSync()) {
    if (item?.cardId) ids.add(item.cardId);
  }
  return ids;
}

export function hasPendingOrInFlightCardWrite(cardId: string): boolean {
  if (!cardId) return false;
  if (inFlightCardWrites.has(cardId)) return true;
  return readPendingQueueFromLocalStorageSync().some((item) => item?.cardId === cardId);
}

async function getPendingQueue(): Promise<PendingCardUpdate[]> {
  if (typeof window === 'undefined') return [];
  const lsQueue = readPendingQueueFromLocalStorageSync();
  try {
    const fromIDB = await getIDBItem<PendingCardUpdate[]>(PENDING_QUEUE_KEY);
    if (Array.isArray(fromIDB) && fromIDB.length > 0) {
      if (lsQueue.length === 0) return fromIDB;
      const merged = new Map<string, PendingCardUpdate>();
      for (const item of [...fromIDB, ...lsQueue]) {
        if (!item?.cardId) continue;
        const prev = merged.get(item.cardId);
        if (!prev || (item.timestamp || 0) >= (prev.timestamp || 0)) {
          merged.set(item.cardId, item);
        }
      }
      return Array.from(merged.values());
    }
  } catch {}
  return lsQueue;
}

async function savePendingQueue(queue: PendingCardUpdate[]): Promise<void> {
  if (typeof window === 'undefined') return;
  writePendingQueueToLocalStorageSync(queue);
  try {
    await setIDBItem(PENDING_QUEUE_KEY, queue);
  } catch {}
}

function upsertPendingQueueSync(cardId: string, payload: Record<string, any>, timestamp: number): PendingCardUpdate[] {
  const queue = readPendingQueueFromLocalStorageSync();
  const item: PendingCardUpdate = { cardId, payload, timestamp };
  const existingIdx = queue.findIndex((q) => q.cardId === cardId);
  if (existingIdx >= 0) {
    queue[existingIdx] = item;
  } else {
    queue.push(item);
  }
  writePendingQueueToLocalStorageSync(queue);
  return queue;
}

export async function enqueuePendingCard(cardId: string, payload: Record<string, any>) {
  const cleanPayload = { ...payload };
  delete cleanPayload.updated_at;
  const ts = Date.now();
  upsertPendingQueueSync(cardId, cleanPayload, ts);
  const fullQueue = await getPendingQueue();
  const idx = fullQueue.findIndex((q) => q.cardId === cardId);
  const item: PendingCardUpdate = { cardId, payload: cleanPayload, timestamp: ts };
  if (idx >= 0) {
    fullQueue[idx] = item;
  } else {
    fullQueue.push(item);
  }
  await savePendingQueue(fullQueue);
}

export async function dequeuePendingCard(cardId: string, upToTimestamp?: number): Promise<void> {
  if (!cardId || typeof window === 'undefined') return;
  const queue = await getPendingQueue();
  const next = queue.filter((q) => {
    if (q.cardId !== cardId) return true;
    if (upToTimestamp !== undefined && (q.timestamp || 0) > upToTimestamp) {
      return true;
    }
    return false;
  });
  if (next.length !== queue.length) {
    await savePendingQueue(next);
  }
}

export async function flushPendingQueue(): Promise<void> {
  if (flushInFlightPromise) return flushInFlightPromise;
  if (typeof window !== 'undefined' && !navigator.onLine) {
    setCloudSyncStatus('offline');
    return;
  }

  flushInFlightPromise = (async () => {
    const queue = await getPendingQueue();
    if (queue.length === 0) return;

    const caps = await getSchemaCapabilities();
    const remaining: PendingCardUpdate[] = [];

    for (const item of queue) {
      if (!item?.cardId || !item?.payload) continue;
      inFlightCardWrites.add(item.cardId);
      try {
        const sanitizedPayload = sanitizeCardMutationPayload(item.payload, caps.cardsHasMistake);

        let { error } = await supabase
          .from('cards')
          .update(sanitizedPayload)
          .eq('id', item.cardId);

        if (error && (error.code === '42703' || error.code === 'PGRST204' || error.message?.includes('does not exist'))) {
          if (error.message?.includes('has_mistake')) {
            markSchemaCapabilityFalse('cardsHasMistake');
            delete sanitizedPayload.has_mistake;
          }
          const retry = await supabase.from('cards').update(sanitizedPayload).eq('id', item.cardId);
          error = retry.error;
        }

        if (error) {
          console.error('[CloudSync] Failed to flush queued card update:', item.cardId, error);
          remaining.push(item);
        }
      } catch (err) {
        console.error('[CloudSync] Network error flushing queued card update:', item.cardId, err);
        remaining.push(item);
      } finally {
        inFlightCardWrites.delete(item.cardId);
      }
    }

    // Preserve any newer item queued while we were flushing
    const currentLs = readPendingQueueFromLocalStorageSync();
    const mergedRemaining = new Map<string, PendingCardUpdate>();
    for (const rem of remaining) {
      mergedRemaining.set(rem.cardId, rem);
    }
    for (const cur of currentLs) {
      if (!cur?.cardId) continue;
      const flushedItem = queue.find((q) => q.cardId === cur.cardId);
      if (!flushedItem || (cur.timestamp || 0) > (flushedItem.timestamp || 0)) {
        mergedRemaining.set(cur.cardId, cur);
      }
    }

    const finalRemaining = Array.from(mergedRemaining.values());
    await savePendingQueue(finalRemaining);
    if (finalRemaining.length === 0 && queue.length > 0) {
      setCloudSyncStatus('synced');
    }
  })().finally(() => {
    flushInFlightPromise = null;
  });

  return flushInFlightPromise;
}

// Setup network event listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    setCloudSyncStatus('idle');
    flushPendingQueue().catch(() => {});
  });

  window.addEventListener('offline', () => {
    setCloudSyncStatus('offline');
  });
}

// ============================================================================
// INSTANT NON-BLOCKING WRITE-THROUGH (COMPACT SRS PAYLOAD, ZERO SELECT('*'))
// ============================================================================

export function writeThroughCardUpdate(cardId: string, card: any, includeContent: boolean = false): void {
  const nextMastery = card.masteryLevel ?? card.mastery_level ?? 0;
  const isArchived = Boolean(card.isArchived ?? card.is_archived);
  const nextInterval = card.interval ?? 0;
  const nextRepetitions = card.repetitions ?? 0;
  const rawReviewDate = card.nextReviewDate !== undefined ? card.nextReviewDate : card.next_review_date;
  const numericReviewDate =
    rawReviewDate === null || rawReviewDate === undefined
      ? null
      : typeof rawReviewDate === 'number'
      ? Math.round(rawReviewDate)
      : new Date(rawReviewDate).getTime();

  const initialPayload: Record<string, any> = {
    masteryLevel: nextMastery,
    isArchived: isArchived,
    interval: nextInterval,
    repetitions: nextRepetitions,
    nextReviewDate: numericReviewDate,
    ...(typeof card.has_mistake === 'boolean' ? { has_mistake: card.has_mistake } : {}),
  };

  if (includeContent) {
    if (card.sentence !== undefined) initialPayload.sentence = card.sentence;
    if (card.targetWord !== undefined) initialPayload.targetWord = card.targetWord;
    if (card.translation !== undefined) initialPayload.translation = card.translation;
    if (card.baseWordInfo !== undefined) initialPayload.baseWordInfo = card.baseWordInfo;
    if (card.forms !== undefined) initialPayload.forms = card.forms;
  }

  // Optimistically record in synchronous localStorage retry queue & in-flight set
  // so abrupt mobile tab suspension (iOS Safari) never loses SRS progress.
  const writeTimestamp = Date.now();
  inFlightCardWrites.add(cardId);
  upsertPendingQueueSync(cardId, initialPayload, writeTimestamp);

  // Background non-blocking execution (zero delay for user UI, zero .select('*'))
  (async () => {
    try {
      const caps = await getSchemaCapabilities();
      const safePayload = sanitizeCardMutationPayload(initialPayload, caps.cardsHasMistake);

      if (typeof window !== 'undefined' && !navigator.onLine) {
        await enqueuePendingCard(cardId, safePayload);
        setCloudSyncStatus('offline');
        return;
      }

      let { error } = await supabase
        .from('cards')
        .update(safePayload)
        .eq('id', cardId);

      if (error && (error.code === '42703' || error.code === 'PGRST204' || error.message?.includes('does not exist'))) {
        if (error.message?.includes('has_mistake')) {
          markSchemaCapabilityFalse('cardsHasMistake');
          delete safePayload.has_mistake;
        }
        const retry = await supabase.from('cards').update(safePayload).eq('id', cardId);
        error = retry.error;
      }

      if (error) {
        console.error('[CloudSync] Supabase card update error:', cardId, error);
        await savePendingQueue(upsertPendingQueueSync(cardId, safePayload, writeTimestamp));
        setCloudSyncStatus('error');
      } else {
        await dequeuePendingCard(cardId, writeTimestamp);
        setCloudSyncStatus('synced');
      }
    } catch (e) {
      console.error('[CloudSync] Supabase card update network error:', cardId, e);
      setCloudSyncStatus('offline');
    } finally {
      inFlightCardWrites.delete(cardId);
    }
  })();
}

// ============================================================================
// MASTER PUSH (LOCAL TO CLOUD SINGLE SOURCE OF TRUTH)
// ============================================================================

export async function forcePushLocalToCloud(lang: string = 'DE'): Promise<{ pushedWords: number; pushedCards: number }> {
  if (typeof window === 'undefined') return { pushedWords: 0, pushedCards: 0 };
  const normalizedLang = lang.toUpperCase();

  setCloudSyncStatus('syncing');

  try {
    // Словарь освоенных слов больше не пушится из localStorage в Supabase (Server Wins Over Local Cache).
    const pushedWords = 0;

    // Export local Deck Cards with active SRS states to Supabase
    let pushedCards = 0;
    const localDecks = await getIDBItem<any[]>('app_decks');
    if (Array.isArray(localDecks)) {
      const cardsToUpsert: any[] = [];
      for (const d of localDecks) {
        if (!Array.isArray(d.cards)) continue;
        for (const c of d.cards) {
          if ((c.masteryLevel ?? 0) > 0 || c.isArchived || c.nextReviewDate) {
            cardsToUpsert.push({
              id: c.id,
              masteryLevel: c.masteryLevel ?? 0,
              isArchived: Boolean(c.isArchived),
              interval: c.interval ?? 0,
              repetitions: c.repetitions ?? 0,
              nextReviewDate: c.nextReviewDate ? (typeof c.nextReviewDate === 'number' ? Math.round(c.nextReviewDate) : new Date(c.nextReviewDate).getTime()) : null,
            });
          }
        }
      }

      // Batch update in chunks of 50
      for (let i = 0; i < cardsToUpsert.length; i += 50) {
        const chunk = cardsToUpsert.slice(i, i + 50);
        await Promise.allSettled(
          chunk.map((item) =>
            supabase
              .from('cards')
              .update({
                masteryLevel: item.masteryLevel,
                isArchived: item.isArchived,
                interval: item.interval,
                repetitions: item.repetitions,
                nextReviewDate: item.nextReviewDate,
              })
              .eq('id', item.id)
          )
        );
      }
      pushedCards = cardsToUpsert.length;
    }

    setCloudSyncStatus('synced');
    return { pushedWords, pushedCards };
  } catch (err) {
    console.error('[CloudSync] forcePushLocalToCloud failed:', err);
    setCloudSyncStatus('error');
    return { pushedWords: 0, pushedCards: 0 };
  }
}

// ============================================================================
// LIGHTWEIGHT SRS STATUS PULL + INCREMENTAL DELTA-SYNC (PC <-> PHONE SYNC)
// ============================================================================

export interface LightweightCardSrsRow {
  id: string;
  deck_id?: string | null;
  masteryLevel?: number | null;
  isArchived?: boolean | null;
  nextReviewDate?: number | string | null;
  interval?: number | null;
  repetitions?: number | null;
  has_mistake?: boolean | null;
}

export interface LightweightSrsPullResult {
  rows: LightweightCardSrsRow[];
  ok: boolean;
}

/**
 * Ультралёгкий постраничный запрос ТОЛЬКО компактных SRS-полей (без тяжёлых текстовых полей
 * sentence/translation/forms/options и без несуществующей колонки updated_at) для всех начатых
 * или архивированных карточек.
 */
export async function fetchLightweightSrsStates(
  client: typeof supabase = supabase
): Promise<LightweightSrsPullResult> {
  if (typeof window !== 'undefined' && !navigator.onLine) {
    return { rows: [], ok: false };
  }

  try {
    const caps = await getSchemaCapabilities();
    let includeMistake = caps.cardsHasMistake;
    const PAGE_SIZE = 1000;
    const rows: LightweightCardSrsRow[] = [];
    let from = 0;

    while (true) {
      let data: LightweightCardSrsRow[] | null = null;
      let error: any = null;

      if (includeMistake) {
        const res = await client
          .from('cards')
          .select('id, deck_id, masteryLevel, isArchived, nextReviewDate, interval, repetitions, has_mistake')
          .or('isArchived.eq.true,masteryLevel.gt.0,nextReviewDate.not.is.null,repetitions.gt.0')
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        data = res.data as LightweightCardSrsRow[] | null;
        error = res.error;
      } else {
        const res = await client
          .from('cards')
          .select('id, deck_id, masteryLevel, isArchived, nextReviewDate, interval, repetitions')
          .or('isArchived.eq.true,masteryLevel.gt.0,nextReviewDate.not.is.null,repetitions.gt.0')
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        data = res.data as LightweightCardSrsRow[] | null;
        error = res.error;
      }

      if (error && includeMistake && (error.code === '42703' || error.code === 'PGRST204' || error.message?.includes('has_mistake'))) {
        markSchemaCapabilityFalse('cardsHasMistake');
        includeMistake = false;
        const retry = await client
          .from('cards')
          .select('id, deck_id, masteryLevel, isArchived, nextReviewDate, interval, repetitions')
          .or('isArchived.eq.true,masteryLevel.gt.0,nextReviewDate.not.is.null,repetitions.gt.0')
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        data = retry.data as LightweightCardSrsRow[] | null;
        error = retry.error;
      }

      if (error) {
        console.warn('[LightweightSrsPull] Supabase query error:', error.message);
        return { rows, ok: false };
      }

      if (!data || data.length === 0) {
        break;
      }

      rows.push(...data);
      if (data.length < PAGE_SIZE) {
        break;
      }
      from += PAGE_SIZE;
    }

    return { rows, ok: true };
  } catch (e) {
    console.warn('[LightweightSrsPull] Failed to pull lightweight SRS states:', e);
    return { rows: [], ok: false };
  }
}

export const LAST_CARDS_SYNC_KEY = 'kraft_last_cards_sync_at';
const DELTA_SYNC_V2_READY_KEY = 'kraft_cards_delta_v2_ready';

export interface CardsDeltaResult {
  cards: any[];
  checkpointIso: string | null;
  ok: boolean;
}

/**
 * Загружает новые/изменённые колоды целиком (без несуществующей колонки updated_at).
 */
export interface SyncCardsDeltaOptions {
  allowFullFallback?: boolean;
  targetDeckIds?: string[];
  hasLocalCache?: boolean;
}

const FULL_CARDS_FALLBACK_KEY = 'kraft_last_full_cards_sync_at';
const FULL_CARDS_FALLBACK_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function syncCardsDelta(
  client: typeof supabase = supabase,
  _overrideLastSync?: string | null,
  options?: SyncCardsDeltaOptions
): Promise<CardsDeltaResult> {
  if (typeof window !== 'undefined' && !navigator.onLine) {
    return { cards: [], checkpointIso: null, ok: false };
  }

  try {
    const caps = await getSchemaCapabilities();

    // NEVER scan all ~8,169 cards on F5/focus/startup!
    // Only fetch explicit changed/new decks (targetDeckIds) or run full scan once per 24h / manual force.
    if (options?.targetDeckIds !== undefined && options.targetDeckIds.length === 0 && !options.allowFullFallback) {
      return { cards: [], checkpointIso: null, ok: true };
    }

    if (!options?.targetDeckIds?.length && !options?.allowFullFallback && typeof window !== 'undefined') {
      const lastFullMs = Number(localStorage.getItem(FULL_CARDS_FALLBACK_KEY) || '0');
      const hasCache = options?.hasLocalCache ?? lastFullMs > 0;
      if (hasCache && lastFullMs > 0 && Date.now() - lastFullMs < FULL_CARDS_FALLBACK_COOLDOWN_MS) {
        return { cards: [], checkpointIso: null, ok: true };
      }
    }

    const PAGE_SIZE = 1000;
    const allRows: any[] = [];
    const selectCols = caps.cardsHasMistake
      ? 'id, deck_id, targetWord, sentence, translation, options, masteryLevel, isArchived, nextReviewDate, interval, repetitions, baseWordInfo, forms, has_mistake'
      : 'id, deck_id, targetWord, sentence, translation, options, masteryLevel, isArchived, nextReviewDate, interval, repetitions, baseWordInfo, forms';

    const targetChunks: (string[] | null)[] = [];
    if (options?.targetDeckIds && options.targetDeckIds.length > 0 && !options.allowFullFallback) {
      const CHUNK = 40;
      for (let i = 0; i < options.targetDeckIds.length; i += CHUNK) {
        targetChunks.push(options.targetDeckIds.slice(i, i + CHUNK));
      }
    } else {
      targetChunks.push(null);
    }

    for (const deckChunk of targetChunks) {
      let from = 0;
      while (true) {
        let query = client.from('cards').select(selectCols);

        if (deckChunk) {
          query = query.in('deck_id', deckChunk);
        }
        query = query.order('id', { ascending: true });

        const { data, error } = await query.range(from, from + PAGE_SIZE - 1);

        if (error) {
          console.warn('[DeltaSync] Supabase delta query error:', error.message);
          return { cards: allRows, checkpointIso: null, ok: false };
        }

        if (!data || data.length === 0) {
          break;
        }

        allRows.push(...data);
        if (data.length < PAGE_SIZE) {
          break;
        }
        from += PAGE_SIZE;
      }
    }

    // Track 24h timestamp if we executed a full fallback scan without deck filter
    if (typeof window !== 'undefined' && (options?.allowFullFallback || !options?.targetDeckIds?.length)) {
      try {
        localStorage.setItem(FULL_CARDS_FALLBACK_KEY, String(Date.now()));
      } catch {}
    }

    const checkpointIso = new Date(Date.now() - 15_000).toISOString();

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(LAST_CARDS_SYNC_KEY, checkpointIso);
        localStorage.setItem(DELTA_SYNC_V2_READY_KEY, '1');
      } catch {}
    }

    return { cards: allRows, checkpointIso, ok: true };
  } catch (e) {
    console.warn('[DeltaSync] Failed to fetch cards delta from Supabase:', e);
    return { cards: [], checkpointIso: null, ok: false };
  }
}

export async function fetchCardsDelta(lastSync?: string | null): Promise<any[]> {
  const result = await syncCardsDelta(supabase, lastSync);
  return result.cards;
}

// ============================================================================
// DELTA CLOUD RECONCILIATION (SHORT DEDUPE COOLDOWN FOR INSTANT TAB SWITCHING)
// ============================================================================

const FOCUS_COOLDOWN_MS = 20 * 1000; // 20-second cooldown for lightweight SRS reconciliation

export async function syncWithCloud(force: boolean = false): Promise<void> {
  const now = Date.now();
  if (isSyncInProgress) return;
  if (!force && now - lastSyncTimestamp < FOCUS_COOLDOWN_MS) return;

  if (typeof window !== 'undefined' && !navigator.onLine) {
    setCloudSyncStatus('offline');
    return;
  }

  isSyncInProgress = true;
  lastSyncTimestamp = now;
  setCloudSyncStatus('syncing');

  try {
    // Step 1: Flush any offline pending mutations first
    await flushPendingQueue();

    // Step 2: Trigger delta sync only (or full if explicitly forced by user button)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('trigger-supabase-card-sync', { detail: { force } }));
    }

    setCloudSyncStatus('synced');
  } catch (err) {
    console.warn('[CloudSync] Sync failed:', err);
    setCloudSyncStatus('error');
  } finally {
    isSyncInProgress = false;
  }
}
