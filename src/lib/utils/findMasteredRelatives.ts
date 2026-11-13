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
  cardType?: string | null;
  card_type?: string | null;
  language?: string | null;
}

export interface MasteredRelativeItem {
  id: string;
  word: string;
  translation: string;
  level?: string | null;
  canonicalLemma: string;
  stem: string;
}

const MIN_STEM_LENGTH = 4;

// Ordered longest-first so compound prefixes like "zusammen" / "zurück" / "wider" match before "zu" / "wi".
const GERMAN_PREFIXES = [
  'zusammen', 'zwischen', 'entgegen', 'entlang', 'entzwei', 'gegenüber', 'zurecht',
  'zurück', 'herunter', 'herüber', 'hinaus', 'hinein', 'hinauf', 'hinab', 'hinweg',
  'hinüber', 'vorbei', 'voraus', 'vorüber', 'vorweg', 'wieder', 'weiter', 'nieder',
  'heraus', 'herein', 'herauf', 'herab', 'herbei', 'hervor', 'heran', 'herum',
  'empor', 'durch', 'unter', 'hinter', 'über', 'wider', 'gegen', 'gleich', 'statt',
  'voran', 'weiter', 'her', 'hin', 'auf', 'aus', 'bei', 'ein', 'ent', 'emp', 'ver',
  'zer', 'miss', 'fern', 'fest', 'fort', 'frei', 'heim', 'hoch', 'teil', 'miss',
  'los', 'mit', 'nach', 'weg', 'ab', 'an', 'be', 'er', 'ge', 'um', 'un', 'ur', 'zu',
];

const UNIQUE_PREFIXES = Array.from(new Set(GERMAN_PREFIXES)).sort(
  (a, b) => b.length - a.length
);

// Ordered longest-first; only accepted if remaining stem has length >= MIN_STEM_LENGTH.
const GERMAN_SUFFIXES = [
  'lichkeiten', 'lichkeit', 'schaften', 'igkeiten', 'igungen', 'ierungen',
  'ationen', 'itionen', 'keiten', 'heiten', 'schaft', 'ungen', 'igung',
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

function foldUmlauts(value: string): string {
  return value
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss');
}

function stripOneSuffix(token: string): string {
  for (const suffix of GERMAN_SUFFIXES) {
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

function stripSeparableInfixGe(token: string): string {
  for (const prefix of UNIQUE_PREFIXES) {
    if (token.startsWith(prefix + 'ge') && token.length - prefix.length - 2 >= MIN_STEM_LENGTH) {
      return prefix + token.slice(prefix.length + 2);
    }
  }
  return token;
}

function stripLeadingPrefixWithParticiple(token: string): string {
  for (const prefix of UNIQUE_PREFIXES) {
    if (token.startsWith(prefix)) {
      let rest = token.slice(prefix.length);
      // Handle Partizip II infix -ge- right after a separable prefix (e.g. "aufgeregt" -> "auf" + "ge" + "regt").
      if (rest.startsWith('ge') && rest.length - 2 >= MIN_STEM_LENGTH) {
        rest = rest.slice(2);
      }
      if (rest.length >= MIN_STEM_LENGTH) {
        return rest;
      }
    }
  }
  return token;
}

/**
 * Normalizes a German word (with optional article, reflexive pronoun, or `|`/`·` marker)
 * into a root stem of at least 4 characters for pure in-memory Wortfamilie matching.
 */
export function extractGermanStem(rawWord: string): string {
  const canonical = normalizeCanonicalLemma(rawWord);
  if (!canonical) return '';

  // Keep only alphabetic German token characters (strip residual spaces/slashes on multiword edges).
  const firstAlpha = canonical
    .replace(/[/·|•]+/g, '')
    .split(/\s+/)
    .find((t) => /^[a-zäöüß-]+$/i.test(t) && t.length >= MIN_STEM_LENGTH);

  if (!firstAlpha) return '';

  const base = foldUmlauts(firstAlpha.toLowerCase());
  if (base.length < MIN_STEM_LENGTH) return '';

  // Try stripping one prefix (and optional -ge-) first, then suffix.
  const afterPrefix = stripLeadingPrefixWithParticiple(base);
  if (afterPrefix !== base) {
    // Only commit the prefix strip if suffix stripping STILL leaves >= 4 chars
    // (otherwise e.g. "auf|regen" -> "regen" -> "reg" (len 3) rolls back to "aufreg" so it pairs with "Aufregung").
    const afterBoth = stripOneSuffix(afterPrefix);
    if (afterBoth !== afterPrefix && afterBoth.length >= MIN_STEM_LENGTH) {
      return afterBoth;
    }
    // Check if prefix-stripped word without further suffix stripping matches a bare root (e.g. "ab|bau" / "Un|fall").
    // Avoid returning bare "regen" when word had derivational suffix like "-en" / "-ung" that got blocked by min-length guard.
    const endedWithDerivationalSuffix = ['ung', 'en', 'ten', 'tet', 't', 'e'].some((sfx) =>
      afterPrefix.endsWith(sfx)
    );
    if (!endedWithDerivationalSuffix && afterPrefix.length >= MIN_STEM_LENGTH) {
      return afterPrefix;
    }
  }

  const wholeStripped = stripOneSuffix(stripSeparableInfixGe(base));
  return wholeStripped.length >= MIN_STEM_LENGTH ? wholeStripped : '';
}

function getLevelRank(level?: string | null): number {
  if (!level) return 0;
  const normalized = level.trim().toUpperCase().slice(0, 2);
  return CEFR_RANK[normalized] || 0;
}

function matchStems(
  stemA: string,
  stemB: string
): 'exact' | 'compound' | null {
  if (!stemA || !stemB) return null;
  if (stemA === stemB) return 'exact';

  const shorter = stemA.length <= stemB.length ? stemA : stemB;
  const longer = stemA.length <= stemB.length ? stemB : stemA;

  // Allow compound noun <-> root verb pairing (e.g. "personalplan" <-> "plan"),
  // requiring >= 3 extra prefix chars to avoid spurious 1-char diffs.
  if (
    shorter.length >= MIN_STEM_LENGTH &&
    longer.length >= shorter.length + 3 &&
    longer.endsWith(shorter)
  ) {
    return 'compound';
  }

  return null;
}

/**
 * Finds up to 3 same-root words from the user's already-archived (`isArchived === true`) pool.
 * Strictly zero network requests, zero synonym matching — pure in-memory stem comparison.
 */
export function findMasteredRelatives(
  currentCard: MasteredRelativeSourceCard | null | undefined,
  archivedCards: MasteredRelativeSourceCard[],
  maxResults = 3
): MasteredRelativeItem[] {
  if (!currentCard?.word || !Array.isArray(archivedCards) || archivedCards.length === 0) {
    return [];
  }

  const currentStem = extractGermanStem(currentCard.word);
  if (currentStem.length < MIN_STEM_LENGTH) return [];

  const currentCanonical = normalizeCanonicalLemma(currentCard.word);
  const currentLang = (currentCard.language || 'de').toLowerCase();

  interface RankedMatch {
    item: MasteredRelativeItem;
    matchKindRank: number; // 0 = exact stem, 1 = compound
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

    const candCanonical = normalizeCanonicalLemma(cand.word);
    if (!candCanonical || candCanonical === currentCanonical) continue;
    if (seenCanonical.has(candCanonical)) continue;

    const candStem = extractGermanStem(cand.word);
    const kind = matchStems(currentStem, candStem);
    if (!kind) continue;

    seenCanonical.add(candCanonical);
    const level = cand.level ?? cand.cefr_level ?? null;

    matches.push({
      item: {
        id: cand.id,
        word: cand.word,
        translation: cand.translation || '',
        level,
        canonicalLemma: candCanonical,
        stem: candStem,
      },
      matchKindRank: kind === 'exact' ? 0 : 1,
      cefrRank: getLevelRank(level),
      interval: typeof cand.interval === 'number' ? cand.interval : 0,
    });
  }

  matches.sort((a, b) => {
    if (a.matchKindRank !== b.matchKindRank) return a.matchKindRank - b.matchKindRank;
    if (a.cefrRank !== b.cefrRank) return b.cefrRank - a.cefrRank;
    return b.interval - a.interval;
  });

  return matches.slice(0, maxResults).map((m) => m.item);
}
