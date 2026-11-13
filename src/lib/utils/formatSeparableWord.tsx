import React from 'react';

// СТРОГИЙ список только для внешнего серого лейбла (без одиночного 'sich'):
export const EXTERNAL_GOVERNANCE_REGEX = /^(?:(?:in|an|auf|aus|bei|mit|nach|über|um|unter|von|vor|zu|für|gegen|durch)\s+)?(jemandem\s+etwas|jemanden|jemandem|etwas|jdn\.|jdm\.|etw\.)\s+/i;
export const GOVERNANCE_REGEX = EXTERNAL_GOVERNANCE_REGEX;

const GOVERNANCE_PREPOSITIONS = new Set([
  'in', 'an', 'auf', 'aus', 'bei', 'mit', 'nach', 'über', 'um', 'unter',
  'von', 'vor', 'zu', 'für', 'gegen', 'durch', 'gegenüber', 'zwischen',
  'neben', 'hinter', 'wegen', 'trotz', 'aufgrund', 'als', 'wie',
  'ins', 'ans', 'aufs', 'zum', 'zur', 'beim', 'vom', 'im', 'am', '+'
]);

const GOVERNANCE_HELPERS = new Set([
  'jemanden', 'jemandem', 'jemandes', 'jemand', 'etwas',
  'jdn.', 'jdm.', 'jds.', 'etw.', 'jdn', 'jdm', 'jds', 'etw'
]);

const GOVERNANCE_CASE_TAGS = new Set([
  'akk', 'akk.', 'dat', 'dat.', 'gen', 'gen.', 'nom', 'nom.'
]);

function stripWrappingParens(token: string): string {
  return token.replace(/^[(\[]+|[)\]]+$/g, '').toLowerCase().trim();
}

function classifyGovernanceToken(token: string): { isHelperOrCase: boolean; isPrep: boolean; isSich: boolean } {
  const parts = stripWrappingParens(token).split('/').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { isHelperOrCase: false, isPrep: false, isSich: false };

  let allHelperOrCase = true;
  let allPrep = true;
  let allSich = true;

  for (const part of parts) {
    const isH = GOVERNANCE_HELPERS.has(part) || GOVERNANCE_CASE_TAGS.has(part);
    const isP = GOVERNANCE_PREPOSITIONS.has(part);
    const isS = part === 'sich';
    if (!isH) allHelperOrCase = false;
    if (!isP) allPrep = false;
    if (!isS) allSich = false;
    if (!isH && !isP && !isS) {
      return { isHelperOrCase: false, isPrep: false, isSich: false };
    }
  }

  return { isHelperOrCase: allHelperOrCase, isPrep: allPrep, isSich: allSich };
}

function isAnyGovernanceToken(token: string, allowSich: boolean): boolean {
  const { isHelperOrCase, isPrep, isSich } = classifyGovernanceToken(token);
  return isHelperOrCase || isPrep || (allowSich && isSich);
}

export interface ParsedVerbComponents {
  leadingText: string;
  coreWord: string;
  trailingText: string;
  prefix: string;
  externalPrefix: string;
  inputTarget: string;
}

export function parseVerbComponents(rawTarget: string, externalPrefixProp?: string): ParsedVerbComponents {
  const cleanTarget = (rawTarget || '').replace(/\s+/g, ' ').trim();
  const propPrefix = (externalPrefixProp || '').trim();

  if (!cleanTarget) {
    return {
      leadingText: propPrefix,
      coreWord: '',
      trailingText: '',
      prefix: propPrefix,
      externalPrefix: propPrefix,
      inputTarget: '',
    };
  }

  // Существительные с артиклем (der/die/das) не разбиваются на управление
  if (/^(der|die|das)\s+/i.test(cleanTarget)) {
    return {
      leadingText: propPrefix,
      coreWord: cleanTarget,
      trailingText: '',
      prefix: propPrefix,
      externalPrefix: propPrefix,
      inputTarget: cleanTarget,
    };
  }

  const tokens = cleanTarget.split(' ').filter(Boolean);
  let startIdx = 0;

  // 1. Собираем ВСЕ ведущие токены управления (включая середину вроде "vor jemandem" и "sich an jemanden")
  while (startIdx < tokens.length - 1) {
    const cls = classifyGovernanceToken(tokens[startIdx]);
    if (cls.isHelperOrCase) {
      startIdx++;
      continue;
    }
    if (cls.isSich) {
      // Одиночное "sich" перед глаголом ("sich entscheiden") оставляем внутри coreWord,
      // но "sich an jemanden ..." выносим целиком в leadingText
      const next = tokens[startIdx + 1];
      const hasMoreGovAhead =
        startIdx + 1 < tokens.length - 1 &&
        isAnyGovernanceToken(next, true);
      if (startIdx > 0 || hasMoreGovAhead) {
        startIdx++;
        continue;
      }
      break;
    }
    if (cls.isPrep) {
      const next = tokens[startIdx + 1];
      if (startIdx + 1 < tokens.length - 1 && isAnyGovernanceToken(next, true)) {
        startIdx++;
        continue;
      }
      break;
    }
    break;
  }

  // Гарантируем, что одиночный "sich" без предлогов/объектов не ушёл в leadingText
  const candidateLeading = tokens.slice(0, startIdx);
  const leadingHasGovContent = candidateLeading.some((t) => {
    const c = classifyGovernanceToken(t);
    return c.isHelperOrCase || c.isPrep;
  });
  if (!leadingHasGovContent) {
    startIdx = 0;
  }

  // 2. Собираем ВСЕ хвостовые токены управления после глагола (напр. "warten auf etwas" -> trailingText = "auf etwas")
  let endIdx = tokens.length - 1;
  while (endIdx > startIdx) {
    if (isAnyGovernanceToken(tokens[endIdx], false)) {
      endIdx--;
      continue;
    }
    break;
  }

  const leadingTokens = tokens.slice(0, startIdx);
  const coreTokens = tokens.slice(startIdx, endIdx + 1);
  const trailingTokens = tokens.slice(endIdx + 1);

  const computedLeading = leadingTokens.join(' ');
  const leadingText = computedLeading || propPrefix;
  const coreWord = coreTokens.join(' ');
  const trailingText = trailingTokens.join(' ');

  return {
    leadingText,
    coreWord,
    trailingText,
    prefix: leadingText,
    externalPrefix: leadingText,
    inputTarget: coreWord,
  };
}

export const GERMAN_SEPARABLE_PREFIXES = [
  'auseinander', 'gegenüber', 'zusammen', 'entgegen', 'vorüber', 'herunter', 'hinunter',
  'hinüber', 'herüber', 'hervor', 'zurück', 'zurecht', 'entlang', 'entzwei',
  'dazwischen', 'daneben', 'vorweg', 'voraus', 'vorbei', 'voran', 'weiter',
  'heraus', 'herein', 'herauf', 'herbei', 'herum', 'heran', 'herab',
  'hinaus', 'hinein', 'hinauf', 'hinweg', 'hinzu', 'hinab',
  'runter', 'rüber', 'raus', 'rein', 'rum', 'ran',
  'ab', 'an', 'auf', 'aus', 'bei', 'dar', 'ein', 'empor', 'fern', 'fest', 'fort', 'frei',
  'heim', 'her', 'hin', 'los', 'mit', 'nach', 'nieder', 'statt', 'teil',
  'vor', 'weg', 'zu', 'wieder'
].sort((a, b) => b.length - a.length);

// Явный черный список неделимых глаголов, начинающихся на созвучные с приставками буквы
export const INSEPARABLE_GUARD_VERBS = new Set([
  'reinigen',
  'reisen',
  'reißen',
  'reiten',
  'reichen',
  'reimen',
  'reizen',
  'beinhalten',
  'beantragen',
]);

/**
 * Извлекает подтвержденные отделяемые приставки из форм глагола (Präsens/Partizip II).
 * Если Partizip II начинается с `ge-` (напр. "hat gereinigt"), глагол строго неделимый.
 */
function extractConfirmedPrefixesFromForms(forms: string): {
  confirmedPrefixes: string[];
  participleWords: string[];
} {
  const prefixPattern = GERMAN_SEPARABLE_PREFIXES.join('|');
  const segments = forms
    .split(/[·;,/\n()]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const confirmed = new Set<string>();
  const participleWords: string[] = [];

  const innerGeRegex = new RegExp(`^(?:(?:hat|ist|wird)(?:\\s+sich)?\\s+)?(${prefixPattern})ge[a-zA-ZäöüÄÖÜß]+$`, 'i');
  const detachedPrefixRegex = new RegExp(`^[a-zA-ZäöüÄÖÜß]+(?:\\s+[a-zA-ZäöüÄÖÜß.]+){0,3}\\s+(${prefixPattern})$`, 'i');
  const bareGeParticipleRegex = /^(?:(?:hat|ist|wird)(?:\s+sich)?\s+)?(ge[a-zA-ZäöüÄÖÜß]+)$/i;

  for (const segment of segments) {
    const geStartMatch = segment.match(bareGeParticipleRegex);
    if (geStartMatch) {
      participleWords.push(geStartMatch[1].toLowerCase());
    }

    const innerGeMatch = segment.match(innerGeRegex);
    if (innerGeMatch) {
      confirmed.add(innerGeMatch[1].toLowerCase());
      continue;
    }

    const detachedMatch = segment.match(detachedPrefixRegex);
    if (detachedMatch) {
      confirmed.add(detachedMatch[1].toLowerCase());
    }
  }

  return {
    confirmedPrefixes: Array.from(confirmed),
    participleWords,
  };
}

/**
 * Автоматически находит отделяемую приставку в глаголе ТОЛЬКО если:
 * 1. В слове уже нет явного маркера `|` (приоритет явного разделителя).
 * 2. Токен не входит в черный список неделимых глаголов.
 * 3. Формы глагола (Präsens / Partizip II) прямо доказывают отделяемость,
 *    а Partizip II не начинается с `ge-` перед предполагаемой приставкой (напр. "hat gereinigt").
 */
export function detectAndMarkSeparable(word: string, forms?: string | null): string {
  if (!word || typeof word !== 'string') return word || '';
  // 1. Приоритет явного разделителя
  if (word.includes('|')) return word;

  // 2. Без форм глагола автоопределение не угадывает приставку вслепую
  if (!forms || typeof forms !== 'string' || !forms.trim()) {
    return word;
  }

  const { confirmedPrefixes, participleWords } = extractConfirmedPrefixesFromForms(forms);
  if (confirmedPrefixes.length === 0) {
    return word;
  }

  const tokens = word.split(' ');
  const markedTokens = tokens.map((token) => {
    const lower = token.toLowerCase();
    if (!/(en|eln|ern)$/i.test(lower)) return token;
    if (INSEPARABLE_GUARD_VERBS.has(lower)) return token;

    for (const prefix of confirmedPrefixes) {
      if (!lower.startsWith(prefix) || lower.length < prefix.length + 3) {
        continue;
      }

      // Если в Partizip II `ge-` стоит в начале слова (напр. "gereinigt", "gereist", "gereicht")
      // — это неделимый глагол (исключение только если сама приставка начинается на "ge-", напр. "gegenüberge...")
      const hasInseparableLeadingGe = participleWords.some((pWord) => {
        if (pWord.startsWith(`ge${prefix}`)) return true;
        return !prefix.startsWith('ge') && pWord.startsWith('ge');
      });
      if (hasInseparableLeadingGe) {
        continue;
      }

      return token.slice(0, prefix.length) + '|' + token.slice(prefix.length);
    }

    return token;
  });

  return markedTokens.join(' ');
}

export interface SeparableWordParts {
  isSeparable: boolean;
  prefixPart: string;
  stemPart: string;
  cleanWord: string;
  leadingText?: string;
  trailingText?: string;
}

export function splitSeparableWord(word: string, forms?: string | null): SeparableWordParts {
  if (!word || typeof word !== 'string') {
    return { isSeparable: false, prefixPart: '', stemPart: '', cleanWord: '' };
  }

  // Сохраняем ведущие и хвостовые части конструкции (напр. "jemanden vor jemandem", "auf etwas")
  const { leadingText, coreWord, trailingText } = parseVerbComponents(word);
  const targetToMark = coreWord;

  const markedWord = targetToMark.includes('|') ? targetToMark : detectAndMarkSeparable(targetToMark, forms);
  if (!markedWord.includes('|')) {
    return {
      isSeparable: false,
      prefixPart: '',
      stemPart: '',
      cleanWord: markedWord,
      leadingText,
      trailingText,
    };
  }

  const cleanWord = markedWord.replace(/\s*\|\s*/g, '|');
  const parts = cleanWord.split('|');
  const prefixPart = parts[0];
  const stemPart = parts.slice(1).join('');

  return {
    isSeparable: true,
    prefixPart,
    stemPart,
    cleanWord: `${prefixPart}${stemPart}`,
    leadingText,
    trailingText,
  };
}

/**
 * Отрендерить слово с отделяемой приставкой (z.B. "auf|schrauben", "ein|holen", "vor|heizen")
 * и полной конструкцией управления без потери средних/хвостовых слов.
 */
export function formatSeparableWord(
  word: string,
  forms?: string | null,
  _variant: 'emerald' | 'red' | 'neutral' = 'emerald'
): React.ReactNode {
  if (!word || typeof word !== 'string') {
    return word;
  }

  const parts = splitSeparableWord(word, forms);

  const coreNode = parts.isSeparable ? (
    <>
      {parts.prefixPart}<span className="text-neutral-400 dark:text-white/30 font-normal select-none px-[0.5px]" aria-hidden="true">·</span>{parts.stemPart}
    </>
  ) : (
    parts.cleanWord
  );

  if (parts.leadingText || parts.trailingText) {
    return (
      <span className="font-medium tracking-tight">
        {parts.leadingText ? <>{parts.leadingText}{' '}</> : null}
        <span className="whitespace-nowrap">{coreNode}</span>
        {parts.trailingText ? <>{' '}{parts.trailingText}</> : null}
      </span>
    );
  }

  return (
    <span className="whitespace-nowrap font-medium tracking-tight">
      {coreNode}
    </span>
  );
}
