'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { extractLemma, isValidLemma } from '@/lib/vocabulary/normalizer';
import {
  AppLang,
  CEFRLevel,
  resolveCEFRLevel,
  normalizeLanguageCode,
  LANGUAGE_CEFR_CONFIG,
  GLOBAL_LEXICON_CACHE,
} from '@/lib/vocabulary/defaultLexiconMap';

export interface CEFRMatrixStats {
  counts: Record<CEFRLevel, number>;
  totalWords: number;
  activeLevel: CEFRLevel;
}

const SUPPORTED_LANGS: AppLang[] = ['de', 'en', 'ru'];

// In-memory reactive state isolated by language
const globalMatrixStatsByLang: Record<AppLang, CEFRMatrixStats> = {
  de: { counts: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 }, totalWords: 0, activeLevel: 'A1' },
  en: { counts: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 }, totalWords: 0, activeLevel: 'A1' },
  ru: { counts: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 }, totalWords: 0, activeLevel: 'A1' },
};

const masteredLemmasSetByLang: Record<AppLang, Set<string>> = {
  de: new Set<string>(),
  en: new Set<string>(),
  ru: new Set<string>(),
};

const lemmaLevelMapByLang: Record<AppLang, Map<string, CEFRLevel>> = {
  de: new Map<string, CEFRLevel>(),
  en: new Map<string, CEFRLevel>(),
  ru: new Map<string, CEFRLevel>(),
};

const listeners = new Set<(lang: AppLang, stats: CEFRMatrixStats) => void>();

function getStorageKeys(lang: AppLang) {
  return {
    statsKey: `cefr_matrix_stats_${lang}_v3`,
    lemmasKey: `cefr_mastered_lemmas_${lang}_v3`,
    cacheKeyV3: `cefr_mastered_cache_v3`,
  };
}

function notifyListeners(lang: AppLang) {
  const currentStats = { ...globalMatrixStatsByLang[lang] };
  listeners.forEach((listener) => listener(lang, currentStats));
}

function calculateActiveLevel(counts: Record<CEFRLevel, number>, lang: AppLang): CEFRLevel {
  const config = LANGUAGE_CEFR_CONFIG[lang] || LANGUAGE_CEFR_CONFIG.de;
  for (const lvl of config.levels) {
    if ((counts[lvl.key] || 0) < lvl.target) {
      return lvl.key;
    }
  }
  return 'C1';
}

function updateLocalState(lemma: string, level: CEFRLevel, lang: AppLang): boolean {
  const masteredSet = masteredLemmasSetByLang[lang];
  if (masteredSet.has(lemma)) return false;

  masteredSet.add(lemma);
  lemmaLevelMapByLang[lang].set(lemma, level);

  const prevCounts = globalMatrixStatsByLang[lang].counts;
  const updatedCounts = {
    ...prevCounts,
    [level]: (prevCounts[level] || 0) + 1,
  };

  const total = Object.values(updatedCounts).reduce((acc, curr) => acc + curr, 0);
  const activeLevel = calculateActiveLevel(updatedCounts, lang);

  globalMatrixStatsByLang[lang] = {
    counts: updatedCounts,
    totalWords: total,
    activeLevel,
  };

  if (typeof window !== 'undefined') {
    try {
      const { statsKey, lemmasKey, cacheKeyV3 } = getStorageKeys(lang);
      const cachePayload = {
        counts: updatedCounts,
        totalWords: total,
        activeLevel,
        lemmas: Array.from(masteredSet),
        updatedAt: Date.now(),
      };
      localStorage.setItem(statsKey, JSON.stringify(globalMatrixStatsByLang[lang]));
      localStorage.setItem(lemmasKey, JSON.stringify(Array.from(masteredSet)));
      localStorage.setItem(cacheKeyV3, JSON.stringify(cachePayload));
      localStorage.setItem(`cefr_mastered_cache_v3_${lang}`, JSON.stringify(cachePayload));
    } catch (e) {
      console.warn('Wortschatz-Matrix storage quota warning:', e);
    }
  }

  notifyListeners(lang);
  return true;
}

/**
 * Cloud-First Single Source of Truth (SSOT) synchronization.
 * Pulls all mastered words directly from Supabase user_mastered_words with ZERO TTL.
 * Completely overwrites local mastered set with cloud data.
 */
export async function syncMasteredWordsFromCloud(lang: AppLang = 'de'): Promise<void> {
  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return;

    // Direct lightweight cloud fetch - Single Source of Truth
    const { data: remoteRows, error } = await supabase
      .from('user_mastered_words')
      .select('lemma, cefr_level')
      .eq('user_id', userId);

    if (error) {
      console.warn('[Wortschatz-Matrix] Cloud sync query warning:', error.message);
      return;
    }

    if (Array.isArray(remoteRows)) {
      const masteredSet = masteredLemmasSetByLang[lang];
      const levelMap = lemmaLevelMapByLang[lang];

      // 1. COMPLETELY OVERWRITE local state from cloud SSOT (NO merging with stale local duplicates)
      masteredSet.clear();
      levelMap.clear();

      const updatedCounts: Record<CEFRLevel, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 };

      for (const r of remoteRows) {
        const clean = extractLemma(r.lemma, lang);
        if (!clean || !isValidLemma(clean, lang)) continue;

        masteredSet.add(clean);

        // Priority: Global Lexicon first, then stored level, then fallback resolver
        const officialLevel = GLOBAL_LEXICON_CACHE[lang]?.[clean];
        const resolvedLevel: CEFRLevel =
          officialLevel || (r.cefr_level as CEFRLevel) || resolveCEFRLevel(clean, null, lang);

        levelMap.set(clean, resolvedLevel);
        if (updatedCounts[resolvedLevel] !== undefined) {
          updatedCounts[resolvedLevel] += 1;
        }
      }

      // 2. Recalculate level counts and active level
      const total = Object.values(updatedCounts).reduce((a, b) => a + b, 0);
      const activeLevel = calculateActiveLevel(updatedCounts, lang);

      globalMatrixStatsByLang[lang] = {
        counts: updatedCounts,
        totalWords: total,
        activeLevel,
      };

      // 3. Save fresh result to localStorage with version key cefr_mastered_cache_v3
      if (typeof window !== 'undefined') {
        try {
          const { statsKey, lemmasKey, cacheKeyV3 } = getStorageKeys(lang);
          const cachePayload = {
            counts: updatedCounts,
            totalWords: total,
            activeLevel,
            lemmas: Array.from(masteredSet),
            updatedAt: Date.now(),
          };
          localStorage.setItem(statsKey, JSON.stringify(globalMatrixStatsByLang[lang]));
          localStorage.setItem(lemmasKey, JSON.stringify(Array.from(masteredSet)));
          localStorage.setItem(cacheKeyV3, JSON.stringify(cachePayload));
          localStorage.setItem(`cefr_mastered_cache_v3_${lang}`, JSON.stringify(cachePayload));

          // Invalidate and delete stale legacy v2/v1 keys and old TTL timers
          localStorage.removeItem(`cefr_matrix_stats_${lang}_v2`);
          localStorage.removeItem(`cefr_mastered_lemmas_${lang}_v2`);
          localStorage.removeItem(`cefr_matrix_stats_${lang}`);
          localStorage.removeItem(`cefr_mastered_lemmas_${lang}`);
          localStorage.removeItem(`cefr_last_matrix_sync_${lang}`);
          localStorage.removeItem('cefr_matrix_stats_v1');
          localStorage.removeItem('cefr_mastered_lemmas_v1');
        } catch (e) {
          console.warn('Wortschatz-Matrix storage quota warning:', e);
        }
      }

      notifyListeners(lang);
    }
  } catch (err) {
    console.warn('[Wortschatz-Matrix] syncMasteredWordsFromCloud notice:', err);
  }
}

/**
 * Initializes matrix store from localStorage v3 cache & immediately triggers cloud fetch.
 */
function initMatrixStore(lang: AppLang) {
  if (typeof window === 'undefined') return;

  const { statsKey, lemmasKey, cacheKeyV3 } = getStorageKeys(lang);

  // 1. Instant load from localStorage v3 cache to avoid layout shift while network request is in flight
  try {
    const cachedV3 = localStorage.getItem(cacheKeyV3) || localStorage.getItem(statsKey);
    if (cachedV3) {
      const parsed = JSON.parse(cachedV3);
      if (parsed?.counts) {
        globalMatrixStatsByLang[lang] = {
          counts: parsed.counts,
          totalWords: parsed.totalWords || Object.values(parsed.counts).reduce((a: any, b: any) => a + b, 0),
          activeLevel: parsed.activeLevel || calculateActiveLevel(parsed.counts, lang),
        };
      }
    }

    const cachedLemmas = localStorage.getItem(lemmasKey);
    if (cachedLemmas) {
      const parsed: string[] = JSON.parse(cachedLemmas);
      if (Array.isArray(parsed)) {
        masteredLemmasSetByLang[lang].clear();
        parsed.forEach((l) => masteredLemmasSetByLang[lang].add(l));
      }
    }
  } catch (e) {}

  // 2. Fetch Single Source of Truth from Cloud - ALWAYS, with ZERO TTL!
  syncMasteredWordsFromCloud(lang).catch(() => {});
}

/**
 * Records a single mastered word into the deduplicated matrix.
 * Priority: checks official global_lexicon for the active language first!
 */
export async function recordMasteredLemma(
  paramsOrWord: { rawWord: string; bookId?: string; bookLevel?: string | null; language?: string } | string,
  levelOrNull?: string | null,
  bookIdOrNull?: string,
  langOrNull?: string
) {
  const rawWord = typeof paramsOrWord === 'string' ? paramsOrWord : paramsOrWord.rawWord;
  const bookLevel = typeof paramsOrWord === 'string' ? levelOrNull : paramsOrWord.bookLevel;
  const bookId = typeof paramsOrWord === 'string' ? bookIdOrNull : paramsOrWord.bookId;
  const rawLang = typeof paramsOrWord === 'string' ? langOrNull : paramsOrWord.language;

  // Resolve target language
  let currentLanguage: AppLang = 'de';
  if (rawLang) {
    currentLanguage = normalizeLanguageCode(rawLang);
  } else {
    try {
      const { useStore } = await import('@/app/page');
      currentLanguage = normalizeLanguageCode(useStore.getState().appLanguage);
    } catch {}
  }

  const cleanLemma = extractLemma(rawWord, currentLanguage);
  if (!isValidLemma(cleanLemma, currentLanguage)) return;

  // 1. Сначала ищем в памяти / кэше global_lexicon для активного языка:
  const officialLevel = GLOBAL_LEXICON_CACHE[currentLanguage]?.[cleanLemma];

  // 2. Истинный уровень: если есть в мировой базе — берем его, иначе fallback на уровень книги
  const resolvedLevel: CEFRLevel = officialLevel || resolveCEFRLevel(cleanLemma, bookLevel, currentLanguage);

  // 3. Обновляем локальное состояние
  const isNew = updateLocalState(cleanLemma, resolvedLevel, currentLanguage);
  if (!isNew) return; // Слово уже выучено

  // 4. Записываем в Supabase:
  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return;

    await supabase
      .from('user_mastered_words')
      .upsert(
        {
          user_id: userId,
          lemma: cleanLemma,
          cefr_level: resolvedLevel,
          source_book_id: bookId || null,
          first_mastered_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,lemma', ignoreDuplicates: true }
      );
  } catch (err) {
    console.warn('[Wortschatz-Matrix] Remote upsert notice:', err);
  }
}

/**
 * Immediately demotes and removes a word upon mistake during review.
 */
export async function removeMasteredLemma(
  paramsOrWord: { rawWord: string; language?: string } | string,
  langOrNull?: string
) {
  const rawWord = typeof paramsOrWord === 'string' ? paramsOrWord : paramsOrWord.rawWord;
  const rawLang = typeof paramsOrWord === 'string' ? langOrNull : paramsOrWord.language;

  let currentLanguage: AppLang = 'de';
  if (rawLang) {
    currentLanguage = normalizeLanguageCode(rawLang);
  } else {
    try {
      const { useStore } = await import('@/app/page');
      currentLanguage = normalizeLanguageCode(useStore.getState().appLanguage);
    } catch {}
  }

  const cleanLemma = extractLemma(rawWord, currentLanguage);
  if (!isValidLemma(cleanLemma, currentLanguage)) return;

  const masteredSet = masteredLemmasSetByLang[currentLanguage];
  if (!masteredSet.has(cleanLemma)) return;

  masteredSet.delete(cleanLemma);
  const level =
    lemmaLevelMapByLang[currentLanguage].get(cleanLemma) || resolveCEFRLevel(cleanLemma, null, currentLanguage);
  lemmaLevelMapByLang[currentLanguage].delete(cleanLemma);

  const prevCounts = globalMatrixStatsByLang[currentLanguage].counts;
  const updatedCounts = {
    ...prevCounts,
    [level]: Math.max(0, (prevCounts[level] || 0) - 1),
  };

  const total = Math.max(0, Object.values(updatedCounts).reduce((acc, curr) => acc + curr, 0));
  const activeLevel = calculateActiveLevel(updatedCounts, currentLanguage);

  globalMatrixStatsByLang[currentLanguage] = {
    counts: updatedCounts,
    totalWords: total,
    activeLevel,
  };

  if (typeof window !== 'undefined') {
    try {
      const { statsKey, lemmasKey, cacheKeyV3 } = getStorageKeys(currentLanguage);
      const cachePayload = {
        counts: updatedCounts,
        totalWords: total,
        activeLevel,
        lemmas: Array.from(masteredSet),
        updatedAt: Date.now(),
      };
      localStorage.setItem(statsKey, JSON.stringify(globalMatrixStatsByLang[currentLanguage]));
      localStorage.setItem(lemmasKey, JSON.stringify(Array.from(masteredSet)));
      localStorage.setItem(cacheKeyV3, JSON.stringify(cachePayload));
      localStorage.setItem(`cefr_mastered_cache_v3_${currentLanguage}`, JSON.stringify(cachePayload));
    } catch (e) {
      console.warn('Wortschatz-Matrix storage quota warning:', e);
    }
  }

  notifyListeners(currentLanguage);

  // Asynchronously remove from Supabase user_mastered_words
  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return;

    await supabase
      .from('user_mastered_words')
      .delete()
      .match({ user_id: userId, lemma: cleanLemma });
  } catch (err) {
    console.warn('[Wortschatz-Matrix] Remote delete notice:', err);
  }
}

export function getMasteredLemmasSet(langParam?: string | AppLang): Set<string> {
  const normLang = normalizeLanguageCode(langParam);
  initMatrixStore(normLang);
  return new Set(masteredLemmasSetByLang[normLang]);
}

/**
 * Reconciles mastered words when decks, books, or cards are deleted.
 * When isExplicitDeletion is false, it NEVER allows local indexes to overwrite user_mastered_words!
 * Supabase is the sole authority.
 */
export async function reconcileMasteredWords(
  providedDecks?: Array<{ id: string; bookId?: string; language?: string; cards?: Array<any> }>,
  targetLangParam?: string | AppLang,
  isExplicitDeletion: boolean = false
) {
  let targetLang: AppLang = 'de';
  let currentDecks = providedDecks;

  try {
    const { useStore } = await import('@/app/page');
    if (!currentDecks) {
      currentDecks = useStore.getState().decks;
    }
    targetLang = normalizeLanguageCode(targetLangParam || useStore.getState().appLanguage);
  } catch {
    targetLang = normalizeLanguageCode(targetLangParam);
  }

  // PROTECT AGAINST LOCAL INDEX OVERWRITE:
  // If this is NOT an explicit deletion, do not pollute or overwrite with local IndexedDB cards!
  // Supabase user_mastered_words is the sole authority for the matrix.
  if (!isExplicitDeletion) {
    syncMasteredWordsFromCloud(targetLang).catch(() => {});
    return;
  }

  if (!Array.isArray(currentDecks)) return;
  initMatrixStore(targetLang);

  const masteredSet = masteredLemmasSetByLang[targetLang];
  const { statsKey, lemmasKey, cacheKeyV3 } = getStorageKeys(targetLang);

  // Filter decks matching targetLang
  const langDecks = currentDecks.filter((deck) => {
    const dLang = normalizeLanguageCode(deck.language || 'de');
    return dLang === targetLang;
  });

  const activeMasteredSet = new Set<string>();
  const activeLemmaLevelMap = new Map<string, CEFRLevel>();

  langDecks.forEach((deck) => {
    const bookLevel = (deck as any).level || 'B2';
    deck.cards?.forEach((card: any) => {
      if ((card.masteryLevel !== undefined && card.masteryLevel >= 4) || card.isArchived) {
        const raw = card.targetWord || card.missingWord || card.infinitive || card.front || '';
        const clean = extractLemma(raw, targetLang);
        if (clean && clean.length >= 2 && isValidLemma(clean, targetLang)) {
          activeMasteredSet.add(clean);
          if (!activeLemmaLevelMap.has(clean)) {
            const official = GLOBAL_LEXICON_CACHE[targetLang]?.[clean];
            activeLemmaLevelMap.set(clean, official || resolveCEFRLevel(clean, bookLevel, targetLang));
          }
        }
      }
    });
  });

  // EXPLICIT DELETION: The user intentionally deleted a deck, book, or card
  const orphanLemmas = Array.from(masteredSet).filter((l) => !activeMasteredSet.has(l));
  if (orphanLemmas.length === 0) return;

  masteredSet.clear();
  lemmaLevelMapByLang[targetLang].clear();

  activeMasteredSet.forEach((l) => {
    masteredSet.add(l);
    const lvl = activeLemmaLevelMap.get(l) || resolveCEFRLevel(l, null, targetLang);
    lemmaLevelMapByLang[targetLang].set(l, lvl);
  });

  const updatedCounts: Record<CEFRLevel, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 };
  activeMasteredSet.forEach((lemma) => {
    const lvl = lemmaLevelMapByLang[targetLang].get(lemma) || resolveCEFRLevel(lemma, null, targetLang);
    if (updatedCounts[lvl] !== undefined) {
      updatedCounts[lvl] += 1;
    }
  });

  const total = Object.values(updatedCounts).reduce((acc, curr) => acc + curr, 0);
  const activeLevel = calculateActiveLevel(updatedCounts, targetLang);

  globalMatrixStatsByLang[targetLang] = {
    counts: updatedCounts,
    totalWords: total,
    activeLevel,
  };

  if (typeof window !== 'undefined') {
    try {
      const cachePayload = {
        counts: updatedCounts,
        totalWords: total,
        activeLevel,
        lemmas: Array.from(activeMasteredSet),
        updatedAt: Date.now(),
      };
      localStorage.setItem(statsKey, JSON.stringify(globalMatrixStatsByLang[targetLang]));
      localStorage.setItem(lemmasKey, JSON.stringify(Array.from(activeMasteredSet)));
      localStorage.setItem(cacheKeyV3, JSON.stringify(cachePayload));
      localStorage.setItem(`cefr_mastered_cache_v3_${targetLang}`, JSON.stringify(cachePayload));
    } catch (e) {
      console.warn('Wortschatz-Matrix storage quota warning:', e);
    }
  }

  notifyListeners(targetLang);

  // Delete orphan lemmas from Supabase
  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (userId) {
      const chunkSize = 100;
      for (let i = 0; i < orphanLemmas.length; i += chunkSize) {
        const chunk = orphanLemmas.slice(i, i + chunkSize);
        await supabase
          .from('user_mastered_words')
          .delete()
          .eq('user_id', userId)
          .in('lemma', chunk);
      }
    }
  } catch (err) {
    console.warn('[Wortschatz-Matrix] Remote delete orphans notice:', err);
  }
}

/**
 * React hook for consuming the Wortschatz-Matrix in UI components for the active language.
 */
export function useWortschatzMatrix(langParam?: string | AppLang) {
  const normLang = normalizeLanguageCode(langParam);

  const [stats, setStats] = useState<CEFRMatrixStats>(() => {
    initMatrixStore(normLang);
    return { ...globalMatrixStatsByLang[normLang] };
  });

  useEffect(() => {
    initMatrixStore(normLang);
    syncMasteredWordsFromCloud(normLang);
    setStats({ ...globalMatrixStatsByLang[normLang] });

    const handleUpdate = (changedLang: AppLang, updated: CEFRMatrixStats) => {
      if (changedLang === normLang) {
        setStats({ ...updated });
      }
    };

    listeners.add(handleUpdate);

    // Cross-browser & Cross-tab sync: trigger cloud pull when user switches to tab
    const handleFocus = () => {
      syncMasteredWordsFromCloud(normLang);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncMasteredWordsFromCloud(normLang);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    // Realtime channel for instant cross-device updates
    const channel = supabase
      .channel(`realtime:user_mastered_words:${normLang}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_mastered_words' }, () => {
        syncMasteredWordsFromCloud(normLang);
      })
      .subscribe();

    return () => {
      listeners.delete(handleUpdate);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      supabase.removeChannel(channel);
    };
  }, [normLang]);

  const langConfig = LANGUAGE_CEFR_CONFIG[normLang] || LANGUAGE_CEFR_CONFIG.de;

  const refreshMatrix = useCallback(async () => {
    await syncMasteredWordsFromCloud(normLang);
  }, [normLang]);

  return {
    counts: stats.counts,
    totalWords: stats.totalWords,
    activeLevel: stats.activeLevel,
    currentLanguage: normLang,
    wordLabel: langConfig.wordLabel,
    totalGoal: langConfig.totalGoal,
    levels: langConfig.levels,
    masteredLemmas: masteredLemmasSetByLang[normLang],
    refreshMatrix,
  };
}
