'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase, safeUpsertUserStats, safeFetchUserStats } from '@/lib/supabase';
import { normalizeLemmaKey } from '@/lib/utils/lemmaNormalizer';
import { CEFRLevel, detectWordLevel } from '@/lib/vocabulary/cefrLevelDetector';
import { getIDBItem, setIDBItem } from '@/hooks/useDayStats';

export type AppLang = 'de' | 'en' | 'ru' | 'es';
export type { CEFRLevel };

export const C1_TARGET_WORDS: Record<string, number> = {
  de: 10000,
  en: 8000,
  ru: 8000,
  es: 8000,
};

export const WORD_LABELS_BY_LANG: Record<string, string> = {
  de: 'Wörter',
  en: 'Words',
  ru: 'Слов',
  es: 'Palabras',
};

export const CEFR_LEVEL_KEYS: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];

export interface MasteredWordEntry {
  originalWord: string;
  level: CEFRLevel;
  masteredAt: number;
  first_mastered_at?: string;
  created_at?: string;
  bookId?: string;
  translation?: string;
  cardId?: string;
  nextReviewDate?: string | number | null;
  sentence?: string;
  sentenceTranslation?: string;
}

export interface CEFRMatrixStats {
  counts: Record<CEFRLevel, number>;
  totalWords: number;
  activeLevel: CEFRLevel;
}

export interface TodayProgress {
  wordsLearnedToday: number;
  percentLearnedToday: string;
  todayCounts: Record<CEFRLevel, number>;
}

const SUPPORTED_LANGS: AppLang[] = ['de', 'en', 'ru', 'es'];

/**
 * Черный список грамматических частиц, предлогов, связок и местоимений.
 * Изолированные грамматические элементы не должны попадать в Wortschatz-Matrix.
 */
export const FUNCTIONAL_PARTICLES = new Set([
  'an', 'in', 'auf', 'aus', 'bei', 'mit', 'nach', 'von', 'zu', 'über', 'unter', 'vor', 'hinter',
  'werde', 'wirst', 'wird', 'wurden', 'worden', 'würde', 'würden',
  'mich', 'dich', 'sich', 'uns', 'euch', 'mir', 'dir', 'ihm', 'ihr', 'ihnen',
  'der', 'die', 'das', 'dem', 'den', 'des', 'ein', 'eine', 'einer', 'einem', 'einen', 'eines',
  'und', 'aber', 'oder', 'denn', 'weil', 'dass', 'ob', 'als', 'wie'
]);

/**
 * Черный список грамматических форм и спряжений глаголов,
 * которые не должны попадать в список выученных слов и матрицу.
 */
export const EXCLUDED_GRAMMAR_FORMS = new Set([
  'bin', 'bist', 'ist', 'sind', 'seid', 'war', 'waren',
  'habe', 'hast', 'hat', 'haben', 'habt', 'hatte', 'hatten',
  'werde', 'wirst', 'wird', 'werden', 'werdet', 'wurde', 'wurden',
  'wäscht', 'läuft', 'findet', 'liest', 'fährt', 'gilt', 'gibt',
  'mein', 'dein', 'sein', 'ihr', 'unser', 'euer',
  'mich', 'dich', 'sich', 'uns', 'euch', 'ihm', 'ihnen', 'dir', 'mir', 'an'
]);

/**
 * Черный список спряженных форм глаголов, грамматических кусков и не-лемм
 * (из упражнений на контекст, спряжение и грамматические тренажеры).
 */
export const CONJUGATED_VERB_FORMS = new Set([
  // Настоящее время (2-е и 3-е лицо, неправильные/спряженные формы)
  'findet', 'findest', 'liest', 'fährst', 'fährt', 'gilt', 'giltst',
  'sieht', 'siehst', 'hilft', 'hilfst', 'schläft', 'schläfst', 'spricht', 'sprichst',
  'nimmt', 'nimmst', 'gibt', 'gibst', 'trifft', 'triffst', 'trägst', 'trägt',
  'vergisst', 'lädt', 'lädst', 'empfiehlt', 'empfiehlst', 'hält', 'hältst',
  'fällt', 'fällst', 'lässt', 'bricht', 'brichst', 'wirft', 'wirfst',
  'trinkst', 'trinkt', 'arbeitet', 'arbeitest', 'kommt', 'kommst', 'geht', 'gehst',
  'steht', 'stehst', 'bleibt', 'bleibst', 'bringt', 'bringst', 'denkt', 'denkst',
  'kennt', 'kennst', 'weiß', 'weißt', 'wusste', 'wusstest',
  'hast', 'hat', 'bist', 'ist', 'sind', 'seid', 'war', 'warst', 'waren', 'wart',
  'hatte', 'hattest', 'hatten', 'hattet',
  // Модальные глаголы в спряженных формах
  'kann', 'kannst', 'könnt', 'muss', 'musst', 'müsst', 'darf', 'darfst', 'dürft',
  'will', 'willst', 'wollt', 'sollst', 'sollt', 'möchte', 'möchtest', 'möchtet',
  // Прошедшее время и сослагательное наклонение
  'käme', 'müsste', 'gäbe', 'bliebe', 'wüsste', 'fände', 'ginge', 'täte',
  'ging', 'schrieb', 'blieb', 'fand', 'nahm', 'stand', 'schlief', 'trug', 'sprach', 'verlor',
  // Слитные формы предлогов и артиклей
  'unterden', 'unterdem', 'hinterdas', 'hinterdem', 'vordie', 'nebenden', 'nebendem',
  'überden', 'überdem', 'zwischendie', 'indie', 'aufdas', 'aufdie', 'aufder',
  'hinterdie', 'hinterder', 'vorden', 'vordem', 'unterdie', 'unterder', 'nebendas',
  'überdie', 'überder', 'zwischendas'
]);

export function isFunctionalParticle(rawWord?: string | null): boolean {
  if (!rawWord || typeof rawWord !== 'string') return true;
  const trimmed = rawWord.trim();
  if (trimmed.length < 2) return true;

  // Исключаем контекстные задания с пропусками или целые предложения
  if (trimmed.includes('___') || trimmed.includes('...') || /[.?!:;]/.test(trimmed)) return true;
  if (trimmed.split(/\s+/).length > 4) return true;

  const clean = trimmed.toLowerCase().replace(/\|/g, '');
  if (EXCLUDED_GRAMMAR_FORMS.has(clean)) return true;
  if (FUNCTIONAL_PARTICLES.has(clean) || CONJUGATED_VERB_FORMS.has(clean)) return true;

  // Если одиночное изолированное слово из черного списка
  const parts = clean.split(/\s+/);
  if (parts.length === 1 && (EXCLUDED_GRAMMAR_FORMS.has(parts[0]) || FUNCTIONAL_PARTICLES.has(parts[0]))) {
    return true;
  }

  return false;
}

/**
 * Проверяет, относится ли колода, книга или карточка к режиму «Kontext» или грамматике.
 * В Wortschatz-Matrix включаются ТОЛЬКО слова из режима карточек (Karteikarten / лексические колоды).
 * ПОЛНОСТЬЮ ИСКЛЮЧАЮТСЯ:
 * 1. Карточки/упражнения из режима «Kontext» (mode === 'kontext', deck.isContext === true, card.source === 'context')
 * 2. Грамматические модули и тренажёры (Grammatik, Strukturen & NVV, starke Verben, Präpositionen)
 */
export function isContextOrGrammarDeck(deck?: any, parentBook?: any, card?: any): boolean {
  if (!deck && !parentBook && !card) return false;

  // 1. Исключаем карточки и задания из режима «Kontext»
  if (
    card?.isContext === true ||
    (card as any)?.is_context === true ||
    (card as any)?.source === 'context' ||
    (card as any)?.mode === 'kontext' ||
    (card as any)?.mode === 'context' ||
    deck?.isContext === true ||
    (deck as any)?.is_context === true ||
    deck?.mode === 'kontext' ||
    deck?.mode === 'context' ||
    deck?.type === 'context' ||
    parentBook?.mode === 'kontext' ||
    parentBook?.mode === 'context' ||
    parentBook?.training_mode === 'kontext' ||
    parentBook?.training_mode === 'context'
  ) {
    return true;
  }

  // 1.1 Исключаем карточки с пропусками предложений (___ или ...)
  if (card?.sentence && (card.sentence.includes('___') || card.sentence.includes('...'))) {
    return true;
  }

  // 2. Исключаем грамматические модули и тренажеры форм
  if (deck?.isGrammar === true || (deck as any)?.is_grammar === true) return true;
  if (deck?.type === 'grammar' || deck?.type === 'structures') return true;
  if (parentBook?.category === 'structures' || parentBook?.category === 'grammar') return true;

  const bTrainingMode = (parentBook?.training_mode || deck?.training_mode || '').toLowerCase();
  if (
    bTrainingMode === 'starke_verben' ||
    bTrainingMode === 'preposition_drill' ||
    bTrainingMode === 'redemittel'
  ) {
    return true;
  }

  const deckTitle = (deck?.name || deck?.title || '').toLowerCase();
  const bookTitle = (parentBook?.title || '').toLowerCase();
  const combined = `${deckTitle} ${bookTitle}`;

  // Исключаем по названию режим контекста
  if (
    deckTitle.includes('kontext') ||
    bookTitle.includes('kontext') ||
    deckTitle.includes('context') ||
    bookTitle.includes('context')
  ) {
    return true;
  }

  // Исключаем по названию грамматику и структуры
  const isExplicitGrammar =
    combined.includes('grammatik') ||
    combined.includes('grammar') ||
    combined.includes('strukturen & nvv') ||
    combined.includes('strukturen und nvv') ||
    combined.includes('nomen-verb') ||
    combined.includes('nvv') ||
    combined.includes('präposition') ||
    combined.includes('praeposition') ||
    combined.includes('starke verben') ||
    combined.includes('redemittel');

  if (isExplicitGrammar) {
    if (
      deckTitle.includes('wortschatz') ||
      deckTitle.includes('wörter') ||
      deckTitle.includes('woerter') ||
      deckTitle.includes('karteikarten')
    ) {
      const isExplicitGrammarBook =
        bookTitle.includes('grammatik') ||
        bookTitle.includes('starke verben') ||
        bookTitle.includes('präposition') ||
        bookTitle.includes('strukturen');

      if (!isExplicitGrammarBook) {
        return false;
      }
    }
    return true;
  }

  return false;
}

export const isGrammarDeckOrBook = isContextOrGrammarDeck;

/**
 * Извлекает краткий перевод слова, исключая длинные примеры предложений.
 * Проверяет поля карточки: hint, forms, baseWordInfo (где обычно записано "Wort — краткий перевод"),
 * а также сам card.translation, если он лаконичен.
 */
export function extractConciseTranslation(card?: any, fallback?: string): string {
  if (!card && !fallback) return '';

  const cyrRegex = /[\u0400-\u04FF]/;

  // 1. Проверяем hint, forms, baseWordInfo на наличие тире "Слово — краткий перевод"
  const extraSources = [
    card?.hint,
    card?.forms,
    card?.baseWordInfo,
    card?.base_word_info,
  ];

  for (const src of extraSources) {
    if (src && typeof src === 'string' && (src.includes('—') || src.includes('–') || src.includes(' - '))) {
      const parts = src.split(/[—–]|\s-\s/);
      for (let i = parts.length - 1; i >= 1; i--) {
        let candidate = parts[i].trim();
        candidate = candidate.replace(/\[cite:[^\]]*\]/g, '').trim();
        candidate = candidate.replace(/[.;]+$/, '').trim();
        if (candidate && cyrRegex.test(candidate) && candidate.split(/\s+/).length <= 7) {
          return candidate;
        }
      }
    }
  }

  // 2. Проверяем card.translation или fallback
  const rawTrans = (card?.translation || card?.back || fallback || '').trim();
  if (rawTrans) {
    let clean = rawTrans.replace(/\[cite:[^\]]*\]/g, '').trim();

    // Если в самом переводе есть тире: "Wort — перевод"
    if (clean.includes('—') || clean.includes('–')) {
      const parts = clean.split(/[—–]/);
      const afterDash = parts[parts.length - 1].trim().replace(/[.;]+$/, '');
      if (cyrRegex.test(afterDash) && afterDash.split(/\s+/).length <= 7) {
        return afterDash;
      }
    }

    // Если перевод короткий и не является предложением с точкой на конце
    const isSentence =
      clean.endsWith('.') ||
      clean.endsWith('!') ||
      clean.length > 35 ||
      clean.split(/\s+/).length > 6 ||
      /[.?!]/.test(clean);

    if (!isSentence) {
      return clean;
    }

    // Длинные контекстные предложения исключаем из перевода
    return '';
  }

  return '';
}

export function normalizeLanguageCode(lang?: string | null): AppLang {
  const clean = (lang || 'de').toLowerCase().trim();
  if (clean.startsWith('en')) return 'en';
  if (clean.startsWith('ru')) return 'ru';
  if (clean.startsWith('es')) return 'es';
  return 'de';
}

let cachedAuthUserId: string | null = null;
export async function getMatrixAuthUserId(): Promise<string | null> {
  if (cachedAuthUserId) return cachedAuthUserId;
  try {
    const { data: authData } = await supabase.auth.getUser();
    cachedAuthUserId = authData?.user?.id || null;
  } catch {}
  return cachedAuthUserId;
}

// Единственный источник правды в памяти: Map<normalizedKey, { originalWord, level, masteredAt, bookId }>
const uniqueMasteredWordsByLang: Record<AppLang, Map<string, MasteredWordEntry>> = {
  de: new Map<string, MasteredWordEntry>(),
  en: new Map<string, MasteredWordEntry>(),
  ru: new Map<string, MasteredWordEntry>(),
  es: new Map<string, MasteredWordEntry>(),
};

const globalMatrixStatsByLang: Record<AppLang, CEFRMatrixStats> = {
  de: { counts: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 }, totalWords: 0, activeLevel: 'A1' },
  en: { counts: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 }, totalWords: 0, activeLevel: 'A1' },
  ru: { counts: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 }, totalWords: 0, activeLevel: 'A1' },
  es: { counts: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 }, totalWords: 0, activeLevel: 'A1' },
};

const listeners = new Set<(lang: AppLang, stats: CEFRMatrixStats) => void>();
const MASTERED_COUNT_CACHE_KEY = 'kraft_mastered_count_cache';
let authoritativeMasteredCount: number | null = null;
const countListeners = new Set<(count: number | null) => void>();

function getCachedMasteredWordsCount(): number | null {
  if (authoritativeMasteredCount !== null) return authoritativeMasteredCount;
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(MASTERED_COUNT_CACHE_KEY);
      if (raw !== null) {
        const parsed = parseInt(raw, 10);
        if (!isNaN(parsed) && parsed >= 0) {
          authoritativeMasteredCount = parsed;
          return parsed;
        }
      }
    } catch {}
  }
  return null;
}

function setAuthoritativeMasteredCount(count: number) {
  authoritativeMasteredCount = count;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(MASTERED_COUNT_CACHE_KEY, String(count));
    } catch {}
  }
  countListeners.forEach((listener) => listener(count));
}

export async function fetchMasteredWordsCountFromCloud(): Promise<number | null> {
  try {
    // Единый источник истины (Source of Truth): таблица user_mastered_words в Supabase
    const { count, error } = await supabase
      .from('user_mastered_words')
      .select('*', { count: 'exact', head: true });

    if (!error && count !== null && count > 0) {
      setAuthoritativeMasteredCount(count);
      return count;
    }
  } catch {}
  return getCachedMasteredWordsCount();
}

function getStorageKeys(lang: AppLang) {
  return {
    cacheKeyV4: `wortschatz_matrix_v4_${lang}`,
    legacyCacheKeyV3: `cefr_mastered_cache_v3_${lang}`,
    legacyTimestampsKey: `cefr_mastered_timestamps_${lang}_v3`,
  };
}

function notifyListeners(lang: AppLang) {
  const currentStats = {
    counts: { ...globalMatrixStatsByLang[lang].counts },
    totalWords: globalMatrixStatsByLang[lang].totalWords,
    activeLevel: globalMatrixStatsByLang[lang].activeLevel,
  };
  listeners.forEach((listener) => listener(lang, currentStats));
}

function calculateActiveLevel(counts: Record<CEFRLevel, number>): CEFRLevel {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return 'A1';

  // Выбираем уровень с наибольшим числом освоенных слов (при равенстве — более высокий уровень)
  let bestLevel: CEFRLevel = 'A1';
  let maxCount = -1;
  for (const lvl of CEFR_LEVEL_KEYS) {
    const c = counts[lvl] || 0;
    if (c >= maxCount && c > 0) {
      maxCount = c;
      bestLevel = lvl;
    }
  }
  return bestLevel;
}

function recomputeStatsFromMap(lang: AppLang): CEFRMatrixStats {
  const map = uniqueMasteredWordsByLang[lang];

  // Очистка стоп-слов / грамматических частиц и мусорных слов
  for (const [k, v] of Array.from(map.entries())) {
    const isJunkExportieren = 
      k.toLowerCase().includes('exportieren') ||
      v.originalWord.toLowerCase().includes('exportieren') ||
      (v.translation && v.translation.toLowerCase().includes('деяние'));

    if (isFunctionalParticle(k) || isFunctionalParticle(v.originalWord) || isJunkExportieren) {
      map.delete(k);
    }
  }

  const counts: Record<CEFRLevel, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 };

  map.forEach((entry) => {
    const lvl = CEFR_LEVEL_KEYS.includes(entry.level) ? entry.level : 'B1';
    counts[lvl] = (counts[lvl] || 0) + 1;
  });

  const totalWords =
    (counts.A1 || 0) +
    (counts.A2 || 0) +
    (counts.B1 || 0) +
    (counts.B2 || 0) +
    (counts.C1 || 0) +
    ((counts as Record<string, number>).C2 || 0);
  const activeLevel = calculateActiveLevel(counts);

  globalMatrixStatsByLang[lang] = {
    counts,
    totalWords,
    activeLevel,
  };

  return globalMatrixStatsByLang[lang];
}

function persistMatrixToStorage(lang: AppLang) {
  if (typeof window === 'undefined') return;
  try {
    const { cacheKeyV4 } = getStorageKeys(lang);
    const entriesObj: Record<string, MasteredWordEntry> = {};
    uniqueMasteredWordsByLang[lang].forEach((val, key) => {
      entriesObj[key] = val;
    });
    const payload = {
      stats: globalMatrixStatsByLang[lang],
      entries: entriesObj,
      updatedAt: Date.now(),
    };
    localStorage.setItem(cacheKeyV4, JSON.stringify(payload));
  } catch (e) {
    console.warn('[Wortschatz-Matrix] Storage persist warning:', e);
  }
}

/**
 * Извлекает точный таймстемп освоения карточки (masteredAt).
 * Учитывает:
 * 1) явные поля updated_at / first_mastered_at,
 * 2) дату следующего повторения SRS (nextReviewDate - interval * 86400000),
 *    которая записывается в таблицу cards в момент перехода карточки на 4 этап.
 */
export function extractCardMasteredAt(card: any, existingTs: number = 0): number {
  // 1. Явная дата первого освоения (first_mastered_at)
  const rawExplicit =
    card?.first_mastered_at ||
    card?.firstMasteredAt;

  if (rawExplicit) {
    const parsed = new Date(rawExplicit).getTime();
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  // 2. Уже существующий исторический таймстемп первого освоения
  if (existingTs && existingTs > 0) {
    return existingTs;
  }

  // 3. Дата создания карточки в базе (created_at)
  const rawCreated = card?.created_at || card?.createdAt;
  if (rawCreated) {
    const parsed = new Date(rawCreated).getTime();
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  // 4. Оценка по SRS (nextReviewDate - interval) только для исторических интервалов
  const rawNextReview = card?.nextReviewDate ?? card?.next_review_date;
  if (rawNextReview !== null && rawNextReview !== undefined) {
    const nextReviewMs =
      typeof rawNextReview === 'number' ? rawNextReview : new Date(rawNextReview).getTime();
    const intervalDays = Number(card?.interval ?? 1) || 1;
    if (!isNaN(nextReviewMs) && nextReviewMs > 0) {
      const inferredMasteredAt = nextReviewMs - intervalDays * 86400000;
      if (inferredMasteredAt > 1577836800000 && inferredMasteredAt <= Date.now() + 60000) {
        return inferredMasteredAt;
      }
    }
  }

  return 0;
}

const isInitializedByLang: Record<AppLang, boolean> = {
  de: false,
  en: false,
  ru: false,
  es: false,
};

const isSyncingByLang: Record<AppLang, boolean> = {
  de: false,
  en: false,
  ru: false,
  es: false,
};

const lastCloudSyncByLang: Record<AppLang, number> = {
  de: 0,
  en: 0,
  ru: 0,
  es: 0,
};

const hasAttemptedCloudSyncByLang: Record<AppLang, boolean> = {
  de: false,
  en: false,
  ru: false,
  es: false,
};

function initMatrixStore(lang: AppLang) {
  if (typeof window === 'undefined') return;
  if (isInitializedByLang[lang]) return;
  isInitializedByLang[lang] = true;

  const { cacheKeyV4, legacyTimestampsKey } = getStorageKeys(lang);

  try {
    // Читаем legacy-таймстемпы, чтобы не потерять прогресс за сегодня при миграции на v4
    const legacyTimestamps: Record<string, number> = {};
    try {
      const rawLegacyTs = localStorage.getItem(legacyTimestampsKey);
      if (rawLegacyTs) {
        const parsedTs = JSON.parse(rawLegacyTs);
        if (parsedTs && typeof parsedTs === 'object') {
          Object.entries(parsedTs).forEach(([k, v]) => {
            const normKey = normalizeLemmaKey(k);
            if (normKey && typeof v === 'number' && v > 0) {
              legacyTimestamps[normKey] = v;
            }
          });
        }
      }
    } catch {}

    const rawV4 = localStorage.getItem(cacheKeyV4);
    if (rawV4) {
      const parsed = JSON.parse(rawV4);
      if (parsed?.entries && typeof parsed.entries === 'object') {
        const map = uniqueMasteredWordsByLang[lang];
        map.clear();
        Object.entries(parsed.entries).forEach(([key, val]: [string, any]) => {
          const raw = val?.originalWord || key || '';
          const normKey = normalizeLemmaKey(raw);
          if (!normKey || normKey.length < 2) return;
          if (isFunctionalParticle(raw) || isFunctionalParticle(normKey)) return;
          const level: CEFRLevel = detectWordLevel(
            raw || normKey,
            null,
            val?.level,
            lang
          );
          const masteredAt = Number(val?.masteredAt || legacyTimestamps[normKey] || 0);
          const first_mastered_at = val?.first_mastered_at;
          const created_at = val?.created_at;
          const existing = map.get(normKey);
          if (!existing) {
            map.set(normKey, {
              originalWord: val?.originalWord || normKey,
              level,
              masteredAt,
              first_mastered_at,
              created_at,
              bookId: val?.bookId,
              translation: val?.translation,
              cardId: val?.cardId,
              nextReviewDate: val?.nextReviewDate,
              sentence: val?.sentence,
              sentenceTranslation: val?.sentenceTranslation,
            });
          } else {
            const earliestTs = (masteredAt > 0 && existing.masteredAt > 0)
              ? Math.min(masteredAt, existing.masteredAt)
              : (existing.masteredAt || masteredAt);

            map.set(normKey, {
              originalWord: val?.originalWord || normKey,
              level,
              masteredAt: earliestTs,
              first_mastered_at: existing.first_mastered_at || first_mastered_at,
              created_at: existing.created_at || created_at,
              bookId: val?.bookId || existing?.bookId,
              translation: val?.translation || existing?.translation,
              cardId: val?.cardId || existing?.cardId,
              nextReviewDate: val?.nextReviewDate || existing?.nextReviewDate,
              sentence: val?.sentence || existing?.sentence,
              sentenceTranslation: val?.sentenceTranslation || existing?.sentenceTranslation,
            });
          }
        });
        recomputeStatsFromMap(lang);
      }
    }
  } catch (e) {
    console.warn('[Wortschatz-Matrix] Hydration notice:', e);
  }
}

// Local-first in-memory cooldown guards to eliminate egress spikes
let lastRepairTimestampByLang: Record<string, number> = {};
const MATRIX_CLOUD_SYNC_COOLDOWN_MS = 20 * 1000; // 20 seconds
const REPAIR_TIMESTAMPS_COOLDOWN_MS = 60 * 60 * 1000; // 60 minutes

/**
 * Синхронизация выученных слов из Supabase:
 * Собирает реально выученные карточки пользователя (masteryLevel >= 4 || isArchived === true)
 * и записи user_mastered_words, строго дедуплицируя по normalizeLemmaKey.
 */
export async function syncMasteredWordsFromCloud(lang: AppLang = 'de', force: boolean = false): Promise<void> {
  initMatrixStore(lang);
  if (isSyncingByLang[lang]) return;
  const now = Date.now();
  if (!force && now - (lastCloudSyncByLang[lang] || 0) < MATRIX_CLOUD_SYNC_COOLDOWN_MS) return;

  isSyncingByLang[lang] = true;
  lastCloudSyncByLang[lang] = now;
  hasAttemptedCloudSyncByLang[lang] = true;

  try {
    // 0. Strict Local-First: если в локальной памяти/IndexedDB уже есть колоды с карточками,
    // матрица строится локально через autoBackfillMasteredWords без единого байта сетевого egress!
    try {
      const localDecks = await getIDBItem<any[]>('app_decks');
      if (Array.isArray(localDecks) && localDecks.length > 0) {
        const totalCards = localDecks.reduce((sum, d) => sum + (Array.isArray(d.cards) ? d.cards.length : 0), 0);
        if (totalCards > 0) {
          await autoBackfillMasteredWords(localDecks, undefined, lang);
        }
      }
    } catch {}

    const existingMap = uniqueMasteredWordsByLang[lang];

    // 0. Загружаем снимок слов из user_stats (работает для всех клиентов без обязательной auth-сессии)
    try {
      const statsDaily = await safeFetchUserStats(`MASTERED_WORDS_${lang.toUpperCase()}`);

      let addedWords = false;
      if (statsDaily?.words && Array.isArray(statsDaily.words)) {
        for (const w of statsDaily.words) {
          if (w && typeof w === 'string') {
            const key = normalizeLemmaKey(w);
            if (key && key.length >= 2 && !existingMap.has(key)) {
              existingMap.set(key, { originalWord: w, level: 'B1', masteredAt: Date.now() });
              addedWords = true;
            }
          }
        }
      }
      if (statsDaily?.entries && Array.isArray(statsDaily.entries)) {
        for (const item of statsDaily.entries) {
          if (item && item.originalWord) {
            const key = normalizeLemmaKey(item.originalWord);
            if (key && key.length >= 2 && !existingMap.has(key)) {
              existingMap.set(key, item);
              addedWords = true;
            }
          }
        }
      }

      if (addedWords) {
        recomputeStatsFromMap(lang);
        persistMatrixToStorage(lang);
        notifyListeners(lang);
      }
    } catch (e) {
      console.warn('[Wortschatz-Matrix] safeFetchUserStats notice:', e);
    }

    // 1. Загружаем канонический счетчик и строки из user_mastered_words (Single Source of Truth)
    await fetchMasteredWordsCountFromCloud();

    const remoteMetaByKey = new Map<string, { level?: string | null; masteredAt: number; first_mastered_at?: string; created_at?: string; bookId?: string; rawLemma?: string }>();
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      let umwFrom = 0;
      const UMW_PAGE_SIZE = 1000;
      let umwHasMore = true;
      while (umwHasMore) {
        let umwQuery = supabase
          .from('user_mastered_words')
          .select('lemma, cefr_level, source_book_id, first_mastered_at, created_at')
          .range(umwFrom, umwFrom + UMW_PAGE_SIZE - 1);
        if (userId) {
          umwQuery = umwQuery.eq('user_id', userId);
        }
        const { data, error: umwErr } = await umwQuery;
        if (umwErr || !Array.isArray(data) || data.length === 0) {
          umwHasMore = false;
        } else {
          for (const row of data) {
            const key = normalizeLemmaKey(row.lemma || '');
            if (!key || key.length < 2) continue;
            const ts = row.first_mastered_at ? new Date(row.first_mastered_at).getTime() : 0;
            const prev = remoteMetaByKey.get(key);
            if (!prev || (ts > 0 && (prev.masteredAt === 0 || ts < prev.masteredAt))) {
              remoteMetaByKey.set(key, {
                level: row.cefr_level,
                first_mastered_at: row.first_mastered_at,
                created_at: row.created_at,
                bookId: row.source_book_id || undefined,
                rawLemma: row.lemma,
                masteredAt: !isNaN(ts) && ts > 0 ? ts : 0,
              });
            }
          }
          umwFrom += UMW_PAGE_SIZE;
          umwHasMore = data.length === UMW_PAGE_SIZE;
        }
      }
    } catch {}

    // 2. Запрашиваем реально выученные карточки из таблицы cards в Supabase
    let allMasteredCards: any[] = [];
    let from = 0;
    const PAGE_SIZE = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: cardRows, error: cardErr } = await supabase
        .from('cards')
        .select('id, targetWord, sentence, translation, forms, baseWordInfo, masteryLevel, isArchived, nextReviewDate, interval, repetitions, decks!inner(id, name, category, language, level, book_id)')
        .or('isArchived.eq.true,masteryLevel.gte.4')
        .range(from, from + PAGE_SIZE - 1);

      if (cardErr || !cardRows || cardRows.length === 0) {
        hasMore = false;
      } else {
        allMasteredCards = allMasteredCards.concat(cardRows);
        from += PAGE_SIZE;
        hasMore = cardRows.length === PAGE_SIZE;
      }
    }

    if (allMasteredCards.length > 0 || remoteMetaByKey.size > 0) {
      const nextMap = new Map<string, MasteredWordEntry>();

      for (const c of allMasteredCards) {
        const deckObj = Array.isArray(c.decks) ? c.decks[0] : c.decks;
        const dLang = normalizeLanguageCode(deckObj?.language || 'de');
        if (dLang !== lang) continue;
        if (isContextOrGrammarDeck(deckObj, undefined, c)) continue;

        const rawWord = c.targetWord || '';
        const normalizedKey = normalizeLemmaKey(rawWord);
        if (!normalizedKey || normalizedKey.length < 2) continue;
        if (isFunctionalParticle(rawWord) || isFunctionalParticle(normalizedKey)) continue;

        const prevEntry = existingMap.get(normalizedKey);
        const remoteMeta = remoteMetaByKey.get(normalizedKey);
        const priorTs = remoteMeta?.masteredAt || prevEntry?.masteredAt || 0;
        const masteredAt = extractCardMasteredAt(c, priorTs);
        const firstMasteredAt = remoteMeta?.first_mastered_at || (c as any).first_mastered_at || prevEntry?.first_mastered_at || (masteredAt > 0 ? new Date(masteredAt).toISOString() : undefined);
        const createdAt = (c as any).created_at || remoteMeta?.created_at || prevEntry?.created_at;

        const deckLevel = deckObj?.level || deckObj?.name || deckObj?.title || null;
        const cardLevel = (c as any).level || remoteMeta?.level || null;
        const level = detectWordLevel(normalizedKey, deckLevel, cardLevel, lang);

        const conciseTrans = extractConciseTranslation(c);
        const cardTranslation = conciseTrans || c.translation || prevEntry?.translation;
        const cardNextReview = c.nextReviewDate ?? c.next_review_date ?? prevEntry?.nextReviewDate;
        const cardSentence = c.sentence || prevEntry?.sentence;
        const cardSentenceTrans = (c as any).sentenceTranslation || (c as any).sentence_translation || prevEntry?.sentenceTranslation;

        const alreadyInNext = nextMap.get(normalizedKey);
        if (!alreadyInNext) {
          nextMap.set(normalizedKey, {
            originalWord: rawWord,
            level,
            masteredAt,
            first_mastered_at: firstMasteredAt,
            created_at: createdAt,
            bookId: deckObj?.book_id || prevEntry?.bookId,
            translation: cardTranslation,
            cardId: c.id || prevEntry?.cardId,
            nextReviewDate: cardNextReview,
            sentence: cardSentence,
            sentenceTranslation: cardSentenceTrans,
          });
        } else {
          // Сохраняем САМУЮ РАННЮЮ дату первого освоения (не смещаем вперед при повторах)
          const earliestMasteredAt = (masteredAt > 0 && alreadyInNext.masteredAt > 0)
            ? Math.min(masteredAt, alreadyInNext.masteredAt)
            : (alreadyInNext.masteredAt || masteredAt);

          nextMap.set(normalizedKey, {
            ...alreadyInNext,
            masteredAt: earliestMasteredAt,
            first_mastered_at: alreadyInNext.first_mastered_at || firstMasteredAt,
            created_at: alreadyInNext.created_at || createdAt,
            translation: cardTranslation || alreadyInNext.translation,
            cardId: c.id || alreadyInNext.cardId,
            nextReviewDate: cardNextReview || alreadyInNext.nextReviewDate,
            sentence: cardSentence || alreadyInNext.sentence,
            sentenceTranslation: cardSentenceTrans || alreadyInNext.sentenceTranslation,
          });
        }
      }

      // Дополняем леммами из user_mastered_words (если каких-то карточек нет в выборке) без сохранения локального мусора
      if (lang === 'de') {
        remoteMetaByKey.forEach((meta, key) => {
          if (!nextMap.has(key) && !isFunctionalParticle(key)) {
            const prevEntry = existingMap.get(key);
            const level = detectWordLevel(key, null, meta.level || null, lang);
            nextMap.set(key, {
              originalWord: prevEntry?.originalWord || meta.rawLemma || key,
              level,
              masteredAt: meta.masteredAt || prevEntry?.masteredAt || 0,
              first_mastered_at: meta.first_mastered_at || prevEntry?.first_mastered_at,
              created_at: meta.created_at || prevEntry?.created_at,
              bookId: meta.bookId || prevEntry?.bookId,
              translation: prevEntry?.translation,
              cardId: prevEntry?.cardId,
              nextReviewDate: prevEntry?.nextReviewDate,
              sentence: prevEntry?.sentence,
              sentenceTranslation: prevEntry?.sentenceTranslation,
            });
          }
        });
      }

      const hadOrphans = existingMap.size !== nextMap.size;
      let hasChanged = hadOrphans;
      if (!hasChanged) {
        for (const [k, v] of nextMap.entries()) {
          const prev = existingMap.get(k);
          if (!prev || prev.level !== v.level || prev.masteredAt !== v.masteredAt || prev.translation !== v.translation) {
            hasChanged = true;
            break;
          }
        }
      }

      uniqueMasteredWordsByLang[lang] = nextMap;
      recomputeStatsFromMap(lang);
      if (hasChanged) {
        persistMatrixToStorage(lang);
        notifyListeners(lang);
      }

      safeUpsertUserStats({
        language: `MASTERED_WORDS_${lang.toUpperCase()}`,
        daily_activity: {
          counts: globalMatrixStatsByLang[lang]?.counts,
          totalWords: nextMap.size,
          words: Array.from(nextMap.keys()),
          updatedAt: Date.now(),
        },
      }).catch(() => {});
    }
  } catch (err) {
    console.warn('[Wortschatz-Matrix] syncMasteredWordsFromCloud notice:', err);
  } finally {
    isSyncingByLang[lang] = false;
  }
}

/**
 * Регистрирует одно выученное слово в матрице (строго без дубликатов по normalizeLemmaKey).
 */
export async function recordMasteredLemma(
  paramsOrWord:
    | {
        rawWord: string;
        bookId?: string;
        bookLevel?: string | null;
        cardLevel?: string | null;
        language?: string;
        timestamp?: number;
        isReview?: boolean;
        first_mastered_at?: string;
        created_at?: string;
      }
    | string,
  levelOrNull?: string | null,
  bookIdOrNull?: string,
  langOrNull?: string,
  timestampOrNull?: number
) {
  const rawWord = typeof paramsOrWord === 'string' ? paramsOrWord : paramsOrWord.rawWord;
  const deckLevel = typeof paramsOrWord === 'string' ? levelOrNull : paramsOrWord.bookLevel;
  const cardLevel = typeof paramsOrWord === 'object' ? paramsOrWord.cardLevel : null;
  const bookId = typeof paramsOrWord === 'string' ? bookIdOrNull : paramsOrWord.bookId;
  const rawLang = typeof paramsOrWord === 'string' ? langOrNull : paramsOrWord.language;
  const isReview = typeof paramsOrWord === 'object' ? Boolean(paramsOrWord.isReview) : false;
  const timestamp =
    typeof paramsOrWord === 'object' && paramsOrWord.timestamp
      ? paramsOrWord.timestamp
      : timestampOrNull || Date.now();

  let currentLanguage: AppLang = 'de';
  if (rawLang) {
    currentLanguage = normalizeLanguageCode(rawLang);
  } else if (typeof window !== 'undefined') {
    try {
      const savedLang = localStorage.getItem('selected_language');
      if (savedLang) currentLanguage = normalizeLanguageCode(savedLang);
    } catch {}
  }

  initMatrixStore(currentLanguage);

  if (isFunctionalParticle(rawWord)) return;
  const normalizedKey = normalizeLemmaKey(rawWord);
  if (!normalizedKey || normalizedKey.length < 2) return;
  if (isFunctionalParticle(normalizedKey)) return;

  const resolvedLevel = detectWordLevel(normalizedKey, deckLevel, cardLevel, currentLanguage);
  const map = uniqueMasteredWordsByLang[currentLanguage];
  const existing = map.get(normalizedKey);

  // Если слово уже зарегистрировано:
  if (existing) {
    // В режиме повторения дата первого освоения НЕ перезаписывается
    if (isReview) {
      return;
    }
    if (!existing.masteredAt || existing.masteredAt <= 0) {
      map.set(normalizedKey, {
        ...existing,
        masteredAt: timestamp,
        first_mastered_at: new Date(timestamp).toISOString(),
      });
      persistMatrixToStorage(currentLanguage);
      notifyListeners(currentLanguage);
    }
    return;
  }

  // Новое освоенное слово
  const firstMasteredAt = (typeof paramsOrWord === 'object' && paramsOrWord.first_mastered_at)
    ? paramsOrWord.first_mastered_at
    : (isReview 
        ? ((typeof paramsOrWord === 'object' && paramsOrWord.created_at) ? paramsOrWord.created_at : new Date(timestamp - 86400000).toISOString())
        : new Date(timestamp).toISOString());

  const effectiveTs = (isReview && firstMasteredAt) ? new Date(firstMasteredAt).getTime() : timestamp;

  map.set(normalizedKey, {
    originalWord: rawWord,
    level: resolvedLevel,
    masteredAt: effectiveTs,
    first_mastered_at: firstMasteredAt,
    created_at: typeof paramsOrWord === 'object' ? paramsOrWord.created_at : undefined,
    bookId,
  });

  recomputeStatsFromMap(currentLanguage);
  persistMatrixToStorage(currentLanguage);
  notifyListeners(currentLanguage);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('stats-update', { detail: { language: currentLanguage } }));
  }

  // Всегда сохраняем компактную статистику в user_stats (без передачи сотен килобайт entries)
  try {
    const counts = globalMatrixStatsByLang[currentLanguage].counts;
    const currentMap = uniqueMasteredWordsByLang[currentLanguage];
    const totalWords = currentMap.size;
    safeUpsertUserStats({
      language: `MASTERED_WORDS_${currentLanguage.toUpperCase()}`,
      daily_activity: {
        counts,
        totalWords,
        words: Array.from(currentMap.keys()),
        updatedAt: Date.now(),
      },
    }).catch(() => {});
  } catch {}

  // Сохраняем в Supabase user_mastered_words (при наличии авторизованного пользователя)
  try {
    const userId = await getMatrixAuthUserId();
    if (!userId) return;

    const payload: any = {
      user_id: userId,
      lemma: normalizedKey,
      cefr_level: resolvedLevel,
      source_book_id: bookId || null,
      first_mastered_at: firstMasteredAt ? new Date(firstMasteredAt).toISOString() : new Date().toISOString(),
    };

    const { error } = await supabase
      .from('user_mastered_words')
      .upsert(payload, { onConflict: 'user_id,lemma' });

    if (error) {
      console.error('[CRITICAL user_mastered_words 400]:', error.message, error.details, payload);
    } else {
      await fetchMasteredWordsCountFromCloud();
    }
  } catch (err) {
    console.warn('[Wortschatz-Matrix] Remote upsert notice:', err);
  }
}

/**
 * Удаляет слово из матрицы при сбросе прогресса карточки (ошибке на повторении).
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
  } else if (typeof window !== 'undefined') {
    try {
      const savedLang = localStorage.getItem('selected_language');
      if (savedLang) currentLanguage = normalizeLanguageCode(savedLang);
    } catch {}
  }

  initMatrixStore(currentLanguage);

  if (isFunctionalParticle(rawWord)) return;
  const normalizedKey = normalizeLemmaKey(rawWord);
  if (!normalizedKey || normalizedKey.length < 2) return;
  if (isFunctionalParticle(normalizedKey)) return;

  const map = uniqueMasteredWordsByLang[currentLanguage];
  if (!map.has(normalizedKey)) return;

  map.delete(normalizedKey);
  recomputeStatsFromMap(currentLanguage);
  persistMatrixToStorage(currentLanguage);
  notifyListeners(currentLanguage);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('stats-update', { detail: { language: currentLanguage } }));
  }

  try {
    const userId = await getMatrixAuthUserId();
    if (!userId) return;

    await supabase
      .from('user_mastered_words')
      .delete()
      .match({ user_id: userId, lemma: normalizedKey });
    await fetchMasteredWordsCountFromCloud();
  } catch (err) {
    console.warn('[Wortschatz-Matrix] Remote delete notice:', err);
  }
}

export function getMasteredLemmasSet(langParam?: string | AppLang): Set<string> {
  const normLang = normalizeLanguageCode(langParam);
  initMatrixStore(normLang);
  return new Set(uniqueMasteredWordsByLang[normLang].keys());
}

/**
 * Возвращает полный список уникальных освоенных слов пользователя для указанного языка
 */
export function getMasteredWordEntries(langParam?: string | AppLang): MasteredWordEntry[] {
  const normLang = normalizeLanguageCode(langParam);
  initMatrixStore(normLang);
  return Array.from(uniqueMasteredWordsByLang[normLang].values()).filter(
    (e) => !isFunctionalParticle(e.originalWord) && !isFunctionalParticle(normalizeLemmaKey(e.originalWord))
  );
}

/**
 * Пересчитывает матрицу строго по выученным карточкам пользователя (masteryLevel >= 4 || isArchived === true)
 * с дедупликацией через normalizeLemmaKey и определением уровня через detectWordLevel.
 */
export async function autoBackfillMasteredWords(
  providedDecks?: Array<{ id: string; bookId?: string; level?: string; language?: string; cards?: Array<any> }>,
  providedBooks?: Array<{ id: string; language?: string; activeLevels?: string[]; title?: string }>,
  targetLangParam?: string | AppLang
): Promise<number> {
  const decks = providedDecks;
  const books = providedBooks;

  if (!Array.isArray(decks) || decks.length === 0) return 0;
  const totalCardsInDecks = decks.reduce((sum, d) => sum + (Array.isArray(d.cards) ? d.cards.length : 0), 0);
  if (totalCardsInDecks === 0) return 0;

  const bookMap = new Map<string, any>();
  if (Array.isArray(books)) {
    books.forEach((b) => bookMap.set(b.id, b));
  }

  // Пересчитываем для всех поддерживаемых языков, присутствующих в колодах
  const langsToProcess: AppLang[] = SUPPORTED_LANGS;

  let primaryCount = 0;

  for (const targetLang of langsToProcess) {
    initMatrixStore(targetLang);
    const existingMap = uniqueMasteredWordsByLang[targetLang];

    const langDecks = decks.filter((deck) => {
      const dBookId = deck.bookId || (deck as any).book_id;
      const dLang = normalizeLanguageCode(deck.language || bookMap.get(dBookId || '')?.language || 'de');
      return dLang === targetLang;
    });

    if (langDecks.length === 0) continue;

    const deduplicatedMap = new Map<string, MasteredWordEntry>();

    langDecks.forEach((deck) => {
      const dBookId = deck.bookId || (deck as any).book_id;
      const parentBook = dBookId ? bookMap.get(dBookId) : undefined;

      // Исключаем грамматические колоды, режим «Kontext» и упражнения
      if (isContextOrGrammarDeck(deck, parentBook)) return;

      const deckLevel =
        (deck as any).level ||
        (parentBook?.activeLevels?.length === 1 ? parentBook.activeLevels[0] : null) ||
        (deck as any).name ||
        (deck as any).title ||
        parentBook?.title ||
        null;

      deck.cards?.forEach((card: any) => {
        // Исключаем карточки режима «Kontext»
        if (isContextOrGrammarDeck(deck, parentBook, card)) return;

        const mastery = card.masteryLevel ?? card.mastery_level ?? 0;
        const archived = Boolean(card.isArchived ?? card.is_archived);
        const isMastered = mastery >= 4 || archived === true;
        if (!isMastered) return;

        const rawWord =
          card.targetWord ||
          card.target_word ||
          card.missingWord ||
          card.infinitive ||
          card.front ||
          '';
        const normalizedKey = normalizeLemmaKey(rawWord);
        if (!normalizedKey || normalizedKey.length < 2) return;
        if (isFunctionalParticle(rawWord) || isFunctionalParticle(normalizedKey)) return;

        const prevEntry = existingMap.get(normalizedKey);
        const prevTs = prevEntry?.masteredAt || 0;
        const masteredAt = extractCardMasteredAt(card, prevTs);
        const cardLevel = card.level || card.cefrLevel || card.cefr_level || null;
        const level = detectWordLevel(normalizedKey, deckLevel, cardLevel, targetLang);

        const existingEntry = deduplicatedMap.get(normalizedKey);
        const conciseTrans = extractConciseTranslation(card);
        const cardTranslation = conciseTrans || card.translation || card.back || existingMap.get(normalizedKey)?.translation;
        const cardNextReview = card.nextReviewDate ?? card.next_review_date ?? existingMap.get(normalizedKey)?.nextReviewDate;
        const cardSentence = card.sentence || card.exampleSentence || card.example || existingMap.get(normalizedKey)?.sentence;
        const cardSentenceTrans = card.sentenceTranslation || card.sentence_translation || existingMap.get(normalizedKey)?.sentenceTranslation;

        const firstMasteredAt = card.first_mastered_at || prevEntry?.first_mastered_at || (masteredAt > 0 ? new Date(masteredAt).toISOString() : undefined);
        const createdAt = card.created_at || prevEntry?.created_at;

        if (!existingEntry) {
          deduplicatedMap.set(normalizedKey, {
            originalWord: rawWord,
            level,
            masteredAt,
            first_mastered_at: firstMasteredAt,
            created_at: createdAt,
            bookId: dBookId,
            translation: cardTranslation,
            cardId: card.id,
            nextReviewDate: cardNextReview,
            sentence: cardSentence,
            sentenceTranslation: cardSentenceTrans,
          });
        } else {
          // Сохраняем самый ранний таймстемп
          const earliestMasteredAt = (masteredAt > 0 && existingEntry.masteredAt > 0)
            ? Math.min(masteredAt, existingEntry.masteredAt)
            : (existingEntry.masteredAt || masteredAt);

          deduplicatedMap.set(normalizedKey, {
            ...existingEntry,
            masteredAt: earliestMasteredAt,
            first_mastered_at: existingEntry.first_mastered_at || firstMasteredAt,
            created_at: existingEntry.created_at || createdAt,
            translation: cardTranslation || existingEntry.translation,
            cardId: card.id || existingEntry.cardId,
            nextReviewDate: cardNextReview || existingEntry.nextReviewDate,
            sentence: cardSentence || existingEntry.sentence,
            sentenceTranslation: cardSentenceTrans || existingEntry.sentenceTranslation,
          });
        }
      });
    });

    // Строгое инкрементальное объединение: новые выученные слова добавляются,
    // а ранее освоенные слова из других колод/книг НИКОГДА не сбрасываются и не удаляются!
    let mapChanged = false;
    deduplicatedMap.forEach((entry, key) => {
      const existing = existingMap.get(key);
      if (!existing) {
        existingMap.set(key, entry);
        mapChanged = true;
      } else {
        const earliestTs = (entry.masteredAt > 0 && existing.masteredAt > 0)
          ? Math.min(entry.masteredAt, existing.masteredAt)
          : (existing.masteredAt || entry.masteredAt);
        if (
          existing.level !== entry.level ||
          existing.masteredAt !== earliestTs ||
          (entry.translation && existing.translation !== entry.translation)
        ) {
          existingMap.set(key, {
            ...existing,
            ...entry,
            masteredAt: earliestTs,
            first_mastered_at: existing.first_mastered_at || entry.first_mastered_at,
          });
          mapChanged = true;
        }
      }
    });

    recomputeStatsFromMap(targetLang);
    if (mapChanged) {
      persistMatrixToStorage(targetLang);
      notifyListeners(targetLang);

      // Синхронизируем очищенную статистику выученных слов в user_stats (компактный payload)
      try {
        safeUpsertUserStats({
          language: `MASTERED_WORDS_${targetLang.toUpperCase()}`,
          daily_activity: {
            counts: globalMatrixStatsByLang[targetLang]?.counts,
            totalWords: existingMap.size,
            words: Array.from(existingMap.keys()),
            updatedAt: Date.now(),
          },
        }).catch(() => {});
      } catch {}
    }

    if (targetLang === normalizeLanguageCode(targetLangParam)) {
      primaryCount = existingMap.size;
    }
  }

  return primaryCount;
}

/**
 * Очищает «сиротские» выученные слова (чьи карточки больше не принадлежат ни одной существующей колоде или книге)
 */
export async function purgeOrphanedMasteredWords(
  currentDecks: Array<{ id: string; cards?: Array<any> }>,
  currentBooks?: Array<{ id: string; decks?: Array<any> }>,
  langParam?: string | AppLang
): Promise<number> {
  const normLang = normalizeLanguageCode(langParam);
  initMatrixStore(normLang);

  // 1. Собираем ID всех актуальных существующих карточек и их канонические леммы
  const validCardIds = new Set<string>();
  const validLemmaKeys = new Set<string>();
  const collectCard = (c: any) => {
    if (!c || c.isDeleted) return;
    if (c.id) validCardIds.add(c.id);
    const rawWord = c.targetWord || c.word || c.front || '';
    const key = normalizeLemmaKey(rawWord);
    if (key) validLemmaKeys.add(key);
  };

  (currentDecks || []).forEach((d: any) => {
    if (!d || d.isDeleted) return;
    (d.cards || []).forEach(collectCard);
  });
  (currentBooks || []).forEach((b: any) => {
    if (!b || b.isDeleted) return;
    (b.decks || []).forEach((d: any) => {
      if (!d || d.isDeleted) return;
      (d.cards || []).forEach(collectCard);
    });
  });

  if (validCardIds.size === 0) return 0;

  // 2. Фильтруем локальную матрицу uniqueMasteredWordsByLang
  const currentMap = uniqueMasteredWordsByLang[normLang];
  let changed = false;
  const removedKeys: string[] = [];

  currentMap.forEach((entry, key) => {
    const missingCardId = Boolean(entry.cardId && !validCardIds.has(entry.cardId));
    const missingLemma = !validLemmaKeys.has(key);
    if (missingCardId || missingLemma) {
      removedKeys.push(key);
      changed = true;
    }
  });

  removedKeys.forEach(k => currentMap.delete(k));

  if (changed) {
    recomputeStatsFromMap(normLang);
    persistMatrixToStorage(normLang);
    notifyListeners(normLang);

    try {
      safeUpsertUserStats({
        language: `MASTERED_WORDS_${normLang.toUpperCase()}`,
        daily_activity: {
          counts: globalMatrixStatsByLang[normLang]?.counts,
          totalWords: currentMap.size,
          words: Array.from(currentMap.keys()),
          updatedAt: Date.now(),
        },
      }).catch(() => {});
    } catch {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('stats-update', { detail: { language: normLang } }));
      window.dispatchEvent(new Event('stats-update'));
    }
  }

  return removedKeys.length;
}

/**
 * Одноразовая чистка мусорной записи «exportieren» («деяние») из памяти,
 * Supabase user_mastered_words и IndexedDB app_decks.
 */
export async function purgeJunkExportierenWord(): Promise<void> {
  try {
    let memoryChanged = false;
    const langs: AppLang[] = ['de', 'en', 'ru', 'es'];
    for (const lang of langs) {
      const map = uniqueMasteredWordsByLang[lang];
      const toDelete: string[] = [];
      map.forEach((v, k) => {
        const isJunk =
          k.toLowerCase().includes('exportieren') ||
          v.originalWord.toLowerCase().includes('exportieren') ||
          (v.translation && v.translation.toLowerCase().includes('деяние'));
        if (isJunk) {
          toDelete.push(k);
        }
      });
      if (toDelete.length > 0) {
        toDelete.forEach((k) => map.delete(k));
        recomputeStatsFromMap(lang);
        persistMatrixToStorage(lang);
        notifyListeners(lang);
        memoryChanged = true;
      }
    }

    if (memoryChanged && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('stats-update'));
    }

    // Удаление из Supabase user_mastered_words
    try {
      await supabase
        .from('user_mastered_words')
        .delete()
        .ilike('lemma', '%exportieren%');
    } catch {}

    // Удаление из IndexedDB app_decks
    try {
      const decks = await getIDBItem<any[]>('app_decks');
      if (Array.isArray(decks)) {
        let idbChanged = false;
        decks.forEach((d) => {
          if (Array.isArray(d.cards)) {
            const beforeLen = d.cards.length;
            d.cards = d.cards.filter((c: any) => {
              const tw = (c.targetWord || '').toLowerCase();
              const tr = (c.translation || '').toLowerCase();
              return !tw.includes('exportieren') && !tr.includes('деяние');
            });
            if (d.cards.length !== beforeLen) {
              idbChanged = true;
            }
          }
        });
        if (idbChanged) {
          await setIDBItem('app_decks', decks);
        }
      }
    } catch {}
  } catch (err) {
    console.warn('purgeJunkExportierenWord notice:', err);
  }
}

/**
 * Синхронизирует матрицу при явном удалении колоды, книги или карточки.
 */
export async function reconcileMasteredWords(
  providedDecks?: Array<{ id: string; bookId?: string; level?: string; language?: string; cards?: Array<any> }>,
  targetLangParam?: string | AppLang,
  isExplicitDeletion: boolean = false
) {
  if (!isExplicitDeletion) {
    return;
  }
  if (Array.isArray(providedDecks)) {
    await purgeOrphanedMasteredWords(providedDecks, undefined, targetLangParam);
  }
  await autoBackfillMasteredWords(providedDecks, undefined, targetLangParam);
}

/**
 * Каскадное удаление выученных слов при удалении книги, колоды или карточек
 */
export async function removeMasteredWordsByCardIds(
  cardIds: string[], 
  bookId?: string, 
  langParam?: string | AppLang
): Promise<void> {
  const normLang = normalizeLanguageCode(langParam);
  initMatrixStore(normLang);

  const cardIdSet = new Set(cardIds.filter(Boolean));
  const currentMap = uniqueMasteredWordsByLang[normLang];
  const keysToRemove: string[] = [];

  currentMap.forEach((entry, key) => {
    if (entry.cardId && cardIdSet.has(entry.cardId)) {
      keysToRemove.push(key);
    } else if (bookId && entry.bookId === bookId) {
      keysToRemove.push(key);
    }
  });

  keysToRemove.forEach((k) => currentMap.delete(k));

  recomputeStatsFromMap(normLang);
  persistMatrixToStorage(normLang);
  notifyListeners(normLang);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('stats-update', { detail: { language: normLang } }));
  }

  // Удаление из Supabase таблицы user_mastered_words
  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (userId) {
      if (bookId) {
        await supabase
          .from('user_mastered_words')
          .delete()
          .eq('user_id', userId)
          .eq('source_book_id', bookId);
      }
      if (keysToRemove.length > 0) {
        await supabase
          .from('user_mastered_words')
          .delete()
          .eq('user_id', userId)
          .in('lemma', keysToRemove);
      }
      await fetchMasteredWordsCountFromCloud();
    }
  } catch (err) {
    console.warn('[Wortschatz-Matrix] Remote cascade delete notice:', err);
  }
}

/**
 * Подсчет реально НОВЫХ слов, выученных сегодня.
 * Карточка учитывается ТОЛЬКО если дата ее первого освоения (first_mastered_at или created_at)
 * совпадает с сегодняшним днем. Повторные ревью старых карточек сюда НЕ попадают.
 */
export function getWordsLearnedToday(langParam?: string | AppLang): TodayProgress {
  const lang = normalizeLanguageCode(langParam);
  initMatrixStore(lang);

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const todayLocalStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayEnd = todayStart + 24 * 60 * 60 * 1000;

  const todayCounts: Record<CEFRLevel, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 };
  let wordsLearnedToday = 0;

  const map = uniqueMasteredWordsByLang[lang];
  map.forEach((entry) => {
    // Фильтр строго по дате первого освоения:
    const firstMastered = entry.first_mastered_at;
    const createdAt = entry.created_at;

    let isNewlyLearnedToday = false;

    if (firstMastered || createdAt) {
      const targetDateStr = firstMastered || createdAt;
      try {
        const d = new Date(targetDateStr!);
        if (!isNaN(d.getTime())) {
          const dIso = d.toISOString().split('T')[0];
          const dLocal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          if (dIso === todayStr || dLocal === todayLocalStr) {
            isNewlyLearnedToday = true;
          }
        }
      } catch {}
    } else if (entry.masteredAt >= todayStart && entry.masteredAt < todayEnd) {
      isNewlyLearnedToday = true;
    }

    if (isNewlyLearnedToday) {
      wordsLearnedToday++;
      const lvl = CEFR_LEVEL_KEYS.includes(entry.level) ? entry.level : 'B1';
      todayCounts[lvl] = (todayCounts[lvl] || 0) + 1;
    }
  });

  const totalGoal = C1_TARGET_WORDS[lang] || 10000;
  const percentLearnedToday =
    totalGoal > 0 ? ((wordsLearnedToday / totalGoal) * 100).toFixed(2) : '0.00';

  return {
    wordsLearnedToday,
    percentLearnedToday,
    todayCounts,
  };
}

/**
 * Миграция и сброс накрученного счетчика дневной статистики:
 * восстанавливает истинные даты первого освоения слов из Supabase user_mastered_words
 * и структуры карточек колод, сбрасывая ложные таймстемпы сегодняшнего дня от сессий повторения.
 */
export async function repairInflatedMasteredTimestamps(lang: AppLang = 'de'): Promise<void> {
  initMatrixStore(lang);
  const map = uniqueMasteredWordsByLang[lang];
  if (map.size === 0) return;

  const now = Date.now();
  if (lastRepairTimestampByLang[lang] && now - lastRepairTimestampByLang[lang] < REPAIR_TIMESTAMPS_COOLDOWN_MS) {
    return;
  }
  lastRepairTimestampByLang[lang] = now;

  const nowDate = new Date();
  const todayStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
  let hasRepairs = false;

  // 1. Проверяем записи в таблице user_mastered_words в Supabase (Single Source of Truth)
  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (userId) {
      const { data: remoteRows } = await supabase
        .from('user_mastered_words')
        .select('lemma, first_mastered_at, created_at')
        .eq('user_id', userId);

      if (Array.isArray(remoteRows)) {
        for (const row of remoteRows) {
          const key = normalizeLemmaKey(row.lemma || '');
          const entry = map.get(key);
          if (entry && row.first_mastered_at) {
            const remoteTs = new Date(row.first_mastered_at).getTime();
            if (!isNaN(remoteTs) && remoteTs > 0) {
              if (remoteTs < todayStart && entry.masteredAt >= todayStart) {
                entry.masteredAt = remoteTs;
                entry.first_mastered_at = row.first_mastered_at;
                if (row.created_at) entry.created_at = row.created_at;
                hasRepairs = true;
              } else if (!entry.first_mastered_at) {
                entry.first_mastered_at = row.first_mastered_at;
                entry.created_at = row.created_at || entry.created_at;
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('[Wortschatz-Matrix] Repair Supabase notice:', e);
  }

  // 2. Проверяем локальные карточки из IndexedDB (app_decks) или localStorage
  try {
    let decksList: any[] = [];
    if (typeof window !== 'undefined') {
      const cached = await getIDBItem<any[]>('app_decks');
      if (Array.isArray(cached) && cached.length > 0) {
        decksList = cached;
      } else {
        const raw = localStorage.getItem('cached_app_decks');
        if (raw) decksList = JSON.parse(raw);
      }
    }

    if (Array.isArray(decksList)) {
      for (const d of decksList) {
        if (!Array.isArray(d?.cards)) continue;
        for (const c of d.cards) {
          const rawWord = c.targetWord || c.target_word || c.missingWord || c.infinitive || c.front || '';
          const normKey = normalizeLemmaKey(rawWord);
          const entry = map.get(normKey);
          if (!entry) continue;

          const cardCreated = c.created_at || c.createdAt;
          const cardCreatedTs = cardCreated ? new Date(cardCreated).getTime() : 0;
          const reps = Number(c.repetitions || 0);
          const interval = Number(c.interval || 0);

          if (c.first_mastered_at && !entry.first_mastered_at) {
            entry.first_mastered_at = c.first_mastered_at;
          }

          if (entry.masteredAt >= todayStart && cardCreatedTs > 0 && cardCreatedTs < todayStart) {
            if (reps > 1 || interval > 1 || c.isArchived) {
              const inferredTs = (c.nextReviewDate ? Number(c.nextReviewDate) : Date.now()) - (Math.max(1, interval) * 86400000);
              const safeTs = (inferredTs > 1577836800000 && inferredTs < todayStart) ? inferredTs : cardCreatedTs;
              entry.masteredAt = safeTs;
              entry.first_mastered_at = c.first_mastered_at || new Date(safeTs).toISOString();
              entry.created_at = cardCreated;
              hasRepairs = true;
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('[Wortschatz-Matrix] Repair decks notice:', e);
  }

  if (hasRepairs) {
    recomputeStatsFromMap(lang);
    persistMatrixToStorage(lang);
    notifyListeners(lang);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('stats-update', { detail: { language: lang } }));
    }
  }
}

function areMatrixStatsEqual(a: CEFRMatrixStats, b: CEFRMatrixStats): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.totalWords !== b.totalWords || a.activeLevel !== b.activeLevel) return false;
  for (const lvl of CEFR_LEVEL_KEYS) {
    if ((a.counts?.[lvl] ?? 0) !== (b.counts?.[lvl] ?? 0)) return false;
  }
  return true;
}

function areTodayProgressEqual(a: TodayProgress, b: TodayProgress): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.wordsLearnedToday !== b.wordsLearnedToday || a.percentLearnedToday !== b.percentLearnedToday) return false;
  for (const lvl of CEFR_LEVEL_KEYS) {
    if ((a.todayCounts?.[lvl] ?? 0) !== (b.todayCounts?.[lvl] ?? 0)) return false;
  }
  return true;
}

/**
 * React-хук для отображения матрицы Wortschatz-Matrix и суточного прогресса.
 */
export function useWortschatzMatrix(langParam?: string | AppLang) {
  const normLang = normalizeLanguageCode(langParam);

  const [stats, setStats] = useState<CEFRMatrixStats>(() => {
    initMatrixStore(normLang);
    return { ...globalMatrixStatsByLang[normLang] };
  });

  const [masteredWordsCount, setMasteredWordsCount] = useState<number | null>(() => {
    return getCachedMasteredWordsCount();
  });

  const [todayProgress, setTodayProgress] = useState<TodayProgress>(() => {
    return getWordsLearnedToday(normLang);
  });

  useEffect(() => {
    initMatrixStore(normLang);
    purgeJunkExportierenWord().catch(() => {});

    const applyLatestStats = () => {
      const nextStats = { ...globalMatrixStatsByLang[normLang] };
      setStats((prev) => (areMatrixStatsEqual(prev, nextStats) ? prev : nextStats));
      const nextProgress = getWordsLearnedToday(normLang);
      setTodayProgress((prev) => (areTodayProgressEqual(prev, nextProgress) ? prev : nextProgress));
      const cachedCount = getCachedMasteredWordsCount();
      if (cachedCount !== null) {
        setMasteredWordsCount((prev) => (prev === cachedCount ? prev : cachedCount));
      }
    };

    repairInflatedMasteredTimestamps(normLang)
      .then(() => {
        applyLatestStats();
      })
      .catch(() => {});
    applyLatestStats();

    // Единый источник истины из Supabase (user_mastered_words) на старте на всех устройствах
    fetchMasteredWordsCountFromCloud().catch(() => {});

    // Гарантированно синхронизируем выученные слова из облака на старте (Chrome, Safari, Mobile)
    if (!hasAttemptedCloudSyncByLang[normLang]) {
      syncMasteredWordsFromCloud(normLang);
    }

    const handleUpdate = (changedLang: AppLang, updated: CEFRMatrixStats) => {
      if (changedLang === normLang) {
        const nextStats = { ...updated };
        setStats((prev) => (areMatrixStatsEqual(prev, nextStats) ? prev : nextStats));
        const nextProgress = getWordsLearnedToday(normLang);
        setTodayProgress((prev) => (areTodayProgressEqual(prev, nextProgress) ? prev : nextProgress));
      }
    };

    const handleCountUpdate = (nextCount: number | null) => {
      if (nextCount !== null) {
        setMasteredWordsCount((prev) => (prev === nextCount ? prev : nextCount));
      }
    };

    listeners.add(handleUpdate);
    countListeners.add(handleCountUpdate);

    const handleRefreshDaily = () => {
      applyLatestStats();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('stats-update', handleRefreshDaily);
      window.addEventListener('storage', handleRefreshDaily);
      window.addEventListener('storage-update', handleRefreshDaily);
    }

    let visibilityDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (visibilityDebounceTimer) clearTimeout(visibilityDebounceTimer);
        visibilityDebounceTimer = setTimeout(() => {
          fetchMasteredWordsCountFromCloud().catch(() => {});
          const nextProgress = getWordsLearnedToday(normLang);
          setTodayProgress((prev) => (areTodayProgressEqual(prev, nextProgress) ? prev : nextProgress));
        }, 2000);
      }
    };

    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      if (visibilityDebounceTimer) clearTimeout(visibilityDebounceTimer);
      listeners.delete(handleUpdate);
      countListeners.delete(handleCountUpdate);
      if (typeof window !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('stats-update', handleRefreshDaily);
        window.removeEventListener('storage', handleRefreshDaily);
        window.removeEventListener('storage-update', handleRefreshDaily);
      }
    };
  }, [normLang]);

  const totalGoal = C1_TARGET_WORDS[normLang] || 10000;
  const wordLabel = WORD_LABELS_BY_LANG[normLang] || 'Wörter';

  const refreshMatrix = useCallback(async () => {
    await repairInflatedMasteredTimestamps(normLang);
    await syncMasteredWordsFromCloud(normLang, true);
    await fetchMasteredWordsCountFromCloud();
    const nextProgress = getWordsLearnedToday(normLang);
    setTodayProgress((prev) => (areTodayProgressEqual(prev, nextProgress) ? prev : nextProgress));
  }, [normLang]);

  const totalMasteredWords =
    (stats.counts.A1 || 0) +
    (stats.counts.A2 || 0) +
    (stats.counts.B1 || 0) +
    (stats.counts.B2 || 0) +
    (stats.counts.C1 || 0) +
    ((stats.counts as Record<string, number | undefined>).C2 || 0);

  const resolvedActiveLevel = calculateActiveLevel(stats.counts);

  return {
    counts: stats.counts,
    totalWords: totalMasteredWords,
    masteredWordsCount: totalMasteredWords,
    activeLevel: resolvedActiveLevel,
    currentLanguage: normLang,
    wordLabel,
    totalGoal,
    levels: CEFR_LEVEL_KEYS,
    masteredLemmas: getMasteredLemmasSet(normLang),
    refreshMatrix,
    wordsLearnedToday: todayProgress.wordsLearnedToday,
    percentLearnedToday: todayProgress.percentLearnedToday,
    todayCounts: todayProgress.todayCounts,
  };
}
