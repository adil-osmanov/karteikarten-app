import { getCanonicalKey, mergeCardContext } from '@/lib/vocabulary/canonical';

const SEPARABLE_PREFIXES = new Set([
  'ab', 'an', 'auf', 'aus', 'bei', 'ein', 'empor', 'entgegen', 'entlang', 'entzwei',
  'fern', 'fest', 'fort', 'frei', 'gegenüber', 'gleich', 'heim', 'her', 'herab',
  'heran', 'herauf', 'heraus', 'herbei', 'herein', 'herüber', 'herum', 'herunter',
  'hervor', 'hin', 'hinab', 'hinauf', 'hinaus', 'hinein', 'hinüber', 'hinunter',
  'hinweg', 'hinzu', 'hoch', 'los', 'mit', 'nach', 'nieder', 'statt', 'teil',
  'über', 'um', 'unter', 'vor', 'voran', 'voraus', 'vorbei', 'vorüber', 'vorweg',
  'weg', 'weiter', 'wieder', 'zu', 'zurecht', 'zurück', 'zusammen', 'zwischen'
]);

/**
 * Единая функция нормализации немецкой леммы для выявления дубликатов
 * независимо от формы записи (артиклей, местоимений, вертикальных черт и инверсии приставки).
 */
export function normalizeLemmaKey(rawWord: string): string {
  if (!rawWord) return '';

  let cleaned = rawWord.trim().toLowerCase();

  // 1. Убираем скобки вроде (von + D.)
  cleaned = cleaned.replace(/\(.*?\)/g, ' ');

  // 2. Убираем артикли в начале
  cleaned = cleaned.replace(/^(der|die|das|dem|den|des|ein|eine|einen|einem|eines)\s+/i, '');

  // 3. Убираем маркеры управления и местоимения
  cleaned = cleaned.replace(/\b(jemanden|jemandem|jemand|etwas|jmdn\.?|jmdm\.?|jdn\.?|jdm\.?|jmd\.?|etw\.?)\b/gi, ' ');
  cleaned = cleaned.replace(/\b(sich)\b/gi, ' ');

  // 4. Обрабатываем инверсию отделяемых приставок с многоточием ("schrauben ... auf" -> "aufschrauben")
  const ellipsisMatch = cleaned.trim().match(/^([a-zäöüß]+)\s*(?:\.{2,}|…+)\s*([a-zäöüß]+)$/i);
  if (ellipsisMatch) {
    const stem = ellipsisMatch[1];
    const prefix = ellipsisMatch[2];
    return `${prefix}${stem}`.toLowerCase();
  }

  // 5. Убираем черту отделяемой приставки и лишние знаки
  cleaned = cleaned.replace(/[|·\u2506\u250A]/g, '');
  cleaned = cleaned.replace(/[\/\\,\.\-…]/g, ' ');

  // 6. Схлопываем множественные пробелы
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // 7. Если осталось ровно 2 токена и второй — отделяемая приставка после глагола ("schrauben auf" -> "aufschrauben")
  const parts = cleaned.split(' ');
  if (parts.length === 2 && SEPARABLE_PREFIXES.has(parts[1]) && /(en|eln|ern|t|st|e)$/.test(parts[0])) {
    cleaned = `${parts[1]}${parts[0]}`;
  }

  return cleaned;
}

/**
 * 1. Агрессивная нормализация до корня слова (леммы) по строгому стандарту дедупликации SRS:
 * Однозначно приводит вариации фразы/глагола ("sich vorstellen", "jemandem etwas vorstellen",
 * "vor|stellen", "die Vorstellung") к общему каноническому корню без артиклей, рефлексивов и управления.
 */
export function getStrictLemmaKey(raw: string): string {
  if (!raw) return '';
  let s = raw.toLowerCase().trim();
  // 1. Убираем скобки и всё внутри них: "отвечать (на запрос)" -> "отвечать"
  s = s.replace(/\(.*?\)/g, ' ');
  // 2. Убираем знаки отделяемых приставок и спецсимволы
  s = s.replace(/[|·\u2506\u250A]/g, '');
  // 3. Убираем все маркеры управления и местоимения в любой позиции (sich, jemanden, jemandem, jdn., jdm., etwas, etw. и т.д.)
  s = s.replace(/\b(jemandem|jemanden|jemand|etwas|jmdn\.?|jmdm\.?|jdn\.?|jdm\.?|jmd\.?|etw\.?|sich)\b/gi, ' ');
  // 4. Убираем артикли
  s = s.replace(/\b(der|die|das|dem|den|des|ein|eine|einen|einem|einer)\b/gi, ' ');
  // 5. Убираем знаки препинания
  s = s.replace(/[.,/#!$%^&*;:{}=\-_`~?+]/g, ' ');
  // 6. Схлопываем множественные пробелы
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Нормализация ключа слова (Lemma Key) для строгой дедупликации в сессии повторений
 */
export function getWordKey(word: string): string {
  return getStrictLemmaKey(word);
}

/**
 * Умная педагогическая сортировка очереди повторений (Smart Review Sorting):
 * 1. Проблемные слова (низкий masteryLevel 1 -> 2 -> 3)
 * 2. Самые просроченные карточки (давний next_review_at идет первым)
 */
export function sortReviewCardsPedagogically<
  T extends { id?: string; targetWord?: string; card?: any; masteryLevel?: number; nextReviewDate?: any; nextReviewAt?: any }
>(candidates: T[]): T[] {
  if (!Array.isArray(candidates) || candidates.length <= 1) return candidates;

  return [...candidates].sort((itemA, itemB) => {
    const a = (itemA as any).card || itemA;
    const b = (itemB as any).card || itemB;

    const masteryA = a.masteryLevel ?? (a as any).mastery_level ?? 0;
    const masteryB = b.masteryLevel ?? (b as any).mastery_level ?? 0;

    // 1. Приоритет: проблемные слова (низкий уровень владения masteryLevel 1 -> 2 -> 3)
    if (masteryA !== masteryB) {
      return masteryA - masteryB;
    }

    // 2. Приоритет: самые просроченные карточки (давний next_review_at идет первым)
    const rawDateA = a.nextReviewAt ?? a.nextReviewDate ?? a.next_review_date ?? 0;
    const rawDateB = b.nextReviewAt ?? b.nextReviewDate ?? b.next_review_date ?? 0;
    const timeA = typeof rawDateA === 'number' ? rawDateA : new Date(rawDateA || 0).getTime();
    const timeB = typeof rawDateB === 'number' ? rawDateB : new Date(rawDateB || 0).getTime();
    return timeA - timeB;
  });
}

/**
 * Строгая дедупликация в сессии повторений (SRS Review Session):
 * В ежедневной тренировке повторов одно и то же слово ни в коем случае не должно попадаться дважды за день!
 * Кандидаты сортируются по педагогическому приоритету, после чего оставляется строго ОДНА карточка на лемму,
 * а дубликаты откладываются на следующие сессии.
 */
export function deduplicateCardsByLemma<
  T extends { id?: string; targetWord?: string; front?: string; sentence?: string; card?: any; linkedCardIds?: string[]; masteryLevel?: number; nextReviewDate?: any; nextReviewAt?: any }
>(cards: T[], logDeduplication: boolean = true): T[] {
  if (!Array.isArray(cards) || cards.length === 0) return [];

  // 1. Умная сортировка кандидатов по педагогическому приоритету
  const sortedCandidates = sortReviewCardsPedagogically(cards);

  // 2. Фильтрация дублей перед стартом сессии
  const seenKeys = new Map<string, T>();
  const sessionQueue: T[] = [];
  const removedDuplicates: string[] = [];

  for (const item of sortedCandidates) {
    if (!item) continue;
    const inner = (item as any).card ? (item as any).card : item;
    const raw = inner.targetWord || inner.target_word || inner.front || inner.lemma || inner.word || inner.missingWord || inner.infinitive || '';
    const key = getLemmaKey(raw) || getWordKey(raw) || getCanonicalKey(raw) || normalizeLemmaKey(raw);

    if (!key) {
      // Если ключа нет, сохраняем карточку в очередь по id
      sessionQueue.push(item);
      continue;
    }

    const currentId = inner.id || (item as any).id;

    if (!seenKeys.has(key)) {
      const initialIds: string[] = [];
      if (currentId) initialIds.push(currentId);
      if (Array.isArray(inner.linkedCardIds)) {
        initialIds.push(...inner.linkedCardIds);
      }
      const uniqueIds = Array.from(new Set(initialIds));
      inner.linkedCardIds = uniqueIds;
      if ((item as any).card) {
        (item as any).card.linkedCardIds = uniqueIds;
      }
      seenKeys.set(key, item);
      sessionQueue.push(item);
    } else {
      // Карточка-дубль пропускается и не попадает в сегодняшнюю сессию (откладывается)
      const existing = seenKeys.get(key)!;
      const existingInner = (existing as any).card ? (existing as any).card : existing;
      removedDuplicates.push(`${raw} (ключ: "${key}")`);

      // Обогащаем сохраненную карточку контекстом и связываем ID
      const existingId = existingInner.id || (existing as any).id;
      const mergedIds = Array.from(new Set([
        ...(existingInner.linkedCardIds || []),
        ...(inner.linkedCardIds || []),
        existingId,
        currentId
      ].filter(Boolean)));
      existingInner.linkedCardIds = mergedIds;
      const enriched = mergeCardContext(existingInner, inner);
      Object.assign(existingInner, enriched);
      if ((existing as any).card) {
        (existing as any).card.linkedCardIds = mergedIds;
        Object.assign((existing as any).card, enriched);
      }
    }
  }

  if (logDeduplication) {
    console.info(
      `[SRS Deduplication] Было карточек: ${cards.length}, осталось уникальных: ${sessionQueue.length} (отфильтровано дублей: ${cards.length - sessionQueue.length})`
    );
    console.log('✅ Очередь сессии очищена от дублей. Уникальных слов:', sessionQueue.length);
    if (removedDuplicates.length > 0) {
      console.info('🗑 [SRS Deduplication] Удаленные дубликаты слов:', removedDuplicates);
    }
  }

  return sessionQueue;
}

export function getLemmaKey(word: string): string {
  if (!word) return '';
  return word
    .toLowerCase()
    .trim()
    .replace(/\|/g, '')
    .replace(/^(der|die|das|dem|den|des|ein|eine|einen|einem|einer)\s+/gi, '')
    .replace(/^sich\s+/gi, '')
    .replace(/^(jemanden|jemandem|etwas|jdn\.|jdm\.|etw\.)\s+/gi, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[.,/#!$%^&*;:{}=\-_`~]/g, '')
    .trim();
}

export function getUniqueReviewQueue<
  T extends { id?: string; targetWord?: string; front?: string; lemma?: string; word?: string; card?: any }
>(cards: T[]): T[] {
  if (!Array.isArray(cards) || cards.length === 0) return [];
  const seen = new Set<string>();
  const queue: T[] = [];

  for (const item of cards) {
    if (!item) continue;
    const card = (item as any).card || item;
    const word = card.targetWord || card.target_word || card.front || card.lemma || card.word || card.missingWord || card.infinitive || '';
    const key = getLemmaKey(word);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    queue.push(item);
  }
  return queue;
}

export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export const deduplicateReviewSession = getUniqueReviewQueue;
export const getDueReviewCards = getUniqueReviewQueue;
