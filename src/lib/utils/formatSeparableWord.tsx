import React from 'react';

// СТРОГИЙ список только для внешнего серого лейбла (КАТЕГОРИЧЕСКИ без 'sich'):
export const EXTERNAL_GOVERNANCE_REGEX = /^(?:(?:in|an|auf|aus|bei|mit|nach|über|um|unter|von|vor|zu|für|gegen|durch)\s+)?(jemandem\s+etwas|jemanden|jemandem|etwas|jdn\.|jdm\.|etw\.)\s+/i;
export const GOVERNANCE_REGEX = EXTERNAL_GOVERNANCE_REGEX;

export function parseVerbComponents(rawTarget: string, externalPrefixProp?: string) {
  let cleanTarget = (rawTarget || '').trim();
  let externalPrefix = (externalPrefixProp || '').trim();

  // Проверяем наличие управления ТОЛЬКО из разрешенного списка (без 'sich'):
  const match = cleanTarget.match(EXTERNAL_GOVERNANCE_REGEX);
  if (match) {
    if (!externalPrefix) {
      externalPrefix = match[1]; // jemanden / jemandem / etwas
    }
    // Срезаем ТОЛЬКО jemanden/jemandem/etwas:
    cleanTarget = cleanTarget.replace(EXTERNAL_GOVERNANCE_REGEX, '').trim();
  }

  // «sich» остается частью cleanTarget!
  // cleanTarget теперь содержит: "sich entscheiden", "sich aus|ruhen" и т.д.
  return {
    prefix: externalPrefix,
    externalPrefix,
    coreWord: cleanTarget,
    inputTarget: cleanTarget,
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
}

export function splitSeparableWord(word: string, forms?: string | null): SeparableWordParts {
  if (!word || typeof word !== 'string') {
    return { isSeparable: false, prefixPart: '', stemPart: '', cleanWord: '' };
  }

  // Очищаем от возможного управления (jemanden, jemandem и т.д.)
  const { coreWord } = parseVerbComponents(word);
  const targetToMark = coreWord;

  const markedWord = targetToMark.includes('|') ? targetToMark : detectAndMarkSeparable(targetToMark, forms);
  if (!markedWord.includes('|')) {
    return { isSeparable: false, prefixPart: '', stemPart: '', cleanWord: markedWord };
  }

  const cleanWord = markedWord.replace(/\s*\|\s*/g, '|');
  const parts = cleanWord.split('|');
  const prefixPart = parts[0];
  const stemPart = parts.slice(1).join('');

  return {
    isSeparable: true,
    prefixPart,
    stemPart,
    cleanWord: `${prefixPart}${stemPart}`
  };
}

/**
 * Отрендерить слово с отделяемой приставкой (z.B. "auf|schrauben", "ein|holen", "vor|heizen")
 * со стильным цветным вертикальным разделителем Apple-стиля и гарантированным запретом переноса строки.
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

  if (parts.isSeparable) {
    return (
      <span className="whitespace-nowrap font-medium tracking-tight">
        {parts.prefixPart}<span className="text-neutral-400 dark:text-neutral-400 font-normal mx-0.5 select-none" aria-hidden="true">|</span>{parts.stemPart}
      </span>
    );
  }

  return (
    <span className="whitespace-nowrap font-medium tracking-tight">
      {parts.cleanWord}
    </span>
  );
}
