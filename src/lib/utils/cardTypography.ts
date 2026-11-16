/**
 * Fluid typography helpers for study cards.
 * Each helper selects complete static Tailwind utility classes based on clean character count
 * so short words feel bold and expressive while long B2 phrases and sentences fit cleanly.
 */

function getCleanCharCount(text?: string | null): number {
  if (!text || typeof text !== 'string') return 0;
  return text
    .replace(/[|·\u2506\u250A]/g, '')
    .replace(/\s+/g, ' ')
    .trim().length;
}

/**
 * Main German target word / phrase inside a study card.
 */
export function getTargetWordFontClasses(text?: string | null): string {
  const len = getCleanCharCount(text);
  if (len <= 14) {
    return 'text-4xl sm:text-5xl md:text-[56px] font-semibold tracking-tight leading-[1.12]';
  }
  if (len <= 26) {
    return 'text-3xl sm:text-4xl md:text-[44px] font-semibold tracking-tight leading-[1.15]';
  }
  if (len <= 40) {
    return 'text-2xl sm:text-3xl md:text-[36px] font-semibold tracking-tight leading-[1.2]';
  }
  return 'text-xl sm:text-2xl md:text-[30px] font-semibold tracking-tight leading-[1.25]';
}

/**
 * Grammar forms (3 verb forms / noun plural) below the target word.
 */
export function getFormsFontClasses(text?: string | null): string {
  const len = getCleanCharCount(text);
  if (len <= 45) {
    return 'text-base sm:text-[18px] text-neutral-500 dark:text-neutral-400 mt-2.5 leading-snug';
  }
  return 'text-sm sm:text-[15px] text-neutral-500 dark:text-neutral-400 mt-2.5 leading-snug';
}

/**
 * Russian translation on the back of Karten flashcards (or fallback prompt).
 */
export function getTranslationFontClasses(text?: string | null): string {
  const len = getCleanCharCount(text);
  if (len <= 28) {
    return 'text-2xl sm:text-[28px] font-medium text-neutral-900 dark:text-neutral-100 leading-snug';
  }
  if (len <= 55) {
    return 'text-xl sm:text-[23px] font-medium text-neutral-900 dark:text-neutral-100 leading-snug';
  }
  return 'text-lg sm:text-[19px] font-medium text-neutral-900 dark:text-neutral-100 leading-snug';
}

/**
 * Prompt heading size when Russian translation is the primary Active Recall question.
 */
export function getRecallPromptFontClasses(text?: string | null): string {
  const len = getCleanCharCount(text);
  if (len <= 28) {
    return 'text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100 leading-tight';
  }
  if (len <= 55) {
    return 'text-xl sm:text-2xl md:text-[30px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100 leading-snug';
  }
  return 'text-lg sm:text-xl md:text-[24px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100 leading-snug';
}

/**
 * Example sentence block on Karten cards.
 */
export function getExampleSentenceFontClasses(text?: string | null): string {
  const len = getCleanCharCount(text);
  if (len <= 75) {
    return 'text-lg sm:text-[20px] leading-relaxed text-neutral-700 dark:text-neutral-300';
  }
  return 'text-base sm:text-[17px] leading-relaxed text-neutral-700 dark:text-neutral-300';
}

/**
 * Contextual cloze sentence in Lücken exercises.
 */
export function getClozeSentenceFontClasses(text?: string | null): string {
  const len = getCleanCharCount(text);
  if (len <= 80) {
    return 'text-2xl sm:text-[30px] font-medium leading-[1.4]';
  }
  return 'text-xl sm:text-[24px] font-medium leading-[1.45]';
}
