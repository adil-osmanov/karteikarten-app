import { AppLang, normalizeLanguageCode } from './defaultLexiconMap';

/**
 * Normalization utility for vocabulary words and lemmas across DE, EN, and RU.
 * Automatically strips articles, footnotes, separators, punctuation, and variants.
 * Strictly guarantees isolation of a single canonical lemma.
 */

export function extractLemma(rawFront: string, lang: AppLang | string = 'de'): string {
  if (!rawFront || typeof rawFront !== 'string') return '';
  const normLang = normalizeLanguageCode(lang);

  let cleaned = rawFront
    .toLowerCase()
    // 1. Срезаем скобки со сносками [ ... ] или ( ... )
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    // 2. Срезаем артикли в зависимости от языка
    .replace(normLang === 'de' ? /^(der|die|das|ein|eine)\s+/i : normLang === 'en' ? /^(the|a|an|to)\s+/i : /^$/, '')
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

export function isValidLemma(lemma: string, lang: AppLang | string = 'de'): boolean {
  if (!lemma || lemma.length < 2) return false;
  // Ignore special non-word markers like '-', 'VERB_DRILL', etc.
  if (/^[-—_0-9]+$/.test(lemma)) return false;
  
  const normLang = normalizeLanguageCode(lang);
  if (normLang === 'de') {
    return /[a-zA-ZäöüÄÖÜß]/.test(lemma);
  }
  if (normLang === 'en') {
    return /^[a-zA-Z]+$/.test(lemma);
  }
  if (normLang === 'ru') {
    return /^[а-яёА-ЯЁ]+$/.test(lemma);
  }
  return true;
}

// Full backwards compatibility for German helpers
export const extractGermanLemma = (raw: string) => extractLemma(raw, 'de');
export const normalizeGermanLemma = extractGermanLemma;
export const isValidGermanLemma = (lemma: string) => isValidLemma(lemma, 'de');
