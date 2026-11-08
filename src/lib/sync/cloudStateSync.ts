import { supabase } from '@/lib/supabase';
import { getIDBItem, setIDBItem } from '@/hooks/useDayStats';
import { normalizeLemmaKey } from '@/lib/utils/lemmaNormalizer';

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

  const remaining: PendingCardUpdate[] = [];

  for (const item of queue) {
    try {
      const { error } = await supabase
        .from('cards')
        .update(item.payload)
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
    syncWithCloud().catch(() => {});
  });

  window.addEventListener('offline', () => {
    setCloudSyncStatus('offline');
  });
}

// ============================================================================
// INSTANT NON-BLOCKING WRITE-THROUGH
// ============================================================================

export function writeThroughCardUpdate(cardId: string, card: any): void {
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
  };

  if (card.sentence !== undefined) primaryPayload.sentence = card.sentence;
  if (card.targetWord !== undefined) primaryPayload.targetWord = card.targetWord;
  if (card.translation !== undefined) primaryPayload.translation = card.translation;
  if (card.baseWordInfo !== undefined) primaryPayload.baseWordInfo = card.baseWordInfo;
  if (card.forms !== undefined) primaryPayload.forms = card.forms;

  // Background non-blocking execution (zero delay for user UI)
  (async () => {
    if (typeof window !== 'undefined' && !navigator.onLine) {
      await enqueuePendingCard(cardId, primaryPayload);
      setCloudSyncStatus('offline');
      return;
    }

    try {
      const { error } = await supabase
        .from('cards')
        .update(primaryPayload)
        .eq('id', cardId);

      if (error) {
        console.warn('[CloudSync] Primary update failed, queuing retry:', error);
        await enqueuePendingCard(cardId, primaryPayload);
        setCloudSyncStatus('error');
      } else {
        // Successful write
        setCloudSyncStatus('synced');
      }
    } catch (e) {
      console.warn('[CloudSync] Network error during write-through:', e);
      await enqueuePendingCard(cardId, primaryPayload);
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
    // 1. Export local Mastered Words from localStorage / memory
    let localEntries: any[] = [];
    try {
      const rawV4 = localStorage.getItem(`wortschatz_matrix_v4_${lang.toLowerCase()}`);
      if (rawV4) {
        const parsed = JSON.parse(rawV4);
        if (parsed && typeof parsed === 'object') {
          localEntries = Object.values(parsed);
        }
      }
    } catch {}

    let pushedWords = 0;
    if (localEntries.length > 0) {
      // Calculate level stats
      const counts: Record<string, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 };
      localEntries.forEach((e: any) => {
        const lvl = e.level || 'B1';
        if (counts[lvl] !== undefined) counts[lvl]++;
      });

      const { error: statsErr } = await supabase.from('user_stats').upsert({
        language: `MASTERED_WORDS_${normalizedLang}`,
        daily_activity: {
          entries: localEntries,
          counts,
          totalWords: localEntries.length,
          updatedAt: Date.now(),
        },
      });

      if (!statsErr) {
        pushedWords = localEntries.length;
      }
    }

    // 2. Export local Deck Cards with active SRS states to Supabase
    let pushedCards = 0;
    const localDecks = await getIDBItem<any[]>('app_decks');
    if (Array.isArray(localDecks)) {
      const cardsToUpsert: any[] = [];
      for (const d of localDecks) {
        if (!Array.isArray(d.cards)) continue;
        for (const c of d.cards) {
          if (c.masteryLevel >= 4 || c.isArchived || c.nextReviewDate) {
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
// FULL SEAMLESS CLOUD RECONCILIATION (PULL + MERGE + REHYDRATE)
// ============================================================================

export async function syncWithCloud(force: boolean = false): Promise<void> {
  const now = Date.now();
  if (isSyncInProgress) return;
  // Throttle to once every 3 seconds unless forced
  if (!force && now - lastSyncTimestamp < 3000) return;

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

    // Step 2: Fetch Cloud Mastered Words snapshot from user_stats
    const { data: statsRow } = await supabase
      .from('user_stats')
      .select('daily_activity')
      .eq('language', 'MASTERED_WORDS_DE')
      .maybeSingle();

    const cloudSnapshot = statsRow?.daily_activity;
    const cloudEntries: any[] = Array.isArray(cloudSnapshot?.entries) ? cloudSnapshot.entries : [];

    // Check local snapshot
    let localEntries: any[] = [];
    try {
      const rawV4 = localStorage.getItem('wortschatz_matrix_v4_de');
      if (rawV4) {
        const parsed = JSON.parse(rawV4);
        if (parsed && typeof parsed === 'object') {
          localEntries = Object.values(parsed);
        }
      }
    } catch {}

    // Bidirectional sync for Mastered Words:
    if (cloudEntries.length > localEntries.length) {
      // Cloud has more mastered words -> Hydrate local storage
      const nextMap: Record<string, any> = {};
      for (const e of cloudEntries) {
        const key = normalizeLemmaKey(e.originalWord || '');
        if (key) nextMap[key] = e;
      }
      localStorage.setItem('wortschatz_matrix_v4_de', JSON.stringify(nextMap));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('stats-update', { detail: { language: 'de' } }));
      }
    } else if (localEntries.length > cloudEntries.length) {
      // Local has more mastered words -> Push to cloud
      await forcePushLocalToCloud('DE');
    }

    // Step 3: Trigger card sync via custom event or global syncCardsFromSupabase
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('trigger-supabase-card-sync'));
    }

    setCloudSyncStatus('synced');
  } catch (err) {
    console.warn('[CloudSync] Sync failed:', err);
    setCloudSyncStatus('error');
  } finally {
    isSyncInProgress = false;
  }
}

// Auto-sync on visibility change (tab focus, reopening PWA)
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      syncWithCloud().catch(() => {});
    }
  });

  window.addEventListener('focus', () => {
    syncWithCloud().catch(() => {});
  });
}
