'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Search, Pencil, Layers } from 'lucide-react';
import { useStore, type Flashcard } from '@/app/page';
import {
  getMasteredWordEntries,
  normalizeLanguageCode,
  isFunctionalParticle,
  extractConciseTranslation,
  type CEFRLevel,
  type AppLang,
} from '@/hooks/useWortschatzMatrix';
import { normalizeLemmaKey } from '@/lib/utils/lemmaNormalizer';
import { formatSeparableWord } from '@/lib/utils/formatSeparableWord';
import { CardEditorModal } from '@/components/CardEditorModal';

export interface MasteredWordsModalProps {
  isOpen: boolean;
  onClose: () => void;
  language?: string;
  initialLevelFilter?: CEFRLevel | 'Alle';
}

const FILTER_LEVELS: Array<'Alle' | CEFRLevel> = ['Alle', 'A1', 'A2', 'B1', 'B2', 'C1'];

const LEVEL_BADGE_STYLES: Record<CEFRLevel, string> = {
  A1: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
  A2: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/25',
  B1: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25',
  B2: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25',
  C1: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/25',
};

/**
 * Вычисляет статус интервального повторения SRS для выученной карточки
 */
export function getSRSStatus(nextReviewDate?: string | number | null): { label: string; isDue: boolean } {
  if (!nextReviewDate) return { label: 'Освоено', isDue: false };

  const diffMs = new Date(nextReviewDate).getTime() - Date.now();

  if (diffMs <= 0) {
    return { label: 'К повтору', isDue: true };
  }

  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 24) {
    return { label: `через ${diffHours} ч.`, isDue: false };
  }
  return { label: `через ${diffDays} дн.`, isDue: false };
}

export const MasteredWordsModal: React.FC<MasteredWordsModalProps> = ({
  isOpen,
  onClose,
  language = 'de',
  initialLevelFilter = 'Alle',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<'Alle' | CEFRLevel>(initialLevelFilter);
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [updateTick, setUpdateTick] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const decks = useStore((state) => state.decks);
  const updateCardContent = useStore((state) => state.updateCardContent);

  const currentLang: AppLang = normalizeLanguageCode(language);

  // Синхронизация при смене начального фильтра или открытии
  useEffect(() => {
    if (isOpen) {
      setSelectedLevel(initialLevelFilter || 'Alle');
      setSearchQuery('');
      setIsEditorOpen(false);
      setEditingCard(null);
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

  // Закрытие по клавише Escape (только если не открыт внутренний редактор)
  useEffect(() => {
    if (!isOpen || isEditorOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isEditorOpen, onClose]);

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
    return getMasteredWordEntries(currentLang);
  }, [currentLang, isOpen, updateTick]);

  // Обогащение записей краткими переводами, SRS-датами и объектами карточек
  const enrichedWords = useMemo(() => {
    return rawEntries
      .filter(
        (entry) =>
          !isFunctionalParticle(entry.originalWord) &&
          !isFunctionalParticle(normalizeLemmaKey(entry.originalWord))
      )
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

  // Открытие модального окна редактирования карточки
  const handleOpenEditor = (item: (typeof enrichedWords)[0]) => {
    let targetCard = item.card;

    if (!targetCard) {
      targetCard = {
        id: item.entry.cardId || `mastered_${item.key}`,
        targetWord: item.word,
        sentence: item.word,
        translation: item.translation,
        options: [],
        masteryLevel: 4,
        isArchived: true,
        nextReviewDate: item.nextReviewDate ? new Date(item.nextReviewDate).getTime() : null,
        interval: 30,
        repetitions: 4,
        level: item.level,
      };
    }

    setEditingCard(targetCard);
    setIsEditorOpen(true);
  };

  // Сохранение обновленной карточки
  const handleSaveCard = async (updatedCard: Flashcard) => {
    await updateCardContent(updatedCard.id, updatedCard);
    setEditingCard(null);
    setIsEditorOpen(false);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('stats-update'));
    }
  };

  if (!isOpen) return null;

  return (
    <>
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
          <div className="p-1 bg-neutral-100 dark:bg-neutral-800/80 rounded-2xl flex items-center gap-1 border border-neutral-200/60 dark:border-white/5 mb-3.5 select-none overflow-x-auto scrollbar-none">
            {FILTER_LEVELS.map((lvl) => {
              const isSelected = selectedLevel === lvl;
              const count = levelCounts[lvl] ?? 0;

              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setSelectedLevel(lvl)}
                  className={`flex-1 min-w-[56px] rounded-xl px-3 py-1.5 text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    isSelected
                      ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white font-medium shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
                  }`}
                >
                  <span>{lvl}</span>
                  <span className="opacity-70 font-mono text-[10px]">({count})</span>
                </button>
              );
            })}
          </div>

          {/* 3. СКРОЛЛИРУЕМЫЙ СПИСОК СЛОВ В СТИЛЕ APPLE macOS */}
          <div className="flex-1 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800/50 py-1 pr-1 min-h-[220px] scrollbar-thin scrollbar-thumb-neutral-300 dark:scrollbar-thumb-neutral-700/50 hover:scrollbar-thumb-neutral-400 dark:hover:scrollbar-thumb-neutral-600 scrollbar-track-transparent [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-neutral-300 dark:[&::-webkit-scrollbar-thumb]:bg-neutral-800 hover:[&::-webkit-scrollbar-thumb]:bg-neutral-400 dark:hover:[&::-webkit-scrollbar-thumb]:bg-neutral-700 [&::-webkit-scrollbar-thumb]:rounded-full">
            {filteredWords.length === 0 ? (
              <div className="py-20 flex items-center justify-center text-neutral-300 dark:text-neutral-700 opacity-40">
                <Layers className="w-12 h-12 stroke-[1.2]" />
              </div>
            ) : (
              filteredWords.map((item) => {
                const badgeClass =
                  LEVEL_BADGE_STYLES[item.level] ||
                  'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25';

                const srs = getSRSStatus(item.nextReviewDate);

                return (
                  <div
                    key={item.key}
                    className="flex items-center justify-between py-2.5 px-2 rounded-xl hover:bg-neutral-100/70 dark:hover:bg-neutral-800/40 transition-colors group"
                  >
                    {/* Левая часть: Немецкое слово + Краткий русский перевод */}
                    <div className="flex flex-col min-w-0 pr-3">
                      <span className="text-neutral-900 dark:text-neutral-100 font-medium text-base tracking-tight group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">
                        {formatSeparableWord(item.word)}
                      </span>
                      {item.translation ? (
                        <span className="text-neutral-500 dark:text-neutral-400 font-normal text-xs mt-0.5 truncate max-w-xs sm:max-w-md">
                          {item.translation}
                        </span>
                      ) : (
                        <span className="text-neutral-400 dark:text-neutral-600 italic font-normal text-xs mt-0.5">
                          Keine Übersetzung angegeben
                        </span>
                      )}
                    </div>

                    {/* Правая часть: SRS-индикатор + Бейдж уровня + Карандаш */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {srs.isDue ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-500 dark:text-amber-400 border border-amber-500/30">
                          {srs.label}
                        </span>
                      ) : (
                        <span className="text-[11px] text-neutral-400 dark:text-neutral-500 font-normal mr-1">
                          {srs.label}
                        </span>
                      )}

                      <span
                        className={`text-[11px] font-semibold font-mono px-2 py-0.5 rounded-lg border ${badgeClass}`}
                      >
                        {item.level}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleOpenEditor(item)}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                        title="Karte bearbeiten"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Вложенная модалка редактирования конкретной карточки */}
      {isEditorOpen && editingCard && (
        <CardEditorModal
          card={editingCard}
          isOpen={isEditorOpen}
          onClose={() => {
            setIsEditorOpen(false);
            setEditingCard(null);
          }}
          onSave={handleSaveCard}
        />
      )}
    </>
  );
};
