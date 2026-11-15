import { parseVerbComponents } from './formatSeparableWord';

export interface ClozeResolution {
  parts: [string, string];
  clozeWord: string;
  fullSentence: string;
  isCustomCloze: boolean;
  hasMask: boolean;
}

export interface NormalizedStudyCardFields {
  targetWord: string;
  sentence: string;
  translation: string;
  wasSwapped: boolean;
}

const HAS_CYRILLIC_RE = /[а-яА-ЯёЁ]/;
const HAS_LATIN_RE = /[a-zA-ZäöüÄÖÜß]/;
const GERMAN_LETTER_RE = /[a-zA-ZäöüÄÖÜß]/;

const LEADING_ARTICLE_RE = /^(?:der\/die\/das|der\/die|der|die|das|ein\/eine|eine?n?|eine?[rms]?)\s+/i;
const CASE_PLACEHOLDER_TOKEN_RE = /^(?:sich|jemanden|jemandem|jemandes|jemand|etwas|jmdn\.?|jmdm\.?|jmds\.?|jmd\.?|jdn\.?|jdm\.?|jds\.?|etw\.?|jn\.?|jm\.?|jd\.?)$/i;
const STOPWORD_TOKENS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
  'in', 'im', 'an', 'am', 'auf', 'aufs', 'aus', 'bei', 'beim', 'mit', 'nach', 'über', 'um',
  'unter', 'von', 'vom', 'vor', 'zu', 'zum', 'zur', 'für', 'gegen', 'durch', 'ohne', 'bis',
  'und', 'oder', 'aber', 'als', 'wie', 'sich', 'sein', 'haben', 'werden', 'ist', 'hat', 'war',
]);

const SEPARABLE_PREFIXES = [
  'zusammen', 'zurück', 'weiter', 'wieder', 'heraus', 'herein', 'herauf', 'herab', 'heran',
  'hinauf', 'hinaus', 'hinein', 'vorbei', 'entgegen', 'gegenüber',
  'nach', 'teil', 'voll', 'fern', 'fest', 'fort', 'hoch', 'klar', 'los', 'mit', 'vor', 'weg',
  'ein', 'aus', 'auf', 'bei', 'her', 'hin', 'ab', 'an', 'um', 'zu',
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanTargetForCandidates(raw: string): string {
  return (raw || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\|/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLeadingArticlesAndMarkers(phrase: string): string {
  let prev = '';
  let curr = cleanTargetForCandidates(phrase);
  while (curr !== prev) {
    prev = curr;
    curr = curr.replace(LEADING_ARTICLE_RE, '').trim();
    const tokens = curr.split(/\s+/).filter(Boolean);
    if (tokens.length > 1 && CASE_PLACEHOLDER_TOKEN_RE.test(tokens[0])) {
      curr = tokens.slice(1).join(' ').trim();
    }
  }
  const filtered = curr
    .split(/\s+/)
    .filter((tok) => tok && !CASE_PLACEHOLDER_TOKEN_RE.test(tok));
  return (filtered.length > 0 ? filtered.join(' ') : curr).trim();
}

function buildStemPattern(word: string, minStemLength: number): string | null {
  const clean = word.replace(/[^a-zA-ZäöüÄÖÜß-]/g, '');
  if (clean.length < minStemLength) return null;

  let stem = clean;
  if (clean.length > minStemLength + 1 && /(?:innen|ungen|heit|keit|schaft|ieren)$/i.test(clean)) {
    const candidate = clean.replace(/(?:innen|ungen|en|er|es|em)$/i, '');
    if (candidate.length >= minStemLength) stem = candidate;
  } else if (clean.length > minStemLength + 1) {
    stem = clean.slice(0, -2);
  } else if (clean.length > minStemLength) {
    stem = clean.slice(0, -1);
  }

  if (stem.length < minStemLength) {
    stem = clean.slice(0, minStemLength);
  }

  return escapeRegex(stem)
    .replace(/ä/gi, '[aäAÄ]')
    .replace(/ö/gi, '[oöOÖ]')
    .replace(/ü/gi, '[uüUÜ]');
}

/**
 * Normalizes card fields when CSV/cloud records have `sentence` and `translation` swapped
 * (e.g., Russian gloss stored in `sentence` while the full German example sentence is in `translation`).
 */
export function normalizeStudyCardContent(card: {
  targetWord?: string | null;
  sentence?: string | null;
  translation?: string | null;
  hint?: string | null;
}): NormalizedStudyCardFields {
  const targetWord = (card.targetWord || '').trim();
  const rawSentence = (card.sentence || '').trim();
  const rawTranslation = (card.translation || '').trim();
  const rawHint = (card.hint || '').trim();

  const targetHasCyrillic = HAS_CYRILLIC_RE.test(targetWord);
  if (!targetHasCyrillic) {
    const sentenceIsCyrillicOnly =
      Boolean(rawSentence) && HAS_CYRILLIC_RE.test(rawSentence) && !HAS_LATIN_RE.test(rawSentence);
    const translationIsLatinOnly =
      Boolean(rawTranslation) && HAS_LATIN_RE.test(rawTranslation) && !HAS_CYRILLIC_RE.test(rawTranslation);

    if (sentenceIsCyrillicOnly && translationIsLatinOnly) {
      return {
        targetWord,
        sentence: rawTranslation,
        translation: rawSentence,
        wasSwapped: true,
      };
    }

    if (translationIsLatinOnly && (!rawSentence || rawSentence === '-' || rawSentence === 'VERB_DRILL')) {
      const hintHasCyrillic = Boolean(rawHint) && HAS_CYRILLIC_RE.test(rawHint);
      if (hintHasCyrillic) {
        return {
          targetWord,
          sentence: rawTranslation,
          translation: rawHint,
          wasSwapped: true,
        };
      }
    }
  }

  return {
    targetWord,
    sentence: rawSentence,
    translation: rawTranslation || rawHint,
    wasSwapped: false,
  };
}

/**
 * Resolves a cloze gap (`___`) inside `rawSentence` for `rawTargetWord` and optional `forms`.
 * Returns `hasMask: false` whenever the sentence has no `___` and the target word cannot be reliably masked.
 */
export function resolveCloze(
  rawSentence: string | undefined | null,
  rawTargetWord: string,
  forms?: string | null
): ClozeResolution {
  const cleanTargetWord = (rawTargetWord || '').replace(/\|/g, '').trim();

  if (!rawSentence || rawSentence === '-' || rawSentence === 'VERB_DRILL') {
    return {
      parts: ['', ''],
      clozeWord: cleanTargetWord,
      fullSentence: cleanTargetWord,
      isCustomCloze: false,
      hasMask: false,
    };
  }

  // Common typographic cleanup: remove double spaces and stray space before punctuation.
  const sentence = rawSentence.replace(/\s+([.,!?;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  const targetWord = (rawTargetWord || '').trim();

  // Swapped/Russian-only sentence cannot form a German cloze context.
  if (HAS_CYRILLIC_RE.test(sentence) && !HAS_LATIN_RE.test(sentence)) {
    return {
      parts: ['', ''],
      clozeWord: cleanTargetWord,
      fullSentence: cleanTargetWord,
      isCustomCloze: false,
      hasMask: false,
    };
  }

  if (sentence.includes('___')) {
    const splitParts = sentence.split('___');
    return {
      parts: [splitParts[0], splitParts.slice(1).join('___')],
      clozeWord: cleanTargetWord,
      fullSentence: sentence.replace('___', cleanTargetWord),
      isCustomCloze: false,
      hasMask: true,
    };
  }

  const tw = targetWord.trim();
  const parsedGov = parseVerbComponents(cleanTargetForCandidates(tw));
  const strippedPhrase = stripLeadingArticlesAndMarkers(tw);
  const corePhrase = stripLeadingArticlesAndMarkers(parsedGov.coreWord || '');

  const candidates: string[] = [];
  const pushCandidate = (val: string) => {
    const v = val.trim();
    if (v && !candidates.includes(v)) candidates.push(v);
  };

  pushCandidate(strippedPhrase);
  pushCandidate(corePhrase);
  pushCandidate(cleanTargetWord);
  pushCandidate(tw.replace(/\|/g, ''));

  const phraseSource = strippedPhrase || corePhrase || cleanTargetWord;
  const twWords = phraseSource.split(/\s+/).filter(Boolean);

  // 1. Multi-word phrase matching with flexible endings (e.g. "tabellarische Lebenslauf" -> "tabellarischen Lebenslauf")
  if (twWords.length > 1) {
    const pattern = twWords
      .map((w) => {
        const cleanW = w.replace(/[^a-zA-ZäöüÄÖÜß-]/g, '');
        const stem = cleanW.length >= 6 ? cleanW.slice(0, -2) : (cleanW.length >= 5 ? cleanW.slice(0, -1) : cleanW);
        return `${escapeRegex(stem)}[a-zA-ZäöüÄÖÜß]*`;
      })
      .join('\\s+');
    const phraseRegex = new RegExp(`(^|[^a-zA-ZäöüÄÖÜß])(${pattern})(?=[^a-zA-ZäöüÄÖÜß]|$)`, 'i');
    const pMatch = sentence.match(phraseRegex);
    if (pMatch && pMatch.index !== undefined) {
      const prefixLen = pMatch[1] ? pMatch[1].length : 0;
      const matchStart = pMatch.index + prefixLen;
      const matchedText = pMatch[2];
      return {
        parts: [sentence.slice(0, matchStart), sentence.slice(matchStart + matchedText.length)],
        clozeWord: matchedText,
        fullSentence: sentence,
        isCustomCloze: true,
        hasMask: true,
      };
    }
  }

  // Gather candidates from `forms` (e.g. "arbeitet ab, arbeitete ab, hat abgearbeitet" or "die Foren")
  if (forms && forms !== '-') {
    const formParts = forms.split(/[,;/·]+/).map((s) => s.trim()).filter(Boolean);
    for (const fp of formParts) {
      const cleanFp = fp
        .replace(/^(?:der|die|das|hat|ist|hat sich|ist sich)\s+/i, '')
        .replace(/\s+(?:hat|ist|wird)$/i, '')
        .trim();
      pushCandidate(cleanFp);
      for (const sw of cleanFp.split(/\s+/)) {
        if (sw.length >= 4 && !STOPWORD_TOKENS.has(sw.toLowerCase())) {
          pushCandidate(sw);
        }
      }
    }
  }

  // Meaningful single tokens from multi-word `targetWord`
  if (twWords.length > 1) {
    for (let i = twWords.length - 1; i >= 0; i--) {
      const token = twWords[i].replace(/[.,!?;:()]/g, '');
      if (token.length >= 3 && !STOPWORD_TOKENS.has(token.toLowerCase()) && !CASE_PLACEHOLDER_TOKEN_RE.test(token)) {
        pushCandidate(token);
      }
    }
  }

  // Feminine "-in" base form fallback (e.g. "Teilnehmerin" -> "Teilnehmer")
  for (const cand of [...candidates]) {
    if (cand.toLowerCase().endsWith('in') && cand.length > 5) {
      pushCandidate(cand.slice(0, -2));
    }
  }

  // Separable verb Partizip II (`ge-` infix) & finite stem when prefix exists in sentence
  for (const source of [tw, ...candidates]) {
    const cleanPipe = source.trim();
    let sepPrefix = '';
    let sepBase = '';
    if (cleanPipe.includes('|')) {
      const [p, ...rest] = cleanPipe.split('|');
      sepPrefix = p.trim();
      sepBase = rest.join('').trim();
    } else {
      const lower = cleanPipe.toLowerCase();
      const matchedPrefix = SEPARABLE_PREFIXES.find((p) => lower.startsWith(p) && lower.length - p.length >= 4);
      if (matchedPrefix) {
        sepPrefix = cleanPipe.slice(0, matchedPrefix.length);
        sepBase = cleanPipe.slice(matchedPrefix.length);
      }
    }

    if (sepPrefix && sepBase.length >= 4) {
      const lowerBase = sepBase.toLowerCase();
      const baseStem = lowerBase.replace(/(?:en|n)$/i, '');
      if (baseStem.length >= 3) {
        pushCandidate(`${sepPrefix}ge${baseStem}t`);
        pushCandidate(`${sepPrefix}ge${baseStem}en`);
      }
      // Match split V2 finite verb only when the separable prefix also appears as a standalone token in the sentence.
      const prefixPresent = new RegExp(`(^|[^a-zA-ZäöüÄÖÜß])${escapeRegex(sepPrefix)}(?=[^a-zA-ZäöüÄÖÜß]|$)`, 'i').test(sentence);
      if (prefixPresent && sepBase.length >= 5) {
        pushCandidate(sepBase);
      }
    }
  }

  // 2. Exact word boundary match
  for (const cand of candidates) {
    if (cand.length < 2) continue;
    const regex = new RegExp(`(^|[^a-zA-ZäöüÄÖÜß])(${escapeRegex(cand)})(?=[^a-zA-ZäöüÄÖÜß]|$)`, 'i');
    const match = sentence.match(regex);
    if (match && match.index !== undefined) {
      const prefixLen = match[1] ? match[1].length : 0;
      const matchStart = match.index + prefixLen;
      const matchedText = match[2];
      return {
        parts: [sentence.slice(0, matchStart), sentence.slice(matchStart + matchedText.length)],
        clozeWord: matchedText,
        fullSentence: sentence,
        isCustomCloze: true,
        hasMask: true,
      };
    }
  }

  // 3. German umlaut-tolerant stem match (stem length >= 5, word boundary)
  for (const cand of candidates) {
    const stemPattern = buildStemPattern(cand, 5);
    if (!stemPattern) continue;
    const stemRegex = new RegExp(`(^|[^a-zA-ZäöüÄÖÜß])(${stemPattern}[a-zA-ZäöüÄÖÜß]*)`, 'i');
    const match = sentence.match(stemRegex);
    if (match && match.index !== undefined) {
      const prefixLen = match[1] ? match[1].length : 0;
      const matchStart = match.index + prefixLen;
      const matchedText = match[2];
      return {
        parts: [sentence.slice(0, matchStart), sentence.slice(matchStart + matchedText.length)],
        clozeWord: matchedText,
        fullSentence: sentence,
        isCustomCloze: true,
        hasMask: true,
      };
    }
  }

  // 4. Compound-word / substring stem match (stem length >= 5, expands to full containing word)
  for (const cand of candidates) {
    const stemPattern = buildStemPattern(cand, 5);
    if (!stemPattern) continue;
    const subMatch = sentence.match(new RegExp(stemPattern, 'i'));
    if (subMatch && subMatch.index !== undefined) {
      let wordStart = subMatch.index;
      while (wordStart > 0 && GERMAN_LETTER_RE.test(sentence[wordStart - 1])) {
        wordStart--;
      }
      let wordEnd = subMatch.index + subMatch[0].length;
      while (wordEnd < sentence.length && GERMAN_LETTER_RE.test(sentence[wordEnd])) {
        wordEnd++;
      }
      const fullWord = sentence.slice(wordStart, wordEnd);
      return {
        parts: [sentence.slice(0, wordStart), sentence.slice(wordEnd)],
        clozeWord: fullWord,
        fullSentence: sentence,
        isCustomCloze: true,
        hasMask: true,
      };
    }
  }

  return {
    parts: ['', ''],
    clozeWord: cleanTargetWord,
    fullSentence: sentence,
    isCustomCloze: false,
    hasMask: false,
  };
}
