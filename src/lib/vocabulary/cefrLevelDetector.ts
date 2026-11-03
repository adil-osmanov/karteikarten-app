export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';

export function detectWordLevel(
  word: string,
  deckLevel?: string | null,
  cardLevel?: string | null,
  lang: string = 'de'
): CEFRLevel {
  // 1. Приоритет: явный уровень в самой карточке
  if (cardLevel && ['A1', 'A2', 'B1', 'B2', 'C1'].includes(cardLevel.toUpperCase())) {
    return cardLevel.toUpperCase() as CEFRLevel;
  }

  // 2. Приоритет: уровень колоды или секции, в которой лежит карточка
  if (deckLevel) {
    const cleanDeck = deckLevel.toUpperCase();
    if (cleanDeck.includes('C1')) return 'C1';
    if (cleanDeck.includes('B2')) return 'B2';
    if (cleanDeck.includes('B1')) return 'B1';
    if (cleanDeck.includes('A2')) return 'A2';
    if (cleanDeck.includes('A1')) return 'A1';
  }

  const normLang = (lang || 'de').toLowerCase().trim();

  // 3. Эвристический анализатор для немецкого языка (DE)
  if (normLang === 'de') {
    const clean = word.toLowerCase().trim();
    // Академические/профессиональные абстрактные суффиксы B2/C1
    if (/(ierung|isation|ismus|tät|keit|schaft|ment|logie|graphie|enz|anz)$/.test(clean)) {
      return clean.length > 12 ? 'C1' : 'B2';
    }
    // Длинные сложные составные существительные
    if (clean.length >= 14) return 'B2';
    if (clean.length <= 5) return 'A1';
    if (clean.length <= 8) return 'A2';
    return 'B1';
  }

  // 4. Эвристика для английского языка (EN)
  if (normLang === 'en') {
    const clean = word.toLowerCase().trim();
    if (/(tion|sion|ity|ence|ance|ology|ment|ous|ive)$/.test(clean) && clean.length > 9) {
      return clean.length > 12 ? 'C1' : 'B2';
    }
    if (clean.length <= 4) return 'A1';
    if (clean.length <= 7) return 'A2';
    return 'B1';
  }

  // Дефолт
  return 'B1';
}
