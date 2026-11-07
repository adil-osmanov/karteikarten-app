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
 * Дедупликация массива карточек (или оберток { deckId, card }) по нормализованному ключу леммы.
 * При обнаружении дубля выбирается карточка с более низким уровнем освоения (masteryLevel).
 */
export function deduplicateCardsByLemma<
  T extends { id?: string; targetWord?: string; front?: string; sentence?: string; card?: any; linkedCardIds?: string[] }
>(cards: T[], logDeduplication: boolean = true): T[] {
  if (!Array.isArray(cards) || cards.length === 0) return [];

  const seen = new Map<string, T>();
  const removedDuplicates: string[] = [];

  for (const card of cards) {
    if (!card) continue;
    const inner = (card as any).card ? (card as any).card : card;
    const raw = inner.targetWord || inner.target_word || inner.front || inner.lemma || inner.word || inner.missingWord || inner.infinitive || '';
    const key = getCanonicalKey(raw) || normalizeLemmaKey(raw);

    if (!key) {
      // Если по какой-то причине ключа нет, сохраняем по id
      const fallbackId = inner.id || (card as any).id || Math.random().toString();
      seen.set(`__id_${fallbackId}`, card);
      continue;
    }

    const currentId = inner.id || (card as any).id;

    if (!seen.has(key)) {
      const initialIds: string[] = [];
      if (currentId) initialIds.push(currentId);
      if (Array.isArray(inner.linkedCardIds)) {
        initialIds.push(...inner.linkedCardIds);
      }
      const uniqueIds = Array.from(new Set(initialIds));
      inner.linkedCardIds = uniqueIds;
      if ((card as any).card) {
        (card as any).card.linkedCardIds = uniqueIds;
      }
      seen.set(key, card);
    } else {
      // Если дубль уже встретился:
      // Выбираем карточку с более низким уровнем освоения (более проблемную)
      const existing = seen.get(key)!;
      const existingInner = (existing as any).card ? (existing as any).card : existing;
      const cardMastery = inner.masteryLevel ?? inner.mastery_level ?? 0;
      const existingMastery = existingInner.masteryLevel ?? existingInner.mastery_level ?? 0;
      const existingId = existingInner.id || (existing as any).id;

      const mergedIds = Array.from(new Set([
        ...(existingInner.linkedCardIds || []),
        ...(inner.linkedCardIds || []),
        existingId,
        currentId
      ].filter(Boolean)));

      if (cardMastery < existingMastery) {
        removedDuplicates.push(`${existingInner.targetWord || existingInner.front || key} (ключ: "${key}")`);
        inner.linkedCardIds = mergedIds;
        const enriched = mergeCardContext(inner, existingInner);
        Object.assign(inner, enriched);
        if ((card as any).card) {
          (card as any).card.linkedCardIds = mergedIds;
          Object.assign((card as any).card, enriched);
        }
        seen.set(key, card);
      } else {
        removedDuplicates.push(`${raw} (ключ: "${key}")`);
        existingInner.linkedCardIds = mergedIds;
        const enriched = mergeCardContext(existingInner, inner);
        Object.assign(existingInner, enriched);
        if ((existing as any).card) {
          (existing as any).card.linkedCardIds = mergedIds;
          Object.assign((existing as any).card, enriched);
        }
      }
    }
  }

  const uniqueCards = Array.from(seen.values());

  if (logDeduplication) {
    console.info(
      `[SRS Deduplication] Было карточек: ${cards.length}, осталось уникальных: ${uniqueCards.length} (отфильтровано дублей: ${cards.length - uniqueCards.length})`
    );
    console.log('✅ Очередь сессии очищена от дублей. Уникальных слов:', uniqueCards.length);
    if (removedDuplicates.length > 0) {
      console.info('🗑 [SRS Deduplication] Удаленные дубликаты слов:', removedDuplicates);
    }
  }

  return uniqueCards;
}
