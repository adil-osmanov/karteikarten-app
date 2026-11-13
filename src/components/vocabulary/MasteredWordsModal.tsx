'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Sparkles, ArrowUpDown } from 'lucide-react';
import { useStore, stopAllGermanSpeech, type Flashcard } from '@/app/page';
import {
  useWortschatzMatrix,
  isValidMasteredEntry,
  normalizeLanguageCode,
  extractConciseTranslation,
  purgeJunkExportierenWord,
  type MatrixCEFRLevel,
  type AppLang,
} from '@/hooks/useWortschatzMatrix';
import { normalizeMasteredLemma } from '@/lib/utils/lemmaNormalizer';
import { getWordTier, type WordTier } from '@/lib/vocabulary/wordFamilies';
import {
  WordInspector,
  renderDelicateWord,
  type EnrichedMasteredWord,
} from './WordInspector';
import {
  ContextStoryPanel,
  type GeneratedContextStory,
} from './ContextStoryPanel';

export interface MasteredWordsModalProps {
  isOpen: boolean;
  onClose: () => void;
  language?: string;
  initialLevelFilter?: MatrixCEFRLevel | 'Alle';
}

type TierFilter = 'Alle' | WordTier;
type SortOption = 'recent' | 'az';

const BASE_LEVELS: Array<'Alle' | MatrixCEFRLevel> = ['Alle', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const TIER_DOT_FILTERS: Array<{ id: WordTier; label: string; dotClass: string }> = [
  {
    id: 'gold',
    label: 'Gold',
    dotClass: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]',
  },
  {
    id: 'silber',
    label: 'Silber',
    dotClass: 'bg-slate-300/70',
  },
  {
    id: 'graphit',
    label: 'Graphit',
    dotClass: 'bg-white/25',
  },
];

const TIER_TILE_CLASSES: Record<WordTier, string> = {
  gold: 'bg-gradient-to-b from-amber-400/[0.07] to-[#111114] border border-amber-400/25 hover:border-amber-400/50',
  silber:
    'bg-gradient-to-b from-white/[0.04] to-[#111114] border border-white/15 hover:border-white/30',
  graphit: 'bg-[#111114] border border-white/[0.07] hover:border-white/20',
};

const TIER_DOT_CLASSES: Record<WordTier, string> = {
  gold: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]',
  silber: 'bg-slate-300/70',
  graphit: 'bg-white/20',
};

export const MasteredWordsModal: React.FC<MasteredWordsModalProps> = ({
  isOpen,
  onClose,
  language = 'de',
  initialLevelFilter = 'Alle',
}) => {
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<'Alle' | MatrixCEFRLevel>(initialLevelFilter);
  const [tierFilter, setTierFilter] = useState<TierFilter>('Alle');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [inspectorItemKey, setInspectorItemKey] = useState<string | null>(null);
  const [isStoryOpen, setIsStoryOpen] = useState(false);
  const [storyLoading, setStoryLoading] = useState(false);
  const [generatedStory, setGeneratedStory] = useState<GeneratedContextStory | null>(null);
  const [updateTick, setUpdateTick] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const decks = useStore((state) => state.decks);
  const books = useStore((state) => state.books);

  const currentLang: AppLang = normalizeLanguageCode(language);
  const { masteredEntries } = useWortschatzMatrix(currentLang);

  // Reset modal transient UI on open
  useEffect(() => {
    if (isOpen) {
      purgeJunkExportierenWord().catch(() => {});
      setSelectedLevel(initialLevelFilter || 'Alle');
      setSearchQuery('');
      setTierFilter('Alle');
      setInspectorItemKey(null);
      setIsStoryOpen(false);
      setGeneratedStory(null);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      stopAllGermanSpeech();
    }
  }, [isOpen, initialLevelFilter]);

  // Live vocabulary updates in memory (zero Supabase reads)
  useEffect(() => {
    const handleStatsUpdate = () => setUpdateTick((t) => t + 1);
    window.addEventListener('kraft:mastered-updated', handleStatsUpdate);
    window.addEventListener('stats-update', handleStatsUpdate);
    return () => {
      window.removeEventListener('kraft:mastered-updated', handleStatsUpdate);
      window.removeEventListener('stats-update', handleStatsUpdate);
    };
  }, []);

  // Cascading Esc: close Inspector -> Story -> Modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (inspectorItemKey) {
          stopAllGermanSpeech();
          setInspectorItemKey(null);
          return;
        }
        if (isStoryOpen) {
          stopAllGermanSpeech();
          setIsStoryOpen(false);
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isStoryOpen, inspectorItemKey, onClose]);

  // Body Scroll Lock
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // In-memory index of loaded books & decks (0 extra Supabase egress)
  const { cardsById, cardsByLemma, lemmaTranslationMap, cardMetaById, cardMetaByLemma } = useMemo(() => {
    const bookTitleMap = new Map<string, string>();
    books.forEach((b) => {
      if (b?.id && b?.title) bookTitleMap.set(b.id, b.title);
    });

    const byId = new Map<string, Flashcard>();
    const byLemma = new Map<string, Flashcard>();
    const lemmaMap = new Map<string, string>();
    const metaById = new Map<string, { deckId: string; deckName: string; bookTitle: string }>();
    const metaByLemma = new Map<string, { deckId: string; deckName: string; bookTitle: string }>();

    decks.forEach((deck) => {
      const bId = deck.bookId || (deck as any).book_id;
      const resolvedBookTitle = (bId && bookTitleMap.get(bId)) || '';
      const resolvedDeckName = deck.name || (deck as any).title || '';
      const deckMeta = {
        deckId: deck.id,
        deckName: resolvedDeckName,
        bookTitle: resolvedBookTitle,
      };

      deck.cards?.forEach((c) => {
        if (c.id) {
          byId.set(c.id, c);
          metaById.set(c.id, deckMeta);
        }
        const lKey = normalizeMasteredLemma(c.targetWord || '');
        if (lKey) {
          if (!byLemma.has(lKey)) {
            byLemma.set(lKey, c);
            metaByLemma.set(lKey, deckMeta);
          } else {
            const existing = byLemma.get(lKey)!;
            if (
              (c.interval ?? 0) > (existing.interval ?? 0) ||
              (c.isArchived && !existing.isArchived)
            ) {
              byLemma.set(lKey, c);
              metaByLemma.set(lKey, deckMeta);
            }
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

    return {
      cardsById: byId,
      cardsByLemma: byLemma,
      lemmaTranslationMap: lemmaMap,
      cardMetaById: metaById,
      cardMetaByLemma: metaByLemma,
    };
  }, [decks, books, updateTick]);

  // Unified authoritative mastered entries (1:1 synced with Header & Matrix)
  const rawEntries = useMemo(() => {
    if (!isOpen) return [];
    return masteredEntries.filter((e) =>
      isValidMasteredEntry(e.originalWord, normalizeMasteredLemma(e.originalWord), e.translation)
    );
  }, [masteredEntries, isOpen]);

  const enrichedWords: EnrichedMasteredWord[] = useMemo(() => {
    const bookTitleById = new Map<string, string>();
    books.forEach((b) => {
      if (b?.id && b?.title) bookTitleById.set(b.id, b.title);
    });

    return rawEntries.map((entry) => {
      const lKey = normalizeMasteredLemma(entry.originalWord);
      const card = (entry.cardId && cardsById.get(entry.cardId)) || cardsByLemma.get(lKey) || null;
      const localMeta =
        (entry.cardId && cardMetaById.get(entry.cardId)) || cardMetaByLemma.get(lKey) || null;

      let translation =
        lemmaTranslationMap.get(lKey) ||
        extractConciseTranslation(card, entry.translation) ||
        entry.translation ||
        card?.translation ||
        '';

      if (translation.includes('—') || translation.includes('–')) {
        const parts = translation.split(/[—–]/);
        translation = parts[parts.length - 1].trim();
      }
      translation = translation.replace(/\.$/, '').trim();
      if (translation.length > 42 || translation.split(/\s+/).length > 6 || /[.?!:;]/.test(translation)) {
        translation = entry.translation || '';
      }

      const intervalDays = Math.max(Number(card?.interval ?? 0), Number(entry.interval ?? 0));
      const repetitions = Math.max(Number(card?.repetitions ?? 0), Number(entry.repetitions ?? 0));
      const nextReviewDate =
        card?.nextReviewDate ?? (card as any)?.next_review_date ?? entry.nextReviewDate ?? null;

      const resolvedBook =
        localMeta?.bookTitle ||
        (entry.bookId ? bookTitleById.get(entry.bookId) : '') ||
        entry.bookTitle ||
        '';
      const resolvedDeck = localMeta?.deckName || entry.deckName || '';
      const sourceLabel = resolvedBook || resolvedDeck || 'Wortschatz';

      const forms = card?.forms || card?.baseWordInfo || entry.forms || null;
      const sentence = card?.sentence || entry.sentence || null;
      const sentenceTranslation =
        (card as any)?.sentenceTranslation || entry.sentenceTranslation || null;

      return {
        key: lKey || entry.originalWord,
        word: entry.originalWord,
        translation,
        level: (entry.level || 'B1') as MatrixCEFRLevel,
        masteredAt: entry.masteredAt || 0,
        nextReviewDate,
        intervalDays,
        repetitions,
        tier: getWordTier(intervalDays),
        forms: typeof forms === 'string' && forms.trim() ? forms.trim() : null,
        sentence,
        sentenceTranslation,
        sourceLabel,
        deckId: localMeta?.deckId || entry.deckId || null,
        card,
        entry,
      };
    });
  }, [rawEntries, books, cardsById, cardsByLemma, lemmaTranslationMap, cardMetaById, cardMetaByLemma]);

  const levelCounts = useMemo(() => {
    const counts: Record<string, number> = { Alle: enrichedWords.length };
    BASE_LEVELS.forEach((lvl) => {
      if (lvl !== 'Alle') counts[lvl] = 0;
    });
    enrichedWords.forEach((item) => {
      if (counts[item.level] !== undefined) {
        counts[item.level] += 1;
      }
    });
    return counts;
  }, [enrichedWords]);

  // Hide C2 pill if C2 count is 0
  const visibleLevels = useMemo(
    () => BASE_LEVELS.filter((lvl) => lvl !== 'C2' || (levelCounts.C2 ?? 0) > 0),
    [levelCounts.C2]
  );

  // Tier counts matching selected level
  const tierCounts = useMemo(() => {
    const pool =
      selectedLevel === 'Alle'
        ? enrichedWords
        : enrichedWords.filter((item) => item.level === selectedLevel);
    const counts: Record<WordTier, number> = { gold: 0, silber: 0, graphit: 0 };
    pool.forEach((item) => {
      counts[item.tier] += 1;
    });
    return counts;
  }, [enrichedWords, selectedLevel]);

  const filteredWords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return enrichedWords
      .filter((item) => {
        if (selectedLevel !== 'Alle' && item.level !== selectedLevel) return false;
        if (tierFilter !== 'Alle' && item.tier !== tierFilter) return false;
        if (q) {
          const cleanDe = item.word.replace(/[|·•\u2506\u250A]/g, '').toLowerCase();
          const matchWord = cleanDe.includes(q) || item.word.toLowerCase().includes(q);
          const matchTrans = item.translation.toLowerCase().includes(q);
          if (!matchWord && !matchTrans) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'az') {
          const cleanA = a.word.replace(/[|·•\u2506\u250A]/g, '');
          const cleanB = b.word.replace(/[|·•\u2506\u250A]/g, '');
          return cleanA.localeCompare(cleanB, 'de');
        }
        if (b.masteredAt !== a.masteredAt) return b.masteredAt - a.masteredAt;
        return a.word.localeCompare(b.word, 'de');
      });
  }, [enrichedWords, selectedLevel, tierFilter, searchQuery, sortBy]);

  const inspectorItem = useMemo(() => {
    if (!inspectorItemKey) return null;
    return enrichedWords.find((w) => w.key === inspectorItemKey) || null;
  }, [enrichedWords, inspectorItemKey]);

  const handleQuickPractice = useCallback(
    (item: EnrichedMasteredWord) => {
      const cardForPractice: Flashcard = item.card || {
        id: item.entry.cardId || `practice-${item.key}`,
        targetWord: item.word,
        sentence: item.sentence || `${item.word.replace(/[|·•\u2506\u250A]/g, '')}.`,
        translation: item.translation || '',
        options: [],
        masteryLevel: 4,
        isArchived: true,
        nextReviewDate: typeof item.nextReviewDate === 'number' ? item.nextReviewDate : null,
        interval: item.intervalDays,
        repetitions: item.repetitions,
        forms: item.forms,
        level: item.level,
      };
      stopAllGermanSpeech();
      onClose();
      window.dispatchEvent(
        new CustomEvent('kraft:practice-word', {
          detail: {
            deckId: item.deckId || 'mastered-quick-practice',
            card: cardForPractice,
          },
        })
      );
    },
    [onClose]
  );

  const handleGenerateContextStory = useCallback(async () => {
    const candidatePool =
      filteredWords.length >= 8
        ? filteredWords
        : selectedLevel !== 'Alle'
        ? enrichedWords.filter((w) => w.level === selectedLevel)
        : enrichedWords;
    const effectivePool = candidatePool.length > 0 ? candidatePool : enrichedWords;
    if (effectivePool.length === 0) return;

    // Pick 8-10 learned words randomly from the pool
    const shuffled = [...effectivePool].sort(() => Math.random() - 0.5);
    const targetCount = Math.min(shuffled.length, effectivePool.length >= 10 ? 9 : 8);
    const chosen = shuffled.slice(0, targetCount);

    setIsStoryOpen(true);
    setInspectorItemKey(null);
    setStoryLoading(true);
    setGeneratedStory(null);

    try {
      const res = await fetch('/api/generate-context-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: selectedLevel !== 'Alle' ? selectedLevel : 'B1–B2',
          words: chosen.map((w) => ({
            word: w.word,
            translation: w.translation,
            sentence: w.sentence,
            level: w.level,
          })),
        }),
      });
      if (!res.ok) throw new Error('Story request failed');
      const data = await res.json();
      setGeneratedStory(data);
    } catch {
      const cleanList = chosen.map((w) => ({
        lemma: w.word.replace(/[|·•\u2506\u250A]/g, '').trim(),
        surfaceForm: w.word.replace(/[|·•\u2506\u250A]/g, '').trim(),
        translation: w.translation || '—',
      }));
      setGeneratedStory({
        title: 'Ein Tag im Alltag',
        paragraphs: [
          chosen
            .map(
              (w) =>
                w.sentence?.replace(/[|·•\u2506\u250A]/g, '').trim() ||
                `Im Gespräch fällt oft das Wort ${w.word.replace(/[|·•\u2506\u250A]/g, '')}.`
            )
            .join(' '),
        ],
        russianTranslation: cleanList.map((w) => `${w.lemma} — ${w.translation}`).join(' • '),
        usedWords: cleanList,
        source: 'fallback',
      });
    } finally {
      setStoryLoading(false);
    }
  }, [filteredWords, enrichedWords, selectedLevel]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/75 backdrop-blur-md transition-opacity select-none"
      onClick={onClose}
    >
      <div
        className="relative w-full h-[92dvh] sm:h-[85vh] sm:max-w-3xl flex flex-col rounded-t-[28px] sm:rounded-3xl bg-[#0B0B0E]/95 border border-white/10 shadow-[0_25px_80px_rgba(0,0,0,0.85)] overflow-hidden select-text text-left"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Wortschatz-Tresor"
      >
        {/* TWO-ROW MINIMALIST HEADER */}
        <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-white/[0.06] space-y-3 shrink-0">
          {/* Row 1: Search + Geschichte + Round Close */}
          <div className="flex items-center gap-2.5">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Wörter durchsuchen..."
                className="w-full bg-white/[0.04] border border-white/[0.07] rounded-xl pl-9 pr-8 py-2 text-base sm:text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-white/20 transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-neutral-500 hover:text-neutral-200 transition-colors cursor-pointer"
                  aria-label="Suche löschen"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleGenerateContextStory}
              disabled={enrichedWords.length === 0 || storyLoading}
              className="bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-40"
            >
              <Sparkles className="w-3.5 h-3.5 text-neutral-300" />
              <span>Geschichte</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.07] text-neutral-400 hover:text-white transition-colors cursor-pointer shrink-0"
              title="Schließen (Esc)"
              aria-label="Schließen"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Row 2: CEFR Level Pills (left) + Tier Dot Counters & Sort (right) */}
          {!isStoryOpen && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {visibleLevels.map((lvl) => {
                  const isSelected = selectedLevel === lvl;
                  const count = levelCounts[lvl] ?? 0;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setSelectedLevel(lvl)}
                      className={`px-2.5 py-1 rounded-xl text-xs transition-colors flex items-center gap-1.5 cursor-pointer outline-none shrink-0 ${
                        isSelected
                          ? 'bg-white/15 text-white font-medium border border-white/15'
                          : 'bg-white/[0.03] text-neutral-400 border border-white/[0.06] hover:bg-white/[0.07] hover:text-neutral-200'
                      }`}
                    >
                      <span>{lvl}</span>
                      <span className="text-[11px] opacity-60 tabular-nums">{count}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {/* 3 compact tier dot counters */}
                <div className="inline-flex items-center gap-0.5 bg-white/[0.03] border border-white/[0.06] rounded-xl p-0.5">
                  {TIER_DOT_FILTERS.map((tf) => {
                    const active = tierFilter === tf.id;
                    return (
                      <button
                        key={tf.id}
                        type="button"
                        onClick={() => setTierFilter((curr) => (curr === tf.id ? 'Alle' : tf.id))}
                        aria-pressed={active}
                        aria-label={`${tf.label} (${tierCounts[tf.id]})`}
                        className={`px-2 py-1 rounded-lg text-[11px] inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                          active
                            ? 'bg-white/15 text-white font-medium'
                            : 'text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${tf.dotClass}`} />
                        <span className="tabular-nums">{tierCounts[tf.id]}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Compact Sort Toggle: Zuletzt / A–Z */}
                <button
                  type="button"
                  onClick={() => setSortBy((curr) => (curr === 'recent' ? 'az' : 'recent'))}
                  className="px-2.5 py-1 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] text-[11px] font-medium text-neutral-300 inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                  aria-label="Sortierung wechseln"
                >
                  <ArrowUpDown className="w-3 h-3 text-neutral-500" />
                  <span>{sortBy === 'recent' ? 'Zuletzt' : 'A–Z'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* BODY: STORY READER OR CLEAN BENTO MOSAIC */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {isStoryOpen ? (
            <ContextStoryPanel
              story={generatedStory}
              isLoading={storyLoading}
              onRegenerate={handleGenerateContextStory}
              onClose={() => setIsStoryOpen(false)}
            />
          ) : (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin scrollbar-thumb-neutral-700/50 hover:scrollbar-thumb-neutral-600 scrollbar-track-transparent">
              {filteredWords.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-neutral-500 text-sm">
                  Keine Wörter gefunden
                </div>
              ) : (
                <div
                  data-testid="bento-mosaik-grid"
                  className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
                >
                  {filteredWords.map((item) => {
                    const isSelected = inspectorItemKey === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setInspectorItemKey(item.key)}
                        lang="de"
                        className={`group relative min-h-[88px] p-3.5 rounded-2xl flex flex-col justify-between text-left transition-colors duration-150 cursor-pointer active:scale-[0.98] ${
                          TIER_TILE_CLASSES[item.tier]
                        } ${isSelected ? 'ring-1 ring-white/40' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-2 w-full">
                          <span className="text-[11px] font-mono text-neutral-500">
                            {item.level}
                          </span>
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${TIER_DOT_CLASSES[item.tier]}`}
                          />
                        </div>

                        <div
                          className="mt-3 w-full break-words leading-snug text-[14px] sm:text-[15px] font-medium text-neutral-100"
                          style={{ overflowWrap: 'anywhere', hyphens: 'auto' }}
                        >
                          {renderDelicateWord(item.word, item.forms)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* FLOATING APPLE WORD INSPECTOR OVER DIMMED MOSAIC */}
        <WordInspector
          item={inspectorItem}
          onClose={() => {
            stopAllGermanSpeech();
            setInspectorItemKey(null);
          }}
          onQuickPractice={handleQuickPractice}
        />
      </div>
    </div>,
    document.body
  );
};
