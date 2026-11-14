import { normalizeCanonicalLemma } from '@/lib/utils/lemmaNormalizer';

export interface MasteredRelativeSourceCard {
  id: string;
  word: string;
  translation: string;
  isArchived?: boolean;
  is_archived?: boolean;
  level?: string | null;
  cefr_level?: string | null;
  interval?: number | null;
  masteryLevel?: number | null;
  mastery_level?: number | null;
  forms?: string | null;
  baseWordInfo?: string | null;
  sentence?: string | null;
  sentenceTranslation?: string | null;
  cardType?: string | null;
  card_type?: string | null;
  language?: string | null;
}

export interface MasteredRelativeItem {
  id: string;
  word: string;
  translation: string;
  forms?: string | null;
  sentence?: string | null;
  sentenceTranslation?: string | null;
  level?: string | null;
  canonicalLemma: string;
  stem: string;
}

const MIN_STEM_LENGTH = 4;

// Verbal & derivational prefixes ordered longest-first.
const VERBAL_PREFIXES = [
  'zusammen', 'entgegen', 'zurück', 'zurecht', 'herein', 'heraus', 'weiter',
  'wieder', 'vorbei', 'voraus', 'durch', 'unter', 'wider', 'über', 'auf', 'aus',
  'bei', 'ein', 'emp', 'ent', 'fern', 'fest', 'fort', 'her', 'hin', 'los', 'mit',
  'nach', 'ver', 'vor', 'weg', 'zer', 'ab', 'an', 'be', 'er', 'um', 'zu',
];

const UNIQUE_PREFIXES = Array.from(new Set(VERBAL_PREFIXES)).sort(
  (a, b) => b.length - a.length
);

const PREFIX_SET = new Set(UNIQUE_PREFIXES);

const STRIP_WORDS = new Set([
  'der', 'die', 'das', 'dem', 'den', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
  'sich', 'mich', 'dich', 'uns', 'euch', 'mir', 'dir',
  'jemanden', 'jemandem', 'jemandes', 'jemand', 'etwas',
  'jmdn', 'jmdm', 'jdn', 'jdm', 'jmd', 'etw',
  'an', 'auf', 'aus', 'bei', 'durch', 'für', 'gegen', 'gegenüber', 'hinter',
  'in', 'mit', 'nach', 'neben', 'ohne', 'über', 'um', 'unter', 'von', 'vor', 'zu', 'zwischen',
]);

const NON_VERB_EN_WORDS = new Set([
  'offen', 'eigen', 'selten', 'trocken', 'bescheiden', 'eben', 'albern', 'nüchtern', 'schüchtern',
]);

// Ordered longest-first; umlauts ä/ö/ü are NEVER folded when stripping suffixes.
const DERIVATIONAL_SUFFIXES = [
  'lichkeiten', 'lichkeit', 'schaften', 'igkeiten', 'ierungen',
  'ationen', 'itionen', 'keiten', 'heiten', 'schaft', 'ungen',
  'ieren', 'ation', 'ition', 'täten', 'mente', 'ments', 'nisse', 'liche',
  'ische', 'hafte', 'weise', 'lose', 'voll', 'chen', 'lein', 'heit', 'keit',
  'tät', 'ment', 'nis', 'ung', 'lich', 'isch', 'haft', 'bar', 'sam', 'los',
  'end', 'ern', 'eln', 'ten', 'tet', 'ige', 'igt', 'est', 'en', 'em', 'er',
  'es', 'te', 'et', 'de', 'ig', 'st', 'e', 't', 's', 'n',
];

const CEFR_RANK: Record<string, number> = {
  C2: 6,
  C1: 5,
  B2: 4,
  B1: 3,
  A2: 2,
  A1: 1,
};

interface ParsedGermanLexeme {
  canonical: string;
  headWord: string;
  pos: 'verb' | 'noun_or_adj';
  prefix: string | null;
  baseVerb: string | null;
  intactStem: string;
  compoundStem: string;
}

function stripOneSuffixExact(token: string): string {
  for (const suffix of DERIVATIONAL_SUFFIXES) {
    if (suffix === 'n' && token.endsWith('en')) continue;
    if (suffix === 'e' && (token.endsWith('te') || token.endsWith('de'))) continue;
    if (token.endsWith(suffix)) {
      const candidate = token.slice(0, token.length - suffix.length);
      if (candidate.length >= MIN_STEM_LENGTH) {
        return candidate;
      }
    }
  }
  return token;
}

function detectLeadingPrefix(lowerHead: string, explicitSplitPrefix: string | null): string | null {
  if (explicitSplitPrefix && PREFIX_SET.has(explicitSplitPrefix)) {
    return explicitSplitPrefix;
  }
  for (const prefix of UNIQUE_PREFIXES) {
    if (lowerHead.startsWith(prefix)) {
      const rest = lowerHead.slice(prefix.length);
      if (rest.length >= MIN_STEM_LENGTH) {
        return prefix;
      }
    }
  }
  return null;
}

function parseGermanLexeme(rawWord: string): ParsedGermanLexeme | null {
  if (!rawWord || typeof rawWord !== 'string') return null;

  let cleaned = rawWord.trim();
  if (!cleaned) return null;

  // Strip trailing plural/inflection notes: "der Antrag, -¨e" -> "der Antrag"
  cleaned = cleaned.replace(/,\s*(?:die\s+)?[-–—¨][^,]*$/i, '').trim();
  // Strip parenthetical and bracketed notes
  cleaned = cleaned.replace(/\(.*?\)|\[.*?\]/g, ' ').trim();
  // Strip paired articles: "der/die Angestellte"
  cleaned = cleaned.replace(/^(?:der|die|das)\s*\/\s*(?:der|die|das)\s+/i, '').trim();
  // Handle separated ellipsis verbs: "schrauben ... auf" -> "aufschrauben"
  const ellipsisMatch = cleaned.match(/^([a-zA-ZäöüÄÖÜß]+)\s*(?:\.{2,}|…+)\s*([a-zA-ZäöüÄÖÜß]+)$/);
  if (ellipsisMatch) {
    cleaned = `${ellipsisMatch[2]}|${ellipsisMatch[1]}`;
  }

  // Keep original casing & explicit separable marker `|` before extracting last meaningful head word.
  const rawTokens = cleaned
    .replace(/[.,/#!$%^&*;:{}=\-_`~?+„"«»'’]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  let hadArticle = false;
  let lastRawToken = '';

  for (const tok of rawTokens) {
    const plainLower = tok.replace(/[|·•\u2506\u250A/]+/g, '').toLowerCase();
    if (!plainLower) continue;
    if (/^(der|die|das|dem|den|des|ein|eine|einen|einem|einer|eines)$/.test(plainLower)) {
      hadArticle = true;
      continue;
    }
    if (STRIP_WORDS.has(plainLower)) {
      continue;
    }
    if (/^[a-zäöüß|·•\u2506\u250A]+$/i.test(tok)) {
      lastRawToken = tok;
    }
  }

  if (!lastRawToken) return null;

  let explicitPrefix: string | null = null;
  if (/[|·•\u2506\u250A]/.test(lastRawToken)) {
    const parts = lastRawToken.split(/[|·•\u2506\u250A]/).filter(Boolean);
    if (parts.length >= 2) {
      explicitPrefix = parts[0].toLowerCase();
    }
  }

  const headRaw = lastRawToken.replace(/[|·•\u2506\u250A/]+/g, '');
  const headLower = headRaw.toLowerCase();
  if (headLower.length < MIN_STEM_LENGTH) return null;

  const isCapitalizedNoun = hadArticle || /^[A-ZÄÖÜ]/.test(headRaw);
  const looksLikeInfinitiveVerb =
    !isCapitalizedNoun &&
    !NON_VERB_EN_WORDS.has(headLower) &&
    (headLower.endsWith('en') || headLower.endsWith('eln') || headLower.endsWith('ern'));

  const pos: 'verb' | 'noun_or_adj' = looksLikeInfinitiveVerb ? 'verb' : 'noun_or_adj';
  const prefix = detectLeadingPrefix(headLower, explicitPrefix);

  let baseVerb: string | null = null;
  if (pos === 'verb') {
    if (prefix) {
      const candidateBase = headLower.slice(prefix.length);
      // Base verb must be a genuine infinitive (e.g. "halten", "brechen", "kaufen")
      if (
        candidateBase.length >= 5 &&
        (candidateBase.endsWith('en') || candidateBase.endsWith('eln') || candidateBase.endsWith('ern')) &&
        /[aeiouyäöü]/i.test(candidateBase)
      ) {
        baseVerb = candidateBase;
      } else {
        baseVerb = headLower;
      }
    } else {
      baseVerb = headLower;
    }
  }

  const intactStem = stripOneSuffixExact(headLower);
  const canonical = normalizeCanonicalLemma(rawWord) || headLower;

  return {
    canonical,
    headWord: headLower,
    pos,
    prefix,
    baseVerb,
    intactStem,
    compoundStem: intactStem,
  };
}

/**
 * Extracts normalized stem (preserving German umlauts ä, ö, ü).
 */
export function extractGermanStem(rawWord: string): string {
  const parsed = parseGermanLexeme(rawWord);
  if (!parsed) return '';
  return parsed.intactStem.length >= MIN_STEM_LENGTH ? parsed.intactStem : '';
}

function matchLexemesStrictly(
  a: ParsedGermanLexeme,
  b: ParsedGermanLexeme
): 'verb_family' | 'direct_pair' | 'compound' | null {
  if (a.canonical === b.canonical) return null;

  // Rule A: Verb-to-Verb — both must be verbs with identical base verb after stripping optional prefixes
  if (a.pos === 'verb' && b.pos === 'verb' && a.baseVerb && b.baseVerb) {
    if (a.baseVerb === b.baseVerb) {
      return 'verb_family';
    }
  }

  // Hard forbid: if BOTH prefix AND part-of-speech differ (e.g. "halten" vs "nachhaltig" / "der Behälter"),
  // never pair them in Wortfamilie.
  if (a.prefix !== b.prefix && a.pos !== b.pos) {
    return null;
  }

  // Rule B: Direct derivational pair without prefix change or conflict
  if (a.prefix === b.prefix) {
    if (
      a.intactStem.length >= MIN_STEM_LENGTH &&
      b.intactStem.length >= MIN_STEM_LENGTH &&
      a.intactStem === b.intactStem
    ) {
      return 'direct_pair';
    }

    // Compound noun <-> root pair without prefix conflict (e.g. "planen" <-> "Personalplanung")
    if (a.prefix === null && b.prefix === null) {
      const shorter = a.compoundStem.length <= b.compoundStem.length ? a : b;
      const longer = a.compoundStem.length <= b.compoundStem.length ? b : a;
      if (
        shorter.compoundStem.length >= MIN_STEM_LENGTH &&
        longer.compoundStem.length >= shorter.compoundStem.length + 3 &&
        longer.compoundStem.endsWith(shorter.compoundStem)
      ) {
        // Ensure compound determiner before the shared root isn't actually an unstripped prefix
        const determiner = longer.compoundStem.slice(0, longer.compoundStem.length - shorter.compoundStem.length);
        if (determiner.length >= 3 && !PREFIX_SET.has(determiner)) {
          return 'compound';
        }
      }
    }
  }

  return null;
}

/**
 * Helper shared with findGermanSynonyms to ensure Wortfamilie words never duplicate in Synonyme.
 */
export function areGermanRelatives(rawWordA: string, rawWordB: string): boolean {
  const a = parseGermanLexeme(rawWordA);
  const b = parseGermanLexeme(rawWordB);
  if (!a || !b) return false;
  if (a.canonical === b.canonical) return true;
  return matchLexemesStrictly(a, b) !== null;
}

function getLevelRank(level?: string | null): number {
  if (!level) return 0;
  const normalized = level.trim().toUpperCase().slice(0, 2);
  return CEFR_RANK[normalized] || 0;
}

/**
 * Finds up to 3 strict same-root words from the user's already-archived (`isArchived === true`) pool.
 * Preserves umlauts, strictly enforces Rule A (Verb-to-Verb) or Rule B (direct derivational pair),
 * and causes zero Supabase egress.
 */
export function findMasteredRelatives(
  currentCard: MasteredRelativeSourceCard | null | undefined,
  archivedCards: MasteredRelativeSourceCard[],
  maxResults = 3
): MasteredRelativeItem[] {
  if (!currentCard?.word || !Array.isArray(archivedCards) || archivedCards.length === 0) {
    return [];
  }

  const currentLexeme = parseGermanLexeme(currentCard.word);
  if (!currentLexeme) return [];

  const currentLang = (currentCard.language || 'de').toLowerCase();

  interface RankedMatch {
    item: MasteredRelativeItem;
    matchRank: number; // 0 = verb_family, 1 = direct_pair, 2 = compound
    cefrRank: number;
    interval: number;
  }

  const seenCanonical = new Set<string>();
  const matches: RankedMatch[] = [];

  for (const cand of archivedCards) {
    const isArchived = Boolean(cand.isArchived ?? cand.is_archived);
    if (!isArchived) continue;
    if (!cand.id || cand.id === currentCard.id) continue;
    if (!cand.word) continue;

    const candLang = (cand.language || currentLang).toLowerCase();
    if (candLang !== currentLang) continue;

    const candLexeme = parseGermanLexeme(cand.word);
    if (!candLexeme) continue;
    if (seenCanonical.has(candLexeme.canonical)) continue;

    const kind = matchLexemesStrictly(currentLexeme, candLexeme);
    if (!kind) continue;

    seenCanonical.add(candLexeme.canonical);
    const level = cand.level ?? cand.cefr_level ?? null;

    matches.push({
      item: {
        id: cand.id,
        word: cand.word,
        translation: cand.translation || '',
        forms: cand.forms ?? cand.baseWordInfo ?? null,
        sentence: cand.sentence ?? null,
        sentenceTranslation: cand.sentenceTranslation ?? null,
        level,
        canonicalLemma: candLexeme.canonical,
        stem: candLexeme.intactStem,
      },
      matchRank: kind === 'verb_family' ? 0 : kind === 'direct_pair' ? 1 : 2,
      cefrRank: getLevelRank(level),
      interval: typeof cand.interval === 'number' ? cand.interval : 0,
    });
  }

  matches.sort((a, b) => {
    if (a.matchRank !== b.matchRank) return a.matchRank - b.matchRank;
    if (a.cefrRank !== b.cefrRank) return b.cefrRank - a.cefrRank;
    return b.interval - a.interval;
  });

  return matches.slice(0, maxResults).map((m) => m.item);
}
