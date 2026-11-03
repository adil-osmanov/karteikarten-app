import React from 'react';

/**
 * Отрендерить слово с отделяемой приставкой (z.B. "auf|schrauben")
 * со стильным цветным вертикальным разделителем Apple-стиля.
 */
export function formatSeparableWord(word: string): React.ReactNode {
  if (!word || typeof word !== 'string' || !word.includes('|')) {
    return word;
  }
  const parts = word.split('|');
  return (
    <span className="inline-flex items-center">
      <span>{parts[0]}</span>
      <span
        className="inline-block w-[2.5px] h-[0.8em] mx-1 bg-blue-500/80 dark:bg-blue-400 rounded-full align-middle"
        title="Trennbare Vorsilbe"
      />
      <span>{parts.slice(1).join('')}</span>
    </span>
  );
}
