import React from 'react';

export const GOVERNANCE_REGEX = /^(jemanden|jemandem|etwas|sich|jdn\.|jdm\.|etw\.)\s+/i;

export function parseVerbComponents(rawTarget: string, externalPrefix?: string) {
  let cleanTarget = (rawTarget || '').trim();
  let prefix = externalPrefix?.trim() || '';

  // Если в самой строке слова уже есть управление (jemanden, jemandem и т.д.)
  const match = cleanTarget.match(GOVERNANCE_REGEX);
  if (match) {
    if (!prefix) {
      prefix = match[1]; // Выносим его в левый лейбл
    }
    // УДАЛЯЕМ управление из строки, которая рендерится внутри инпута!
    cleanTarget = cleanTarget.replace(GOVERNANCE_REGEX, '').trim();
  }

  return { prefix, coreWord: cleanTarget };
}

export const GERMAN_SEPARABLE_PREFIXES = [
  'auseinander', 'gegenüber', 'zusammen', 'entgegen', 'vorüber', 'herunter', 'hinunter',
  'hinüber', 'herüber', 'hervor', 'zurück', 'zurecht', 'entlang', 'entzwei',
  'heraus', 'herein', 'herauf', 'herbei', 'herum', 'heran', 'herab',
  'hinaus', 'hinein', 'hinauf', 'hinweg', 'hinzu', 'hinab',
  'weiter', 'wieder', 'voraus', 'vorbei', 'vorweg', 'voran',
  'ab', 'an', 'auf', 'aus', 'bei', 'dar', 'ein', 'empor', 'fest', 'fort', 'frei',
  'heim', 'her', 'hin', 'los', 'mit', 'nach', 'nieder', 'statt', 'teil',
  'vor', 'weg', 'zu'
].sort((a, b) => b.length - a.length);

/**
 * Автоматически находит отделяемую приставку в глаголе на основе форм глагола
 * (напр. "holt ein", "hat eingeholt") и вставляет маркер "|".
 */
export function detectAndMarkSeparable(word: string, forms?: string | null): string {
  if (!word || typeof word !== 'string') return word || '';
  if (word.includes('|')) return word;
  if (!forms || typeof forms !== 'string') return word;

  const prefixPattern = GERMAN_SEPARABLE_PREFIXES.join('|');
  const prefixRegex = new RegExp(`\\b(?:[a-zA-ZäöüÄÖÜß]+)\\s+(${prefixPattern})\\b`, 'i');
  const geRegex = new RegExp(`\\b(${prefixPattern})ge[a-zA-ZäöüÄÖÜß]+\\b`, 'i');

  const match = forms.match(prefixRegex) || forms.match(geRegex);
  if (!match) return word;

  const prefix = match[1].toLowerCase();

  // Ищем токен во фразе/слове, который начинается с этой приставки
  const tokens = word.split(' ');
  const markedTokens = tokens.map((token) => {
    const lower = token.toLowerCase();
    // Приставка должна быть в начале глагола (длина глагола минимум на 3 буквы длиннее приставки)
    if (lower.startsWith(prefix) && lower.length >= prefix.length + 3) {
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
      <span className="inline-flex items-center font-medium tracking-tight whitespace-nowrap">
        <span className="whitespace-nowrap">{parts.prefixPart}</span>
        <span className="text-current opacity-40 mx-0.5 font-light select-none whitespace-nowrap" aria-hidden="true">
          |
        </span>
        <span className="whitespace-nowrap">{parts.stemPart}</span>
      </span>
    );
  }

  return (
    <span className="whitespace-nowrap font-medium tracking-tight">
      {parts.cleanWord}
    </span>
  );
}
