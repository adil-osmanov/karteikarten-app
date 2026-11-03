import React from 'react';

/**
 * Отрендерить слово с отделяемой приставкой (z.B. "auf|schrauben")
 * со стильным цветным вертикальным разделителем Apple-стиля.
 */
export function formatSeparableWord(word: string): React.ReactNode {
  if (!word || typeof word !== 'string' || !word.includes('|')) {
    return word;
  }
  const cleanWord = word.replace(/\s*\|\s*/g, '|');
  const parts = cleanWord.split('|');
  return (
    <span className="inline-flex items-baseline">
      <span>{parts[0]}</span>
      <span
        className="text-neutral-400 dark:text-neutral-500 font-light select-none px-[0.5px]"
        aria-hidden="true"
      >
        |
      </span>
      <span>{parts.slice(1).join('')}</span>
    </span>
  );
}
