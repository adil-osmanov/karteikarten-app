import { normalizeCanonicalLemma } from '@/lib/utils/lemmaNormalizer';

export type WordTier = 'basis' | 'gefestigt' | 'sicher' | 'episch' | 'legendaer';

export interface WordEvolutionRankMeta {
  id: WordTier;
  stufe: string;
  label: string;
  inspectorLabel: string;
  filterTitle: string;
  dotClass: string;
  inspectorTextClass: string;
  segmentClass: string;
  tileClass: string;
}

export const WORD_EVOLUTION_RANKS: WordEvolutionRankMeta[] = [
  {
    id: 'basis',
    stufe: 'Stufe I',
    label: 'Basis',
    inspectorLabel: 'Basis (< 3 Tage)',
    filterTitle: 'Stufe I · Basis (< 3 Tage)',
    dotClass: 'bg-neutral-500',
    inspectorTextClass: 'text-neutral-400',
    segmentClass: 'bg-neutral-500',
    tileClass:
      'bg-[#111114] border border-white/[0.06] hover:border-white/[0.16] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]',
  },
  {
    id: 'gefestigt',
    stufe: 'Stufe II',
    label: 'Gefestigt',
    inspectorLabel: 'Gefestigt (3+ Tage)',
    filterTitle: 'Stufe II · Gefestigt (3+ Tage)',
    dotClass: 'bg-emerald-400',
    inspectorTextClass: 'text-emerald-400',
    segmentClass: 'bg-emerald-400',
    tileClass:
      'bg-gradient-to-b from-emerald-400/[0.07] via-[#121315] to-[#101013] border border-emerald-400/[0.15] hover:border-emerald-400/35 shadow-[inset_0_1px_0_0_rgba(52,211,153,0.14)]',
  },
  {
    id: 'sicher',
    stufe: 'Stufe III',
    label: 'Sicher',
    inspectorLabel: 'Sicher (14+ Tage)',
    filterTitle: 'Stufe III · Sicher (14+ Tage)',
    dotClass: 'bg-sky-400',
    inspectorTextClass: 'text-sky-400',
    segmentClass: 'bg-sky-400',
    tileClass:
      'bg-gradient-to-b from-sky-400/[0.08] via-[#121316] to-[#101013] border border-sky-400/[0.18] hover:border-sky-400/40 shadow-[inset_0_1px_0_0_rgba(56,189,248,0.16)]',
  },
  {
    id: 'episch',
    stufe: 'Stufe IV',
    label: 'Episch',
    inspectorLabel: 'Episch (30+ Tage)',
    filterTitle: 'Stufe IV · Episch (30+ Tage)',
    dotClass: 'bg-purple-400',
    inspectorTextClass: 'text-purple-400',
    segmentClass: 'bg-purple-400',
    tileClass:
      'bg-gradient-to-b from-purple-400/[0.09] via-[#131216] to-[#101013] border border-purple-400/[0.22] hover:border-purple-400/45 shadow-[inset_0_1px_0_0_rgba(192,132,252,0.18)]',
  },
  {
    id: 'legendaer',
    stufe: 'Stufe V',
    label: 'Legendär',
    inspectorLabel: 'Legendär (90+ Tage)',
    filterTitle: 'Stufe V · Legendär (90+ Tage)',
    dotClass: 'bg-amber-400',
    inspectorTextClass: 'text-amber-400',
    segmentClass: 'bg-amber-400',
    tileClass:
      'bg-gradient-to-b from-amber-400/[0.11] via-[#141312] to-[#101013] border border-amber-300/[0.26] hover:border-amber-300/50 shadow-[inset_0_1px_0_0_rgba(252,211,77,0.22)]',
  },
];

export const WORD_EVOLUTION_BY_ID: Record<WordTier, WordEvolutionRankMeta> =
  Object.fromEntries(WORD_EVOLUTION_RANKS.map((r) => [r.id, r])) as Record<
    WordTier,
    WordEvolutionRankMeta
  >;

const SEPARABLE_SPLIT_REGEX = /[|·•\u2506\u250A]/;

const GERMAN_WORD_PREFIXES = [
  'zusammen',
  'zurück',
  'zurueck',
  'entgegen',
  'gegenüber',
  'weiter',
  'wieder',
  'nieder',
  'hinter',
  'herunter',
  'herauf',
  'heraus',
  'herein',
  'hinauf',
  'hinaus',
  'hinein',
  'hinzu',
  'unter',
  'über',
  'ueber',
  'durch',
  'gegen',
  'nach',
  'auf',
  'aus',
  'ein',
  'ent',
  'mit',
  'vor',
  'ver',
  'zer',
  'emp',
  'weg',
  'los',
  'her',
  'hin',
  'ab',
  'an',
  'be',
  'er',
  'ge',
  'um',
  'zu',
];

const VOWEL_REGEX = /[aeiouyäöü]/i;

/**
 * Определяет 5-ступенчатый ранг зрелости слова строго по SRS-интервалу (`interval` в днях).
 */
export function getWordTier(intervalDays: number = 0): WordTier {
  const safeDays = Number.isFinite(intervalDays) ? intervalDays : 0;
  if (safeDays >= 90) return 'legendaer';
  if (safeDays >= 30) return 'episch';
  if (safeDays >= 14) return 'sicher';
  if (safeDays >= 3) return 'gefestigt';
  return 'basis';
}

/**
 * Возвращает число заполненных сегментов (1..4) в 4-сегментном индикаторе SRS-памяти.
 */
export function getMemoryStrengthSegments(intervalDays: number = 0): number {
  const safeDays = Number.isFinite(intervalDays) ? intervalDays : 0;
  if (safeDays >= 30) return 4;
  if (safeDays >= 14) return 3;
  if (safeDays >= 3) return 2;
  return 1;
}

export interface WordRootExtraction {
  root: string;
  prefix: string | null;
}

/**
 * Извлекает глагольный/именной корень слова, отбрасывая отделяемые и неотделяемые приставки
 * для интеллектуальной группировки в режиме «Wortfamilien».
 */
export function extractWordRoot(rawWord: string): WordRootExtraction {
  const trimmed = (rawWord || '').trim();
  if (!trimmed) return { root: '', prefix: null };

  // 1. Явная отделяемая приставка через символ "|" или "·" (напр., ab|brechen, mit|teilen)
  const splitParts = trimmed.split(SEPARABLE_SPLIT_REGEX);
  if (splitParts.length >= 2) {
    const rawPrefix = splitParts[0].toLowerCase().replace(/[^a-zäöüß]/g, '');
    const rawRest = normalizeCanonicalLemma(splitParts.slice(1).join(''));
    const headRest = rawRest.split(/\s+/).pop() || rawRest;
    if (rawPrefix && headRest.length >= 3 && VOWEL_REGEX.test(headRest)) {
      return { root: headRest, prefix: rawPrefix };
    }
  }

  // 2. Канонизируем (убираем артикли, "sich", "jemanden etwas", пометы)
  const canonical = normalizeCanonicalLemma(trimmed);
  if (!canonical) return { root: '', prefix: null };

  // Для словосочетаний берём основное лексическое слово в конце (либо глагол)
  const tokens = canonical.split(/\s+/).filter(Boolean);
  const candidate = tokens[tokens.length - 1] || canonical;
  if (candidate.length < 5) {
    return { root: candidate, prefix: null };
  }

  for (const prefix of GERMAN_WORD_PREFIXES) {
    if (candidate.startsWith(prefix)) {
      const stem = candidate.slice(prefix.length);
      if (stem.length >= 4 && VOWEL_REGEX.test(stem)) {
        return { root: stem, prefix };
      }
    }
  }

  return { root: candidate, prefix: null };
}

export interface WordFamilyCluster<T> {
  root: string;
  items: T[];
}

export interface GroupedWordFamilies<T> {
  families: Array<WordFamilyCluster<T>>;
  singletons: T[];
}

/**
 * Группирует слова по общему корню в памяти:
 * - если у корня найдено >= 2 разных слов -> в общий кластер Wortfamilie;
 * - остальные -> в отсортированный список одиночных слов ниже.
 */
export function buildWordFamilies<T extends { word: string; key: string }>(
  items: T[]
): GroupedWordFamilies<T> {
  const byRoot = new Map<string, T[]>();

  for (const item of items) {
    const { root } = extractWordRoot(item.word);
    const groupKey = root || item.key;
    const bucket = byRoot.get(groupKey);
    if (bucket) {
      bucket.push(item);
    } else {
      byRoot.set(groupKey, [item]);
    }
  }

  const families: Array<WordFamilyCluster<T>> = [];
  const singletons: T[] = [];

  byRoot.forEach((groupItems, root) => {
    if (groupItems.length >= 2) {
      families.push({
        root,
        items: [...groupItems].sort((a, b) => a.word.localeCompare(b.word, 'de')),
      });
    } else if (groupItems.length === 1) {
      singletons.push(groupItems[0]);
    }
  });

  families.sort((a, b) => {
    if (b.items.length !== a.items.length) return b.items.length - a.items.length;
    return a.root.localeCompare(b.root, 'de');
  });

  return { families, singletons };
}
