'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Search, Pencil, BookOpen, Layers } from 'lucide-react';
import { useStore, type Flashcard } from '@/app/page';
import {
  getMasteredWordEntries,
  normalizeLanguageCode,
  isFunctionalParticle,
  type MasteredWordEntry,
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
  A1: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  A2: 'bg-teal-500/15 text-teal-400 border-teal-500/25',
  B1: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  B2: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  C1: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
};

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

  // Индексация карточек из колод для мгновенного сопоставления переводов и редактирования
  const { cardsById, cardsByLemma } = useMemo(() => {
    const byId = new Map<string, Flashcard>();
    const byLemma = new Map<string, Flashcard>();

    decks.forEach((deck) => {
      deck.cards?.forEach((c) => {
        if (c.id) byId.set(c.id, c);
        const lKey = normalizeLemmaKey(c.targetWord || '');
        if (lKey && !byLemma.has(lKey)) {
          byLemma.set(lKey, c);
        }
      });
    });

    return { cardsById: byId, cardsByLemma: byLemma };
  }, [decks, updateTick]);

  // Получение сырого списка выученных слов из матрицы памяти
  const rawEntries = useMemo(() => {
    if (!isOpen) return [];
    return getMasteredWordEntries(currentLang);
  }, [currentLang, isOpen, updateTick]);

  // Обогащение записей переводами и объектами карточек
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
        let translation = entry.translation || card?.translation || '';
        // Если перевод слишком длинный (целое русское предложение), очищаем его
        if (translation.length > 80 && translation.includes('.')) {
          const firstSentence = translation.split('.')[0].trim();
          if (firstSentence.length > 3) translation = firstSentence;
        }
        const level = (entry.level || card?.level || 'B1') as CEFRLevel;

        return {
          key: lKey || entry.originalWord,
          word: entry.originalWord,
          translation,
          level,
          masteredAt: entry.masteredAt || 0,
          card,
          entry,
        };
      });
  }, [rawEntries, cardsById, cardsByLemma]);

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
      // Если карточка не найдена локально, формируем валидный объект Flashcard для редактирования
      targetCard = {
        id: item.entry.cardId || `mastered_${item.key}`,
        targetWord: item.word,
        sentence: item.word,
        translation: item.translation,
        options: [],
        masteryLevel: 4,
        isArchived: true,
        nextReviewDate: null,
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
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xl animate-in fade-in duration-200 select-none"
        onClick={onClose}
      >
        <div
          className="max-w-2xl w-full max-h-[80vh] flex flex-col rounded-3xl bg-neutral-900/95 border border-neutral-800 shadow-2xl p-6 select-text text-left relative overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mastered-words-title"
        >
          {/* 1. ШАПКА МОДАЛЬНОГО ОКНА */}
          <div className="flex items-center justify-between pb-4 border-b border-neutral-800/80">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <BookOpen className="w-5 h-5 stroke-[2]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3
                    id="mastered-words-title"
                    className="text-lg font-semibold text-white tracking-tight"
                  >
                    Gelernte Wörter
                  </h3>
                  <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700/50">
                    {filteredWords.length}
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Alle einzigartigen gemeisterten Vokabeln (Stufe 4 & Archiv)
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/80 transition-colors cursor-pointer"
              title="Schließen (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 2. ПАНЕЛЬ ФИЛЬТРОВ И ПОИСКА */}
          <div className="py-4 space-y-3 border-b border-neutral-800/80">
            {/* Поисковая строка */}
            <div className="relative">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Wort oder Übersetzung suchen..."
                className="w-full bg-neutral-800/60 border border-neutral-700/40 rounded-xl pl-9 pr-9 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-neutral-400 hover:text-neutral-200 transition"
                  title="Suche leeren"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Apple Segmented Control для уровней CEFR */}
            <div className="bg-neutral-800/60 p-1 rounded-xl flex items-center gap-1 border border-neutral-700/30 overflow-x-auto scrollbar-none">
              {FILTER_LEVELS.map((lvl) => {
                const isSelected = selectedLevel === lvl;
                const count = levelCounts[lvl] ?? 0;

                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setSelectedLevel(lvl)}
                    className={`flex-1 min-w-[56px] py-1 px-2 rounded-lg text-xs font-medium tracking-tight transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      isSelected
                        ? 'bg-neutral-700/90 text-white shadow-sm font-semibold'
                        : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40'
                    }`}
                  >
                    <span>{lvl}</span>
                    <span className="text-[10px] opacity-70 font-mono">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. СКРОЛЛИРУЕМЫЙ СПИСОК СЛОВ В СТИЛЕ macOS */}
          <div className="flex-1 overflow-y-auto divide-y divide-neutral-800/50 py-2 pr-1 min-h-[220px] scrollbar-thin scrollbar-thumb-neutral-700/50 hover:scrollbar-thumb-neutral-600 scrollbar-track-transparent [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-neutral-800 hover:[&::-webkit-scrollbar-thumb]:bg-neutral-700 [&::-webkit-scrollbar-thumb]:rounded-full">
            {filteredWords.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-12 text-center select-none">
                <div className="w-12 h-12 rounded-2xl bg-neutral-800/60 flex items-center justify-center text-neutral-500 mb-3">
                  <Layers className="w-6 h-6 stroke-[1.5]" />
                </div>
                <p className="text-sm font-medium text-neutral-300">
                  {searchQuery
                    ? `Keine Wörter gefunden für «${searchQuery}»`
                    : selectedLevel !== 'Alle'
                    ? `Noch keine gelernten Wörter auf Niveau ${selectedLevel}`
                    : 'Noch keine gelernten Wörter vorhanden'}
                </p>
                <p className="text-xs text-neutral-500 mt-1 max-w-sm">
                  {searchQuery
                    ? 'Versuche einen anderen Suchbegriff oder setze den Filter zurück.'
                    : 'Schließe Karten auf Stufe 4 ab, um deinen Wortschatz aufzubauen.'}
                </p>
              </div>
            ) : (
              filteredWords.map((item) => {
                const badgeClass =
                  LEVEL_BADGE_STYLES[item.level] ||
                  'bg-blue-500/15 text-blue-400 border-blue-500/25';

                return (
                  <div
                    key={item.key}
                    className="flex items-center justify-between py-2.5 px-2 rounded-xl hover:bg-neutral-800/40 transition-colors group"
                  >
                    {/* Левая колонка: Немецкое слово + Перевод */}
                    <div className="flex flex-col min-w-0 pr-3">
                      <span className="text-neutral-100 font-medium text-base tracking-tight group-hover:text-blue-400 transition-colors">
                        {formatSeparableWord(item.word)}
                      </span>
                      {item.translation ? (
                        <span className="text-neutral-400 font-normal text-xs mt-0.5 truncate max-w-xs sm:max-w-md">
                          {item.translation}
                        </span>
                      ) : (
                        <span className="text-neutral-600 italic font-normal text-xs mt-0.5">
                          Keine Übersetzung angegeben
                        </span>
                      )}
                    </div>

                    {/* Правая колонка: Бейдж уровня + Кнопка редактирования */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className={`text-[11px] font-semibold font-mono px-2 py-0.5 rounded-lg border ${badgeClass}`}
                      >
                        {item.level}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleOpenEditor(item)}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
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
