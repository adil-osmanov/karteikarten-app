import React from 'react';

// СТРОГИЙ список только для внешнего серого лейбла (КАТЕГОРИЧЕСКИ без 'sich'):
export const EXTERNAL_GOVERNANCE_REGEX = /^(jemandem\s+etwas|jemanden|jemandem|etwas|jdn\.|jdm\.|etw\.)\s+/i;
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
  'ab', 'an', 'auf', 'aus', 'bei', 'dar', 'ein', 'empor', 'fest', 'fort', 'frei',
  'heim', 'her', 'hin', 'los', 'mit', 'nach', 'nieder', 'statt', 'teil',
  'vor', 'weg', 'zu', 'wieder'
].sort((a, b) => b.length - a.length);

/**
 * Автоматически находит отделяемую приставку в глаголе на основе форм глагола
 * (напр. "schnuppert rein", "hat reingeschnuppert") или по известным отделяемым префиксам
 * и вставляет маркер "|".
 */
export function detectAndMarkSeparable(word: string, forms?: string | null): string {
  if (!word || typeof word !== 'string') return word || '';
  if (word.includes('|')) return word;

  const prefixPattern = GERMAN_SEPARABLE_PREFIXES.join('|');

  // 1. Поиск по формам глагола (e.g. "schnuppert rein", "hat reingeschnuppert")
  if (forms && typeof forms === 'string') {
    const prefixRegex = new RegExp(`\\b(?:[a-zA-ZäöüÄÖÜß]+)\\s+(?:sich\\s+)?(${prefixPattern})\\b`, 'i');
    const geRegex = new RegExp(`\\b(${prefixPattern})ge[a-zA-ZäöüÄÖÜß]+\\b`, 'i');

    const match = forms.match(prefixRegex) || forms.match(geRegex);
    if (match) {
      const prefix = match[1].toLowerCase();
      const tokens = word.split(' ');
      const markedTokens = tokens.map((token) => {
        const lower = token.toLowerCase();
        if (lower.startsWith(prefix) && lower.length >= prefix.length + 3) {
          return token.slice(0, prefix.length) + '|' + token.slice(prefix.length);
        }
        return token;
      });
      const res = markedTokens.join(' ');
      if (res.includes('|')) return res;
    }
  }

  // 2. Fallback: поиск по списку строго отделяемых приставок для глаголов (ending in en, eln, ern)
  const tokens = word.split(' ');
  const markedTokens = tokens.map((token) => {
    const lower = token.toLowerCase();
    if (!/(en|eln|ern)$/i.test(lower)) return token;

    for (const prefix of GERMAN_SEPARABLE_PREFIXES) {
      if (lower.startsWith(prefix) && lower.length >= prefix.length + 3) {
        // Убеждаемся, что основа глагола выглядит как реальный корень
        return token.slice(0, prefix.length) + '|' + token.slice(prefix.length);
      }
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
        {parts.prefixPart}<span className="opacity-40 mx-0.5 font-light select-none" aria-hidden="true">|</span>{parts.stemPart}
      </span>
    );
  }

  return (
    <span className="whitespace-nowrap font-medium tracking-tight">
      {parts.cleanWord}
    </span>
  );
}
