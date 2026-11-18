import { getIDBItem, setIDBItem } from '@/hooks/useDayStats';
import { safeFetchUserStats, safeUpsertUserStats } from '@/lib/supabase';

export type FsrsRating = 1 | 2 | 3 | 4; // 1=Again, 2=Hard, 3=Good, 4=Easy

export interface FsrsCardState {
  difficulty: number; // D in [1, 10]
  stability: number; // S in days
  lastReviewDate: number; // UTC ms timestamp
}

export interface FsrsTelemetry {
  elapsedMs?: number;
  hadTypo?: boolean;
  failedInSession?: boolean;
  hadLearningMistakes?: boolean;
  ratingOverride?: FsrsRating;
  nowMs?: number;
  fuzzRandom?: number;
}

export interface FsrsScheduleResult {
  masteryLevel: number;
  isArchived: boolean;
  repetitions: number;
  interval: number;
  easeFactor: number;
  nextReviewDate: number | null;
  first_mastered_at?: string;
  rating: FsrsRating;
  fsrsState?: FsrsCardState;
}

/** Compact tuple serialized into localStorage / IDB / Supabase user_stats (`FSRS_STATE`) */
export type FsrsCompactTuple = [number, number, number]; // [difficulty, stability, lastReviewDateMs]

export interface FsrsCloudPayload {
  entries: Record<string, FsrsCompactTuple>;
  updatedAt: number;
}

export const DAY_MS = 86_400_000;
export const FSRS_FACTOR = 19 / 81;
export const FSRS_DECAY = -0.5;

export const INITIAL_D_CLEAN = 4.5;
export const INITIAL_S_CLEAN = 3;
export const INITIAL_D_HARD = 6.8;
export const INITIAL_S_HARD = 1;

const FSRS_STORAGE_KEY = 'kraft_fsrs_state_v1';
const FSRS_IDB_KEY = 'app_fsrs_state';
export const FSRS_CLOUD_KEY = 'FSRS_STATE';
const FSRS_SYNC_COOLDOWN_MS = 20_000;

let inMemoryFsrsMap: Map<string, FsrsCardState> | null = null;
let fsrsDirtySinceLastPush = false;
let lastFsrsCloudPullAt = 0;
let pushDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let inFlightFsrsSync: Promise<boolean> | null = null;

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

function safeParseDateMs(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '' || raw === 0) return null;
  const num = typeof raw === 'number' ? raw : new Date(String(raw)).getTime();
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num);
}

/**
 * Checks whether a card has a structurally valid (> 0, non-NaN) nextReviewDate.
 */
export function hasValidNextReviewDate(card: any): boolean {
  if (!card) return false;
  const raw = card.nextReviewDate ?? card.next_review_date ?? card.next_review_at;
  return safeParseDateMs(raw) !== null;
}

function ensureFsrsMapLoaded(): Map<string, FsrsCardState> {
  if (inMemoryFsrsMap) return inMemoryFsrsMap;
  const map = new Map<string, FsrsCardState>();
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(FSRS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const entries = parsed?.entries && typeof parsed.entries === 'object' ? parsed.entries : parsed;
        if (entries && typeof entries === 'object') {
          for (const [cardId, tuple] of Object.entries(entries)) {
            if (Array.isArray(tuple) && tuple.length >= 3) {
              const d = clamp(Number(tuple[0]) || INITIAL_D_CLEAN, 1, 10);
              const s = Math.max(0.5, Number(tuple[1]) || 1);
              const ts = Math.round(Number(tuple[2]) || 0);
              if (cardId && ts > 0) {
                map.set(cardId, { difficulty: d, stability: s, lastReviewDate: ts });
              }
            }
          }
        }
      }
    } catch {}
  }
  inMemoryFsrsMap = map;
  return map;
}

function serializeFsrsPayload(map: Map<string, FsrsCardState>): FsrsCloudPayload {
  const entries: Record<string, FsrsCompactTuple> = {};
  let maxTs = 0;
  map.forEach((st, id) => {
    entries[id] = [round2(clamp(st.difficulty, 1, 10)), round2(Math.max(0.5, st.stability)), Math.round(st.lastReviewDate)];
    if (st.lastReviewDate > maxTs) maxTs = st.lastReviewDate;
  });
  return { entries, updatedAt: maxTs || Date.now() };
}

function persistFsrsMapLocally(map: Map<string, FsrsCardState>): void {
  if (typeof window === 'undefined') return;
  const payload = serializeFsrsPayload(map);
  try {
    localStorage.setItem(FSRS_STORAGE_KEY, JSON.stringify(payload));
  } catch {}
  setIDBItem(FSRS_IDB_KEY, payload).catch(() => {});
}

export async function hydrateFsrsMapFromIDB(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const stored = await getIDBItem<FsrsCloudPayload>(FSRS_IDB_KEY);
    if (stored?.entries && typeof stored.entries === 'object') {
      mergeFsrsEntriesIntoLocal(stored.entries, false);
    }
  } catch {}
}

export function getFsrsCardState(cardId: string): FsrsCardState | null {
  if (!cardId) return null;
  const map = ensureFsrsMapLoaded();
  return map.get(cardId) ?? null;
}

export function setFsrsCardState(cardId: string, state: FsrsCardState, schedulePush: boolean = true): void {
  if (!cardId) return;
  const map = ensureFsrsMapLoaded();
  map.set(cardId, {
    difficulty: round2(clamp(state.difficulty, 1, 10)),
    stability: round2(Math.max(0.5, state.stability)),
    lastReviewDate: Math.round(state.lastReviewDate),
  });
  persistFsrsMapLocally(map);
  if (schedulePush) {
    fsrsDirtySinceLastPush = true;
    scheduleFsrsCloudPush();
  }
}

export function clearFsrsCardState(cardId: string): void {
  if (!cardId) return;
  const map = ensureFsrsMapLoaded();
  if (map.delete(cardId)) {
    persistFsrsMapLocally(map);
    fsrsDirtySinceLastPush = true;
    scheduleFsrsCloudPush();
  }
}

export function resetFsrsSyncCooldownForTests(): void {
  lastFsrsCloudPullAt = 0;
  inMemoryFsrsMap = null;
}

function mergeFsrsEntriesIntoLocal(
  remoteEntries: Record<string, any> | null | undefined,
  markDirtyIfLocalAhead: boolean = true
): { localChanged: boolean; localAhead: boolean } {
  const map = ensureFsrsMapLoaded();
  if (!remoteEntries || typeof remoteEntries !== 'object') {
    return { localChanged: false, localAhead: map.size > 0 };
  }

  let localChanged = false;
  let localAhead = false;
  const seenRemote = new Set<string>();

  for (const [cardId, raw] of Object.entries(remoteEntries)) {
    if (!cardId || !Array.isArray(raw) || raw.length < 3) continue;
    seenRemote.add(cardId);
    const rD = clamp(Number(raw[0]) || INITIAL_D_CLEAN, 1, 10);
    const rS = Math.max(0.5, Number(raw[1]) || 1);
    const rTs = Math.round(Number(raw[2]) || 0);
    if (rTs <= 0) continue;

    const local = map.get(cardId);
    if (!local || rTs > local.lastReviewDate) {
      map.set(cardId, { difficulty: round2(rD), stability: round2(rS), lastReviewDate: rTs });
      localChanged = true;
    } else if (local.lastReviewDate > rTs) {
      localAhead = true;
    }
  }

  for (const id of map.keys()) {
    if (!seenRemote.has(id)) {
      localAhead = true;
      break;
    }
  }

  if (localChanged) {
    persistFsrsMapLocally(map);
  }
  if (markDirtyIfLocalAhead && localAhead) {
    fsrsDirtySinceLastPush = true;
  }
  return { localChanged, localAhead };
}

export function applyCloudFsrsPayload(payload: any): void {
  if (!payload || typeof payload !== 'object') return;
  const entries = payload.entries && typeof payload.entries === 'object' ? payload.entries : payload;
  mergeFsrsEntriesIntoLocal(entries, true);
}

export function scheduleFsrsCloudPush(): void {
  if (typeof window === 'undefined') return;
  if (pushDebounceTimer) clearTimeout(pushDebounceTimer);
  pushDebounceTimer = setTimeout(() => {
    pushDebounceTimer = null;
    void flushFsrsStateToCloud();
  }, 1500);
}

export async function flushFsrsStateToCloud(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (pushDebounceTimer) {
    clearTimeout(pushDebounceTimer);
    pushDebounceTimer = null;
  }
  if (!fsrsDirtySinceLastPush) return true;
  if (!navigator.onLine) return false;

  const map = ensureFsrsMapLoaded();
  if (map.size === 0) {
    fsrsDirtySinceLastPush = false;
    return true;
  }

  const payload = serializeFsrsPayload(map);
  const ok = await safeUpsertUserStats({
    language: FSRS_CLOUD_KEY,
    daily_activity: payload,
  });
  if (ok) {
    fsrsDirtySinceLastPush = false;
  }
  return ok;
}

export async function syncFsrsStateFromCloud(force: boolean = false): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!navigator.onLine) return false;
  if (inFlightFsrsSync) return inFlightFsrsSync;

  const now = Date.now();
  if (!force && lastFsrsCloudPullAt > 0 && now - lastFsrsCloudPullAt < FSRS_SYNC_COOLDOWN_MS) {
    return false;
  }

  inFlightFsrsSync = (async () => {
    try {
      await hydrateFsrsMapFromIDB();
      const cloudPayload = await safeFetchUserStats(FSRS_CLOUD_KEY);
      lastFsrsCloudPullAt = Date.now();

      const entries =
        cloudPayload && typeof cloudPayload === 'object'
          ? cloudPayload.entries && typeof cloudPayload.entries === 'object'
            ? cloudPayload.entries
            : cloudPayload
          : null;

      const { localAhead } = mergeFsrsEntriesIntoLocal(entries, false);
      if (localAhead || fsrsDirtySinceLastPush) {
        fsrsDirtySinceLastPush = true;
        await flushFsrsStateToCloud();
      }
      return true;
    } catch (e) {
      console.warn('[FSRS] Failed to sync DSR state:', e);
      return false;
    } finally {
      inFlightFsrsSync = null;
    }
  })();

  return inFlightFsrsSync;
}

/**
 * FSRS power forgetting curve:
 * R(t, S) = (1 + (19/81) * (t / S)) ^ (-0.5)
 * Equals 0.90 at t === S.
 */
export function calculateRetrievability(elapsedDays: number, stabilityDays: number): number {
  const s = Math.max(0.1, stabilityDays);
  const t = Math.max(0, elapsedDays);
  return Math.pow(1 + FSRS_FACTOR * (t / s), FSRS_DECAY);
}

/**
 * Automatic 1..4 grade inference without UI grade buttons:
 * - 1 (Again): incorrect or Surrender/Hilfe
 * - 2 (Hard): correct after retry/failedInSession, typing typo, prior learning mistakes, or slow (> 12s)
 * - 4 (Easy): fast (< 3s), zero errors/typos/history of errors
 * - 3 (Good): standard confident recall (3..12s or untimed clean answer)
 */
export function determineFsrsRating(
  isCorrect: boolean,
  isHilfe: boolean,
  telemetry: FsrsTelemetry = {}
): FsrsRating {
  if (telemetry.ratingOverride) return telemetry.ratingOverride;
  if (!isCorrect || isHilfe) return 1;

  const hadPriorMistake = Boolean(telemetry.failedInSession || telemetry.hadLearningMistakes);
  if (
    telemetry.failedInSession ||
    telemetry.hadTypo ||
    (typeof telemetry.elapsedMs === 'number' && telemetry.elapsedMs > 12_000)
  ) {
    return 2;
  }

  if (
    !hadPriorMistake &&
    !telemetry.hadTypo &&
    typeof telemetry.elapsedMs === 'number' &&
    telemetry.elapsedMs >= 0 &&
    telemetry.elapsedMs < 3_000
  ) {
    return 4;
  }

  return 3;
}

function deriveLegacyFsrsState(card: any, nowMs: number): FsrsCardState {
  const cardId = card?.id;
  if (cardId) {
    const cached = getFsrsCardState(cardId);
    if (cached) return cached;
  }

  const rawInterval = Number(card?.interval || 0);
  const stability = rawInterval > 0 ? rawInterval : 1;
  const rawEase = typeof card?.easeFactor === 'number' && card.easeFactor >= 1.3 ? card.easeFactor : 2.5;
  const difficulty = clamp(round2(INITIAL_D_CLEAN + (2.5 - rawEase) * 4), 1, 10);

  const scheduledMs = safeParseDateMs(card?.nextReviewDate ?? card?.next_review_date ?? card?.next_review_at);
  const reps = Number(card?.repetitions || 0);
  // If reps === 0, the scheduled gap after lapse was 1 day (tomorrow), even if retained stability is 1..2
  const inferredGapDays = reps === 0 ? 1 : Math.max(1, stability);
  const estimatedLastReview = scheduledMs
    ? Math.min(nowMs, scheduledMs - inferredGapDays * DAY_MS)
    : Math.max(0, nowMs - Math.max(1, stability) * DAY_MS);

  return {
    difficulty,
    stability,
    lastReviewDate: estimatedLastReview,
  };
}

function difficultyToLegacyEase(difficulty: number): number {
  return round2(clamp(2.5 - (difficulty - INITIAL_D_CLEAN) * 0.15, 1.3, 3.0));
}

/**
 * Pure + persistent FSRS DSR scheduler.
 * Updates and stores exact (D, S, lastReviewDate) for archived/graduating cards.
 */
export function calculateNextFSRSState(
  card: any,
  isCorrect: boolean,
  isHilfe: boolean,
  isReviewMode: boolean = false,
  forceArchiveGraduation: boolean = false,
  telemetry: FsrsTelemetry = {}
): FsrsScheduleResult {
  const nowMs = typeof telemetry.nowMs === 'number' ? telemetry.nowMs : Date.now();
  const rating = determineFsrsRating(isCorrect, isHilfe, telemetry);
  const currentReps = Number(card?.repetitions || 0);
  const currentMastery = Number(card?.masteryLevel ?? card?.mastery_level ?? 0);
  const wasArchived = Boolean(card?.isArchived ?? card?.is_archived);
  const inReviewFlow = Boolean(wasArchived && !forceArchiveGraduation);

  // Stage 3: Spaced repetition of archived cards
  if (inReviewFlow) {
    const prevState = deriveLegacyFsrsState(card, nowMs);
    const prevD = prevState.difficulty;
    const prevS = Math.max(1, prevState.stability);

    if (rating === 1) {
      // Again / Lapse: card REMAINS archived, next review tomorrow, S decayed without resetting to 0
      const nextD = round2(clamp(prevD + 0.8, 1, 10));
      const nextS = round2(Math.max(1, Math.min(prevS * 0.25, 2)));
      const nextInterval = Math.max(1, Math.round(nextS));
      const nextReviewDate = nowMs + DAY_MS; // Strictly tomorrow (+24h)
      const nextState: FsrsCardState = {
        difficulty: nextD,
        stability: nextS,
        lastReviewDate: nowMs,
      };
      if (card?.id) {
        setFsrsCardState(card.id, nextState, true);
      }
      return {
        masteryLevel: Math.max(4, currentMastery),
        isArchived: true,
        repetitions: 0,
        interval: nextInterval,
        easeFactor: difficultyToLegacyEase(nextD),
        nextReviewDate,
        first_mastered_at: card?.first_mastered_at,
        rating,
        fsrsState: nextState,
      };
    }

    // Recall (Hard=2, Good=3, Easy=4)
    const elapsedDays = Math.max(0, (nowMs - prevState.lastReviewDate) / DAY_MS);
    const retrievability = calculateRetrievability(elapsedDays, prevS);

    // Difficulty update with gentle mean reversion toward INITIAL_D_CLEAN (4.5)
    const nextD = round2(clamp(0.95 * (prevD - 0.8 * (rating - 3)) + 0.05 * INITIAL_D_CLEAN, 1, 10));

    // FSRS recall stability gain: scales with (11 - D), S^(-0.14), and (e^(1 - R) - 1)
    // Tuned so S=3 -> Good lands in 7-9 days, Easy lands in 10-12 days, then grows exponentially
    const gradeMult = rating === 2 ? 0.45 : rating === 4 ? 1.5 : 1.0;
    const dFactor = 11 - nextD;
    const sDecay = Math.pow(prevS, -0.14);
    const rBonus = Math.exp(1.0 * (1 - retrievability)) - 1;
    let rawNextS = prevS * (1 + 2.7 * dFactor * sDecay * rBonus * gradeMult);

    // Ensure non-failing due cards with S >= 1 at least step forward when answered Good/Easy
    if (rating >= 3 && elapsedDays >= prevS * 0.5) {
      rawNextS = Math.max(rawNextS, prevS + 1);
    }

    // Randomized +/- 5% fuzzing so cards from one deck do not stack on the same timestamp
    const rand =
      typeof telemetry.fuzzRandom === 'number'
        ? clamp(telemetry.fuzzRandom, 0, 0.999999)
        : Math.random();
    const fuzzMultiplier = 0.95 + rand * 0.1;
    const fuzzedS = round2(clamp(rawNextS * fuzzMultiplier, 1, 36_500));
    const nextInterval = Math.max(1, Math.round(fuzzedS));
    const nextReviewDate = nowMs + nextInterval * DAY_MS;

    const nextState: FsrsCardState = {
      difficulty: nextD,
      stability: fuzzedS,
      lastReviewDate: nowMs,
    };
    if (card?.id) {
      setFsrsCardState(card.id, nextState, true);
    }

    return {
      masteryLevel: Math.max(4, currentMastery),
      isArchived: true,
      repetitions: currentReps + 1,
      interval: nextInterval,
      easeFactor: difficultyToLegacyEase(nextD),
      nextReviewDate,
      first_mastered_at: card?.first_mastered_at,
      rating,
      fsrsState: nextState,
    };
  }

  // Stage 1: Initial learning rounds (1..4 until graduating to Archive)
  if (isCorrect && !isHilfe) {
    const nextMastery = forceArchiveGraduation ? 4 : Math.min(4, currentMastery + 1);
    const graduatesToArchive = forceArchiveGraduation || nextMastery >= 4;

    if (graduatesToArchive) {
      const hadLearningMistakes = Boolean(
        isHilfe ||
          telemetry.hadLearningMistakes ||
          telemetry.failedInSession ||
          telemetry.hadTypo ||
          card?.has_mistake ||
          (card?.mistakeCount ?? 0) > 0
      );

      const initialS = Math.min(3, Math.max(1, hadLearningMistakes ? INITIAL_S_HARD : INITIAL_S_CLEAN));
      const initialD = hadLearningMistakes ? INITIAL_D_HARD : INITIAL_D_CLEAN;
      const nextReviewDate = nowMs + initialS * DAY_MS;
      const graduationRating: FsrsRating = hadLearningMistakes ? 2 : rating;

      const nextState: FsrsCardState = {
        difficulty: initialD,
        stability: initialS,
        lastReviewDate: nowMs,
      };
      if (card?.id) {
        setFsrsCardState(card.id, nextState, true);
      }

      return {
        masteryLevel: 4,
        isArchived: true,
        repetitions: 1,
        interval: initialS,
        easeFactor: difficultyToLegacyEase(initialD),
        nextReviewDate,
        first_mastered_at: card?.first_mastered_at || new Date(nowMs).toISOString(),
        rating: graduationRating,
        fsrsState: nextState,
      };
    }

    const existingState = card?.id ? getFsrsCardState(card.id) : null;
    const previewD = existingState?.difficulty ?? (rating === 2 ? INITIAL_D_HARD : INITIAL_D_CLEAN);
    return {
      masteryLevel: nextMastery,
      isArchived: false,
      repetitions: 0,
      interval: 0,
      easeFactor: difficultyToLegacyEase(previewD),
      nextReviewDate: null,
      first_mastered_at: undefined,
      rating,
    };
  }

  // Mistake / Surrender during initial learning: keep out of Archive and remember error history
  const nextMastery = Math.max(0, currentMastery - 1);
  return {
    masteryLevel: nextMastery,
    isArchived: false,
    repetitions: 0,
    interval: 0,
    easeFactor: difficultyToLegacyEase(INITIAL_D_HARD),
    nextReviewDate: null,
    first_mastered_at: card?.first_mastered_at,
    rating: 1,
  };
}
