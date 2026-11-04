'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Search, Layers } from 'lucide-react';
import { useStore, type Flashcard } from '@/app/page';
import {
  getMasteredWordEntries,
  normalizeLanguageCode,
  isFunctionalParticle,
  extractConciseTranslation,
  purgeJunkExportierenWord,
  type CEFRLevel,
  type AppLang,
} from '@/hooks/useWortschatzMatrix';
import { normalizeLemmaKey } from '@/lib/utils/lemmaNormalizer';
import { formatSeparableWord } from '@/lib/utils/formatSeparableWord';

export interface MasteredWordsModalProps {
  isOpen: boolean;
  onClose: () => void;
  language?: string;
  initialLevelFilter?: CEFRLevel | 'Alle';
}

const FILTER_LEVELS: Array<'Alle' | CEFRLevel> = ['Alle', 'A1', 'A2', 'B1', 'B2', 'C1'];

export const MasteredWordsModal: React.FC<MasteredWordsModalProps> = ({
  isOpen,
  onClose,
  language = 'de',
  initialLevelFilter = 'Alle',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<'Alle' | CEFRLevel>(initialLevelFilter);
  const [updateTick, setUpdateTick] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const decks = useStore((state) => state.decks);

  const currentLang: AppLang = normalizeLanguageCode(language);

  // Синхронизация при смене начального фильтра или открытии
  useEffect(() => {
    if (isOpen) {
      purgeJunkExportierenWord().catch(() => {});
      setSelectedLevel(initialLevelFilter || 'Alle');
      setSearchQuery('');
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, initialLevelFilter]);

  // Подписка на обновление статистики и карточек
  useEffect(() => {
    const handleStatsUpdate = () => setUpdateTick((t) => t + 1);
    window.addEventListener('stats-update', handleStatsUpdate);
    return () => window.removeEventListener('stats-update', handleStatsUpdate);
  }, []);

  // Закрытие по клавише Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Блокировка скролла страницы при открытой модалке (Body Scroll Lock)
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Индексация карточек из всех колод для сопоставления переводов, SRS-дат и редактирования
  const { cardsById, cardsByLemma, lemmaTranslationMap } = useMemo(() => {
    const byId = new Map<string, Flashcard>();
    const byLemma = new Map<string, Flashcard>();
    const lemmaMap = new Map<string, string>();

    decks.forEach((deck) => {
      deck.cards?.forEach((c) => {
        if (c.id) byId.set(c.id, c);
        const lKey = normalizeLemmaKey(c.targetWord || '');
        if (lKey) {
          if (!byLemma.has(lKey)) {
            byLemma.set(lKey, c);
          }
          const concise = extractConciseTranslation(c);
          if (concise && !concise.endsWith('.') && concise.split(/\s+/).length <= 6) {
            if (!lemmaMap.has(lKey) || concise.length < lemmaMap.get(lKey)!.length) {
              lemmaMap.set(lKey, concise);
            }
          }
        }
      });
    });

    return { cardsById: byId, cardsByLemma: byLemma, lemmaTranslationMap: lemmaMap };
  }, [decks, updateTick]);

  // Получение сырого списка выученных слов из матрицы памяти
  const rawEntries = useMemo(() => {
    if (!isOpen) return [];
    return getMasteredWordEntries(currentLang).filter(
      (e) =>
        !e.originalWord.toLowerCase().includes('exportieren') &&
        !(e.translation && e.translation.toLowerCase().includes('деяние'))
    );
  }, [currentLang, isOpen, updateTick]);

  // Обогащение записей краткими переводами, SRS-датами и объектами карточек
  const enrichedWords = useMemo(() => {
    return rawEntries
      .filter((entry) => {
        const w = (entry.originalWord || '').toLowerCase();
        const tr = (entry.translation || '').toLowerCase();
        return (
          !w.includes('exportieren') &&
          !tr.includes('деяние') &&
          !isFunctionalParticle(entry.originalWord) &&
          !isFunctionalParticle(normalizeLemmaKey(entry.originalWord))
        );
      })
      .map((entry) => {
        const lKey = normalizeLemmaKey(entry.originalWord);
        const card = (entry.cardId && cardsById.get(entry.cardId)) || cardsByLemma.get(lKey) || null;

        let translation =
          lemmaTranslationMap.get(lKey) ||
          extractConciseTranslation(card, entry.translation) ||
          entry.translation ||
          card?.translation ||
          '';

        // Если в строке перевода осталась часть с тире, берем правую часть определения
        if (translation.includes('—') || translation.includes('–')) {
          const parts = translation.split(/[—–]/);
          translation = parts[parts.length - 1].trim();
        }
        // Убираем завершающую точку предложения
        translation = translation.replace(/\.$/, '').trim();

        // Защита: если перевод длиннее 35 символов или содержит знаки препинания предложения, исключаем
        if (translation.length > 35 || translation.split(/\s+/).length > 6 || /[.?!:;]/.test(translation)) {
          translation = '';
        }

        const level = (entry.level || card?.level || 'B1') as CEFRLevel;
        const nextReviewDate =
          card?.nextReviewDate ?? (card as any)?.next_review_date ?? entry.nextReviewDate ?? null;

        return {
          key: lKey || entry.originalWord,
          word: entry.originalWord,
          translation,
          level,
          masteredAt: entry.masteredAt || 0,
          nextReviewDate,
          card,
          entry,
        };
      });
  }, [rawEntries, cardsById, cardsByLemma, lemmaTranslationMap]);

  // Фильтрация и поиск
  const filteredWords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return enrichedWords
      .filter((item) => {
        // Фильтр по уровню
        if (selectedLevel !== 'Alle' && item.level !== selectedLevel) {
          return false;
        }

        // Фильтр по строке поиска (немецкое слово или русский перевод)
        if (q) {
          const matchWord = item.word.toLowerCase().includes(q);
          const matchTrans = item.translation.toLowerCase().includes(q);
          if (!matchWord && !matchTrans) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Сначала недавно выученные, затем по алфавиту
        if (b.masteredAt !== a.masteredAt) {
          return b.masteredAt - a.masteredAt;
        }
        return a.word.localeCompare(b.word, 'de');
      });
  }, [enrichedWords, selectedLevel, searchQuery]);

  // Подсчет слов по каждому уровню для бейджей сегментного переключателя
  const levelCounts = useMemo(() => {
    const counts: Record<string, number> = { Alle: enrichedWords.length };
    FILTER_LEVELS.forEach((lvl) => {
      if (lvl !== 'Alle') counts[lvl] = 0;
    });
    enrichedWords.forEach((item) => {
      if (counts[item.level] !== undefined) {
        counts[item.level] += 1;
      }
    });
    return counts;
  }, [enrichedWords]);

  if (!isOpen) return null;

  return (
    <div
      className="backdrop-blur-2xl bg-black/60 fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      <div
        className="max-w-2xl w-full max-h-[85vh] rounded-3xl bg-white/95 dark:bg-[#121214]/98 border border-neutral-200 dark:border-white/[0.08] shadow-2xl flex flex-col overflow-hidden p-5 sm:p-6 select-text text-left relative"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
          {/* 1. ВЕРХНИЙ БЛОК: СТРОКА ПОИСКА + КНОПКА ЗАКРЫТИЯ (APPLE MINIMALISM) */}
          <div className="flex items-center gap-3 mb-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-neutral-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск"
                className="w-full bg-black/5 dark:bg-[#1C1C1E] border border-black/10 dark:border-white/[0.08] rounded-2xl pl-11 pr-10 py-2.5 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition cursor-pointer"
                  title="Очистить поиск"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2.5 rounded-full text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0"
              title="Schließen (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 2. APPLE SEGMENTED CONTROL ДЛЯ УРОВНЕЙ CEFR */}
          <div className="w-full p-1 bg-neutral-200/70 dark:bg-neutral-800/80 backdrop-blur-md rounded-2xl border border-black/5 dark:border-white/10 flex items-center gap-1 mb-2.5 select-none">
            {FILTER_LEVELS.map((lvl) => {
              const isSelected = selectedLevel === lvl;
              const count = levelCounts[lvl] ?? 0;
              const isEmpty = count === 0 && lvl !== 'Alle';

              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setSelectedLevel(lvl)}
                  className={`
                    relative flex-1 py-2 px-2.5 rounded-xl text-xs sm:text-[13px] font-medium 
                    transition-all duration-200 flex items-center justify-center gap-1.5 outline-none cursor-pointer
                    ${isSelected 
                      ? 'bg-white dark:bg-neutral-700/90 text-neutral-900 dark:text-white shadow-sm shadow-black/20 ring-1 ring-black/5 dark:ring-white/10 font-semibold' 
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/5'
                    }
                    ${isEmpty ? 'opacity-40' : 'opacity-100'}
                  `}
                >
                  {/* Название уровня */}
                  <span className="tracking-tight">{lvl}</span>

                  {/* Аккуратный счетчик слов */}
                  <span
                    className={`
                      text-[11px] px-1.5 py-0.5 rounded-md font-mono transition-colors
                      ${isSelected 
                        ? 'bg-neutral-100 dark:bg-white/15 text-neutral-700 dark:text-neutral-200 font-semibold' 
                        : 'bg-black/5 dark:bg-black/20 text-neutral-500 dark:text-neutral-400'
                      }
                    `}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 3. СКРОЛЛИРУЕМЫЙ СПИСОК СЛОВ В СТИЛЕ APPLE GOLDEN VAULT */}
          <div className="flex-1 overflow-y-auto space-y-1 py-1 pr-1 min-h-[220px] scrollbar-thin scrollbar-thumb-neutral-300 dark:scrollbar-thumb-neutral-700/50 hover:scrollbar-thumb-neutral-400 dark:hover:scrollbar-thumb-neutral-600 scrollbar-track-transparent [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-neutral-300 dark:[&::-webkit-scrollbar-thumb]:bg-neutral-800 hover:[&::-webkit-scrollbar-thumb]:bg-neutral-400 dark:hover:[&::-webkit-scrollbar-thumb]:bg-neutral-700 [&::-webkit-scrollbar-thumb]:rounded-full">
            {filteredWords.length === 0 ? (
              <div className="py-20 flex items-center justify-center text-neutral-300 dark:text-neutral-700 opacity-40">
                <Layers className="w-12 h-12 stroke-[1.2]" />
              </div>
            ) : (
              filteredWords.map((item) => {
                return (
                  <div
                    key={item.key}
                    className="group relative flex items-center justify-between p-4 my-1.5 rounded-2xl bg-neutral-100/50 dark:bg-white/[0.03] hover:bg-neutral-100 dark:hover:bg-white/[0.07] border border-black/[0.03] dark:border-white/[0.05] hover:border-amber-500/30 transition-all duration-200"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {/* Золотая печать мастера (Apple Gold Seal) */}
                      <div className="w-2 h-2 rounded-full bg-gradient-to-tr from-amber-500 to-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.7)] shrink-0" />
                      
                      <div className="flex flex-col min-w-0">
                        <span className="text-[16px] font-medium text-neutral-900 dark:text-neutral-100 tracking-tight group-hover:text-amber-500 dark:group-hover:text-amber-300 transition-colors truncate">
                          {formatSeparableWord(item.word)}
                        </span>
                        {item.translation ? (
                          <span className="text-xs text-neutral-500 dark:text-neutral-400 font-normal truncate mt-0.5">
                            {item.translation}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Правый блок: чистый матовый уровень */}
                    <div className="shrink-0 flex items-center gap-2">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-neutral-200/70 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-black/5 dark:border-white/5">
                        {item.level || 'B2'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
  );
};
