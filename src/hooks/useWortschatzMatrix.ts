'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { normalizeLemmaKey } from '@/lib/utils/lemmaNormalizer';
import { CEFRLevel, detectWordLevel } from '@/lib/vocabulary/cefrLevelDetector';

export type AppLang = 'de' | 'en' | 'ru' | 'es';
export type { CEFRLevel };

export const C1_TARGET_WORDS: Record<string, number> = {
  de: 10000,
  en: 8000,
  ru: 8000,
  es: 8000,
};

export const WORD_LABELS_BY_LANG: Record<string, string> = {
  de: 'Wörter',
  en: 'Words',
  ru: 'Слов',
  es: 'Palabras',
};

export const CEFR_LEVEL_KEYS: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];

export interface MasteredWordEntry {
  originalWord: string;
  level: CEFRLevel;
  masteredAt: number;
  bookId?: string;
  translation?: string;
  cardId?: string;
  nextReviewDate?: string | number | null;
  sentence?: string;
  sentenceTranslation?: string;
}

export interface CEFRMatrixStats {
  counts: Record<CEFRLevel, number>;
  totalWords: number;
  activeLevel: CEFRLevel;
}

export interface TodayProgress {
  wordsLearnedToday: number;
  percentLearnedToday: string;
  todayCounts: Record<CEFRLevel, number>;
}

const SUPPORTED_LANGS: AppLang[] = ['de', 'en', 'ru', 'es'];

/**
 * Черный список грамматических частиц, предлогов, связок и местоимений.
 * Изолированные грамматические элементы не должны попадать в Wortschatz-Matrix.
 */
export const FUNCTIONAL_PARTICLES = new Set([
  'an', 'in', 'auf', 'aus', 'bei', 'mit', 'nach', 'von', 'zu', 'über', 'unter', 'vor', 'hinter',
  'werde', 'wirst', 'wird', 'wurden', 'worden', 'würde', 'würden',
  'mich', 'dich', 'sich', 'uns', 'euch', 'mir', 'dir', 'ihm', 'ihr', 'ihnen',
  'der', 'die', 'das', 'dem', 'den', 'des', 'ein', 'eine', 'einer', 'einem', 'einen', 'eines',
  'und', 'aber', 'oder', 'denn', 'weil', 'dass', 'ob', 'als', 'wie'
]);

export function isFunctionalParticle(rawWord?: string | null): boolean {
  if (!rawWord || typeof rawWord !== 'string') return false;
  const clean = rawWord.trim().toLowerCase().replace(/\|/g, '');
  return FUNCTIONAL_PARTICLES.has(clean);
}

/**
 * Проверяет, относится ли колода или родительская книга к чисто грамматическому тренажеру.
 * Исключаются ТОЛЬКО специализированные грамматические разделы:
 * книги/колоды, где прямо указано title.includes('Grammatik') или title.includes('Strukturen & NVV'),
 * либо deck.isGrammar === true, либо тренажеры спряжения/предлогов.
 * Лексические карточки учебников и контекстные слова сохраняются в Wortschatz-Matrix.
 */
export function isGrammarDeckOrBook(deck?: any, parentBook?: any, _card?: any): boolean {
  if (!deck && !parentBook) return false;

  // Явный флаг грамматики
  if (deck?.isGrammar === true || (deck as any)?.is_grammar === true) return true;
  if (deck?.type === 'grammar' || deck?.type === 'structures') return true;
  if (parentBook?.category === 'structures' || parentBook?.category === 'grammar') return true;

  const bTrainingMode = (parentBook?.training_mode || deck?.training_mode || '').toLowerCase();
  if (
    bTrainingMode === 'starke_verben' ||
    bTrainingMode === 'preposition_drill' ||
    bTrainingMode === 'redemittel'
  ) {
    return true;
  }

  const deckTitle = (deck?.name || deck?.title || '').toLowerCase();
  const bookTitle = (parentBook?.title || '').toLowerCase();
  const combined = `${deckTitle} ${bookTitle}`;

  const isExplicitGrammar =
    combined.includes('grammatik') ||
    combined.includes('grammar') ||
    combined.includes('strukturen & nvv') ||
    combined.includes('strukturen und nvv') ||
    combined.includes('nomen-verb') ||
    combined.includes('nvv') ||
    combined.includes('präposition') ||
    combined.includes('praeposition') ||
    combined.includes('starke verben') ||
    combined.includes('redemittel');

  if (isExplicitGrammar) {
    if (
      deckTitle.includes('wortschatz') ||
      deckTitle.includes('wörter') ||
      deckTitle.includes('woerter')
    ) {
      return false;
    }
    return true;
  }

  return false;
}

export const isContextOrGrammarDeck = isGrammarDeckOrBook;

/**
 * Извлекает краткий перевод слова, исключая длинные примеры предложений.
 * Проверяет поля карточки: hint, forms, baseWordInfo (где обычно записано "Wort — краткий перевод"),
 * а также сам card.translation, если он лаконичен.
 */
export function extractConciseTranslation(card?: any, fallback?: string): string {
  if (!card && !fallback) return '';

  const cyrRegex = /[\u0400-\u04FF]/;

  // 1. Проверяем hint, forms, baseWordInfo на наличие тире "Слово — краткий перевод"
  const extraSources = [
    card?.hint,
    card?.forms,
    card?.baseWordInfo,
    card?.base_word_info,
  ];

  for (const src of extraSources) {
    if (src && typeof src === 'string' && (src.includes('—') || src.includes('–') || src.includes(' - '))) {
      const parts = src.split(/[—–]|\s-\s/);
      for (let i = parts.length - 1; i >= 1; i--) {
        let candidate = parts[i].trim();
        candidate = candidate.replace(/\[cite:[^\]]*\]/g, '').trim();
        candidate = candidate.replace(/[.;]+$/, '').trim();
        if (candidate && cyrRegex.test(candidate) && candidate.split(/\s+/).length <= 7) {
          return candidate;
        }
      }
    }
  }

  // 2. Проверяем card.translation или fallback
  const rawTrans = (card?.translation || card?.back || fallback || '').trim();
  if (rawTrans) {
    let clean = rawTrans.replace(/\[cite:[^\]]*\]/g, '').trim();

    // Если в самом переводе есть тире: "Wort — перевод"
    if (clean.includes('—') || clean.includes('–')) {
      const parts = clean.split(/[—–]/);
      const afterDash = parts[parts.length - 1].trim().replace(/[.;]+$/, '');
      if (cyrRegex.test(afterDash) && afterDash.split(/\s+/).length <= 7) {
        return afterDash;
      }
    }

    // Если перевод короткий и не является предложением с точкой на конце
    const isSentence = clean.endsWith('.') || clean.endsWith('!') || clean.length > 50 || clean.split(/\s+/).length > 6;
    if (!isSentence) {
      return clean;
    }
  }

  return (rawTrans || fallback || '').replace(/\[cite:[^\]]*\]/g, '').trim();
}

export function normalizeLanguageCode(lang?: string | null): AppLang {
  const clean = (lang || 'de').toLowerCase().trim();
  if (clean.startsWith('en')) return 'en';
  if (clean.startsWith('ru')) return 'ru';
  if (clean.startsWith('es')) return 'es';
  return 'de';
}

// Единственный источник правды в памяти: Map<normalizedKey, { originalWord, level, masteredAt, bookId }>
const uniqueMasteredWordsByLang: Record<AppLang, Map<string, MasteredWordEntry>> = {
  de: new Map<string, MasteredWordEntry>(),
  en: new Map<string, MasteredWordEntry>(),
  ru: new Map<string, MasteredWordEntry>(),
  es: new Map<string, MasteredWordEntry>(),
};

const globalMatrixStatsByLang: Record<AppLang, CEFRMatrixStats> = {
  de: { counts: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 }, totalWords: 0, activeLevel: 'A1' },
  en: { counts: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 }, totalWords: 0, activeLevel: 'A1' },
  ru: { counts: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 }, totalWords: 0, activeLevel: 'A1' },
  es: { counts: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 }, totalWords: 0, activeLevel: 'A1' },
};

const listeners = new Set<(lang: AppLang, stats: CEFRMatrixStats) => void>();

function getStorageKeys(lang: AppLang) {
  return {
    cacheKeyV4: `wortschatz_matrix_v4_${lang}`,
    legacyCacheKeyV3: `cefr_mastered_cache_v3_${lang}`,
    legacyTimestampsKey: `cefr_mastered_timestamps_${lang}_v3`,
  };
}

function notifyListeners(lang: AppLang) {
  const currentStats = {
    counts: { ...globalMatrixStatsByLang[lang].counts },
    totalWords: globalMatrixStatsByLang[lang].totalWords,
    activeLevel: globalMatrixStatsByLang[lang].activeLevel,
  };
  listeners.forEach((listener) => listener(lang, currentStats));
}

function calculateActiveLevel(counts: Record<CEFRLevel, number>): CEFRLevel {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return 'A1';

  // Выбираем уровень с наибольшим числом освоенных слов (при равенстве — более высокий уровень)
  let bestLevel: CEFRLevel = 'A1';
  let maxCount = -1;
  for (const lvl of CEFR_LEVEL_KEYS) {
    const c = counts[lvl] || 0;
    if (c >= maxCount && c > 0) {
      maxCount = c;
      bestLevel = lvl;
    }
  }
  return bestLevel;
}

function recomputeStatsFromMap(lang: AppLang): CEFRMatrixStats {
  const map = uniqueMasteredWordsByLang[lang];

  // Очистка стоп-слов / грамматических частиц
  for (const [k, v] of Array.from(map.entries())) {
    if (isFunctionalParticle(k) || isFunctionalParticle(v.originalWord)) {
      map.delete(k);
    }
  }

  const counts: Record<CEFRLevel, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 };

  map.forEach((entry) => {
    const lvl = CEFR_LEVEL_KEYS.includes(entry.level) ? entry.level : 'B1';
    counts[lvl] = (counts[lvl] || 0) + 1;
  });

  const totalWords = map.size;
  const activeLevel = calculateActiveLevel(counts);

  globalMatrixStatsByLang[lang] = {
    counts,
    totalWords,
    activeLevel,
  };

  return globalMatrixStatsByLang[lang];
}

function persistMatrixToStorage(lang: AppLang) {
  if (typeof window === 'undefined') return;
  try {
    const { cacheKeyV4 } = getStorageKeys(lang);
    const entriesObj: Record<string, MasteredWordEntry> = {};
    uniqueMasteredWordsByLang[lang].forEach((val, key) => {
      entriesObj[key] = val;
    });
    const payload = {
      stats: globalMatrixStatsByLang[lang],
      entries: entriesObj,
      updatedAt: Date.now(),
    };
    localStorage.setItem(cacheKeyV4, JSON.stringify(payload));
  } catch (e) {
    console.warn('[Wortschatz-Matrix] Storage persist warning:', e);
  }
}

/**
 * Извлекает точный таймстемп освоения карточки (masteredAt).
 * Учитывает:
 * 1) явные поля updated_at / first_mastered_at,
 * 2) дату следующего повторения SRS (nextReviewDate - interval * 86400000),
 *    которая записывается в таблицу cards в момент перехода карточки на 4 этап.
 */
export function extractCardMasteredAt(card: any, existingTs: number = 0): number {
  const candidates: number[] = [];
  if (existingTs && existingTs > 0) {
    candidates.push(existingTs);
  }

  const rawExplicit =
    card?.first_mastered_at ||
    card?.firstMasteredAt ||
    card?.updated_at ||
    card?.updatedAt ||
    card?.last_reviewed_at;

  if (rawExplicit) {
    const parsed = new Date(rawExplicit).getTime();
    if (!isNaN(parsed) && parsed > 0) {
      candidates.push(parsed);
    }
  }

  const rawNextReview = card?.nextReviewDate ?? card?.next_review_date;
  if (rawNextReview !== null && rawNextReview !== undefined) {
    const nextReviewMs =
      typeof rawNextReview === 'number' ? rawNextReview : new Date(rawNextReview).getTime();
    const intervalDays = Number(card?.interval ?? 1) || 1;
    if (!isNaN(nextReviewMs) && nextReviewMs > 0) {
      const inferredMasteredAt = nextReviewMs - intervalDays * 86400000;
      // Проверяем, что вычисленная дата разумна (не в будущем и после 2020 года)
      if (inferredMasteredAt > 1577836800000 && inferredMasteredAt <= Date.now() + 60000) {
        candidates.push(inferredMasteredAt);
      }
    }
  }

  if (candidates.length === 0) return 0;

  // Если среди кандидатов есть сегодняшний таймстемп — приоритет ему, иначе максимальный валидный
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayEnd = todayStart + 24 * 60 * 60 * 1000;

  const todayCandidate = candidates.find((ts) => ts >= todayStart && ts < todayEnd);
  if (todayCandidate !== undefined) return todayCandidate;

  return Math.max(...candidates);
}

const isInitializedByLang: Record<AppLang, boolean> = {
  de: false,
  en: false,
  ru: false,
  es: false,
};

const isSyncingByLang: Record<AppLang, boolean> = {
  de: false,
  en: false,
  ru: false,
  es: false,
};

const lastCloudSyncByLang: Record<AppLang, number> = {
  de: 0,
  en: 0,
  ru: 0,
  es: 0,
};

const hasAttemptedCloudSyncByLang: Record<AppLang, boolean> = {
  de: false,
  en: false,
  ru: false,
  es: false,
};

function initMatrixStore(lang: AppLang) {
  if (typeof window === 'undefined') return;
  if (isInitializedByLang[lang]) return;
  isInitializedByLang[lang] = true;

  const { cacheKeyV4, legacyTimestampsKey } = getStorageKeys(lang);

  try {
    // Читаем legacy-таймстемпы, чтобы не потерять прогресс за сегодня при миграции на v4
    const legacyTimestamps: Record<string, number> = {};
    try {
      const rawLegacyTs = localStorage.getItem(legacyTimestampsKey);
      if (rawLegacyTs) {
        const parsedTs = JSON.parse(rawLegacyTs);
        if (parsedTs && typeof parsedTs === 'object') {
          Object.entries(parsedTs).forEach(([k, v]) => {
            const normKey = normalizeLemmaKey(k);
            if (normKey && typeof v === 'number' && v > 0) {
              legacyTimestamps[normKey] = v;
            }
          });
        }
      }
    } catch {}

    const rawV4 = localStorage.getItem(cacheKeyV4);
    if (rawV4) {
      const parsed = JSON.parse(rawV4);
      if (parsed?.entries && typeof parsed.entries === 'object') {
        const map = uniqueMasteredWordsByLang[lang];
        map.clear();
        Object.entries(parsed.entries).forEach(([key, val]: [string, any]) => {
          const raw = val?.originalWord || key || '';
          const normKey = normalizeLemmaKey(raw);
          if (!normKey || normKey.length < 2) return;
          if (isFunctionalParticle(raw) || isFunctionalParticle(normKey)) return;
          const level: CEFRLevel = detectWordLevel(
            raw || normKey,
            null,
            val?.level,
            lang
          );
          const masteredAt = Number(val?.masteredAt || legacyTimestamps[normKey] || 0);
          const existing = map.get(normKey);
          if (!existing || masteredAt > existing.masteredAt) {
            map.set(normKey, {
              originalWord: val?.originalWord || normKey,
              level,
              masteredAt,
              bookId: val?.bookId,
              translation: val?.translation || existing?.translation,
              cardId: val?.cardId || existing?.cardId,
              nextReviewDate: val?.nextReviewDate || existing?.nextReviewDate,
              sentence: val?.sentence || existing?.sentence,
              sentenceTranslation: val?.sentenceTranslation || existing?.sentenceTranslation,
            });
          }
        });
        recomputeStatsFromMap(lang);
      }
    }
  } catch (e) {
    console.warn('[Wortschatz-Matrix] Hydration notice:', e);
  }
}

/**
 * Синхронизация выученных слов из Supabase:
 * Собирает реально выученные карточки пользователя (masteryLevel >= 4 || isArchived === true)
 * и записи user_mastered_words, строго дедуплицируя по normalizeLemmaKey.
 */
export async function syncMasteredWordsFromCloud(lang: AppLang = 'de'): Promise<void> {
  initMatrixStore(lang);
  if (isSyncingByLang[lang]) return;
  const now = Date.now();
  if (now - (lastCloudSyncByLang[lang] || 0) < 30000) return; // Защита от частых запросов (минимум 30 сек)

  isSyncingByLang[lang] = true;
  lastCloudSyncByLang[lang] = now;
  hasAttemptedCloudSyncByLang[lang] = true;

  try {
    const existingMap = uniqueMasteredWordsByLang[lang];

    // 1. Загружаем timestamps и уровни из user_mastered_words (если пользователь авторизован)
    const remoteMetaByKey = new Map<string, { level?: string | null; masteredAt: number }>();
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (userId) {
        const { data } = await supabase
          .from('user_mastered_words')
          .select('lemma, cefr_level, first_mastered_at')
          .eq('user_id', userId);
        if (Array.isArray(data)) {
          for (const row of data) {
            const key = normalizeLemmaKey(row.lemma || '');
            if (!key || key.length < 2) continue;
            const ts = row.first_mastered_at ? new Date(row.first_mastered_at).getTime() : 0;
            const prev = remoteMetaByKey.get(key);
            if (!prev || ts > prev.masteredAt) {
              remoteMetaByKey.set(key, {
                level: row.cefr_level,
                masteredAt: !isNaN(ts) && ts > 0 ? ts : 0,
              });
            }
          }
        }
      }
    } catch {}

    // 2. Запрашиваем реально выученные карточки из таблицы cards в Supabase
    let allMasteredCards: any[] = [];
    let from = 0;
    const PAGE_SIZE = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: cardRows, error: cardErr } = await supabase
        .from('cards')
        .select('id, targetWord, sentence, translation, forms, baseWordInfo, masteryLevel, isArchived, nextReviewDate, interval, repetitions, decks!inner(id, name, category, language, level, book_id)')
        .or('isArchived.eq.true,masteryLevel.gte.4')
        .range(from, from + PAGE_SIZE - 1);

      if (cardErr || !cardRows || cardRows.length === 0) {
        hasMore = false;
      } else {
        allMasteredCards = allMasteredCards.concat(cardRows);
        from += PAGE_SIZE;
        hasMore = cardRows.length === PAGE_SIZE;
      }
    }

    if (allMasteredCards.length > 0) {
      const nextMap = new Map<string, MasteredWordEntry>();

      for (const c of allMasteredCards) {
        const deckObj = Array.isArray(c.decks) ? c.decks[0] : c.decks;
        const dLang = normalizeLanguageCode(deckObj?.language || 'de');
        if (dLang !== lang) continue;
        if (isContextOrGrammarDeck(deckObj, undefined, c)) continue;

        const rawWord = c.targetWord || '';
        const normalizedKey = normalizeLemmaKey(rawWord);
        if (!normalizedKey || normalizedKey.length < 2) continue;
        if (isFunctionalParticle(rawWord) || isFunctionalParticle(normalizedKey)) continue;

        const prevEntry = existingMap.get(normalizedKey);
        const remoteMeta = remoteMetaByKey.get(normalizedKey);
        const priorTs = Math.max(prevEntry?.masteredAt || 0, remoteMeta?.masteredAt || 0);
        const masteredAt = extractCardMasteredAt(c, priorTs);

        const deckLevel = deckObj?.level || deckObj?.name || deckObj?.title || null;
        const cardLevel = (c as any).level || remoteMeta?.level || null;
        const level = detectWordLevel(normalizedKey, deckLevel, cardLevel, lang);

        const conciseTrans = extractConciseTranslation(c);
        const cardTranslation = conciseTrans || c.translation || prevEntry?.translation;
        const cardNextReview = c.nextReviewDate ?? c.next_review_date ?? prevEntry?.nextReviewDate;
        const cardSentence = c.sentence || prevEntry?.sentence;
        const cardSentenceTrans = (c as any).sentenceTranslation || (c as any).sentence_translation || prevEntry?.sentenceTranslation;

        const alreadyInNext = nextMap.get(normalizedKey);
        if (!alreadyInNext) {
          nextMap.set(normalizedKey, {
            originalWord: rawWord,
            level,
            masteredAt,
            bookId: deckObj?.book_id || prevEntry?.bookId,
            translation: cardTranslation,
            cardId: c.id || prevEntry?.cardId,
            nextReviewDate: cardNextReview,
            sentence: cardSentence,
            sentenceTranslation: cardSentenceTrans,
          });
        } else if (masteredAt > alreadyInNext.masteredAt) {
          nextMap.set(normalizedKey, {
            ...alreadyInNext,
            masteredAt,
            translation: cardTranslation || alreadyInNext.translation,
            cardId: c.id || alreadyInNext.cardId,
            nextReviewDate: cardNextReview || alreadyInNext.nextReviewDate,
            sentence: cardSentence || alreadyInNext.sentence,
            sentenceTranslation: cardSentenceTrans || alreadyInNext.sentenceTranslation,
          });
        }
      }

      uniqueMasteredWordsByLang[lang] = nextMap;
      recomputeStatsFromMap(lang);
      persistMatrixToStorage(lang);
      notifyListeners(lang);
    }
  } catch (err) {
    console.warn('[Wortschatz-Matrix] syncMasteredWordsFromCloud notice:', err);
  } finally {
    isSyncingByLang[lang] = false;
  }
}

/**
 * Регистрирует одно выученное слово в матрице (строго без дубликатов по normalizeLemmaKey).
 */
export async function recordMasteredLemma(
  paramsOrWord:
    | {
        rawWord: string;
        bookId?: string;
        bookLevel?: string | null;
        cardLevel?: string | null;
        language?: string;
        timestamp?: number;
      }
    | string,
  levelOrNull?: string | null,
  bookIdOrNull?: string,
  langOrNull?: string,
  timestampOrNull?: number
) {
  const rawWord = typeof paramsOrWord === 'string' ? paramsOrWord : paramsOrWord.rawWord;
  const deckLevel = typeof paramsOrWord === 'string' ? levelOrNull : paramsOrWord.bookLevel;
  const cardLevel = typeof paramsOrWord === 'object' ? paramsOrWord.cardLevel : null;
  const bookId = typeof paramsOrWord === 'string' ? bookIdOrNull : paramsOrWord.bookId;
  const rawLang = typeof paramsOrWord === 'string' ? langOrNull : paramsOrWord.language;
  const timestamp =
    typeof paramsOrWord === 'object' && paramsOrWord.timestamp
      ? paramsOrWord.timestamp
      : timestampOrNull || Date.now();

  let currentLanguage: AppLang = 'de';
  if (rawLang) {
    currentLanguage = normalizeLanguageCode(rawLang);
  } else if (typeof window !== 'undefined') {
    try {
      const savedLang = localStorage.getItem('selected_language');
      if (savedLang) currentLanguage = normalizeLanguageCode(savedLang);
    } catch {}
  }

  initMatrixStore(currentLanguage);

  if (isFunctionalParticle(rawWord)) return;
  const normalizedKey = normalizeLemmaKey(rawWord);
  if (!normalizedKey || normalizedKey.length < 2) return;
  if (isFunctionalParticle(normalizedKey)) return;

  const resolvedLevel = detectWordLevel(normalizedKey, deckLevel, cardLevel, currentLanguage);
  const map = uniqueMasteredWordsByLang[currentLanguage];
  const existing = map.get(normalizedKey);

  // Если слово уже зарегистрировано и имеет валидный таймстемп — дубликат не создаем
  if (existing) {
    if (!existing.masteredAt || existing.masteredAt <= 0) {
      map.set(normalizedKey, {
        ...existing,
        masteredAt: timestamp,
      });
      persistMatrixToStorage(currentLanguage);
      notifyListeners(currentLanguage);
    }
    return;
  }

  map.set(normalizedKey, {
    originalWord: rawWord,
    level: resolvedLevel,
    masteredAt: timestamp,
    bookId,
  });

  recomputeStatsFromMap(currentLanguage);
  persistMatrixToStorage(currentLanguage);
  notifyListeners(currentLanguage);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('stats-update', { detail: { language: currentLanguage } }));
  }

  // Сохраняем в Supabase user_mastered_words (при наличии авторизованного пользователя)
  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return;

    await supabase.from('user_mastered_words').upsert(
      {
        user_id: userId,
        lemma: normalizedKey,
        cefr_level: resolvedLevel,
        source_book_id: bookId || null,
        first_mastered_at: new Date(timestamp).toISOString(),
      },
      { onConflict: 'user_id,lemma', ignoreDuplicates: true }
    );
  } catch (err) {
    console.warn('[Wortschatz-Matrix] Remote upsert notice:', err);
  }
}

/**
 * Удаляет слово из матрицы при сбросе прогресса карточки (ошибке на повторении).
 */
export async function removeMasteredLemma(
  paramsOrWord: { rawWord: string; language?: string } | string,
  langOrNull?: string
) {
  const rawWord = typeof paramsOrWord === 'string' ? paramsOrWord : paramsOrWord.rawWord;
  const rawLang = typeof paramsOrWord === 'string' ? langOrNull : paramsOrWord.language;

  let currentLanguage: AppLang = 'de';
  if (rawLang) {
    currentLanguage = normalizeLanguageCode(rawLang);
  } else if (typeof window !== 'undefined') {
    try {
      const savedLang = localStorage.getItem('selected_language');
      if (savedLang) currentLanguage = normalizeLanguageCode(savedLang);
    } catch {}
  }

  initMatrixStore(currentLanguage);

  if (isFunctionalParticle(rawWord)) return;
  const normalizedKey = normalizeLemmaKey(rawWord);
  if (!normalizedKey || normalizedKey.length < 2) return;
  if (isFunctionalParticle(normalizedKey)) return;

  const map = uniqueMasteredWordsByLang[currentLanguage];
  if (!map.has(normalizedKey)) return;

  map.delete(normalizedKey);
  recomputeStatsFromMap(currentLanguage);
  persistMatrixToStorage(currentLanguage);
  notifyListeners(currentLanguage);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('stats-update', { detail: { language: currentLanguage } }));
  }

  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return;

    await supabase
      .from('user_mastered_words')
      .delete()
      .match({ user_id: userId, lemma: normalizedKey });
  } catch (err) {
    console.warn('[Wortschatz-Matrix] Remote delete notice:', err);
  }
}

export function getMasteredLemmasSet(langParam?: string | AppLang): Set<string> {
  const normLang = normalizeLanguageCode(langParam);
  initMatrixStore(normLang);
  return new Set(uniqueMasteredWordsByLang[normLang].keys());
}

/**
 * Возвращает полный список уникальных освоенных слов пользователя для указанного языка
 */
export function getMasteredWordEntries(langParam?: string | AppLang): MasteredWordEntry[] {
  const normLang = normalizeLanguageCode(langParam);
  initMatrixStore(normLang);
  return Array.from(uniqueMasteredWordsByLang[normLang].values()).filter(
    (e) => !isFunctionalParticle(e.originalWord) && !isFunctionalParticle(normalizeLemmaKey(e.originalWord))
  );
}

/**
 * Пересчитывает матрицу строго по выученным карточкам пользователя (masteryLevel >= 4 || isArchived === true)
 * с дедупликацией через normalizeLemmaKey и определением уровня через detectWordLevel.
 */
export async function autoBackfillMasteredWords(
  providedDecks?: Array<{ id: string; bookId?: string; level?: string; language?: string; cards?: Array<any> }>,
  providedBooks?: Array<{ id: string; language?: string; activeLevels?: string[]; title?: string }>,
  targetLangParam?: string | AppLang
): Promise<number> {
  const decks = providedDecks;
  const books = providedBooks;

  if (!Array.isArray(decks) || decks.length === 0) return 0;
  const totalCardsInDecks = decks.reduce((sum, d) => sum + (Array.isArray(d.cards) ? d.cards.length : 0), 0);
  if (totalCardsInDecks === 0) return 0;

  const bookMap = new Map<string, any>();
  if (Array.isArray(books)) {
    books.forEach((b) => bookMap.set(b.id, b));
  }

  // Пересчитываем для всех поддерживаемых языков, присутствующих в колодах
  const langsToProcess: AppLang[] = SUPPORTED_LANGS;

  let primaryCount = 0;

  for (const targetLang of langsToProcess) {
    initMatrixStore(targetLang);
    const existingMap = uniqueMasteredWordsByLang[targetLang];

    const langDecks = decks.filter((deck) => {
      const dBookId = deck.bookId || (deck as any).book_id;
      const dLang = normalizeLanguageCode(deck.language || bookMap.get(dBookId || '')?.language || 'de');
      return dLang === targetLang;
    });

    if (langDecks.length === 0) continue;

    const deduplicatedMap = new Map<string, MasteredWordEntry>();

    langDecks.forEach((deck) => {
      const dBookId = deck.bookId || (deck as any).book_id;
      const parentBook = dBookId ? bookMap.get(dBookId) : undefined;

      // Исключаем грамматические колоды, режим «Kontext» и упражнения
      if (isContextOrGrammarDeck(deck, parentBook)) return;

      const deckLevel =
        (deck as any).level ||
        (parentBook?.activeLevels?.length === 1 ? parentBook.activeLevels[0] : null) ||
        (deck as any).name ||
        (deck as any).title ||
        parentBook?.title ||
        null;

      deck.cards?.forEach((card: any) => {
        // Исключаем карточки режима «Kontext»
        if (isContextOrGrammarDeck(deck, parentBook, card)) return;

        const mastery = card.masteryLevel ?? card.mastery_level ?? 0;
        const archived = Boolean(card.isArchived ?? card.is_archived);
        const isMastered = mastery >= 4 || archived === true;
        if (!isMastered) return;

        const rawWord =
          card.targetWord ||
          card.target_word ||
          card.missingWord ||
          card.infinitive ||
          card.front ||
          '';
        const normalizedKey = normalizeLemmaKey(rawWord);
        if (!normalizedKey || normalizedKey.length < 2) return;
        if (isFunctionalParticle(rawWord) || isFunctionalParticle(normalizedKey)) return;

        const prevTs = existingMap.get(normalizedKey)?.masteredAt || 0;
        const masteredAt = extractCardMasteredAt(card, prevTs);
        const cardLevel = card.level || card.cefrLevel || card.cefr_level || null;
        const level = detectWordLevel(normalizedKey, deckLevel, cardLevel, targetLang);

        const existingEntry = deduplicatedMap.get(normalizedKey);
        const conciseTrans = extractConciseTranslation(card);
        const cardTranslation = conciseTrans || card.translation || card.back || existingMap.get(normalizedKey)?.translation;
        const cardNextReview = card.nextReviewDate ?? card.next_review_date ?? existingMap.get(normalizedKey)?.nextReviewDate;
        const cardSentence = card.sentence || card.exampleSentence || card.example || existingMap.get(normalizedKey)?.sentence;
        const cardSentenceTrans = card.sentenceTranslation || card.sentence_translation || existingMap.get(normalizedKey)?.sentenceTranslation;

        if (!existingEntry) {
          deduplicatedMap.set(normalizedKey, {
            originalWord: rawWord,
            level,
            masteredAt,
            bookId: dBookId,
            translation: cardTranslation,
            cardId: card.id,
            nextReviewDate: cardNextReview,
            sentence: cardSentence,
            sentenceTranslation: cardSentenceTrans,
          });
        } else if (masteredAt > existingEntry.masteredAt) {
          deduplicatedMap.set(normalizedKey, {
            ...existingEntry,
            masteredAt,
            translation: cardTranslation || existingEntry.translation,
            cardId: card.id || existingEntry.cardId,
            nextReviewDate: cardNextReview || existingEntry.nextReviewDate,
            sentence: cardSentence || existingEntry.sentence,
            sentenceTranslation: cardSentenceTrans || existingEntry.sentenceTranslation,
          });
        }
      });
    });

    uniqueMasteredWordsByLang[targetLang] = deduplicatedMap;
    recomputeStatsFromMap(targetLang);
    persistMatrixToStorage(targetLang);
    notifyListeners(targetLang);

    if (targetLang === normalizeLanguageCode(targetLangParam)) {
      primaryCount = deduplicatedMap.size;
    }
  }

  return primaryCount;
}

/**
 * Синхронизирует матрицу при явном удалении колоды, книги или карточки.
 */
export async function reconcileMasteredWords(
  providedDecks?: Array<{ id: string; bookId?: string; level?: string; language?: string; cards?: Array<any> }>,
  targetLangParam?: string | AppLang,
  isExplicitDeletion: boolean = false
) {
  if (!isExplicitDeletion) {
    return;
  }
  await autoBackfillMasteredWords(providedDecks, undefined, targetLangParam);
}

/**
 * Подсчет слов, выученных сегодня в локальном часовом поясе пользователя:
 * todayStart <= masteredAt < todayEnd
 */
export function getWordsLearnedToday(langParam?: string | AppLang): TodayProgress {
  const lang = normalizeLanguageCode(langParam);
  initMatrixStore(lang);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayEnd = todayStart + 24 * 60 * 60 * 1000;

  const todayCounts: Record<CEFRLevel, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 };
  let wordsLearnedToday = 0;

  const map = uniqueMasteredWordsByLang[lang];
  map.forEach((entry) => {
    const ts = entry.masteredAt;
    if (ts >= todayStart && ts < todayEnd) {
      wordsLearnedToday++;
      const lvl = CEFR_LEVEL_KEYS.includes(entry.level) ? entry.level : 'B1';
      todayCounts[lvl] = (todayCounts[lvl] || 0) + 1;
    }
  });

  const totalGoal = C1_TARGET_WORDS[lang] || 10000;
  const percentLearnedToday =
    totalGoal > 0 ? ((wordsLearnedToday / totalGoal) * 100).toFixed(2) : '0.00';

  return {
    wordsLearnedToday,
    percentLearnedToday,
    todayCounts,
  };
}

/**
 * React-хук для отображения матрицы Wortschatz-Matrix и суточного прогресса.
 */
export function useWortschatzMatrix(langParam?: string | AppLang) {
  const normLang = normalizeLanguageCode(langParam);

  const [stats, setStats] = useState<CEFRMatrixStats>(() => {
    initMatrixStore(normLang);
    return { ...globalMatrixStatsByLang[normLang] };
  });

  const [todayProgress, setTodayProgress] = useState<TodayProgress>(() => {
    return getWordsLearnedToday(normLang);
  });

  useEffect(() => {
    initMatrixStore(normLang);
    setStats({ ...globalMatrixStatsByLang[normLang] });
    setTodayProgress(getWordsLearnedToday(normLang));

    // Синхронизируем из облака не более 1 раза на старте при абсолютно пустом сторе
    if (!hasAttemptedCloudSyncByLang[normLang] && uniqueMasteredWordsByLang[normLang].size === 0) {
      syncMasteredWordsFromCloud(normLang);
    }

    const handleUpdate = (changedLang: AppLang, updated: CEFRMatrixStats) => {
      if (changedLang === normLang) {
        setStats({ ...updated });
        setTodayProgress(getWordsLearnedToday(normLang));
      }
    };

    listeners.add(handleUpdate);

    const handleRefreshDaily = () => {
      setStats({ ...globalMatrixStatsByLang[normLang] });
      setTodayProgress(getWordsLearnedToday(normLang));
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('stats-update', handleRefreshDaily);
      window.addEventListener('storage', handleRefreshDaily);
      window.addEventListener('storage-update', handleRefreshDaily);
    }

    const handleFocus = () => {
      setTodayProgress(getWordsLearnedToday(normLang));
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setTodayProgress(getWordsLearnedToday(normLang));
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      listeners.delete(handleUpdate);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus);
        window.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('stats-update', handleRefreshDaily);
        window.removeEventListener('storage', handleRefreshDaily);
        window.removeEventListener('storage-update', handleRefreshDaily);
      }
    };
  }, [normLang]);

  const totalGoal = C1_TARGET_WORDS[normLang] || 10000;
  const wordLabel = WORD_LABELS_BY_LANG[normLang] || 'Wörter';

  const refreshMatrix = useCallback(async () => {
    await syncMasteredWordsFromCloud(normLang);
    setTodayProgress(getWordsLearnedToday(normLang));
  }, [normLang]);

  return {
    counts: stats.counts,
    totalWords: stats.totalWords,
    activeLevel: stats.activeLevel,
    currentLanguage: normLang,
    wordLabel,
    totalGoal,
    levels: CEFR_LEVEL_KEYS,
    masteredLemmas: getMasteredLemmasSet(normLang),
    refreshMatrix,
    wordsLearnedToday: todayProgress.wordsLearnedToday,
    percentLearnedToday: todayProgress.percentLearnedToday,
    todayCounts: todayProgress.todayCounts,
  };
}
