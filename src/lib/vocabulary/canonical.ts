const ARTICLES = /^(der|die|das|dem|den|des|ein|eine|einen|einem|einer)\s+/i;
const GOVERNANCE = /^(jemanden|jemandem|etwas|sich|jdn\.|jdm\.|etw\.)\s+/i;

/**
 * Единая утилита получения канонического ключа слова для дедупликации,
 * сквозной синхронизации прогресса и очереди повторений (Canonical Lemma Sync).
 */
export function getCanonicalKey(rawWord?: string | null): string {
  if (!rawWord) return '';
  return rawWord
    .trim()
    .toLowerCase()
    .replace(/\|/g, '') // убираем разделитель отделяемых приставок
    .replace(ARTICLES, '') // убираем артикли
    .replace(GOVERNANCE, '') // убираем управление jemanden/etwas
    .replace(/[^a-zäöüß0-9]/gi, '') // убираем пунктуацию и пробелы
    .trim();
}

/**
 * Проверяет, является ли карточка освоенной глобально:
 * либо через её собственный статус (isArchived || masteryLevel >= 4),
 * либо через наличие её канонического ключа в Set освоенных слов (masteredSet).
 */
export function isCardCanonicalMastered(
  card?: {
    isArchived?: boolean;
    masteryLevel?: number;
    targetWord?: string;
    front?: string;
    word?: string;
    missingWord?: string;
    infinitive?: string;
  } | null,
  masteredSet?: Set<string> | null
): boolean {
  if (!card) return false;
  if (card.isArchived || (card.masteryLevel ?? 0) >= 4) return true;
  if (!masteredSet || masteredSet.size === 0) return false;
  const raw = card.targetWord || card.front || card.word || card.missingWord || card.infinitive || '';
  const key = getCanonicalKey(raw);
  return Boolean(key && masteredSet.has(key));
}

/**
 * Формирует Set канонических ключей всех выученных слов (из матрицы и колод).
 */
export function buildMasteredCanonicalSet(
  masteredEntries?: { lemma?: string; originalWord?: string; word?: string }[] | null,
  allDecks?: { cards?: { isArchived?: boolean; masteryLevel?: number; targetWord?: string; front?: string; word?: string; missingWord?: string; infinitive?: string }[] }[] | null
): Set<string> {
  const set = new Set<string>();

  if (masteredEntries && Array.isArray(masteredEntries)) {
    for (const entry of masteredEntries) {
      const raw = entry.lemma || (entry as any).word || entry.originalWord || '';
      const k = getCanonicalKey(raw);
      if (k) set.add(k);
    }
  }

  if (allDecks && Array.isArray(allDecks)) {
    for (const d of allDecks) {
      for (const c of d.cards || []) {
        if (c.isArchived || (c.masteryLevel ?? 0) >= 4) {
          const raw = c.targetWord || c.front || c.word || c.missingWord || c.infinitive || '';
          const k = getCanonicalKey(raw);
          if (k) set.add(k);
        }
      }
    }
  }

  return set;
}
