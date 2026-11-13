'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase, safeUpsertUserStats, safeFetchUserStats } from '@/lib/supabase';
import {
  normalizeCanonicalLemma,
  normalizeMasteredLemma,
  isExcludedStandaloneLemma,
} from '@/lib/utils/lemmaNormalizer';

export function isCardStrictlyArchived(card: any): boolean {
  return Boolean(card && !card.isDeleted && (card.isArchived === true || card.is_archived === true));
}
import { CEFRLevel, detectWordLevel, parseDeckLevel } from '@/lib/vocabulary/cefrLevelDetector';
import { getIDBItem, setIDBItem } from '@/hooks/useDayStats';

export type AppLang = 'de' | 'en' | 'ru' | 'es';
export type MatrixCEFRLevel = CEFRLevel | 'C2';
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
export const MATRIX_LEVEL_KEYS: MatrixCEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export interface MasteredWordEntry {
  originalWord: string;
  level: MatrixCEFRLevel;
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
  counts: Record<MatrixCEFRLevel, number>;
  totalWords: number;
  activeLevel: MatrixCEFRLevel;
}

export interface TodayProgress {
  wordsLearnedToday: number;
  percentLearnedToday: string;
  todayCounts: Record<MatrixCEFRLevel, number>;
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

  // Исключаем контекстные задания с пропусками или длинные предложения (но не "etw." / "(mit Dat.)")
  if (trimmed.includes('___')) return true;
  if (trimmed.split(/\s+/).length > 6) return true;

  const normalized = normalizeMasteredLemma(trimmed);
  if (!normalized || normalized.length < 2) return true;
  if (isExcludedStandaloneLemma(normalized)) return true;

  if (EXCLUDED_GRAMMAR_FORMS.has(normalized)) return true;
  if (FUNCTIONAL_PARTICLES.has(normalized) || CONJUGATED_VERB_FORMS.has(normalized)) return true;

  const parts = normalized.split(/\s+/);
  if (parts.length === 1 && (EXCLUDED_GRAMMAR_FORMS.has(parts[0]) || FUNCTIONAL_PARTICLES.has(parts[0]))) {
    return true;
  }

  return false;
}

/**
 * Проверяет, относится ли колода, книга или карточка к режиму «Kontext» или грамматике.
 * В Wortschatz-Matrix включаются ТОЛЬКО лексические слова (учебные колоды Wörter и rapid_flashcards).
 * ИСКЛЮЧАЮТСЯ:
 * 1. Карточки/колоды из режима «Kontext» (mode === 'kontext', isContext === true, source === 'context')
 * 2. Грамматические модули и тренажёры (Grammatik-колоды в учебниках, Strukturen & NVV, Starke Verben, Präpositionen, Redemittel)
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

  // 2. Исключаем грамматические модули и тренажёры структур
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
  const deckCategory = (deck?.category || '').toLowerCase();
  const isRapidFlashcardsBook =
    bTrainingMode === 'rapid_flashcards' ||
    parentBook?.category === 'flashcards' ||
    parentBook?.category === 'deck';

  // В учебниках (standard_cloze) колоды вкладки «Grammatik» содержат грамматические упражнения;
  // в rapid_flashcards колонке category исторически стоит дефолт 'Grammatik', хотя внутри лексика.
  if (!isRapidFlashcardsBook && (deckCategory === 'grammatik' || deckCategory === 'grammar')) {
    return true;
  }

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
      deckTitle.includes('karteikarten') ||
      deckCategory.includes('wört')
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
  de: { counts: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 }, totalWords: 0, activeLevel: 'A1' },
  en: { counts: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 }, totalWords: 0, activeLevel: 'A1' },
  ru: { counts: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 }, totalWords: 0, activeLevel: 'A1' },
  es: { counts: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 }, totalWords: 0, activeLevel: 'A1' },
};

const listeners = new Set<(lang: AppLang, stats: CEFRMatrixStats) => void>();
export const MASTERED_SNAPSHOT_KEY = 'kraft_mastered_snapshot_v3';
const LEGACY_MASTERED_SNAPSHOT_KEY_V2 = 'kraft_mastered_snapshot_v2';

export interface MasteredSnapshotPayload {
  total: number;
  byLevel: Record<MatrixCEFRLevel, number>;
  lemmas: string[];
  entries?: Record<string, MasteredWordEntry>;
  updatedAt: number;
}

function getStorageKeys(lang: AppLang) {
  return {
    cacheKeyV4: `wortschatz_matrix_v4_${lang}`,
    legacyCacheKeyV3: `cefr_mastered_cache_v3_${lang}`,
    legacyTimestampsKey: `cefr_mastered_timestamps_${lang}_v3`,
  };
}

/**
 * Единый канонический фильтр валидности освоенного слова для всех слоёв
 * (реконсиляция, матрица, пилюля в шапке и модалка выученных слов).
 */
export function isValidMasteredEntry(
  originalWord: string,
  canonicalKey?: string | null,
  translation?: string | null
): boolean {
  const normKey = canonicalKey || normalizeCanonicalLemma(originalWord || '');
  if (!normKey || normKey.length < 2) return false;
  const lowerOrig = String(originalWord || '').toLowerCase();
  const lowerNorm = normKey.toLowerCase();
  const lowerTrans = String(translation || '').toLowerCase();
  if (
    lowerOrig.includes('exportieren') ||
    lowerNorm.includes('exportieren') ||
    lowerTrans.includes('деяние')
  ) {
    return false;
  }
  if (
    isExcludedStandaloneLemma(normKey) ||
    isFunctionalParticle(originalWord) ||
    isFunctionalParticle(normKey)
  ) {
    return false;
  }
  return true;
}

export async function fetchAllRowsPaginated<T = any>(
  queryBuilderFactory: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize: number = 1000
): Promise<{ rows: T[]; error: any }> {
  let from = 0;
  const allRows: T[] = [];
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await queryBuilderFactory(from, to);
    if (error) {
      return { rows: allRows, error };
    }
    if (!Array.isArray(data) || data.length === 0) {
      break;
    }
    allRows.push(...data);
    if (data.length < pageSize) {
      break;
    }
    from += pageSize;
  }
  return { rows: allRows, error: null };
}

function createEmptyLevelCounts(): Record<MatrixCEFRLevel, number> {
  return { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
}

function resolveMasteredLevel(
  lemma: string,
  deckLevel?: string | null,
  cardLevel?: string | null,
  lang: AppLang = 'de'
): MatrixCEFRLevel {
  if (cardLevel && cardLevel.toUpperCase().trim() === 'C2') {
    return 'C2';
  }
  if (deckLevel) {
    const upper = deckLevel.toUpperCase().trim();
    if (upper === 'C2' || /(?:^|[^A-Z0-9])C2(?:[^A-Z0-9]|$)/.test(upper)) {
      if (!upper.includes('C1')) return 'C2';
    }
  }
  const hasExplicitDeckLevel = Boolean(deckLevel && parseDeckLevel(deckLevel));
  const hasExplicitCardLevel = Boolean(cardLevel && ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(cardLevel.toUpperCase().trim()));
  const detected = detectWordLevel(lemma, deckLevel, cardLevel, lang);
  if (hasExplicitCardLevel || hasExplicitDeckLevel) {
    return detected;
  }
  // Для слов без явного контекста колоды/карточки используем детектор или дефолт B1
  return detected || 'B1';
}

function notifyListeners(lang: AppLang) {
  const currentStats: CEFRMatrixStats = {
    counts: { ...globalMatrixStatsByLang[lang].counts },
    totalWords: globalMatrixStatsByLang[lang].totalWords,
    activeLevel: globalMatrixStatsByLang[lang].activeLevel,
  };
  listeners.forEach((listener) => listener(lang, currentStats));
}

export interface VocabCefrEvaluation {
  currentLevel: MatrixCEFRLevel;
  nextLevel: MatrixCEFRLevel | null;
  weightedScore: number;
  wordsToNextLevel: number;
  progressToNextPercent: number;
}

export function evaluateVocabCefrLevel(countsByLevel: Record<string, number> = {}): VocabCefrEvaluation {
  const a1 = countsByLevel.A1 || 0;
  const a2 = countsByLevel.A2 || 0;
  const b1 = countsByLevel.B1 || 0;
  const b2 = countsByLevel.B2 || 0;
  const c1 = countsByLevel.C1 || 0;
  const c2 = countsByLevel.C2 || 0;

  // Взвешенный балл (сложные слова дают умеренный бонус без искусственной инфляции):
  const weightedScore = Math.round(
    a1 * 1.0 +
    a2 * 1.1 +
    b1 * 1.25 +
    b2 * 1.5 +
    c1 * 1.8 +
    c2 * 2.0
  );

  // Реалистичные пороги CEFR (под общую шкалу 10.000 слов) + защита от перескока без базы нужного уровня:
  const levels = [
    { level: 'A1' as const, minScore: 0,    next: 'A2' as const, nextScore: 600,   hasRequiredWords: true },
    { level: 'A2' as const, minScore: 600,  next: 'B1' as const, nextScore: 1500,  hasRequiredWords: true },
    { level: 'B1' as const, minScore: 1500, next: 'B2' as const, nextScore: 3000,  hasRequiredWords: (b1 + b2 + c1 + c2) >= 400 },
    { level: 'B2' as const, minScore: 3000, next: 'C1' as const, nextScore: 5200,  hasRequiredWords: (b2 + c1 + c2) >= 500 },
    { level: 'C1' as const, minScore: 5200, next: 'C2' as const, nextScore: 8000,  hasRequiredWords: (c1 + c2) >= 400 },
    { level: 'C2' as const, minScore: 8000, next: null,          nextScore: 10000, hasRequiredWords: c2 >= 300 },
  ];

  // Находим наивысший достигнутый уровень, для которого хватает и баллов, и профильных слов:
  let currentIndex = 0;
  for (let i = 0; i < levels.length; i++) {
    if (weightedScore >= levels[i].minScore && levels[i].hasRequiredWords) {
      currentIndex = i;
    } else {
      break;
    }
  }

  const current = levels[currentIndex];
  const wordsToNextLevel = current.next ? Math.max(0, current.nextScore - weightedScore) : 0;
  const progressToNextPercent = current.next
    ? Math.max(0, Math.min(100, Math.round(((weightedScore - current.minScore) / (current.nextScore - current.minScore)) * 100)))
    : 100;

  return {
    currentLevel: current.level,
    nextLevel: current.next,
    weightedScore,
    wordsToNextLevel,
    progressToNextPercent,
  };
}

function calculateActiveLevel(counts: Record<MatrixCEFRLevel, number>): MatrixCEFRLevel {
  return evaluateVocabCefrLevel(counts).currentLevel;
}

function dispatchMasteredUpdatedEvent(lang: AppLang, source: string) {
  if (typeof window === 'undefined') return;
  const total = globalMatrixStatsByLang[lang]?.totalWords ?? uniqueMasteredWordsByLang[lang].size;
  window.dispatchEvent(
    new CustomEvent('kraft:mastered-updated', {
      detail: { language: lang, total, source },
    })
  );
  window.dispatchEvent(new CustomEvent('stats-update', { detail: { language: lang, total } }));
}

function recomputeStatsFromMap(lang: AppLang): CEFRMatrixStats {
  const map = uniqueMasteredWordsByLang[lang];

  // Очистка стоп-слов / грамматических частиц и мусорных записей по единому правилу
  for (const [k, v] of Array.from(map.entries())) {
    if (!isValidMasteredEntry(v.originalWord, k, v.translation)) {
      map.delete(k);
    }
  }

  const counts = createEmptyLevelCounts();

  map.forEach((entry) => {
    const lvl: MatrixCEFRLevel = MATRIX_LEVEL_KEYS.includes(entry.level) ? entry.level : 'B1';
    counts[lvl] = (counts[lvl] || 0) + 1;
  });

  // Инвариант: totalWords === размер уникального Set лемм === сумма A1 + A2 + B1 + B2 + C1 + C2
  const totalWords =
    (counts.A1 || 0) +
    (counts.A2 || 0) +
    (counts.B1 || 0) +
    (counts.B2 || 0) +
    (counts.C1 || 0) +
    (counts.C2 || 0);
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
    const map = uniqueMasteredWordsByLang[lang];
    const entriesObj: Record<string, MasteredWordEntry> = {};
    const lemmas: string[] = [];
    map.forEach((val, key) => {
      entriesObj[key] = val;
      lemmas.push(key);
    });
    const stats = globalMatrixStatsByLang[lang];
    const nowTs = Date.now();

    // Сохраняем единый актуальный снимок ТОЛЬКО в kraft_mastered_snapshot_v3 (для 0ms гидрации; перезаписывается ответом сервера)
    let snapshotAll: Record<string, MasteredSnapshotPayload> = {};
    try {
      const existingRaw = localStorage.getItem(MASTERED_SNAPSHOT_KEY);
      if (existingRaw) {
        const parsed = JSON.parse(existingRaw);
        if (parsed && typeof parsed === 'object') snapshotAll = parsed;
      }
    } catch {}

    snapshotAll[lang] = {
      total: stats.totalWords,
      byLevel: { ...stats.counts },
      lemmas,
      entries: entriesObj,
      updatedAt: nowTs,
    };
    localStorage.setItem(MASTERED_SNAPSHOT_KEY, JSON.stringify(snapshotAll));

    // Очищаем устаревшие legacy-ключи старых версий (v2 / v4), чтобы не возникало рассинхрона
    try {
      localStorage.removeItem(LEGACY_MASTERED_SNAPSHOT_KEY_V2);
      localStorage.removeItem(cacheKeyV4);
    } catch {}
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

const inFlightSyncPromiseByLang: Record<AppLang, Promise<void> | null> = {
  de: null,
  en: null,
  ru: null,
  es: null,
};

const masteredSnapshotTimerByLang: Record<string, ReturnType<typeof setTimeout> | null> = {};
const MASTERED_SNAPSHOT_DEBOUNCE_MS = 30 * 1000; // 30s batch debounce for MASTERED_WORDS_* snapshot writes

export async function syncMasteredUserStatsSnapshot(
  lang: AppLang,
  statsRowKey?: string
): Promise<void> {
  const rowKey = statsRowKey || `MASTERED_WORDS_${lang.toUpperCase()}`;
  const map = uniqueMasteredWordsByLang[lang];

  // Clear pending debounce timer when executing an immediate flush
  if (!statsRowKey && masteredSnapshotTimerByLang[lang]) {
    clearTimeout(masteredSnapshotTimerByLang[lang]!);
    masteredSnapshotTimerByLang[lang] = null;
  }

  const counts = globalMatrixStatsByLang[lang]?.counts || createEmptyLevelCounts();
  const lemmas = Array.from(map.keys());
  const lemmaLevels: Record<string, MatrixCEFRLevel> = {};
  const lemmaDates: Record<string, string> = {};
  map.forEach((entry, key) => {
    lemmaLevels[key] = entry.level;
    if (entry.first_mastered_at) {
      lemmaDates[key] = entry.first_mastered_at;
    }
  });

  await safeUpsertUserStats({
    language: rowKey,
    daily_activity: {
      counts,
      totalWords: map.size,
      lemmas,
      words: lemmas,
      lemmaLevels,
      lemmaDates,
      updatedAt: Date.now(),
    },
  }).catch(() => undefined);
}

export function scheduleMasteredSnapshotSync(lang: AppLang): void {
  if (typeof window === 'undefined') return;
  if (masteredSnapshotTimerByLang[lang]) {
    clearTimeout(masteredSnapshotTimerByLang[lang]!);
  }
  masteredSnapshotTimerByLang[lang] = setTimeout(() => {
    masteredSnapshotTimerByLang[lang] = null;
    syncMasteredUserStatsSnapshot(lang).catch(() => {});
  }, MASTERED_SNAPSHOT_DEBOUNCE_MS);
}

export function flushPendingMasteredSnapshots(): void {
  (['de', 'en', 'ru'] as AppLang[]).forEach((lang) => {
    if (masteredSnapshotTimerByLang[lang]) {
      clearTimeout(masteredSnapshotTimerByLang[lang]!);
      masteredSnapshotTimerByLang[lang] = null;
      syncMasteredUserStatsSnapshot(lang).catch(() => {});
    }
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    flushPendingMasteredSnapshots();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushPendingMasteredSnapshots();
    }
  });
}

function hydrateEntriesIntoMap(
  lang: AppLang,
  entriesObj: Record<string, any>,
  legacyTimestamps: Record<string, number>
) {
  const map = uniqueMasteredWordsByLang[lang];
  Object.entries(entriesObj).forEach(([key, val]: [string, any]) => {
    const raw = val?.originalWord || key || '';
    const normKey = normalizeCanonicalLemma(raw) || normalizeCanonicalLemma(key);
    if (!isValidMasteredEntry(raw, normKey, val?.translation)) return;

    const level = resolveMasteredLevel(normKey, null, val?.level, lang);
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
      const earliestTs =
        masteredAt > 0 && existing.masteredAt > 0
          ? Math.min(masteredAt, existing.masteredAt)
          : existing.masteredAt || masteredAt;

      map.set(normKey, {
        originalWord: val?.originalWord || existing.originalWord || normKey,
        level: val?.level ? level : existing.level,
        masteredAt: earliestTs,
        first_mastered_at: existing.first_mastered_at || first_mastered_at,
        created_at: existing.created_at || created_at,
        bookId: val?.bookId || existing.bookId,
        translation: val?.translation || existing.translation,
        cardId: val?.cardId || existing.cardId,
        nextReviewDate: val?.nextReviewDate || existing.nextReviewDate,
        sentence: val?.sentence || existing.sentence,
        sentenceTranslation: val?.sentenceTranslation || existing.sentenceTranslation,
      });
    }
  });
}

function initMatrixStore(lang: AppLang) {
  if (typeof window === 'undefined') return;
  if (isInitializedByLang[lang]) return;
  isInitializedByLang[lang] = true;

  const { cacheKeyV4, legacyTimestampsKey } = getStorageKeys(lang);

  try {
    // Удаляем устаревшие версии кэша (v2 / v4), чтобы устаревшие браузерные данные не просачивались в состояние
    try {
      localStorage.removeItem(LEGACY_MASTERED_SNAPSHOT_KEY_V2);
      localStorage.removeItem(cacheKeyV4);
    } catch {}

    const legacyTimestamps: Record<string, number> = {};
    try {
      const rawLegacyTs = localStorage.getItem(legacyTimestampsKey);
      if (rawLegacyTs) {
        const parsedTs = JSON.parse(rawLegacyTs);
        if (parsedTs && typeof parsedTs === 'object') {
          Object.entries(parsedTs).forEach(([k, v]) => {
            const normKey = normalizeCanonicalLemma(k);
            if (normKey && typeof v === 'number' && v > 0) {
              legacyTimestamps[normKey] = v;
            }
          });
        }
      }
    } catch {}

    const map = uniqueMasteredWordsByLang[lang];

    // Быстрая первоначальная гидрация ТОЛЬКО из kraft_mastered_snapshot_v3 (перезаписывается ответом сервера)
    try {
      const rawSnapshot = localStorage.getItem(MASTERED_SNAPSHOT_KEY);
      if (rawSnapshot) {
        const parsedAll = JSON.parse(rawSnapshot);
        const snap: MasteredSnapshotPayload | undefined = parsedAll?.[lang];
        if (snap && typeof snap === 'object') {
          map.clear();
          if (snap.entries && typeof snap.entries === 'object') {
            hydrateEntriesIntoMap(lang, snap.entries, legacyTimestamps);
          } else if (Array.isArray(snap.lemmas)) {
            snap.lemmas.forEach((rawLemma) => {
              const normKey = normalizeCanonicalLemma(rawLemma);
              if (!isValidMasteredEntry(rawLemma, normKey)) return;
              if (!map.has(normKey)) {
                map.set(normKey, {
                  originalWord: normKey,
                  level: resolveMasteredLevel(normKey, null, null, lang),
                  masteredAt: legacyTimestamps[normKey] || 0,
                });
              }
            });
          }
          recomputeStatsFromMap(lang);
        }
      }
    } catch {}
  } catch (e) {
    console.warn('[Wortschatz-Matrix] Hydration notice:', e);
  }
}

// Защита от дублирующегося всплеска событий focus + visibilitychange (без многочасовых блокировок)
let lastRepairTimestampByLang: Record<string, number> = {};
const REPAIR_TIMESTAMPS_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
const SYNC_BURST_DEDUPE_MS = 400;
const LAST_REPAIR_REMOTE_KEY_PREFIX = 'kraft_matrix_repair_remote_at_';

function getPersistedTimestamp(prefix: string, lang: AppLang): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(`${prefix}${lang}`);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function setPersistedTimestamp(prefix: string, lang: AppLang, ts: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${prefix}${lang}`, String(ts));
  } catch {}
}

function isAnyStudySessionActive(): boolean {
  if (typeof window === 'undefined') return false;
  return Number((window as any).__kraftActiveStudyCount || 0) > 0;
}

export interface SyncMasteredOptions {
  fullReconcile?: boolean;
}

function haveMasteredMapsChanged(
  prevMap: Map<string, MasteredWordEntry>,
  nextMap: Map<string, MasteredWordEntry>
): boolean {
  if (prevMap.size !== nextMap.size) return true;
  for (const [k, v] of nextMap.entries()) {
    const prev = prevMap.get(k);
    if (
      !prev ||
      prev.level !== v.level ||
      prev.masteredAt !== v.masteredAt ||
      prev.translation !== v.translation ||
      prev.originalWord !== v.originalWord
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Авторитетная серверная синхронизация ("Server Wins Over Local Cache"):
 * 1. Пагинированно (по 1000 строк) загружает books, decks и ВСЕ архивные cards (isArchived = true).
 * 2. Канонизирует и дедуплицирует леммы через normalizeCanonicalLemma + isValidMasteredEntry.
 * 3. Если есть authUserId — безопасно сверяет и очищает user_mastered_words (удал. лишние, upsert недостающих без .select()).
 * 4. Атомарно перезаписывает память и kraft_mastered_snapshot_v3 (никогда не подтягивает устаревшие слова из localStorage/user_stats).
 */
export async function syncAuthoritativeMasteredWords(
  client: any = supabase,
  userIdParam?: string | null,
  langParam: AppLang = 'de'
): Promise<{ count: number; reconciled: boolean }> {
  const lang = normalizeLanguageCode(langParam);
  initMatrixStore(lang);

  const existingMap = uniqueMasteredWordsByLang[lang];
  const beforeCount = existingMap.size;

  const authUserId =
    userIdParam !== undefined ? userIdParam : await getMatrixAuthUserId().catch(() => null);

  // Метаданные дат исключительно для сохранения раннего first_mastered_at у подтверждённых архивных слов
  const timestampHintByKey = new Map<
    string,
    { level?: string | null; masteredAt: number; first_mastered_at?: string; bookId?: string; created_at?: string }
  >();
  existingMap.forEach((val, oldKey) => {
    const normKey = normalizeCanonicalLemma(val?.originalWord || oldKey);
    if (!normKey) return;
    timestampHintByKey.set(normKey, {
      level: val.level,
      masteredAt: val.masteredAt || 0,
      first_mastered_at: val.first_mastered_at,
      bookId: val.bookId,
      created_at: val.created_at,
    });
  });

  // 1. Если есть authUserId, пагинированно читаем user_mastered_words (с .order('id'))
  const remoteUmwRows: Array<{
    id?: string;
    lemma: string;
    canonicalKey: string;
    cefr_level?: string | null;
    source_book_id?: string | null;
    first_mastered_at?: string;
  }> = [];
  let umwFetchSucceeded = false;

  if (authUserId) {
    const { rows: umwData, error: umwErr } = await fetchAllRowsPaginated<any>(
      (from, to) =>
        client
          .from('user_mastered_words')
          .select('id, lemma, cefr_level, source_book_id, first_mastered_at')
          .eq('user_id', authUserId)
          .order('id', { ascending: true })
          .range(from, to),
      1000
    );

    if (!umwErr) {
      umwFetchSucceeded = true;
      for (const row of umwData) {
        const rawLemma = String(row.lemma || '').trim();
        const key = normalizeCanonicalLemma(rawLemma);
        remoteUmwRows.push({
          id: row.id,
          lemma: rawLemma,
          canonicalKey: key,
          cefr_level: row.cefr_level,
          source_book_id: row.source_book_id,
          first_mastered_at: row.first_mastered_at,
        });
        if (!key || key.length < 2) continue;
        const ts = row.first_mastered_at ? new Date(row.first_mastered_at).getTime() : 0;
        const parsedTs = !isNaN(ts) && ts > 0 ? ts : 0;
        const prev = timestampHintByKey.get(key);
        if (!prev || (parsedTs > 0 && (prev.masteredAt === 0 || parsedTs < prev.masteredAt))) {
          timestampHintByKey.set(key, {
            level: row.cefr_level || prev?.level,
            masteredAt: parsedTs || prev?.masteredAt || 0,
            first_mastered_at: row.first_mastered_at || prev?.first_mastered_at,
            bookId: row.source_book_id || prev?.bookId,
            created_at: prev?.created_at,
          });
        }
      }
    }
  }

  // 2. Пагинированно читаем авторитетный источник истины: books, decks и cards (isArchived = true)
  const [{ rows: bookRows, error: bookErr }, { rows: deckRows, error: deckErr }, { rows: allArchivedCards, error: cardsErr }] =
    await Promise.all([
      fetchAllRowsPaginated<any>(
        (from, to) =>
          client
            .from('books')
            .select('id, language, title, training_mode, category')
            .order('id', { ascending: true })
            .range(from, to),
        1000
      ),
      fetchAllRowsPaginated<any>(
        (from, to) =>
          client
            .from('decks')
            .select('id, name, category, language, level, book_id')
            .order('id', { ascending: true })
            .range(from, to),
        1000
      ),
      fetchAllRowsPaginated<any>(
        (from, to) =>
          client
            .from('cards')
            .select(
              'id, deck_id, targetWord, translation, forms, baseWordInfo, masteryLevel, isArchived, nextReviewDate, interval, repetitions'
            )
            .eq('isArchived', true)
            .order('id', { ascending: true })
            .range(from, to),
        1000
      ),
    ]);

  if (bookErr || deckErr || cardsErr) {
    console.warn('[Wortschatz-Matrix] Authoritative sync skipped due to fetch error:', {
      bookErr: bookErr?.message,
      deckErr: deckErr?.message,
      cardsErr: cardsErr?.message,
    });
    return { count: existingMap.size, reconciled: false };
  }

  const cloudBookMap = new Map<string, any>();
  for (const b of bookRows) {
    if (b?.id) cloudBookMap.set(b.id, b);
  }
  const cloudDeckMap = new Map<string, any>();
  for (const d of deckRows) {
    if (d?.id) cloudDeckMap.set(d.id, d);
  }

  const nextMap = new Map<string, MasteredWordEntry>();
  const mergeAuthoritativeEntry = (normKey: string, incoming: MasteredWordEntry) => {
    const prev = nextMap.get(normKey);
    if (!prev) {
      nextMap.set(normKey, incoming);
      return;
    }
    const earliestTs =
      incoming.masteredAt > 0 && prev.masteredAt > 0
        ? Math.min(incoming.masteredAt, prev.masteredAt)
        : prev.masteredAt || incoming.masteredAt;

    nextMap.set(normKey, {
      ...prev,
      originalWord: incoming.originalWord || prev.originalWord,
      level: incoming.level || prev.level,
      masteredAt: earliestTs,
      first_mastered_at: prev.first_mastered_at || incoming.first_mastered_at,
      created_at: prev.created_at || incoming.created_at,
      bookId: incoming.bookId || prev.bookId,
      translation: incoming.translation || prev.translation,
      cardId: incoming.cardId || prev.cardId,
      nextReviewDate: incoming.nextReviewDate ?? prev.nextReviewDate,
    });
  };

  for (const c of allArchivedCards) {
    if (!isCardStrictlyArchived(c)) continue;
    const deckObj =
      (c.deck_id && cloudDeckMap.get(c.deck_id)) ||
      (Array.isArray(c.decks) ? c.decks[0] : c.decks);
    const parentBook = deckObj?.book_id ? cloudBookMap.get(deckObj.book_id) : undefined;
    const dLang = normalizeLanguageCode(deckObj?.language || parentBook?.language || 'de');
    if (dLang !== lang) continue;
    if (isContextOrGrammarDeck(deckObj, parentBook, c)) continue;

    const rawWord = c.targetWord || c.target_word || '';
    const normalizedKey = normalizeCanonicalLemma(rawWord);
    const conciseTrans = extractConciseTranslation(c);
    const cardTranslation = conciseTrans || c.translation;
    if (!isValidMasteredEntry(rawWord, normalizedKey, cardTranslation)) continue;

    const hint = timestampHintByKey.get(normalizedKey);
    const priorTs = hint?.masteredAt || 0;
    const masteredAt = extractCardMasteredAt(c, priorTs);
    const firstMasteredAt =
      hint?.first_mastered_at ||
      c.first_mastered_at ||
      (masteredAt > 0 ? new Date(masteredAt).toISOString() : undefined);

    const deckLevel =
      deckObj?.level ||
      deckObj?.name ||
      deckObj?.title ||
      parentBook?.title ||
      null;
    const cardLevel = c.level || hint?.level || null;
    const level = resolveMasteredLevel(normalizedKey, deckLevel, cardLevel, lang);
    const cardNextReview = c.nextReviewDate ?? c.next_review_date;

    mergeAuthoritativeEntry(normalizedKey, {
      originalWord: rawWord,
      level,
      masteredAt,
      first_mastered_at: firstMasteredAt,
      created_at: hint?.created_at,
      bookId: deckObj?.book_id || hint?.bookId,
      translation: cardTranslation,
      cardId: c.id,
      nextReviewDate: cardNextReview,
    });
  }

  // 3. Сверка таблицы user_mastered_words ТОЛЬКО если карточки загружены успешно (>= 1 строки) и есть authUserId
  let prunedRemoteCount = 0;
  let addedRemoteCount = 0;
  if (authUserId && lang === 'de' && umwFetchSucceeded && allArchivedCards.length > 0) {
    const keptCanonicalRows = new Set<string>();
    const staleRowIds: string[] = [];
    const staleNonCanonicalLemmas: string[] = [];

    for (const row of remoteUmwRows) {
      const isValidArchivedCanonical =
        Boolean(row.canonicalKey) &&
        row.lemma === row.canonicalKey &&
        nextMap.has(row.canonicalKey) &&
        !keptCanonicalRows.has(row.canonicalKey);

      if (isValidArchivedCanonical) {
        keptCanonicalRows.add(row.canonicalKey);
      } else if (row.id) {
        staleRowIds.push(row.id);
      } else if (row.lemma) {
        staleNonCanonicalLemmas.push(row.lemma);
      }
    }

    const missingRows: Array<{
      user_id: string;
      lemma: string;
      cefr_level: MatrixCEFRLevel;
      source_book_id: string | null;
      first_mastered_at: string;
    }> = [];
    nextMap.forEach((entry, lemma) => {
      if (!keptCanonicalRows.has(lemma)) {
        missingRows.push({
          user_id: authUserId,
          lemma,
          cefr_level: entry.level,
          source_book_id: entry.bookId || null,
          first_mastered_at:
            entry.first_mastered_at ||
            (entry.masteredAt > 0 ? new Date(entry.masteredAt).toISOString() : new Date().toISOString()),
        });
      }
    });

    for (let i = 0; i < staleRowIds.length; i += 200) {
      const chunk = staleRowIds.slice(i, i + 200);
      const { error: delErr } = await client
        .from('user_mastered_words')
        .delete()
        .eq('user_id', authUserId)
        .in('id', chunk);
      if (!delErr) prunedRemoteCount += chunk.length;
    }
    for (let i = 0; i < staleNonCanonicalLemmas.length; i += 100) {
      const chunk = staleNonCanonicalLemmas.slice(i, i + 100);
      const { error: delErr } = await client
        .from('user_mastered_words')
        .delete()
        .eq('user_id', authUserId)
        .in('lemma', chunk);
      if (!delErr) prunedRemoteCount += chunk.length;
    }
    for (let i = 0; i < missingRows.length; i += 200) {
      const chunk = missingRows.slice(i, i + 200);
      const { error: upErr } = await client
        .from('user_mastered_words')
        .upsert(chunk, { onConflict: 'user_id,lemma', ignoreDuplicates: true });
      if (!upErr) addedRemoteCount += chunk.length;
    }
  }

  // 4. Атомарно заменяем локальное состояние и перезаписываем snapshot v3 (Server Wins)
  const hasChanged = haveMasteredMapsChanged(existingMap, nextMap);
  uniqueMasteredWordsByLang[lang] = nextMap;
  hasAttemptedCloudSyncByLang[lang] = true;
  const stats = recomputeStatsFromMap(lang);
  persistMatrixToStorage(lang);

  console.info(
    `📊 [AuthoritativeSync] (${lang}) ArchivedCards=${allArchivedCards.length}, UniqueLemmas=${stats.totalWords} (before=${beforeCount}), umwRows=${remoteUmwRows.length}, pruned=${prunedRemoteCount}, added=${addedRemoteCount}`
  );

  if (hasChanged) {
    notifyListeners(lang);
    dispatchMasteredUpdatedEvent(lang, 'server-sync');
    syncMasteredUserStatsSnapshot(lang).catch(() => {});
  }

  return { count: stats.totalWords, reconciled: true };
}

/**
 * Лёгкий серверный reload при возврате на вкладку (visibilitychange -> visible):
 * если пользователь авторизован и на старте уже выполнена полная сверка — делает один
 * пагинированный запрос к user_mastered_words; в anon-режиме (без сессии Supabase Auth)
 * пересинхронизирует авторитетный архив cards без 5-минутных блокировок.
 */
export async function reloadMasteredWordsLightweight(
  langParam: AppLang = 'de',
  client: any = supabase
): Promise<{ count: number; updated: boolean }> {
  const lang = normalizeLanguageCode(langParam);
  initMatrixStore(lang);

  if (!hasAttemptedCloudSyncByLang[lang]) {
    const res = await syncAuthoritativeMasteredWords(client, undefined, lang);
    return { count: res.count, updated: res.reconciled };
  }

  const authUserId = await getMatrixAuthUserId().catch(() => null);
  if (!authUserId || lang !== 'de') {
    const res = await syncAuthoritativeMasteredWords(client, authUserId, lang);
    return { count: res.count, updated: res.reconciled };
  }

  const { rows: umwRows, error: umwErr } = await fetchAllRowsPaginated<any>(
    (from, to) =>
      client
        .from('user_mastered_words')
        .select('id, lemma, cefr_level, source_book_id, first_mastered_at')
        .eq('user_id', authUserId)
        .order('id', { ascending: true })
        .range(from, to),
    1000
  );

  if (umwErr) {
    return { count: uniqueMasteredWordsByLang[lang].size, updated: false };
  }

  if (umwRows.length === 0) {
    const res = await syncAuthoritativeMasteredWords(client, authUserId, lang);
    return { count: res.count, updated: res.reconciled };
  }

  const existingMap = uniqueMasteredWordsByLang[lang];
  const nextMap = new Map<string, MasteredWordEntry>();

  for (const row of umwRows) {
    const rawLemma = String(row.lemma || '').trim();
    const normKey = normalizeCanonicalLemma(rawLemma);
    if (!isValidMasteredEntry(rawLemma, normKey)) continue;

    const prev = existingMap.get(normKey);
    const ts = row.first_mastered_at ? new Date(row.first_mastered_at).getTime() : 0;
    const parsedTs = !isNaN(ts) && ts > 0 ? ts : prev?.masteredAt || 0;

    nextMap.set(normKey, {
      originalWord: prev?.originalWord || rawLemma,
      level: resolveMasteredLevel(normKey, null, row.cefr_level || prev?.level, lang),
      masteredAt: parsedTs,
      first_mastered_at: row.first_mastered_at || prev?.first_mastered_at,
      created_at: prev?.created_at,
      bookId: row.source_book_id || prev?.bookId,
      translation: prev?.translation,
      cardId: prev?.cardId,
      nextReviewDate: prev?.nextReviewDate,
      sentence: prev?.sentence,
      sentenceTranslation: prev?.sentenceTranslation,
    });
  }

  const hasChanged = haveMasteredMapsChanged(existingMap, nextMap);
  uniqueMasteredWordsByLang[lang] = nextMap;
  const stats = recomputeStatsFromMap(lang);
  persistMatrixToStorage(lang);

  if (hasChanged) {
    notifyListeners(lang);
    dispatchMasteredUpdatedEvent(lang, 'visibility-reload');
  }

  return { count: stats.totalWords, updated: hasChanged };
}

/**
 * Обёртка синхронизации для старта, фокуса вкладки и принудительного обновления:
 * без многочасовых блокировок, только защита от дублирующегося всплеска (< 1.5 сек).
 */
export async function syncMasteredWordsFromCloud(
  lang: AppLang = 'de',
  force: boolean = false,
  options?: SyncMasteredOptions
): Promise<void> {
  initMatrixStore(lang);
  if (inFlightSyncPromiseByLang[lang]) {
    return inFlightSyncPromiseByLang[lang]!;
  }

  const now = Date.now();
  const lastSyncMs = lastCloudSyncByLang[lang] || 0;
  if (!force && !options?.fullReconcile) {
    if (hasAttemptedCloudSyncByLang[lang] && (isAnyStudySessionActive() || now - lastSyncMs < SYNC_BURST_DEDUPE_MS)) {
      return;
    }
  }

  isSyncingByLang[lang] = true;
  lastCloudSyncByLang[lang] = now;

  const runSync = async () => {
    try {
      if (!force && !options?.fullReconcile && hasAttemptedCloudSyncByLang[lang]) {
        await reloadMasteredWordsLightweight(lang);
      } else {
        await syncAuthoritativeMasteredWords(supabase, undefined, lang);
      }
    } catch (err) {
      console.warn('[Wortschatz-Matrix] syncMasteredWordsFromCloud notice:', err);
    } finally {
      isSyncingByLang[lang] = false;
      inFlightSyncPromiseByLang[lang] = null;
    }
  };

  inFlightSyncPromiseByLang[lang] = runSync();
  return inFlightSyncPromiseByLang[lang]!;
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

  const normalizedKey = normalizeCanonicalLemma(rawWord);
  if (!isValidMasteredEntry(rawWord, normalizedKey)) {
    return;
  }

  const resolvedLevel = resolveMasteredLevel(normalizedKey, deckLevel, cardLevel, currentLanguage);
  const map = uniqueMasteredWordsByLang[currentLanguage];
  const existing = map.get(normalizedKey);

  // Если слово уже зарегистрировано:
  if (existing) {
    // Повторение уже изученного слова НИКОГДА не увеличивает счетчик и не перезаписывает дату первого освоения
    if (isReview) {
      return;
    }
    if (!existing.masteredAt || existing.masteredAt <= 0) {
      map.set(normalizedKey, {
        ...existing,
        masteredAt: timestamp,
        first_mastered_at: new Date(timestamp).toISOString(),
      });
      recomputeStatsFromMap(currentLanguage);
      persistMatrixToStorage(currentLanguage);
      notifyListeners(currentLanguage);
      dispatchMasteredUpdatedEvent(currentLanguage, 'record-mastered');
    }
    return;
  }

  // Новое освоенное слово (строго в момент перехода в архив isArchived === true)
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
  dispatchMasteredUpdatedEvent(currentLanguage, 'record-mastered');

  // Отложенная батч-синхронизация снимка MASTERED_WORDS_* (без GET-запросов)
  scheduleMasteredSnapshotSync(currentLanguage);

  // Сохраняем одну новую строку в Supabase user_mastered_words без .select() (0 KB read egress)
  try {
    const userId = await getMatrixAuthUserId();
    if (!userId) return;

    const payload = {
      user_id: userId,
      lemma: normalizedKey,
      cefr_level: resolvedLevel,
      source_book_id: bookId || null,
      first_mastered_at: firstMasteredAt ? new Date(firstMasteredAt).toISOString() : new Date().toISOString(),
    };

    const { error } = await supabase
      .from('user_mastered_words')
      .upsert(payload, { onConflict: 'user_id,lemma', ignoreDuplicates: true });

    if (error) {
      console.error('[CRITICAL user_mastered_words]:', error.message, error.details, payload);
    }
  } catch (err) {
    console.warn('[Wortschatz-Matrix] Remote upsert notice:', err);
  }
}

/**
 * Удаляет слово из матрицы только при явном удалении карточки/словарной записи пользователем.
 * При ошибках на повторении не вызывается (append-only прогресс).
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

  const normalizedKey = normalizeCanonicalLemma(rawWord);
  if (!normalizedKey || normalizedKey.length < 2) return;
  if (isExcludedStandaloneLemma(normalizedKey) || isFunctionalParticle(rawWord) || isFunctionalParticle(normalizedKey)) {
    return;
  }

  const map = uniqueMasteredWordsByLang[currentLanguage];
  if (!map.has(normalizedKey)) return;

  map.delete(normalizedKey);
  recomputeStatsFromMap(currentLanguage);
  persistMatrixToStorage(currentLanguage);
  notifyListeners(currentLanguage);
  dispatchMasteredUpdatedEvent(currentLanguage, 'remove-mastered');

  scheduleMasteredSnapshotSync(currentLanguage);

  try {
    const userId = await getMatrixAuthUserId();
    if (!userId) return;

    await supabase
      .from('user_mastered_words')
      .delete()
      .match({ user_id: userId, lemma: normalizedKey });
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
  return Array.from(uniqueMasteredWordsByLang[normLang].values()).filter((e) =>
    isValidMasteredEntry(e.originalWord, normalizeCanonicalLemma(e.originalWord), e.translation)
  );
}

/**
 * Устаревший локальный backfill отключён для записи в Supabase/состояние:
 * авторитетный список слов всегда загружается с сервера (syncAuthoritativeMasteredWords),
 * чтобы локальный кэш одного браузера никогда не перезаписывал данные других устройств.
 */
export async function autoBackfillMasteredWords(
  _providedDecks?: Array<{ id: string; bookId?: string; level?: string; language?: string; cards?: Array<any> }>,
  _providedBooks?: Array<{ id: string; language?: string; activeLevels?: string[]; title?: string }>,
  targetLangParam?: string | AppLang
): Promise<number> {
  const normLang = normalizeLanguageCode(targetLangParam);
  initMatrixStore(normLang);
  return uniqueMasteredWordsByLang[normLang].size;
}

/**
 * Append-only защита: удалять выученные слова из матрицы из-за неполного списка загруженных
 * колод/книг строго запрещено. Возвращает 0.
 */
export async function purgeOrphanedMasteredWords(
  _currentDecks: Array<{ id: string; cards?: Array<any> }>,
  _currentBooks?: Array<{ id: string; decks?: Array<any> }>,
  _langParam?: string | AppLang
): Promise<number> {
  return 0;
}

/**
 * Одноразовая чистка мусорной записи «exportieren» («деяние») из памяти,
 * Supabase user_mastered_words и IndexedDB app_decks.
 */
export async function purgeJunkExportierenWord(): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      if (localStorage.getItem('kraft_purged_exportieren_v1') === '1') return;
    } catch {}
  }
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

    // Удаление из Supabase user_mastered_words (однократно)
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
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('kraft_purged_exportieren_v1', '1');
      } catch {}
    }
  } catch (err) {
    console.warn('purgeJunkExportierenWord notice:', err);
  }
}

/**
 * Синхронизирует матрицу при явных действиях с колодами (строго append-only).
 */
export async function reconcileMasteredWords(
  _providedDecks?: Array<{ id: string; bookId?: string; level?: string; language?: string; cards?: Array<any> }>,
  targetLangParam?: string | AppLang,
  isExplicitDeletion: boolean = false
) {
  if (!isExplicitDeletion) {
    return;
  }
  await syncMasteredWordsFromCloud(normalizeLanguageCode(targetLangParam), true);
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
  dispatchMasteredUpdatedEvent(normLang, 'remove-cards');

  syncMasteredUserStatsSnapshot(normLang);

  // Удаление из Supabase таблицы user_mastered_words
  try {
    const userId = await getMatrixAuthUserId();
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
  const todayLocalStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayEnd = todayStart + 24 * 60 * 60 * 1000;

  const todayCounts = createEmptyLevelCounts();
  let wordsLearnedToday = 0;

  const map = uniqueMasteredWordsByLang[lang];
  map.forEach((entry) => {
    // Фильтр строго по локальной дате архивации / первого освоения (YYYY-MM-DD):
    const firstMastered = entry.first_mastered_at;
    let isNewlyLearnedToday = false;

    if (firstMastered) {
      try {
        const d = new Date(firstMastered);
        if (!isNaN(d.getTime())) {
          const dLocal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          if (dLocal === todayLocalStr) {
            isNewlyLearnedToday = true;
          }
        }
      } catch {}
    } else if (entry.masteredAt >= todayStart && entry.masteredAt < todayEnd) {
      isNewlyLearnedToday = true;
    }

    if (isNewlyLearnedToday) {
      wordsLearnedToday++;
      const lvl: MatrixCEFRLevel = MATRIX_LEVEL_KEYS.includes(entry.level) ? entry.level : 'B1';
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
export async function repairInflatedMasteredTimestamps(
  lang: AppLang = 'de',
  allowRemote: boolean = false
): Promise<void> {
  initMatrixStore(lang);
  const map = uniqueMasteredWordsByLang[lang];
  if (map.size === 0) return;

  const now = Date.now();
  if (!allowRemote && lastRepairTimestampByLang[lang] && now - lastRepairTimestampByLang[lang] < 5 * 60 * 1000) {
    return;
  }
  lastRepairTimestampByLang[lang] = now;

  const nowDate = new Date();
  const todayStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
  let hasRepairs = false;

  // 1. Supabase user_mastered_words query only once per 24h or on explicit manual refresh (0 KB on F5/focus!)
  const lastRemoteRepairMs = getPersistedTimestamp(LAST_REPAIR_REMOTE_KEY_PREFIX, lang);
  if (allowRemote || (lastRemoteRepairMs > 0 && now - lastRemoteRepairMs >= REPAIR_TIMESTAMPS_COOLDOWN_MS)) {
    try {
      const userId = await getMatrixAuthUserId();
      if (userId) {
        const { data: remoteRows } = await supabase
          .from('user_mastered_words')
          .select('lemma, first_mastered_at')
          .eq('user_id', userId);

        if (Array.isArray(remoteRows)) {
          for (const row of remoteRows) {
            const key = normalizeMasteredLemma(row.lemma || '');
            const entry = map.get(key);
            if (entry && row.first_mastered_at) {
              const remoteTs = new Date(row.first_mastered_at).getTime();
              if (!isNaN(remoteTs) && remoteTs > 0) {
                if (remoteTs < todayStart && entry.masteredAt >= todayStart) {
                  entry.masteredAt = remoteTs;
                  entry.first_mastered_at = row.first_mastered_at;
                  hasRepairs = true;
                } else if (!entry.first_mastered_at) {
                  entry.first_mastered_at = row.first_mastered_at;
                }
              }
            }
          }
        }
        setPersistedTimestamp(LAST_REPAIR_REMOTE_KEY_PREFIX, lang, Date.now());
      }
    } catch (e) {
      console.warn('[Wortschatz-Matrix] Repair Supabase notice:', e);
    }
  } else if (lastRemoteRepairMs === 0) {
    // Baseline marker on already-initialized cache so next full check happens in 24h
    setPersistedTimestamp(LAST_REPAIR_REMOTE_KEY_PREFIX, lang, now);
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
          const normKey = normalizeMasteredLemma(rawWord);
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
  for (const lvl of MATRIX_LEVEL_KEYS) {
    if ((a.counts?.[lvl] ?? 0) !== (b.counts?.[lvl] ?? 0)) return false;
  }
  return true;
}

function areTodayProgressEqual(a: TodayProgress, b: TodayProgress): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.wordsLearnedToday !== b.wordsLearnedToday || a.percentLearnedToday !== b.percentLearnedToday) return false;
  for (const lvl of MATRIX_LEVEL_KEYS) {
    if ((a.todayCounts?.[lvl] ?? 0) !== (b.todayCounts?.[lvl] ?? 0)) return false;
  }
  return true;
}

/**
 * React-хук для отображения матрицы Wortschatz-Matrix и суточного прогресса.
 * Единый источник истины: totalMasteredCount === uniqueLemmas.size === сумма A1..C2.
 */
export function useWortschatzMatrix(langParam?: string | AppLang) {
  const normLang = normalizeLanguageCode(langParam);

  const [stats, setStats] = useState<CEFRMatrixStats>(() => {
    initMatrixStore(normLang);
    return { ...globalMatrixStatsByLang[normLang], counts: { ...globalMatrixStatsByLang[normLang].counts } };
  });

  const [todayProgress, setTodayProgress] = useState<TodayProgress>(() => {
    return getWordsLearnedToday(normLang);
  });

  const [masteredEntries, setMasteredEntries] = useState<MasteredWordEntry[]>(() => {
    initMatrixStore(normLang);
    return getMasteredWordEntries(normLang);
  });

  useEffect(() => {
    initMatrixStore(normLang);
    purgeJunkExportierenWord().catch(() => {});

    const applyLatestStats = () => {
      const nextStats: CEFRMatrixStats = {
        ...globalMatrixStatsByLang[normLang],
        counts: { ...globalMatrixStatsByLang[normLang].counts },
      };
      setStats((prev) => (areMatrixStatsEqual(prev, nextStats) ? prev : nextStats));
      const nextProgress = getWordsLearnedToday(normLang);
      setTodayProgress((prev) => (areTodayProgressEqual(prev, nextProgress) ? prev : nextProgress));
      setMasteredEntries(getMasteredWordEntries(normLang));
    };

    repairInflatedMasteredTimestamps(normLang)
      .then(() => {
        applyLatestStats();
      })
      .catch(() => {});
    applyLatestStats();

    // Авторитетная серверная синхронизация на старте (без устаревших кэш-блокировок)
    if (!hasAttemptedCloudSyncByLang[normLang]) {
      syncMasteredWordsFromCloud(normLang, true);
    }

    const handleUpdate = (changedLang: AppLang, updated: CEFRMatrixStats) => {
      if (changedLang === normLang) {
        const nextStats: CEFRMatrixStats = {
          ...updated,
          counts: { ...updated.counts },
        };
        setStats((prev) => (areMatrixStatsEqual(prev, nextStats) ? prev : nextStats));
        const nextProgress = getWordsLearnedToday(normLang);
        setTodayProgress((prev) => (areTodayProgressEqual(prev, nextProgress) ? prev : nextProgress));
        setMasteredEntries(getMasteredWordEntries(normLang));
      }
    };

    listeners.add(handleUpdate);

    const handleRefreshDaily = () => {
      applyLatestStats();
    };

    const handleStorageEvent = (e: StorageEvent) => {
      if (!e.key || e.key === MASTERED_SNAPSHOT_KEY) {
        isInitializedByLang[normLang] = false;
        initMatrixStore(normLang);
        applyLatestStats();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('kraft:mastered-updated', handleRefreshDaily);
      window.addEventListener('stats-update', handleRefreshDaily);
      window.addEventListener('storage', handleStorageEvent);
      window.addEventListener('storage-update', handleRefreshDaily);
    }

    let focusSyncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const triggerCloudSyncDebounced = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (isAnyStudySessionActive()) return;
      if (focusSyncDebounceTimer) clearTimeout(focusSyncDebounceTimer);
      focusSyncDebounceTimer = setTimeout(() => {
        if (isAnyStudySessionActive()) return;
        syncMasteredWordsFromCloud(normLang, false).catch(() => {});
      }, 300);
    };

    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', triggerCloudSyncDebounced);
      window.addEventListener('focus', triggerCloudSyncDebounced);
    }

    return () => {
      if (focusSyncDebounceTimer) clearTimeout(focusSyncDebounceTimer);
      listeners.delete(handleUpdate);
      if (typeof window !== 'undefined') {
        document.removeEventListener('visibilitychange', triggerCloudSyncDebounced);
        window.removeEventListener('focus', triggerCloudSyncDebounced);
        window.removeEventListener('kraft:mastered-updated', handleRefreshDaily);
        window.removeEventListener('stats-update', handleRefreshDaily);
        window.removeEventListener('storage', handleStorageEvent);
        window.removeEventListener('storage-update', handleRefreshDaily);
      }
    };
  }, [normLang]);

  const totalGoal = C1_TARGET_WORDS[normLang] || 10000;
  const wordLabel = WORD_LABELS_BY_LANG[normLang] || 'Wörter';

  const refreshMatrix = useCallback(async () => {
    await repairInflatedMasteredTimestamps(normLang, true);
    await syncMasteredWordsFromCloud(normLang, true, { fullReconcile: true });
    const nextProgress = getWordsLearnedToday(normLang);
    setTodayProgress((prev) => (areTodayProgressEqual(prev, nextProgress) ? prev : nextProgress));
    setMasteredEntries(getMasteredWordEntries(normLang));
  }, [normLang]);

  // Единый инвариант: totalMasteredCount === сумма A1 + A2 + B1 + B2 + C1 + C2 === uniqueLemmas.size === masteredEntries.length
  const totalMasteredCount =
    (stats.counts.A1 || 0) +
    (stats.counts.A2 || 0) +
    (stats.counts.B1 || 0) +
    (stats.counts.B2 || 0) +
    (stats.counts.C1 || 0) +
    (stats.counts.C2 || 0);

  const vocabEvaluation = evaluateVocabCefrLevel(stats.counts);

  return {
    counts: stats.counts,
    totalMasteredCount,
    totalWords: totalMasteredCount,
    masteredWordsCount: totalMasteredCount,
    activeLevel: vocabEvaluation.currentLevel,
    vocabEvaluation,
    currentLanguage: normLang,
    wordLabel,
    totalGoal,
    levels: CEFR_LEVEL_KEYS,
    masteredLemmas: getMasteredLemmasSet(normLang),
    masteredEntries,
    refreshMatrix,
    wordsLearnedToday: todayProgress.wordsLearnedToday,
    percentLearnedToday: todayProgress.percentLearnedToday,
    todayCounts: todayProgress.todayCounts,
  };
}
