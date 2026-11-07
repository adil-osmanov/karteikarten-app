/**
 * Единая утилита получения канонического ключа немецкого слова для дедупликации,
 * сквозной синхронизации прогресса и очереди повторений (Canonical Lemma Sync).
 */
export function getCanonicalKey(rawWord?: string | null): string {
  if (!rawWord) return '';

  let word = rawWord.trim().toLowerCase();

  // 1. Убираем содержимое круглых и квадратных скобок:
  // "teilnehmen (an + D)" -> "teilnehmen"
  // "das Buch (¨-er)" -> "das Buch"
  word = word.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');

  // 2. Убираем обозначения множественного числа и родовых окончаний через запятую или слэш:
  // "der Tisch, -e" -> "der Tisch"
  // "die Wand, "-e" -> "die Wand"
  // "der/die Angestellte" -> "Angestellte"
  word = word.split(',')[0].trim();
  word = word.replace(/^(der|die|das)\s*\/\s*(der|die|das)\s+/i, '');

  // 3. Убираем возвратную частицу "sich" в начале, в середине или в конце:
  // "sich freuen" -> "freuen", "freuen sich" -> "freuen"
  word = word.replace(/\bsich\b/gi, ' ').trim();

  // 4. Убираем артикли в начале строки:
  word = word.replace(/^(der|die|das|dem|den|des|ein|eine|einen|einem|einer)\s+/i, '');

  // 5. Убираем маркеры управления и местоимения:
  // "jemanden vorheizen" -> "vorheizen", "etw. bestellen" -> "bestellen"
  word = word.replace(/\b(jemanden|jemandem|etwas|jdn\.|jdm\.|etw\.|jmdn\.|jmdm\.|jmd\.)\b/gi, ' ');
  word = word.replace(/^(jemanden|jemandem|etwas|jdn\.|jdm\.|etw\.)\s+/i, '');

  // 6. Убираем разделитель отделяемых приставок и спецсимволы:
  // "vor|heizen" -> "vorheizen", "ein·laden" -> "einladen"
  word = word.replace(/[|·•\u2506\u250A]/g, '');

  // 7. Срезаем оставшуюся пунктуацию, пробелы и небуквенные символы:
  word = word.replace(/[^a-zäöüß0-9]/gi, '');

  return word.trim();
}

/**
 * Обогащает существующую карточку альтернативными переводами и примерами
 * из карточки-дубликата (Merge, not overwrite).
 */
export function mergeCardContext<T extends {
  translation?: string;
  sentence?: string;
  additionalTranslations?: string[];
  alternateExamples?: string[];
}>(target: T, incoming: {
  translation?: string;
  sentence?: string;
  additionalTranslations?: string[];
  alternateExamples?: string[];
}): T {
  const norm = (s?: string) => (s || '').trim().toLowerCase();

  // 1. Обогащение перевода
  const existingTranslations = new Set<string>();
  if (target.translation) existingTranslations.add(norm(target.translation));
  (target.additionalTranslations || []).forEach(t => existingTranslations.add(norm(t)));

  const newAddTranslations = [...(target.additionalTranslations || [])];

  const incomingTranslations = [
    incoming.translation,
    ...(incoming.additionalTranslations || [])
  ].filter(Boolean) as string[];

  for (const t of incomingTranslations) {
    const trimmed = t.trim();
    const n = norm(trimmed);
    if (n && n !== '—' && n !== '-' && !existingTranslations.has(n)) {
      existingTranslations.add(n);
      newAddTranslations.push(trimmed);
    }
  }

  // 2. Обогащение примеров
  const existingSentences = new Set<string>();
  if (target.sentence) existingSentences.add(norm(target.sentence));
  (target.alternateExamples || []).forEach(s => existingSentences.add(norm(s)));

  const newAltExamples = [...(target.alternateExamples || [])];

  const incomingSentences = [
    incoming.sentence,
    ...(incoming.alternateExamples || [])
  ].filter(Boolean) as string[];

  for (const s of incomingSentences) {
    const trimmed = s.trim();
    const n = norm(trimmed);
    if (n && n !== '—' && n !== '-' && n !== 'verb_drill' && !existingSentences.has(n)) {
      existingSentences.add(n);
      newAltExamples.push(trimmed);
    }
  }

  return {
    ...target,
    additionalTranslations: newAddTranslations.length > 0 ? newAddTranslations : undefined,
    alternateExamples: newAltExamples.length > 0 ? newAltExamples : undefined,
  };
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
