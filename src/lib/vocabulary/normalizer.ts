/**
 * Normalization utility for German vocabulary words and lemmas.
 * Automatically strips articles, footnotes, trennbar separators, punctuation, and variants.
 * Strictly guarantees isolation of a single German lemma.
 */

export function extractGermanLemma(rawFront: string): string {
  if (!rawFront || typeof rawFront !== 'string') return '';
  
  let cleaned = rawFront
    .toLowerCase()
    // 1. Срезаем скобки со сносками [ ... ] или ( ... )
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    // 2. Срезаем артикли (der, die, das, ein, eine)
    .replace(/^(der|die|das|ein|eine)\s+/i, '')
    // 3. Срезаем разделители отделяемых приставок и спецсимволы
    .replace(/[|•·\(\)\[\]\{\},;:\.!\?«»"']/g, '')
    // 4. Берем первую часть до разделителей (/, ;, |)
    .split('/')[0]
    .split(';')[0]
    .split('|')[0]
    .trim();

  // 5. КРИТИЧЕСКОЕ ПРАВИЛО: строго изолируем одно целевое слово (если строка содержит пробелы)
  const single = cleaned.split(/\s+/)[0] || '';
  return single.trim();
}

export const normalizeGermanLemma = extractGermanLemma;

/**
 * Checks if a normalized string can be considered a valid vocabulary lemma
 */
export function isValidGermanLemma(lemma: string): boolean {
  if (!lemma || lemma.length < 2) return false;
  // Ignore special non-word markers like '-', 'VERB_DRILL', etc.
  if (/^[-—_0-9]+$/.test(lemma)) return false;
  // Must contain valid German alphabet characters
  if (!/[a-zA-ZäöüÄÖÜß]/.test(lemma)) return false;
  return true;
}
