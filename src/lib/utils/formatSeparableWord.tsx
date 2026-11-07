import React from 'react';

export const GERMAN_SEPARABLE_PREFIXES = [
  'ab', 'an', 'auf', 'aus', 'bei', 'ein', 'fest', 'fort', 'her', 'hin',
  'los', 'mit', 'nach', 'vor', 'weg', 'weiter', 'zu', 'zurück', 'zusammen'
];

/**
 * Автоматически находит отделяемую приставку в глаголе на основе форм глагола
 * (напр. "holt ein", "hat eingeholt") и вставляет маркер "|".
 */
export function detectAndMarkSeparable(word: string, forms?: string | null): string {
  if (!word || typeof word !== 'string') return word || '';
  if (word.includes('|')) return word;
  if (!forms || typeof forms !== 'string') return word;

  const prefixRegex = /\b(?:[a-zA-ZäöüÄÖÜß]+)\s+(ab|an|auf|aus|bei|ein|fest|fort|her|hin|los|mit|nach|vor|weg|weiter|zu|zurück|zusammen)\b/i;
  const geRegex = /\b(ab|an|auf|aus|bei|ein|fest|fort|her|hin|los|mit|nach|vor|weg|weiter|zu|zurück|zusammen)ge[a-zA-ZäöüÄÖÜß]+\b/i;

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

/**
 * Отрендерить слово с отделяемой приставкой (z.B. "auf|schrauben", "ein|holen", "ein Angebot ein|holen")
 * со стильным цветным вертикальным разделителем Apple-стиля.
 */
export function formatSeparableWord(
  word: string,
  forms?: string | null,
  variant: 'emerald' | 'red' | 'neutral' = 'emerald'
): React.ReactNode {
  if (!word || typeof word !== 'string') {
    return word;
  }

  const markedWord = word.includes('|') ? word : detectAndMarkSeparable(word, forms);
  if (!markedWord.includes('|')) {
    return word;
  }

  const cleanWord = markedWord.replace(/\s*\|\s*/g, '|');
  const parts = cleanWord.split('|');

  const dividerColor =
    variant === 'red'
      ? 'text-red-400/60 dark:text-red-300/50'
      : variant === 'neutral'
      ? 'text-neutral-400 dark:text-neutral-500'
      : 'text-emerald-400/60 dark:text-emerald-300/50';

  return (
    <span className="inline-flex items-baseline">
      <span>{parts[0]}</span>
      <span
        className={`${dividerColor} mx-0.5 font-light select-none`}
        aria-hidden="true"
      >
        |
      </span>
      <span>{parts.slice(1).join('')}</span>
    </span>
  );
}
