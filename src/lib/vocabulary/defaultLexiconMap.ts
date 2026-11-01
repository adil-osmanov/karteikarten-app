import lexiconDataRaw from './lexiconData.json';

export type AppLang = 'de' | 'en' | 'ru';
export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';

export interface CEFRLevelConfig {
  key: CEFRLevel;
  target: number;
}

export const LANGUAGE_CEFR_CONFIG: Record<AppLang, {
  totalGoal: number;
  wordLabel: string;
  levels: CEFRLevelConfig[];
}> = {
  de: {
    totalGoal: 15000,
    wordLabel: 'Wörter',
    levels: [
      { key: 'A1', target: 1100 },
      { key: 'A2', target: 1500 },
      { key: 'B1', target: 2600 },
      { key: 'B2', target: 4800 },
      { key: 'C1', target: 5000 },
    ]
  },
  en: {
    totalGoal: 14000,
    wordLabel: 'Words',
    levels: [
      { key: 'A1', target: 1000 }, // Oxford 3000 / CEFR English Profile
      { key: 'A2', target: 1500 },
      { key: 'B1', target: 2500 },
      { key: 'B2', target: 4500 },
      { key: 'C1', target: 4500 },
    ]
  },
  ru: {
    totalGoal: 14000,
    wordLabel: 'Слов',
    levels: [
      { key: 'A1', target: 1000 }, // Лексический минимум ТРКИ (Элементарный)
      { key: 'A2', target: 1500 }, // ТРКИ (Базовый)
      { key: 'B1', target: 2500 }, // ТРКИ-1
      { key: 'B2', target: 4500 }, // ТРКИ-2
      { key: 'C1', target: 4500 }, // ТРКИ-3
    ]
  }
};

export const CEFR_TARGETS = {
  A1: { target: 1100, cumulative: 1100, label: 'A1 • Grundlagen' },
  A2: { target: 1500, cumulative: 2600, label: 'A2 • Alltag' },
  B1: { target: 2600, cumulative: 5200, label: 'B1 • Selbstständig' },
  B2: { target: 4800, cumulative: 10000, label: 'B2 • Beruf & Fach' },
  C1: { target: 5000, cumulative: 15000, label: 'C1 • Fließend' },
} as const;

export const TOTAL_WORLD_LEXICON_GOAL = 15000;

export const CEFR_LEVEL_COLORS: Record<CEFRLevel, {
  badge: string;
  bar: string;
  glow: string;
  text: string;
}> = {
  A1: {
    badge: 'bg-zinc-150 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-black/5 dark:border-white/5',
    bar: 'bg-blue-500',
    glow: 'rgba(59, 130, 246, 0.4)',
    text: 'text-zinc-600 dark:text-zinc-400',
  },
  A2: {
    badge: 'bg-zinc-150 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-black/5 dark:border-white/5',
    bar: 'bg-blue-500',
    glow: 'rgba(59, 130, 246, 0.4)',
    text: 'text-zinc-600 dark:text-zinc-400',
  },
  B1: {
    badge: 'bg-zinc-150 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-black/5 dark:border-white/5',
    bar: 'bg-blue-500',
    glow: 'rgba(59, 130, 246, 0.4)',
    text: 'text-zinc-600 dark:text-zinc-400',
  },
  B2: {
    badge: 'bg-zinc-150 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-black/5 dark:border-white/5',
    bar: 'bg-blue-500',
    glow: 'rgba(59, 130, 246, 0.4)',
    text: 'text-zinc-600 dark:text-zinc-400',
  },
  C1: {
    badge: 'bg-zinc-150 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-black/5 dark:border-white/5',
    bar: 'bg-blue-500',
    glow: 'rgba(59, 130, 246, 0.4)',
    text: 'text-zinc-600 dark:text-zinc-400',
  },
};

export const RAW_LEXICON_DATA = lexiconDataRaw as unknown as Record<AppLang, Record<CEFRLevel, string[]>>;

/**
 * Returns canonical array of words of a given level for the given language.
 * Guarantees length === target.
 */
export function getCanonicalLevelWords(lang: AppLang, level: CEFRLevel): string[] {
  const normLang = normalizeLanguageCode(lang);
  return RAW_LEXICON_DATA[normLang]?.[level] || [];
}

/**
 * Fast in-memory lookup cache: globalLexiconCache[lang][lemma] => CEFRLevel
 */
export const GLOBAL_LEXICON_CACHE: Record<AppLang, Record<string, CEFRLevel>> = {
  de: {},
  en: {},
  ru: {},
};

// Build index once
(['de', 'en', 'ru'] as AppLang[]).forEach((l) => {
  const levels = ['A1', 'A2', 'B1', 'B2', 'C1'] as CEFRLevel[];
  levels.forEach((lvl) => {
    const words = RAW_LEXICON_DATA[l]?.[lvl] || [];
    words.forEach((w) => {
      const lower = w.trim().toLowerCase();
      if (lower) {
        GLOBAL_LEXICON_CACHE[l][lower] = lvl;
      }
    });
  });
});

/**
 * Normalizes any language string ('DE', 'de', 'EN', 'ru', undefined) to AppLang ('de' | 'en' | 'ru')
 */
export function normalizeLanguageCode(lang?: string | null): AppLang {
  const clean = (lang || 'de').trim().toLowerCase();
  if (clean === 'en') return 'en';
  if (clean === 'ru') return 'ru';
  return 'de';
}

/**
 * Curated reference map for backwards compatibility
 */
export const DEFAULT_LEXICON_MAP: Record<string, CEFRLevel> = GLOBAL_LEXICON_CACHE.de;

/**
 * Determines the CEFR level for a given lemma.
 * 1. Checks official global lexicon for the active language.
 * 2. If missing, falls back to parsed book level or 'B2'.
 */
export function resolveCEFRLevel(
  lemma: string,
  fallbackLevel?: string | null,
  lang: AppLang | string = 'de'
): CEFRLevel {
  const clean = (lemma || '').toLowerCase().trim();
  const normLang = normalizeLanguageCode(lang);

  // 1. Official Global Lexicon Lookup first
  const official = GLOBAL_LEXICON_CACHE[normLang]?.[clean];
  if (official) {
    return official;
  }

  // 2. Parse fallback level string (e.g. 'B1/B2', 'A1', 'B2', 'C1-C2')
  if (fallbackLevel) {
    const upper = fallbackLevel.toUpperCase();
    if (upper.includes('C1') || upper.includes('C2')) return 'C1';
    if (upper.includes('B2')) return 'B2';
    if (upper.includes('B1')) return 'B1';
    if (upper.includes('A2')) return 'A2';
    if (upper.includes('A1')) return 'A1';
  }

  // 3. Fallback heuristic
  if (normLang === 'de' && clean.length >= 12) return 'B2';
  return 'B2';
}
