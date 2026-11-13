import { normalizeCanonicalLemma } from '@/lib/utils/lemmaNormalizer';

export type WordTier = 'graphit' | 'silber' | 'gold';

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
 * Определяет уровень "закалки" слова строго по прочности SRS-памяти (`interval` в днях).
 */
export function getWordTier(intervalDays: number = 0): WordTier {
  const safeDays = Number.isFinite(intervalDays) ? intervalDays : 0;
  if (safeDays >= 21) return 'gold';
  if (safeDays >= 3) return 'silber';
  return 'graphit';
}

/**
 * Возвращает число заполненных сегментов (1..4) в SRS-паспорте слова.
 */
export function getMemoryStrengthSegments(intervalDays: number = 0): number {
  const safeDays = Number.isFinite(intervalDays) ? intervalDays : 0;
  if (safeDays >= 21) return 4;
  if (safeDays >= 7) return 3;
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
