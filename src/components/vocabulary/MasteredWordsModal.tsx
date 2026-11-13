'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Layers } from 'lucide-react';
import { useStore, type Flashcard } from '@/app/page';
import {
  useWortschatzMatrix,
  isValidMasteredEntry,
  normalizeLanguageCode,
  extractConciseTranslation,
  purgeJunkExportierenWord,
  type CEFRLevel,
  type MatrixCEFRLevel,
  type AppLang,
} from '@/hooks/useWortschatzMatrix';
import { normalizeMasteredLemma, isExcludedStandaloneLemma } from '@/lib/utils/lemmaNormalizer';
import { formatSeparableWord } from '@/lib/utils/formatSeparableWord';

export interface MasteredWordsModalProps {
  isOpen: boolean;
  onClose: () => void;
  language?: string;
  initialLevelFilter?: MatrixCEFRLevel | 'Alle';
}

const FILTER_LEVELS: Array<'Alle' | MatrixCEFRLevel> = ['Alle', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export const MasteredWordsModal: React.FC<MasteredWordsModalProps> = ({
  isOpen,
  onClose,
  language = 'de',
  initialLevelFilter = 'Alle',
}) => {
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<'Alle' | MatrixCEFRLevel>(initialLevelFilter);
  const [updateTick, setUpdateTick] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const decks = useStore((state) => state.decks);

  const currentLang: AppLang = normalizeLanguageCode(language);
  const { masteredEntries } = useWortschatzMatrix(currentLang);

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

  // Подписка на мгновенное обновление списка освоенных слов и статистики
  useEffect(() => {
    const handleStatsUpdate = () => setUpdateTick((t) => t + 1);
    window.addEventListener('kraft:mastered-updated', handleStatsUpdate);
    window.addEventListener('stats-update', handleStatsUpdate);
    return () => {
      window.removeEventListener('kraft:mastered-updated', handleStatsUpdate);
      window.removeEventListener('stats-update', handleStatsUpdate);
    };
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
        const lKey = normalizeMasteredLemma(c.targetWord || '');
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

  // Получение единого списка выученных слов напрямую из shared hook state
  const rawEntries = useMemo(() => {
    if (!isOpen) return [];
    return masteredEntries.filter((e) =>
      isValidMasteredEntry(e.originalWord, normalizeMasteredLemma(e.originalWord), e.translation)
    );
  }, [masteredEntries, isOpen]);

  // Обогащение записей краткими переводами, SRS-датами и объектами карточек
  const enrichedWords = useMemo(() => {
    return rawEntries
      .map((entry) => {
        const lKey = normalizeMasteredLemma(entry.originalWord);
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

        const level = (entry.level || 'B1') as MatrixCEFRLevel;
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

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md transition-opacity select-none"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl max-h-[85vh] flex flex-col rounded-3xl bg-neutral-900/95 border border-white/10 shadow-[0_25px_70px_rgba(0,0,0,0.8)] overflow-hidden select-text text-left"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* 1. ШАПКА: ПОИСК И СЕГМЕНТНЫЕ ФИЛЬТРЫ УРОВНЯ */}
        <div className="p-6 pb-4 border-b border-white/5 space-y-4 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по выученным словам..."
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-9 py-2 text-base sm:text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-amber-400/50 transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                  title="Очистить"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
              title="Schließen (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Сегментные фильтры уровня */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {FILTER_LEVELS.map((lvl) => {
              const isSelected = selectedLevel === lvl;
              const count = levelCounts[lvl] ?? 0;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setSelectedLevel(lvl)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer outline-none shrink-0 ${
                    isSelected
                      ? 'bg-amber-400/15 text-amber-300 border border-amber-400/30 font-semibold'
                      : 'bg-white/5 text-neutral-400 border border-white/5 hover:bg-white/10'
                  }`}
                >
                  <span>{lvl}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                      isSelected ? 'bg-amber-400/20 text-amber-200' : 'bg-white/5 text-neutral-500'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. СКРОЛЛИРУЕМЫЙ СПИСОК СЛОВ В СТИЛЕ APPLE GOLDEN VAULT */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1.5 min-h-[220px] scrollbar-thin scrollbar-thumb-neutral-700/50 hover:scrollbar-thumb-neutral-600 scrollbar-track-transparent">
          {filteredWords.length === 0 ? (
            <div className="py-20 flex items-center justify-center text-neutral-600 opacity-40">
              <Layers className="w-12 h-12 stroke-[1.2]" />
            </div>
          ) : (
            filteredWords.map((item) => (
              <div
                key={item.key}
                className="group flex items-center justify-between px-4 py-3 rounded-2xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-amber-400/20 transition-all duration-150"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Золотая точка освоенного слова */}
                  <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)] shrink-0" />

                  <div className="flex flex-col min-w-0">
                    <span className="text-[15px] font-medium text-neutral-100 group-hover:text-amber-300 transition-colors truncate">
                      {formatSeparableWord(item.word)}
                    </span>
                    {item.translation && (
                      <span className="text-xs text-neutral-400 truncate">
                        {item.translation}
                      </span>
                    )}
                  </div>
                </div>

                {/* Бейдж уровня */}
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-white/5 text-neutral-400 border border-white/5 shrink-0">
                  {item.level || 'B2'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
