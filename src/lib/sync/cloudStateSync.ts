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

async function getPendingQueue(): Promise<PendingCardUpdate[]> {
  if (typeof window === 'undefined') return [];
  try {
    const fromIDB = await getIDBItem<PendingCardUpdate[]>(PENDING_QUEUE_KEY);
    if (Array.isArray(fromIDB)) return fromIDB;
    const fromLS = localStorage.getItem(PENDING_QUEUE_KEY);
    if (fromLS) return JSON.parse(fromLS);
  } catch {}
  return [];
}

async function savePendingQueue(queue: PendingCardUpdate[]): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    await setIDBItem(PENDING_QUEUE_KEY, queue);
    localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

export async function enqueuePendingCard(cardId: string, payload: Record<string, any>) {
  const queue = await getPendingQueue();
  const existingIdx = queue.findIndex((q) => q.cardId === cardId);
  const item: PendingCardUpdate = {
    cardId,
    payload,
    timestamp: Date.now(),
  };

  if (existingIdx >= 0) {
    queue[existingIdx] = item;
  } else {
    queue.push(item);
  }

  await savePendingQueue(queue);
}

export async function flushPendingQueue(): Promise<void> {
  if (typeof window !== 'undefined' && !navigator.onLine) {
    setCloudSyncStatus('offline');
    return;
  }

  const queue = await getPendingQueue();
  if (queue.length === 0) return;

  const caps = await getSchemaCapabilities();
  const remaining: PendingCardUpdate[] = [];

  for (const item of queue) {
    try {
      const sanitizedPayload = { ...item.payload };
      if (!caps.cardsUpdatedAt) delete sanitizedPayload.updated_at;
      if (!caps.cardsHasMistake) delete sanitizedPayload.has_mistake;

      const { error } = await supabase
        .from('cards')
        .update(sanitizedPayload)
        .eq('id', item.cardId);

      if (error) {
        remaining.push(item);
      }
    } catch {
      remaining.push(item);
    }
  }

  await savePendingQueue(remaining);
  if (remaining.length === 0 && queue.length > 0) {
    setCloudSyncStatus('synced');
  }
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

  const primaryPayload: Record<string, any> = {
    masteryLevel: nextMastery,
    isArchived: isArchived,
    interval: nextInterval,
    repetitions: nextRepetitions,
    nextReviewDate: numericReviewDate,
    updated_at: new Date().toISOString(),
  };

  if (includeContent) {
    if (card.sentence !== undefined) primaryPayload.sentence = card.sentence;
    if (card.targetWord !== undefined) primaryPayload.targetWord = card.targetWord;
    if (card.translation !== undefined) primaryPayload.translation = card.translation;
    if (card.baseWordInfo !== undefined) primaryPayload.baseWordInfo = card.baseWordInfo;
    if (card.forms !== undefined) primaryPayload.forms = card.forms;
  }

  // Background non-blocking execution (zero delay for user UI, zero .select('*'))
  (async () => {
    const caps = await getSchemaCapabilities();
    const safePayload: Record<string, any> = {
      masteryLevel: nextMastery,
      isArchived: isArchived,
      interval: nextInterval,
      repetitions: nextRepetitions,
      nextReviewDate: numericReviewDate,
      ...(caps.cardsUpdatedAt ? { updated_at: primaryPayload.updated_at } : {}),
      ...(caps.cardsHasMistake && typeof card.has_mistake === 'boolean'
        ? { has_mistake: card.has_mistake }
        : {}),
    };

    if (includeContent) {
      if (card.sentence !== undefined) safePayload.sentence = card.sentence;
      if (card.targetWord !== undefined) safePayload.targetWord = card.targetWord;
      if (card.translation !== undefined) safePayload.translation = card.translation;
      if (card.baseWordInfo !== undefined) safePayload.baseWordInfo = card.baseWordInfo;
      if (card.forms !== undefined) safePayload.forms = card.forms;
    }

    if (typeof window !== 'undefined' && !navigator.onLine) {
      await enqueuePendingCard(cardId, safePayload);
      setCloudSyncStatus('offline');
      return;
    }

    try {
      let { error } = await supabase
        .from('cards')
        .update(safePayload)
        .eq('id', cardId);

      if (error && (error.code === '42703' || error.message?.includes('does not exist'))) {
        if (error.message?.includes('updated_at')) {
          markSchemaCapabilityFalse('cardsUpdatedAt');
          delete safePayload.updated_at;
        }
        if (error.message?.includes('has_mistake')) {
          markSchemaCapabilityFalse('cardsHasMistake');
          delete safePayload.has_mistake;
        }
        const retry = await supabase.from('cards').update(safePayload).eq('id', cardId);
        error = retry.error;
      }

      if (error) {
        console.error('Supabase update error:', error);
        await enqueuePendingCard(cardId, safePayload);
        setCloudSyncStatus('error');
      } else {
        setCloudSyncStatus('synced');
      }
    } catch (e) {
      console.error('Supabase update error (network):', e);
      await enqueuePendingCard(cardId, safePayload);
      setCloudSyncStatus('offline');
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

      const caps = await getSchemaCapabilities();
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
                ...(caps.cardsUpdatedAt ? { updated_at: new Date().toISOString() } : {}),
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
// INCREMENTAL TIMESTAMP DELTA-SYNC (PC <-> PHONE SYNC, ALL MASTERY LEVELS)
// ============================================================================

export const LAST_CARDS_SYNC_KEY = 'kraft_last_cards_sync_at';
const DELTA_SYNC_V2_READY_KEY = 'kraft_cards_delta_v2_ready';

export interface CardsDeltaResult {
  cards: any[];
  checkpointIso: string | null;
  ok: boolean;
}

/**
 * Загружает ТОЛЬКО новые и изменённые карточки по `updated_at` (включая карточки с masteryLevel === 0).
 * При первом запуске (или однократной миграции со старой логики без v2-флага)
 * подтягивает карточки с прогрессом и все карточки, созданные/изменённые за последние 30 дней.
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
  overrideLastSync?: string | null,
  options?: SyncCardsDeltaOptions
): Promise<CardsDeltaResult> {
  if (typeof window !== 'undefined' && !navigator.onLine) {
    return { cards: [], checkpointIso: null, ok: false };
  }

  try {
    const caps = await getSchemaCapabilities();
    const hasV2 =
      typeof window !== 'undefined' &&
      Boolean(localStorage.getItem(DELTA_SYNC_V2_READY_KEY));

    const lastSyncAt =
      overrideLastSync !== undefined
        ? overrideLastSync
        : typeof window !== 'undefined' && hasV2
        ? localStorage.getItem(LAST_CARDS_SYNC_KEY)
        : null;

    // When DB lacks updated_at, NEVER scan all ~8,169 cards on F5/focus/startup!
    // Only fetch explicit changed/new decks (targetDeckIds) or run full scan once per 24h / manual force.
    if (!caps.cardsUpdatedAt) {
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
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const PAGE_SIZE = 1000;
    const allRows: any[] = [];
    const selectCols = caps.cardsHasMistake
      ? 'id, deck_id, targetWord, sentence, translation, options, masteryLevel, isArchived, nextReviewDate, interval, repetitions, baseWordInfo, forms, has_mistake'
      : 'id, deck_id, targetWord, sentence, translation, options, masteryLevel, isArchived, nextReviewDate, interval, repetitions, baseWordInfo, forms';

    const targetChunks: (string[] | null)[] = [];
    if (!caps.cardsUpdatedAt && options?.targetDeckIds && options.targetDeckIds.length > 0 && !options.allowFullFallback) {
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
        let query = client.from('cards').select(caps.cardsUpdatedAt ? `${selectCols}, updated_at` : selectCols);

        if (caps.cardsUpdatedAt) {
          if (lastSyncAt) {
            query = query.gt('updated_at', lastSyncAt);
          } else {
            query = query.or(
              `masteryLevel.gt.0,isArchived.eq.true,nextReviewDate.not.is.null,updated_at.gt.${thirtyDaysAgo}`
            );
          }
          query = query.order('updated_at', { ascending: true });
        } else {
          if (deckChunk) {
            query = query.in('deck_id', deckChunk);
          }
          // Schema without updated_at: deterministic order by id (no HTTP 400!)
          query = query.order('id', { ascending: true });
        }

        const { data, error } = await query.range(from, from + PAGE_SIZE - 1);

        if (error) {
          if (error.code === '42703' || error.message?.includes('updated_at')) {
            markSchemaCapabilityFalse('cardsUpdatedAt');
          }
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
    if (!caps.cardsUpdatedAt && typeof window !== 'undefined' && (options?.allowFullFallback || !options?.targetDeckIds?.length)) {
      try {
        localStorage.setItem(FULL_CARDS_FALLBACK_KEY, String(Date.now()));
      } catch {}
    }

    // Сохраняем серверную отметку времени (или slight-skew-safe baseline при 0 строках)
    let maxRemoteIso: string | null = null;
    let maxRemoteMs = 0;
    for (const row of allRows) {
      if (row?.updated_at) {
        const ms = Date.parse(row.updated_at);
        if (!Number.isNaN(ms) && ms > maxRemoteMs) {
          maxRemoteMs = ms;
          maxRemoteIso = row.updated_at;
        }
      }
    }

    const fallbackCheckpoint = new Date(Date.now() - 15_000).toISOString();
    const checkpointIso = maxRemoteIso || fallbackCheckpoint;

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

const FOCUS_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes hard cooldown to stop Supabase egress leaks

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
