'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { extractGermanLemma, isValidGermanLemma, normalizeGermanLemma } from '@/lib/vocabulary/normalizer';
import { CEFRLevel, resolveCEFRLevel, CEFR_TARGETS } from '@/lib/vocabulary/defaultLexiconMap';

export interface CEFRMatrixStats {
  counts: Record<CEFRLevel, number>;
  totalWords: number;
  activeLevel: CEFRLevel;
}

const STORAGE_KEY_STATS = 'cefr_matrix_stats_v1';
const STORAGE_KEY_LEMMAS = 'cefr_mastered_lemmas_v1';

// In-memory reactive cache
let globalMatrixStats: CEFRMatrixStats = {
  counts: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 },
  totalWords: 0,
  activeLevel: 'B2',
};

const masteredLemmasSet = new Set<string>();
const lemmaLevelMap = new Map<string, CEFRLevel>();
const listeners = new Set<(stats: CEFRMatrixStats) => void>();
let hasInitialized = false;

function notifyListeners() {
  listeners.forEach((listener) => listener({ ...globalMatrixStats }));
}

function calculateActiveLevel(counts: Record<CEFRLevel, number>): CEFRLevel {
  const levels: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];
  for (const lvl of levels) {
    if ((counts[lvl] || 0) < CEFR_TARGETS[lvl].target) {
      return lvl;
    }
  }
  return 'C1';
}

function updateLocalState(lemma: string, level: CEFRLevel) {
  if (masteredLemmasSet.has(lemma)) return false;
  masteredLemmasSet.add(lemma);
  lemmaLevelMap.set(lemma, level);

  const updatedCounts = {
    ...globalMatrixStats.counts,
    [level]: (globalMatrixStats.counts[level] || 0) + 1,
  };

  const total = Object.values(updatedCounts).reduce((acc, curr) => acc + curr, 0);
  const activeLevel = calculateActiveLevel(updatedCounts);

  globalMatrixStats = {
    counts: updatedCounts,
    totalWords: total,
    activeLevel,
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(globalMatrixStats));
      // Store compact array of lemmas
      localStorage.setItem(STORAGE_KEY_LEMMAS, JSON.stringify(Array.from(masteredLemmasSet)));
    } catch (e) {
      console.warn('Wortschatz-Matrix storage quota warning:', e);
    }
  }

  notifyListeners();
  return true;
}

/**
 * Records a single mastered word into the deduplicated matrix.
 * Guaranteed to count each unique German lemma only once.
 * Supports both recordMasteredLemma({ rawWord, bookId, bookLevel }) and recordMasteredLemma(rawWord, level, bookId).
 */
export async function recordMasteredLemma(
  paramsOrWord: { rawWord: string; bookId?: string; bookLevel?: string | null } | string,
  levelOrNull?: string | null,
  bookIdOrNull?: string
) {
  const rawWord = typeof paramsOrWord === 'string' ? paramsOrWord : paramsOrWord.rawWord;
  const bookLevel = typeof paramsOrWord === 'string' ? levelOrNull : paramsOrWord.bookLevel;
  const bookId = typeof paramsOrWord === 'string' ? bookIdOrNull : paramsOrWord.bookId;

  const lemma = extractGermanLemma(rawWord);
  if (!isValidGermanLemma(lemma)) return;

  const level = resolveCEFRLevel(lemma, bookLevel);
  const isNew = updateLocalState(lemma, level);
  if (!isNew) return; // Deduplication: word was already counted

  // Asynchronously sync to Supabase user_mastered_words
  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return;

    await supabase
      .from('user_mastered_words')
      .upsert(
        {
          user_id: userId,
          lemma,
          cefr_level: level,
          source_book_id: bookId || null,
          first_mastered_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,lemma' }
      );
  } catch (err) {
    // Non-blocking: local matrix is already updated
    console.warn('[Wortschatz-Matrix] Remote upsert notice:', err);
  }
}

/**
 * Immediately demotes and removes a word upon mistake during review.
 * Decrements matrix counts and deletes entry from Supabase user_mastered_words.
 */
export async function removeMasteredLemma(
  paramsOrWord: { rawWord: string } | string
) {
  const rawWord = typeof paramsOrWord === 'string' ? paramsOrWord : paramsOrWord.rawWord;
  const lemma = extractGermanLemma(rawWord);
  if (!isValidGermanLemma(lemma)) return;

  if (!masteredLemmasSet.has(lemma)) return;

  masteredLemmasSet.delete(lemma);
  const level = lemmaLevelMap.get(lemma) || resolveCEFRLevel(lemma);
  lemmaLevelMap.delete(lemma);

  const updatedCounts = {
    ...globalMatrixStats.counts,
    [level]: Math.max(0, (globalMatrixStats.counts[level] || 0) - 1),
  };

  const total = Math.max(0, Object.values(updatedCounts).reduce((acc, curr) => acc + curr, 0));
  const activeLevel = calculateActiveLevel(updatedCounts);

  globalMatrixStats = {
    counts: updatedCounts,
    totalWords: total,
    activeLevel,
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(globalMatrixStats));
      localStorage.setItem(STORAGE_KEY_LEMMAS, JSON.stringify(Array.from(masteredLemmasSet)));
    } catch (e) {
      console.warn('Wortschatz-Matrix storage quota warning:', e);
    }
  }

  notifyListeners();

  // Asynchronously remove from Supabase user_mastered_words
  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return;

    await supabase
      .from('user_mastered_words')
      .delete()
      .match({ user_id: userId, lemma });
  } catch (err) {
    console.warn('[Wortschatz-Matrix] Remote delete notice:', err);
  }
}

export function getMasteredLemmasSet(): Set<string> {
  return new Set(masteredLemmasSet);
}

/**
 * Reconciles mastered words when decks, books, or cards are deleted.
 * Scans active decks for mastered cards (masteryLevel >= 4 or isArchived).
 * Deletes orphan lemmas from Supabase user_mastered_words and updates local cache.
 */
export async function reconcileMasteredWords(
  providedDecks?: Array<{ id: string; bookId?: string; cards?: Array<any> }>
) {
  let currentDecks = providedDecks;
  if (!currentDecks) {
    try {
      const { useStore } = await import('@/app/page');
      currentDecks = useStore.getState().decks;
    } catch {}
  }
  if (!Array.isArray(currentDecks)) return;

  const validMasteredLemmas = new Set<string>();

  currentDecks.forEach((deck) => {
    deck.cards?.forEach((card: any) => {
      if ((card.masteryLevel !== undefined && card.masteryLevel >= 4) || card.isArchived) {
        const raw = card.targetWord || card.missingWord || card.infinitive || card.front || '';
        const lemma = normalizeGermanLemma(raw);
        if (lemma && isValidGermanLemma(lemma)) {
          validMasteredLemmas.add(lemma);
        }
      }
    });
  });

  const orphanLemmas = Array.from(masteredLemmasSet).filter((l) => !validMasteredLemmas.has(l));

  if (orphanLemmas.length > 0) {
    // 1. Remove from local in-memory sets and maps
    orphanLemmas.forEach((lemma) => {
      masteredLemmasSet.delete(lemma);
      lemmaLevelMap.delete(lemma);
    });

    // 2. Recalculate counts based on remaining masteredLemmasSet
    const updatedCounts: Record<CEFRLevel, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 };
    masteredLemmasSet.forEach((lemma) => {
      const lvl = lemmaLevelMap.get(lemma) || resolveCEFRLevel(lemma);
      lemmaLevelMap.set(lemma, lvl);
      if (updatedCounts[lvl] !== undefined) {
        updatedCounts[lvl] += 1;
      }
    });

    const total = Object.values(updatedCounts).reduce((acc, curr) => acc + curr, 0);
    const activeLevel = calculateActiveLevel(updatedCounts);

    globalMatrixStats = {
      counts: updatedCounts,
      totalWords: total,
      activeLevel,
    };

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(globalMatrixStats));
        localStorage.setItem(STORAGE_KEY_LEMMAS, JSON.stringify(Array.from(masteredLemmasSet)));
      } catch (e) {
        console.warn('Wortschatz-Matrix storage quota warning:', e);
      }
    }

    notifyListeners();

    // 3. Delete orphan lemmas from Supabase user_mastered_words
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (userId && orphanLemmas.length > 0) {
        const chunkSize = 100;
        for (let i = 0; i < orphanLemmas.length; i += chunkSize) {
          const chunk = orphanLemmas.slice(i, i + chunkSize);
          await supabase
            .from('user_mastered_words')
            .delete()
            .match({ user_id: userId })
            .in('lemma', chunk);
        }
      }
    } catch (err) {
      console.warn('[Wortschatz-Matrix] Remote delete orphans notice:', err);
    }
  }
}

/**
 * Performs backfill from existing in-memory/cached decks.
 * Scans all cards with masteryLevel >= 4 or isArchived === true,
 * deduplicates them, and writes to database & local storage.
 * GUARANTEED: Runs strictly ONCE across user sessions.
 */
export async function backfillMasteredWordsFromDecks(
  decks: Array<{ id: string; bookId?: string; cards?: Array<any> }>,
  books?: Array<{ id: string; activeLevels?: string[]; title?: string }>
) {
  if (!Array.isArray(decks) || decks.length === 0) return;

  // STRICT GUARD: Skip if already backfilled previously
  if (typeof window !== 'undefined' && localStorage.getItem('cefr_backfill_completed') === 'true') {
    return;
  }

  const bookLevelMap = new Map<string, string>();
  if (books) {
    books.forEach((b) => {
      const level = b.activeLevels?.[0] || b.title || 'B2';
      bookLevelMap.set(b.id, level);
    });
  }

  const newLemmasToUpsert: Array<{
    lemma: string;
    level: CEFRLevel;
    bookId?: string;
  }> = [];

  for (const deck of decks) {
    if (!deck.cards) continue;
    const bookLevel = deck.bookId ? bookLevelMap.get(deck.bookId) : 'B2';

    for (const card of deck.cards) {
      const isMastered = card.isArchived === true || (card.masteryLevel && card.masteryLevel >= 4);
      if (!isMastered) continue;

      const rawWord = card.targetWord || card.missingWord || card.infinitive || card.front || '';
      const lemma = extractGermanLemma(rawWord);
      if (!isValidGermanLemma(lemma)) continue;

      if (!masteredLemmasSet.has(lemma)) {
        const level = resolveCEFRLevel(lemma, bookLevel);
        updateLocalState(lemma, level);
        newLemmasToUpsert.push({ lemma, level, bookId: deck.bookId });
      }
    }
  }

  // Mark backfill as completed immediately to prevent duplicate runs
  if (typeof window !== 'undefined') {
    localStorage.setItem('cefr_backfill_completed', 'true');
  }

  // Batch sync newly discovered historical words to Supabase
  if (newLemmasToUpsert.length > 0) {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (userId) {
        const chunkSize = 100;
        for (let i = 0; i < newLemmasToUpsert.length; i += chunkSize) {
          const chunk = newLemmasToUpsert.slice(i, i + chunkSize).map((item) => ({
            user_id: userId,
            lemma: item.lemma,
            cefr_level: item.level,
            source_book_id: item.bookId || null,
          }));

          await supabase
            .from('user_mastered_words')
            .upsert(chunk, { onConflict: 'user_id,lemma' });
        }
      }
    } catch (e) {
      console.warn('[Wortschatz-Matrix] Remote backfill notice:', e);
    }
  }
}

/**
 * Initializes the Wortschatz-Matrix state from local storage and Supabase view
 * with strict caching and egress prevention.
 */
function initMatrixStore() {
  if (hasInitialized || typeof window === 'undefined') return;
  hasInitialized = true;

  try {
    const cachedStats = localStorage.getItem(STORAGE_KEY_STATS);
    if (cachedStats) {
      const parsed = JSON.parse(cachedStats);
      if (parsed && parsed.counts) {
        globalMatrixStats = parsed;
      }
    }

    const cachedLemmas = localStorage.getItem(STORAGE_KEY_LEMMAS);
    if (cachedLemmas) {
      const parsedLemmas: string[] = JSON.parse(cachedLemmas);
      if (Array.isArray(parsedLemmas)) {
        parsedLemmas.forEach((l) => masteredLemmasSet.add(l));
      }
    }
  } catch (e) {}

  // Check TTL: avoid hammering Supabase on every reload if local cache is fresh
  const MATRIX_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
  const lastSync = typeof window !== 'undefined' ? localStorage.getItem('cefr_last_matrix_sync') : null;
  if (lastSync && Date.now() - Number(lastSync) < MATRIX_CACHE_TTL && globalMatrixStats.totalWords > 0) {
    return;
  }

  // Async remote reconciliation from Supabase view_user_cefr_stats
  (async () => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) return;

      // 1. Check aggregate stats view
      const { data: viewStats, error: viewError } = await supabase
        .from('view_user_cefr_stats')
        .select('cefr_level, mastered_count')
        .eq('user_id', userId);

      if (!viewError && Array.isArray(viewStats) && viewStats.length > 0) {
        const remoteCounts: Record<CEFRLevel, number> = {
          A1: 0,
          A2: 0,
          B1: 0,
          B2: 0,
          C1: 0,
        };

        viewStats.forEach((row: any) => {
          const lvl = row.cefr_level as CEFRLevel;
          if (remoteCounts[lvl] !== undefined) {
            remoteCounts[lvl] = row.mastered_count || row.count || 0;
          }
        });

        const total = Object.values(remoteCounts).reduce((acc, curr) => acc + curr, 0);
        if (total >= globalMatrixStats.totalWords) {
          globalMatrixStats = {
            counts: remoteCounts,
            totalWords: total,
            activeLevel: calculateActiveLevel(remoteCounts),
          };
          localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(globalMatrixStats));
          notifyListeners();
        }
      }

      // 2. Fetch existing mastered lemmas only if local lemma cache is empty
      if (masteredLemmasSet.size === 0) {
        const { data: lemmaRows } = await supabase
          .from('user_mastered_words')
          .select('lemma, cefr_level')
          .eq('user_id', userId);

        if (Array.isArray(lemmaRows)) {
          lemmaRows.forEach((r: any) => {
            if (r.lemma) masteredLemmasSet.add(r.lemma);
          });
          localStorage.setItem(STORAGE_KEY_LEMMAS, JSON.stringify(Array.from(masteredLemmasSet)));
        }
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('cefr_last_matrix_sync', String(Date.now()));
      }
    } catch (e) {
      // Offline fallback: keep local data
    }
  })();
}

/**
 * React hook for consuming the Wortschatz-Matrix in UI components
 */
export function useWortschatzMatrix() {
  const [stats, setStats] = useState<CEFRMatrixStats>(() => {
    initMatrixStore();
    return { ...globalMatrixStats };
  });

  useEffect(() => {
    initMatrixStore();
    setStats({ ...globalMatrixStats });

    const handleUpdate = (updated: CEFRMatrixStats) => {
      setStats(updated);
    };

    listeners.add(handleUpdate);
    return () => {
      listeners.delete(handleUpdate);
    };
  }, []);

  const refreshMatrix = useCallback(async () => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) return;

      const { data: viewStats } = await supabase
        .from('view_user_cefr_stats')
        .select('*')
        .eq('user_id', userId);

      if (Array.isArray(viewStats)) {
        const counts: Record<CEFRLevel, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 };
        viewStats.forEach((row: any) => {
          const lvl = row.cefr_level as CEFRLevel;
          if (counts[lvl] !== undefined) counts[lvl] = row.count || 0;
        });

        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        globalMatrixStats = {
          counts,
          totalWords: total,
          activeLevel: calculateActiveLevel(counts),
        };
        localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(globalMatrixStats));
        notifyListeners();
      }
    } catch {}
  }, []);

  return {
    counts: stats.counts,
    totalWords: stats.totalWords,
    activeLevel: stats.activeLevel,
    masteredLemmas: masteredLemmasSet,
    refreshMatrix,
  };
}
