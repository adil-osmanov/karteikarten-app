import { getCleanTranslation } from '@/lib/utils';
import { normalizeValencyLemma } from '@/lib/utils/lemmaNormalizer';
import type { MasteredRelativeSourceCard } from '@/lib/utils/findMasteredRelatives';

const TECHNICAL_LITERALS = new Set([
  'VERB_DRILL',
  'CLOZE',
  'FLASHCARD',
  'MANUAL',
  'STANDARD_CLOZE',
  'STARKE_VERBEN',
  'PREPOSITION_DRILL',
  'RAPID_FLASHCARDS',
  'REDEMITTEL',
  'NONE',
  'NULL',
  'UNDEFINED',
  'N/A',
  '-',
  '—',
  '–',
]);

const UPPER_SNAKE_FULL_REGEX = /^[A-Z0-9_]{3,}$/;
const UPPER_SNAKE_TOKEN_REGEX = /\b[A-Z0-9]{2,}_[A-Z0-9_]+\b/;
const CITE_ANNOTATION_REGEX = /\[cite:[^\]]*\]/gi;
const CYRILLIC_REGEX = /[а-яА-ЯёЁ]/;
const CLOZE_BLANK_REGEX = /(?:_{2,}|\[\s*_{2,}\s*\])/;
const PIPE_CASE_GOVERNANCE_REGEX = /\|\s*(?:AKK|DAT|GEN|NOM|AKKUSATIV|DATIV|GENITIV|NOMINATIV)\b/i;
const RUSSIAN_ABBREV_END_REGEX =
  /(?:[а-яё]-л|и\s+т\.?\s*д|и\s+т\.?\s*п|т\.?\s*е|т\.?\s*к|др|см|н-р)\.\s*$/i;

export type PillMetadataInput = Pick<
  MasteredRelativeSourceCard,
  | 'id'
  | 'word'
  | 'translation'
  | 'forms'
  | 'baseWordInfo'
  | 'sentence'
  | 'sentenceTranslation'
  | 'example'
  | 'contextSentence'
  | 'hint'
  | 'explanation'
  | 'trainingMode'
  | 'bookCategory'
  | 'cardType'
  | 'card_type'
  | 'language'
  | 'isArchived'
  | 'is_archived'
>;

/**
 * Returns true if the string is an internal constant, mode marker, JSON blob,
 * case-tag line (e.g. "an | DAT"), or technical placeholder that must never render in UI.
 */
export function isTechnicalPlaceholder(raw?: string | null): boolean {
  if (!raw || typeof raw !== 'string') return true;
  const trimmed = raw.trim();
  if (!trimmed) return true;

  const upper = trimmed.toUpperCase();
  if (TECHNICAL_LITERALS.has(upper)) return true;
  if (UPPER_SNAKE_FULL_REGEX.test(trimmed)) return true;
  if (UPPER_SNAKE_TOKEN_REGEX.test(trimmed)) return true;
  if (/^\s*[\[{].*[\]}]\s*$/.test(trimmed)) return true;
  if (PIPE_CASE_GOVERNANCE_REGEX.test(trimmed)) return true;

  return false;
}

/**
 * Cleans `[cite: ...]` tags, secondary `auch:` blocks, and leading German lemma prefixes
 * when formatted as `"German — Russian"`. Rejects technical markers and German duplicates.
 */
export function cleanWordTranslation(raw?: string | null, germanWord?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const withoutCite = raw.replace(CITE_ANNOTATION_REGEX, ' ').trim();
  if (!withoutCite || isTechnicalPlaceholder(withoutCite)) return '';

  let cleaned = getCleanTranslation(withoutCite)
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || isTechnicalPlaceholder(cleaned)) return '';

  // Strip `"übernehmen (...) — перенимать, брать на себя"` prefix if left side is German and right is Russian
  const dashMatch = cleaned.match(/^(.+?)\s+[—–-]\s+(.+)$/);
  if (dashMatch) {
    const [, left, right] = dashMatch;
    if (!CYRILLIC_REGEX.test(left) && CYRILLIC_REGEX.test(right)) {
      cleaned = right.trim();
    }
  }

  if (!cleaned || isTechnicalPlaceholder(cleaned)) return '';
  if (cleaned.includes('➔') && !CYRILLIC_REGEX.test(cleaned)) return '';

  if (germanWord) {
    const wordLemma = normalizeValencyLemma(germanWord);
    const transLemma = normalizeValencyLemma(cleaned);
    if (!CYRILLIC_REGEX.test(cleaned) && wordLemma && transLemma === wordLemma) {
      return '';
    }
  }

  return cleaned;
}

/**
 * Heuristic detector for full-sentence translations (`Lücken`) vs concise dictionary glosses (`Karten`).
 */
export function isSentenceLikeTranslation(raw?: string | null): boolean {
  if (!raw || typeof raw !== 'string') return true;
  const cleaned = cleanWordTranslation(raw);
  if (!cleaned) return true;
  if (cleaned.length > 45) return true;
  if (/[.!?]\s*$/.test(cleaned) && !RUSSIAN_ABBREV_END_REGEX.test(cleaned)) {
    return true;
  }
  return false;
}

function isClozeCard(card?: PillMetadataInput | null): boolean {
  if (!card) return false;
  const mode = (card.trainingMode || card.cardType || card.card_type || '').toLowerCase();
  if (mode === 'standard_cloze' || mode === 'cloze') return true;
  if (CLOZE_BLANK_REGEX.test(card.sentence || '')) return true;
  return false;
}

function extractGlossFromExtraFields(card: PillMetadataInput): string {
  const candidates = [card.baseWordInfo, card.forms, card.hint, card.explanation];
  for (const field of candidates) {
    if (!field || typeof field !== 'string') continue;
    const trimmed = field.replace(CITE_ANNOTATION_REGEX, ' ').trim();
    if (!trimmed || /^\s*[\[{]/.test(trimmed)) continue;

    // Look for `"<German lemma/forms> — <Russian translation>"`
    const dashMatch = trimmed.match(/^(.+?)\s+[—–-]\s+(.+)$/);
    if (!dashMatch) continue;
    const [, left, right] = dashMatch;
    if (CYRILLIC_REGEX.test(left) || !CYRILLIC_REGEX.test(right)) continue;

    const cleaned = cleanWordTranslation(right, card.word);
    if (cleaned && !isSentenceLikeTranslation(cleaned)) {
      return cleaned;
    }
  }
  return '';
}

function mergeEntryWithPoolCard(
  entry: PillMetadataInput,
  cardsPool: PillMetadataInput[]
): PillMetadataInput {
  if (!entry?.id || !Array.isArray(cardsPool) || cardsPool.length === 0) {
    return entry;
  }
  const exact = cardsPool.find((c) => c.id === entry.id);
  if (!exact) return entry;
  return {
    ...exact,
    ...entry,
    forms: entry.forms ?? exact.forms,
    baseWordInfo: entry.baseWordInfo ?? exact.baseWordInfo,
    sentence: entry.sentence ?? exact.sentence,
    example: entry.example ?? exact.example,
    contextSentence: entry.contextSentence ?? exact.contextSentence,
    hint: entry.hint ?? exact.hint,
    explanation: entry.explanation ?? exact.explanation,
    trainingMode: entry.trainingMode ?? exact.trainingMode,
    bookCategory: entry.bookCategory ?? exact.bookCategory,
  };
}

/**
 * Resolves the concise Russian word translation for a Wortfamilie/Synonyme pill.
 * Strictly reads in-memory cached cards (`cardsPool`, 0 Supabase egress).
 */
export function resolveWordTranslation(
  entry: PillMetadataInput | null | undefined,
  cardsPool: PillMetadataInput[] = []
): string {
  if (!entry) return '';

  const richEntry = mergeEntryWithPoolCard(entry, cardsPool);
  const directClean = cleanWordTranslation(richEntry.translation, richEntry.word);
  const entryIsCloze = isClozeCard(richEntry);
  const directLooksLikeSentence = isSentenceLikeTranslation(directClean);

  if (!entryIsCloze && directClean && !directLooksLikeSentence) {
    return directClean;
  }

  const targetLemma = normalizeValencyLemma(richEntry.word);
  const targetLang = (richEntry.language || 'de').toLowerCase();

  let bestGloss = '';
  let bestScore = -1;

  if (targetLemma && Array.isArray(cardsPool)) {
    for (const cand of cardsPool) {
      if (!cand || !cand.word) continue;
      const candLang = (cand.language || targetLang).toLowerCase();
      if (candLang !== targetLang) continue;
      if (normalizeValencyLemma(cand.word) !== targetLemma) continue;

      const candIsCloze = isClozeCard(cand);
      const candClean = cleanWordTranslation(cand.translation, cand.word);
      const candMode = (cand.trainingMode || cand.cardType || cand.card_type || '').toLowerCase();
      const candArchived = Boolean(cand.isArchived ?? cand.is_archived);

      if (candClean && !candIsCloze) {
        const isConcise = !isSentenceLikeTranslation(candClean);
        let score = 0;
        if (candMode === 'rapid_flashcards') score += 100;
        else if (candMode === 'starke_verben') score += 90;
        else if (candMode === 'preposition_drill') score += 80;
        else score += 70;

        if (isConcise) score += 50;
        if (candArchived) score += 10;
        // Prefer crisp dictionary meanings over verbose lists
        score -= Math.min(25, Math.floor(candClean.length / 8));

        if (score > bestScore) {
          bestScore = score;
          bestGloss = candClean;
        }
      }

      const extraGloss = extractGlossFromExtraFields(cand);
      if (extraGloss) {
        const extraScore = 55 + (candArchived ? 5 : 0);
        if (extraScore > bestScore) {
          bestScore = extraScore;
          bestGloss = extraGloss;
        }
      }
    }
  }

  if (bestGloss) return bestGloss;

  const entryExtraGloss = extractGlossFromExtraFields(richEntry);
  if (entryExtraGloss) return entryExtraGloss;

  return directClean;
}

function buildClozeFillWord(rawWord: string): string {
  if (!rawWord) return '';
  let cleaned = rawWord
    .replace(/[|·•\u2506\u250A]/g, '')
    .replace(/,\s*(?:die\s+)?[-–—¨][^,]*$/i, '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/^(?:der|die|das|ein|eine|einen|einem|einer)\s+/i, '')
    .replace(/\b(?:jemanden|jemandem|jemandes|jemand|etwas|jmdn|jmdm|jdn|jdm|jds|jmd|etw)\b\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Avoid duplicate reflexive if sentence already has one; caller handles leading-blank capitalization
  cleaned = cleaned.replace(/^sich\s+/i, '').trim();
  return cleaned;
}

function sanitizeGermanExampleCandidate(
  rawSentence: string | null | undefined,
  rawWord: string
): { text: string; wasCloze: boolean } | null {
  if (!rawSentence || typeof rawSentence !== 'string') return null;

  const trimmed = rawSentence.replace(CITE_ANNOTATION_REGEX, ' ').trim();
  if (!trimmed || isTechnicalPlaceholder(trimmed)) return null;
  if (CYRILLIC_REGEX.test(trimmed)) return null;

  // Reject pipe-separated grammar metadata (`an | DAT`) before normalising separable markers
  if (PIPE_CASE_GOVERNANCE_REGEX.test(trimmed)) return null;
  if (/^[^|]{1,18}\s*\|\s*[A-Z]{2,}/.test(trimmed)) return null;

  let text = trimmed
    .replace(/([a-zäöüß])\|([a-zäöüß])/gi, '$1$2')
    .replace(/[|·•\u2506\u250A]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text || isTechnicalPlaceholder(text)) return null;

  const wasCloze = CLOZE_BLANK_REGEX.test(text);
  if (wasCloze) {
    const fillWord = buildClozeFillWord(rawWord);
    if (!fillWord) return null;

    // Strip duplicate reflexive if sentence immediately precedes the blank with one
    text = text.replace(/(?:\[\s*_{2,}\s*\]|_{2,})/g, (_match, offset: number, full: string) => {
      const before = full.slice(0, offset).trim();
      const atSentenceStart = before.length === 0 || /[.!?„"«»]$/.test(before);
      return atSentenceStart
        ? fillWord.charAt(0).toUpperCase() + fillWord.slice(1)
        : fillWord;
    });
    text = text.replace(/\s+/g, ' ').trim();
  }

  // Strict final checks: must be an actual multi-word German phrase/sentence, zero technical leakage
  if (!text || isTechnicalPlaceholder(text)) return null;
  if (!/\s/.test(text)) return null;
  if (CYRILLIC_REGEX.test(text)) return null;
  if (CLOZE_BLANK_REGEX.test(text)) return null;

  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || text.length < 6) return null;

  // Reject if identical to the bare German word
  if (normalizeValencyLemma(text) === normalizeValencyLemma(rawWord) && tokens.length <= 2) {
    return null;
  }

  return { text, wasCloze };
}

function getOwnGermanExample(card: PillMetadataInput): { text: string; wasCloze: boolean } | null {
  const fields = [card.example, card.contextSentence, card.sentence];
  for (const raw of fields) {
    const sanitized = sanitizeGermanExampleCandidate(raw, card.word);
    if (sanitized) return sanitized;
  }
  return null;
}

/**
 * Resolves a valid, natural German example sentence for a Wortfamilie/Synonyme pill.
 * Rejects `VERB_DRILL`, `CLOZE`, `FLASHCARD`, `MANUAL`, `UPPER_SNAKE_CASE`, and single-word strings.
 * Pulls a valid example from another in-memory card with the same valency lemma when needed.
 */
export function resolveGermanExample(
  entry: PillMetadataInput | null | undefined,
  cardsPool: PillMetadataInput[] = []
): string | null {
  if (!entry) return null;

  const richEntry = mergeEntryWithPoolCard(entry, cardsPool);
  const ownExample = getOwnGermanExample(richEntry);
  if (ownExample) {
    return ownExample.text;
  }

  const targetLemma = normalizeValencyLemma(richEntry.word);
  if (!targetLemma || !Array.isArray(cardsPool) || cardsPool.length === 0) {
    return null;
  }

  const targetLang = (richEntry.language || 'de').toLowerCase();
  let bestExample: string | null = null;
  let bestScore = -1;

  for (const cand of cardsPool) {
    if (!cand || cand.id === richEntry.id || !cand.word) continue;
    const candLang = (cand.language || targetLang).toLowerCase();
    if (candLang !== targetLang) continue;
    if (normalizeValencyLemma(cand.word) !== targetLemma) continue;

    const candidateExample = getOwnGermanExample(cand);
    if (!candidateExample) continue;

    const candArchived = Boolean(cand.isArchived ?? cand.is_archived);
    let score = candidateExample.wasCloze ? 40 : 100;
    if (candArchived) score += 10;
    // Slight preference for full punctuated sentences
    if (/[.!?]$/.test(candidateExample.text)) score += 5;

    if (score > bestScore) {
      bestScore = score;
      bestExample = candidateExample.text;
    }
  }

  return bestExample;
}
