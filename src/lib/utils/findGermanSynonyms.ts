import { normalizeCanonicalLemma } from '@/lib/utils/lemmaNormalizer';
import {
  areGermanRelatives,
  type MasteredRelativeSourceCard,
} from '@/lib/utils/findMasteredRelatives';

export interface GermanSynonymItem {
  id: string;
  word: string;
  translation: string;
  forms?: string | null;
  sentence?: string | null;
  sentenceTranslation?: string | null;
  level?: string | null;
  canonicalLemma: string;
  isArchived: boolean;
  matchedMeaning: string;
}

const GENERIC_SINGLE_VERBS = new Set([
  'делать',
  'идти',
  'быть',
  'стать',
  'брать',
  'давать',
]);

const RUSSIAN_STOP_WORDS = new Set([
  'в', 'во', 'на', 'с', 'со', 'к', 'ко', 'о', 'об', 'обо', 'от', 'до', 'по',
  'за', 'из', 'у', 'для', 'без', 'при', 'про', 'через', 'над', 'под', 'перед',
  'между', 'и', 'или', 'а', 'но', 'не', 'ни', 'же', 'бы', 'ли', 'что', 'как',
  'себя', 'себе', 'собой', 'свой', 'своё', 'свою', 'свои', 'это', 'то',
]);

const CASE_PLACEHOLDER_REGEX =
  /(?:^|\s)(?:кого-либо|чего-либо|кому-либо|чему-либо|кем-либо|чем-либо|что-либо|кто-либо)(?=\s|$)/gi;

const CEFR_RANK: Record<string, number> = {
  C2: 6,
  C1: 5,
  B2: 4,
  B1: 3,
  A2: 2,
  A1: 1,
};

/**
 * Splits and normalizes a Russian translation string into discrete cleaned meaning phrases
 * for pure in-memory synonym matching (0 Supabase egress).
 */
export function extractRussianMeanings(translation: string): string[] {
  if (!translation || typeof translation !== 'string') return [];

  const chunks = translation.split(/[/,;]+/);
  const seen = new Set<string>();
  const meanings: string[] = [];

  for (const rawChunk of chunks) {
    let s = rawChunk.toLowerCase();
    // Remove parenthetical & bracketed explanations
    s = s.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ');
    // Strip Russian case placeholders
    s = s.replace(CASE_PLACEHOLDER_REGEX, ' ');
    // Strip punctuation while keeping Cyrillic/Latin letters and internal hyphens (e.g. "кто-то")
    s = s.replace(/[.,!?:;«»„""'—–_]+/g, ' ');
    s = s.replace(/\s+/g, ' ').replace(/^-+|-+$/g, '').trim();

    if (!s) continue;
    if (!seen.has(s)) {
      seen.add(s);
      meanings.push(s);
    }
  }

  return meanings;
}

function getSignificantRussianTokens(phrase: string): string[] {
  const words = phrase.split(/\s+/).filter(Boolean);
  const sig = words.filter((w) => !RUSSIAN_STOP_WORDS.has(w));
  return sig.length > 0 ? sig : words;
}

function isIgnoredGenericSingleVerb(phrase: string): boolean {
  const words = phrase.split(/\s+/).filter(Boolean);
  return words.length === 1 && GENERIC_SINGLE_VERBS.has(words[0]);
}

function matchMeaningPhrases(
  phrasesA: string[],
  phrasesB: string[]
): { score: number; matchedMeaning: string } | null {
  let bestScore = 0;
  let bestMeaning = '';

  for (const a of phrasesA) {
    if (isIgnoredGenericSingleVerb(a)) continue;
    const tokensA = getSignificantRussianTokens(a);

    for (const b of phrasesB) {
      if (isIgnoredGenericSingleVerb(b)) continue;

      if (a === b) {
        return { score: 2.0, matchedMeaning: b };
      }

      const tokensB = getSignificantRussianTokens(b);
      if (tokensA.length === 0 || tokensB.length === 0) continue;

      const setB = new Set(tokensB);
      let intersection = 0;
      for (const tok of tokensA) {
        if (setB.has(tok)) intersection += 1;
      }

      const maxLen = Math.max(tokensA.length, tokensB.length);
      if (maxLen < 2 && intersection === 0) continue;

      const ratio = intersection / maxLen;
      if (ratio >= 0.8 && ratio > bestScore) {
        bestScore = 1 + ratio;
        bestMeaning = b;
      }
    }
  }

  return bestScore > 0 ? { score: bestScore, matchedMeaning: bestMeaning } : null;
}

function getLevelRank(level?: string | null): number {
  if (!level) return 0;
  return CEFR_RANK[level.trim().toUpperCase().slice(0, 2)] || 0;
}

/**
 * Finds up to 3 German synonyms from the user's in-memory cards pool whose Russian meaning
 * matches the current card (`isArchived === true` prioritized; if < 2 archived found,
 * supplemented by cards with `masteryLevel > 0`).
 */
export function findGermanSynonyms(
  currentCard: MasteredRelativeSourceCard | null | undefined,
  cardsPool: MasteredRelativeSourceCard[],
  maxResults = 3
): GermanSynonymItem[] {
  if (!currentCard?.word || !currentCard?.translation || !Array.isArray(cardsPool) || cardsPool.length === 0) {
    return [];
  }

  const currentMeanings = extractRussianMeanings(currentCard.translation);
  if (currentMeanings.length === 0) return [];

  const currentCanonical = normalizeCanonicalLemma(currentCard.word);
  const currentLang = (currentCard.language || 'de').toLowerCase();

  interface RankedSynonym {
    item: GermanSynonymItem;
    isArchived: boolean;
    score: number;
    cefrRank: number;
    interval: number;
  }

  const collectFromFilter = (archivedOnly: boolean, seenCanonical: Set<string>): RankedSynonym[] => {
    const collected: RankedSynonym[] = [];

    for (const cand of cardsPool) {
      if (!cand.id || cand.id === currentCard.id) continue;
      if (!cand.word || !cand.translation) continue;

      const candArchived = Boolean(cand.isArchived ?? cand.is_archived);
      const candMastery = Number(cand.masteryLevel ?? cand.mastery_level ?? 0);

      if (archivedOnly && !candArchived) continue;
      if (!archivedOnly && (candArchived || candMastery <= 0)) continue;

      const candLang = (cand.language || currentLang).toLowerCase();
      if (candLang !== currentLang) continue;

      const candCanonical = normalizeCanonicalLemma(cand.word);
      if (!candCanonical || candCanonical === currentCanonical) continue;
      if (seenCanonical.has(candCanonical)) continue;

      // Exclude same-root / Wortfamilie words so Synonyme stays complementary
      if (areGermanRelatives(currentCard.word, cand.word)) continue;

      const candMeanings = extractRussianMeanings(cand.translation);
      if (candMeanings.length === 0) continue;

      const match = matchMeaningPhrases(currentMeanings, candMeanings);
      if (!match) continue;

      seenCanonical.add(candCanonical);
      const level = cand.level ?? cand.cefr_level ?? null;

      collected.push({
        item: {
          id: cand.id,
          word: cand.word,
          translation: cand.translation,
          forms: cand.forms ?? cand.baseWordInfo ?? null,
          sentence: cand.sentence ?? null,
          sentenceTranslation: cand.sentenceTranslation ?? null,
          level,
          canonicalLemma: candCanonical,
          isArchived: candArchived,
          matchedMeaning: match.matchedMeaning,
        },
        isArchived: candArchived,
        score: match.score,
        cefrRank: getLevelRank(level),
        interval: typeof cand.interval === 'number' ? cand.interval : 0,
      });
    }

    collected.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.cefrRank !== a.cefrRank) return b.cefrRank - a.cefrRank;
      return b.interval - a.interval;
    });

    return collected;
  };

  const seen = new Set<string>();
  const archivedMatches = collectFromFilter(true, seen);

  if (archivedMatches.length >= 2) {
    return archivedMatches.slice(0, maxResults).map((m) => m.item);
  }

  const supplementalMatches = collectFromFilter(false, seen);
  const combined = [...archivedMatches, ...supplementalMatches];
  return combined.slice(0, maxResults).map((m) => m.item);
}
