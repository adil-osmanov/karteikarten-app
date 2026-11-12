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

const EXCLUDED_STANDALONE_LEMMAS = new Set([
  'der', 'die', 'das', 'dem', 'den', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
  'sich', 'mich', 'dich', 'uns', 'euch', 'mir', 'dir', 'ihm', 'ihr', 'ihnen', 'ihn', 'sie', 'er', 'es', 'wir',
  'jemanden', 'jemandem', 'jemandes', 'jemand', 'etwas', 'jdn', 'jdm', 'jmdn', 'jmdm', 'jmd', 'etw',
  'an', 'in', 'auf', 'aus', 'bei', 'mit', 'nach', 'von', 'zu', 'über', 'unter', 'vor', 'hinter', 'um', 'für', 'durch', 'gegen', 'ohne',
  'und', 'aber', 'oder', 'denn', 'weil', 'dass', 'ob', 'als', 'wie',
]);

/**
 * Единая каноническая нормализация лемм для подсчёта выученных слов (Wortschatz-Matrix)
 * и строгой дедупликации между книгами/уроками.
 */
export function normalizeMasteredLemma(rawWord: string): string {
  if (!rawWord || typeof rawWord !== 'string') return '';
  let s = rawWord.toLowerCase().trim();

  // Убираем разделитель отделяемых приставок: mit|teilen -> mitteilen
  s = s.replace(/[|·\u2506\u250A]/g, '');

  // Инверсия отделяемых приставок с многоточием ("schrauben ... auf" -> "aufschrauben")
  const ellipsisMatch = s.match(/^([a-zäöüß]+)\s*(?:\.{2,}|…+)\s*([a-zäöüß]+)$/i);
  if (ellipsisMatch) {
    return `${ellipsisMatch[2]}${ellipsisMatch[1]}`.toLowerCase();
  }

  // Убираем пояснения в скобках
  s = s.replace(/\(.*?\)|\[.*?\]/g, ' ').trim();

  // Сначала убираем предложное управление целиком ("vor jemandem", "auf etwas", "über etw.", "mit Dat")
  s = s.replace(
    /(?:^|\s)(?:an|auf|aus|bei|durch|für|gegen|hinter|in|mit|nach|neben|ohne|über|um|unter|von|vor|zu|zwischen)\s+(?:jemanden|jemandem|jemandes|jemand|etwas|jmdn\.?|jmdm\.?|jmd\.?|jdn\.?|jdm\.?|etw\.?|akk\.?|dat\.?|gen\.?)(?=\s|$|[.,/#!$%^&*;:{}=\-_`~?])/gi,
    ' '
  );

  // Убираем артикли в начале
  s = s.replace(/^(der|die|das|dem|den|des|ein|eine|einen|einem|einer|eines)\s+/gi, '');

  // Убираем возвратные местоимения и управление падежами
  s = s.replace(
    /(?:^|\s)(sich|mich|dich|uns|euch|jemanden|jemandem|jemandes|jemand|etwas|jmdn\.?|jmdm\.?|jdn\.?|jdm\.?|jmd\.?|etw\.?)(?=\s|$|[.,/#!$%^&*;:{}=\-_`~?])/gi,
    ' '
  );

  // Убираем знаки препинания и схлопываем пробелы
  s = s.replace(/[.,/#!$%^&*;:{}=\-_`~?]/g, ' ').replace(/\s+/g, ' ').trim();

  // Если осталось ровно 2 токена и второй — отделяемая приставка после глагола ("schrauben auf" -> "aufschrauben")
  const parts = s.split(' ');
  if (parts.length === 2 && SEPARABLE_PREFIXES.has(parts[1]) && /(en|eln|ern|t|st|e)$/.test(parts[0])) {
    return `${parts[1]}${parts[0]}`;
  }

  return s;
}

export function isExcludedStandaloneLemma(rawOrNormalized: string): boolean {
  const norm = normalizeMasteredLemma(rawOrNormalized);
  if (!norm || norm.length < 2) return true;
  if (EXCLUDED_STANDALONE_LEMMAS.has(norm)) return true;
  return false;
}

/**
 * Единая функция нормализации немецкой леммы для выявления дубликатов
 * независимо от формы записи (артиклей, местоимений, вертикальных черт и инверсии приставки).
 */
export function normalizeLemmaKey(rawWord: string): string {
  if (!rawWord) return '';

  const trimmed = rawWord.trim().toLowerCase();

  // Обрабатываем инверсию отделяемых приставок с многоточием ("schrauben ... auf" -> "aufschrauben")
  const ellipsisMatch = trimmed.match(/^([a-zäöüß]+)\s*(?:\.{2,}|…+)\s*([a-zäöüß]+)$/i);
  if (ellipsisMatch) {
    return `${ellipsisMatch[2]}${ellipsisMatch[1]}`.toLowerCase();
  }

  let cleaned = normalizeMasteredLemma(rawWord);

  // Если осталось ровно 2 токена и второй — отделяемая приставка после глагола ("schrauben auf" -> "aufschrauben")
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
    const raw = extractRawWordFromItem(item);
    const key = getCanonicalLemmaKey(raw) || getWordKey(raw) || getCanonicalKey(raw) || normalizeLemmaKey(raw);

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

const CANONICAL_ARTICLES = new Set([
  'der', 'die', 'das', 'dem', 'den', 'des', 'ein', 'eine', 'einen', 'einem', 'eines', 'einer'
]);

const CANONICAL_REFLEXIVES = new Set([
  'sich', 'mich', 'dich', 'uns', 'euch'
]);

const CANONICAL_GOVERNANCE_MARKERS = new Set([
  'jemanden', 'jemandem', 'jemandes', 'jemand', 'etwas',
  'jmdn', 'jmdm', 'jdn', 'jdm', 'jmd', 'etw',
  'akk', 'dat', 'gen', 'nom'
]);

const CANONICAL_PREPOSITIONS = new Set([
  'an', 'auf', 'aus', 'bei', 'durch', 'für', 'gegen', 'gegenüber', 'hinter',
  'in', 'mit', 'nach', 'neben', 'über', 'um', 'unter', 'von', 'vor', 'zu', 'zwischen',
  'ins', 'ans', 'aufs', 'zum', 'zur', 'beim', 'vom', 'im', 'am'
]);

/**
 * Строгий канонический нормализатор немецкого корня / леммы.
 * Приводит любые вариации записи ("der Antrag" vs "Antrag", "jemanden vor jemandem schützen" vs "schützen",
 * "sich freuen" vs "freuen", "mit|teilen" vs "mitteilen", "aufhören (mit Dat.)" vs "aufhören") к одному ключу.
 */
export function getCanonicalLemmaKey(rawWord: string): string {
  if (!rawWord || typeof rawWord !== 'string') return '';

  let cleaned = rawWord.toLowerCase().trim();
  if (!cleaned) return '';

  // 1. Убираем разделитель отделяемой приставки (mit|teilen -> mitteilen)
  cleaned = cleaned.replace(/[|·\u2506\u250A]/g, '');

  // 2. Убираем пояснения в скобках: "aufhören (mit Dat.)" -> "aufhören"
  cleaned = cleaned.replace(/\(.*?\)|\[.*?\]/g, ' ');

  // 3. Обрабатываем инверсию с многоточием ("schrauben ... auf" -> "aufschrauben")
  const ellipsisMatch = cleaned.trim().match(/^([a-zäöüß]+)\s*(?:\.{2,}|…+)\s*([a-zäöüß]+)$/i);
  if (ellipsisMatch) {
    return `${ellipsisMatch[2]}${ellipsisMatch[1]}`.toLowerCase();
  }

  // 4. Очищаем от пунктуации и лишних пробелов (безопасно для умлаутов äöüß!)
  cleaned = cleaned.replace(/[.,/#!$%^&*;:{}=\-_`~?+]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';

  const rawTokens = cleaned.split(' ').filter(Boolean);
  if (rawTokens.length === 0) return rawWord.toLowerCase().trim();

  // 5. Убираем артикли, возвратные местоимения, маркеры падежей/управления и предлоги управления
  const coreTokens = rawTokens.filter((tok) =>
    !CANONICAL_ARTICLES.has(tok) &&
    !CANONICAL_REFLEXIVES.has(tok) &&
    !CANONICAL_GOVERNANCE_MARKERS.has(tok) &&
    !CANONICAL_PREPOSITIONS.has(tok)
  );

  const candidates = coreTokens.length > 0 ? coreTokens : rawTokens;
  if (candidates.length === 1) return candidates[0];

  // Если осталась составная фраза — берём ключевое самое длинное слово
  return [...candidates].sort((a, b) => b.length - a.length)[0];
}

function extractRawWordFromItem(item: any): string {
  const card = item?.card ? item.card : item;
  return (
    card?.targetWord ||
    card?.target_word ||
    card?.front ||
    card?.lemma ||
    card?.word ||
    card?.missingWord ||
    card?.infinitive ||
    ''
  );
}

function getReviewTimestampMs(raw: any): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Дедупликация и приоритизация очереди повторений:
 * сортирует по самому раннему сроку повтора (и меньшему masteryLevel) и оставляет
 * строго 1 карточку на канонический корень getCanonicalLemmaKey.
 */
export function buildDeduplicatedReviewQueue<
  T extends { id?: string; targetWord?: string; front?: string; lemma?: string; word?: string; card?: any; masteryLevel?: number; nextReviewDate?: any; nextReviewAt?: any; next_review_at?: any }
>(dueCards: T[]): T[] {
  if (!Array.isArray(dueCards) || dueCards.length === 0) return [];

  const sortedCandidates = [...dueCards].sort((itemA, itemB) => {
    const a = (itemA as any)?.card || itemA;
    const b = (itemB as any)?.card || itemB;

    const timeA = getReviewTimestampMs(a?.next_review_at ?? a?.nextReviewAt ?? a?.nextReviewDate ?? a?.next_review_date ?? 0);
    const timeB = getReviewTimestampMs(b?.next_review_at ?? b?.nextReviewAt ?? b?.nextReviewDate ?? b?.next_review_date ?? 0);
    if (timeA !== timeB) {
      return timeA - timeB;
    }

    const masteryA = a?.masteryLevel ?? a?.mastery_level ?? 0;
    const masteryB = b?.masteryLevel ?? b?.mastery_level ?? 0;
    return masteryA - masteryB;
  });

  const seenLemmas = new Set<string>();
  const uniqueQueue: T[] = [];

  for (const item of sortedCandidates) {
    if (!item) continue;
    const card = (item as any)?.card || item;
    const rawWord = extractRawWordFromItem(item);
    const lemmaKey = getCanonicalLemmaKey(rawWord) || (card?.id ? `__id:${card.id}` : '');

    if (!lemmaKey || seenLemmas.has(lemmaKey)) {
      continue;
    }

    seenLemmas.add(lemmaKey);
    uniqueQueue.push(item);
  }

  return uniqueQueue;
}

export function getLemmaKey(word: string): string {
  return getCanonicalLemmaKey(word);
}

export function getUniqueReviewQueue<
  T extends { id?: string; targetWord?: string; front?: string; lemma?: string; word?: string; card?: any }
>(cards: T[]): T[] {
  return buildDeduplicatedReviewQueue(cards);
}

export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export const deduplicateReviewSession = buildDeduplicatedReviewQueue;
export const getDueReviewCards = buildDeduplicatedReviewQueue;
