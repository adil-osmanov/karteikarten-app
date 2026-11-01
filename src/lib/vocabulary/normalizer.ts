/**
 * Normalization utility for German vocabulary words and lemmas.
 * Automatically strips articles, trennbar separators, punctuation, and variants.
 */

export function extractGermanLemma(rawFront: string): string {
  if (!rawFront || typeof rawFront !== 'string') return '';
  
  return rawFront
    .toLowerCase()
    // 1. Срезаем артикли (der, die, das)
    .replace(/^(der|die|das)\s+/i, '')
    // 2. Срезаем разделители отделяемых приставок и спецсимволы
    .replace(/[|•·\(\)\[\]\{\},;:\.!\?]/g, '')
    // 3. Берем первое слово, если указано несколько вариантов через слэш
    .split('/')[0]
    // 4. Очищаем пробельные символы
    .trim();
}

/**
 * Checks if a normalized string can be considered a valid vocabulary lemma
 */
export function isValidGermanLemma(lemma: string): boolean {
  if (!lemma || lemma.length < 2) return false;
  // Ignore special non-word markers like '-', 'VERB_DRILL', etc.
  if (/^[-—_0-9]+$/.test(lemma)) return false;
  return true;
}
