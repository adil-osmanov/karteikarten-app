'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Search,
  Layers,
  Eye,
  EyeOff,
  Sparkles,
  Shield,
  ArrowUpDown,
  GitBranch,
  LayoutGrid,
} from 'lucide-react';
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
import { formatSeparableWord } from '@/lib/utils/formatSeparableWord';
import {
  buildWordFamilies,
  getWordTier,
  type WordTier,
} from '@/lib/vocabulary/wordFamilies';
import { WordInspector, type EnrichedMasteredWord } from './WordInspector';
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

type ViewMode = 'mosaik' | 'wortfamilien';
type TierFilter = 'Alle' | WordTier;
type SortOption = 'recent' | 'strength' | 'az';

const FILTER_LEVELS: Array<'Alle' | MatrixCEFRLevel> = ['Alle', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const TIER_FILTERS: Array<{ id: TierFilter; label: string }> = [
  { id: 'Alle', label: 'Alle' },
  { id: 'gold', label: 'Gold' },
  { id: 'silber', label: 'Silber' },
  { id: 'graphit', label: 'Graphit' },
];

const TIER_TILE_CLASSES: Record<WordTier, string> = {
  graphit:
    'bg-[#121215] border border-white/[0.08] hover:border-white/20',
  silber:
    'bg-gradient-to-b from-slate-300/[0.06] to-[#121215] border border-slate-300/25 hover:border-slate-300/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
  gold:
    'bg-gradient-to-b from-amber-400/[0.09] to-[#121215] border border-amber-400/35 hover:border-amber-400/60 shadow-[0_0_24px_rgba(251,191,36,0.07),inset_0_1px_0_rgba(251,191,36,0.15)]',
};

function renderTierIndicator(tier: WordTier) {
  if (tier === 'gold') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] text-amber-300"
        title="Gold · Langzeitgedächtnis"
      >
        <Sparkles className="w-3 h-3 text-amber-400" />
      </span>
    );
  }
  if (tier === 'silber') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] text-slate-300"
        title="Silber · Gefestigt"
      >
        <Shield className="w-3 h-3 text-slate-300" />
      </span>
    );
  }
  return (
    <span
      className="w-2 h-2 rounded-full bg-zinc-500/80 ring-1 ring-white/15"
      title="Graphit · Neu"
    />
  );
}

export const MasteredWordsModal: React.FC<MasteredWordsModalProps> = ({
  isOpen,
  onClose,
  language = 'de',
  initialLevelFilter = 'Alle',
}) => {
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<'Alle' | MatrixCEFRLevel>(initialLevelFilter);
  const [viewMode, setViewMode] = useState<ViewMode>('mosaik');
  const [tierFilter, setTierFilter] = useState<TierFilter>('Alle');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [isBlindMode, setIsBlindMode] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [inspectorItemKey, setInspectorItemKey] = useState<string | null>(null);
  const [isStoryOpen, setIsStoryOpen] = useState(false);
  const [storyLoading, setStoryLoading] = useState(false);
  const [generatedStory, setGeneratedStory] = useState<GeneratedContextStory | null>(null);
  const [storyWords, setStoryWords] = useState<EnrichedMasteredWord[]>([]);
  const [updateTick, setUpdateTick] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const decks = useStore((state) => state.decks);
  const books = useStore((state) => state.books);

  const currentLang: AppLang = normalizeLanguageCode(language);
  const { masteredEntries } = useWortschatzMatrix(currentLang);

  // Reset state on modal open
  useEffect(() => {
    if (isOpen) {
      purgeJunkExportierenWord().catch(() => {});
      setSelectedLevel(initialLevelFilter || 'Alle');
      setSearchQuery('');
      setTierFilter('Alle');
      setRevealedKeys(new Set());
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

  // Listen to live vocabulary updates (zero extra Supabase reads)
  useEffect(() => {
    const handleStatsUpdate = () => setUpdateTick((t) => t + 1);
    window.addEventListener('kraft:mastered-updated', handleStatsUpdate);
    window.addEventListener('stats-update', handleStatsUpdate);
    return () => {
      window.removeEventListener('kraft:mastered-updated', handleStatsUpdate);
      window.removeEventListener('stats-update', handleStatsUpdate);
    };
  }, []);

  // Cascading Esc: close Story -> Inspector -> Modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isStoryOpen) {
          stopAllGermanSpeech();
          setIsStoryOpen(false);
          return;
        }
        if (inspectorItemKey) {
          stopAllGermanSpeech();
          setInspectorItemKey(null);
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isStoryOpen, inspectorItemKey, onClose]);

  // Body Scroll Lock while open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // In-memory index of loaded books & decks cards (0 extra egress)
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
            if ((c.interval ?? 0) > (existing.interval ?? 0) || (c.isArchived && !existing.isArchived)) {
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

  // Unified authoritative entries list (strictly synced with header/matrix)
  const rawEntries = useMemo(() => {
    if (!isOpen) return [];
    return masteredEntries.filter((e) =>
      isValidMasteredEntry(e.originalWord, normalizeMasteredLemma(e.originalWord), e.translation)
    );
  }, [masteredEntries, isOpen]);

  // Enrich in memory from local state / IndexedDB
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

      const intervalDays = Math.max(
        Number(card?.interval ?? 0),
        Number(entry.interval ?? 0)
      );
      const repetitions = Math.max(
        Number(card?.repetitions ?? 0),
        Number(entry.repetitions ?? 0)
      );
      const nextReviewDate =
        card?.nextReviewDate ?? (card as any)?.next_review_date ?? entry.nextReviewDate ?? null;

      const resolvedBook =
        localMeta?.bookTitle ||
        (entry.bookId ? bookTitleById.get(entry.bookId) : '') ||
        entry.bookTitle ||
        '';
      const resolvedDeck = localMeta?.deckName || entry.deckName || '';
      const sourceLabel =
        resolvedBook && resolvedDeck
          ? `${resolvedBook} · ${resolvedDeck}`
          : resolvedBook || resolvedDeck || 'Persönlicher Wortschatz';

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

  // Exact per-level counts matching Matrix & Header 1:1
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

  // Counts by forged tier (respecting current level filter)
  const tierCounts = useMemo(() => {
    const pool =
      selectedLevel === 'Alle'
        ? enrichedWords
        : enrichedWords.filter((item) => item.level === selectedLevel);
    const counts: Record<TierFilter, number> = {
      Alle: pool.length,
      gold: 0,
      silber: 0,
      graphit: 0,
    };
    pool.forEach((item) => {
      counts[item.tier] += 1;
    });
    return counts;
  }, [enrichedWords, selectedLevel]);

  // Filtered + Sorted words
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
        if (sortBy === 'strength') {
          if (b.intervalDays !== a.intervalDays) return b.intervalDays - a.intervalDays;
          if (b.masteredAt !== a.masteredAt) return b.masteredAt - a.masteredAt;
          return a.word.localeCompare(b.word, 'de');
        }
        if (b.masteredAt !== a.masteredAt) return b.masteredAt - a.masteredAt;
        return a.word.localeCompare(b.word, 'de');
      });
  }, [enrichedWords, selectedLevel, tierFilter, searchQuery, sortBy]);

  // Wortfamilien grouping strictly in memory
  const groupedFamilies = useMemo(() => {
    if (viewMode !== 'wortfamilien') return null;
    return buildWordFamilies(filteredWords);
  }, [filteredWords, viewMode]);

  const inspectorItem = useMemo(() => {
    if (!inspectorItemKey) return null;
    return enrichedWords.find((w) => w.key === inspectorItemKey) || null;
  }, [enrichedWords, inspectorItemKey]);

  const handleTileClick = useCallback(
    (item: EnrichedMasteredWord) => {
      if (isBlindMode && !revealedKeys.has(item.key)) {
        setRevealedKeys((prev) => {
          const next = new Set(prev);
          next.add(item.key);
          return next;
        });
        return;
      }
      setInspectorItemKey(item.key);
    },
    [isBlindMode, revealedKeys]
  );

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
      filteredWords.length >= 5
        ? filteredWords
        : selectedLevel !== 'Alle'
        ? enrichedWords.filter((w) => w.level === selectedLevel)
        : enrichedWords;
    const effectivePool = candidatePool.length > 0 ? candidatePool : enrichedWords;
    if (effectivePool.length === 0) return;

    // Pick 6 words mixing recent & randomized entries from the pool
    const shuffled = [...effectivePool].sort(() => Math.random() - 0.5);
    const chosen = shuffled.slice(0, Math.min(6, shuffled.length));

    setStoryWords(chosen);
    setIsStoryOpen(true);
    setInspectorItemKey(null);
    setStoryLoading(true);
    setGeneratedStory(null);

    try {
      const res = await fetch('/api/generate-context-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: selectedLevel !== 'Alle' ? selectedLevel : 'B1-B2',
          words: chosen.map((w) => ({
            word: w.word,
            translation: w.translation,
            sentence: w.sentence,
            level: w.level,
          })),
        }),
      });
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();
      setGeneratedStory(data);
    } catch {
      setGeneratedStory({
        germanText: chosen
          .map(
            (w) =>
              w.sentence?.replace(/\|/g, '').trim() ||
              `Im Gespräch verwenden wir das Wort ${w.word.replace(/\|/g, '')}.`
          )
          .join(' '),
        russianTranslation: chosen
          .map((w) => `${w.word.replace(/\|/g, '')}${w.translation ? ` — ${w.translation}` : ''}`)
          .join(' • '),
        usedWords: chosen.map((w) => w.word.replace(/\|/g, '')),
        source: 'fallback',
      });
    } finally {
      setStoryLoading(false);
    }
  }, [filteredWords, enrichedWords, selectedLevel]);

  const renderTile = (item: EnrichedMasteredWord) => {
    const isSelected = inspectorItemKey === item.key;
    const isRevealed = !isBlindMode || revealedKeys.has(item.key);

    return (
      <button
        key={item.key}
        type="button"
        onClick={() => handleTileClick(item)}
        title={isRevealed ? item.translation || item.word.replace(/[|·•\u2506\u250A]/g, '') : 'Zum Aufdecken tippen'}
        className={`group relative min-h-[92px] p-3 rounded-2xl flex flex-col justify-between text-left transition-all duration-150 cursor-pointer active:scale-[0.98] ${
          TIER_TILE_CLASSES[item.tier]
        } ${
          isSelected
            ? 'ring-2 ring-amber-400/70 border-amber-400/60'
            : ''
        }`}
      >
        {/* Top Row: CEFR Level + Forged Tier Indicator */}
        <div className="flex items-center justify-between gap-1.5 w-full">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-white/[0.06] text-neutral-300 border border-white/[0.07] font-mono">
            {item.level}
          </span>
          <div className="flex items-center gap-1.5">
            {isBlindMode && !isRevealed && (
              <Eye className="w-3 h-3 text-blue-400/80" />
            )}
            {renderTierIndicator(item.tier)}
          </div>
        </div>

        {/* Bottom Word / Blind Prompt */}
        <div className="mt-3 w-full">
          {isRevealed ? (
            <div className="font-medium text-[15px] text-white leading-snug line-clamp-2 group-hover:text-amber-100 transition-colors">
              {formatSeparableWord(item.word)}
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="text-[13px] font-medium text-blue-200/90 leading-snug line-clamp-2">
                {item.translation || 'Bedeutung prüfen'}
              </div>
              <div className="text-[10px] text-neutral-500">Tippen zum Prüfen</div>
            </div>
          )}
        </div>
      </button>
    );
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/75 backdrop-blur-md transition-opacity select-none"
      onClick={onClose}
    >
      <div
        className={`relative w-full h-[92dvh] sm:h-[85vh] ${
          inspectorItem && !isStoryOpen ? 'sm:max-w-5xl' : 'sm:max-w-3xl'
        } flex flex-col rounded-t-[28px] sm:rounded-3xl bg-[#0B0B0E]/95 border border-white/10 shadow-[0_25px_80px_rgba(0,0,0,0.85)] overflow-hidden select-text text-left transition-[max-width] duration-200`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Wortschatz-Tresor"
      >
        {/* 1. COMPACT APPLE HEADER & CONTROLS */}
        <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-white/[0.07] space-y-3 shrink-0 bg-[#0E0E12]/90">
          {/* Top Row: Search + Blind-Modus + KI Text Generator + Close */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Wörter durchsuchen..."
                className="w-full bg-white/[0.05] border border-white/10 rounded-xl pl-9 pr-8 py-2 text-base sm:text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-amber-400/50 transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                  title="Suche löschen"
                  aria-label="Suche löschen"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Blind-Modus Toggle */}
            <button
              type="button"
              onClick={() => {
                setIsBlindMode((v) => !v);
                setRevealedKeys(new Set());
              }}
              className={`h-9 px-2.5 sm:px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                isBlindMode
                  ? 'bg-blue-500/20 border-blue-400/45 text-blue-300 shadow-[0_0_16px_rgba(59,130,246,0.18)]'
                  : 'bg-white/[0.05] border-white/10 text-neutral-400 hover:text-white hover:bg-white/[0.08]'
              }`}
              title="Blind-Modus (Selbsttest)"
              aria-label="Blind-Modus"
              aria-pressed={isBlindMode}
            >
              {isBlindMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span className="hidden lg:inline">Blind-Modus</span>
            </button>

            {/* Apple Intelligence Mini-Text Generator */}
            <button
              type="button"
              onClick={handleGenerateContextStory}
              disabled={enrichedWords.length === 0 || storyLoading}
              className="h-9 px-2.5 sm:px-3.5 rounded-xl bg-gradient-to-r from-amber-400/15 via-blue-500/15 to-purple-500/15 hover:from-amber-400/25 hover:to-purple-500/25 border border-amber-400/35 text-xs font-medium text-amber-200 inline-flex items-center gap-1.5 transition-all cursor-pointer shrink-0 disabled:opacity-40"
              title="Kontexttext aus deinen Wörtern generieren"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Text aus meinen Wörtern</span>
              <span className="sm:hidden">Text</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 rounded-xl flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
              title="Schließen (Esc)"
              aria-label="Schließen"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Second Row: Segmented View [ Mosaik | Wortfamilien ] + Tier Filter + Sort */}
          {!isStoryOpen && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Segmented Switcher */}
              <div className="inline-flex p-0.5 rounded-xl bg-white/[0.05] border border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setViewMode('mosaik')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                    viewMode === 'mosaik'
                      ? 'bg-white/15 text-white shadow-xs'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Mosaik</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('wortfamilien')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                    viewMode === 'wortfamilien'
                      ? 'bg-white/15 text-white shadow-xs'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  <span>Wortfamilien</span>
                </button>
              </div>

              {/* Tier filter pills + Sort */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <div className="inline-flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] rounded-xl p-0.5">
                  {TIER_FILTERS.map((tf) => {
                    const active = tierFilter === tf.id;
                    return (
                      <button
                        key={tf.id}
                        type="button"
                        onClick={() => setTierFilter(tf.id)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer shrink-0 ${
                          active
                            ? tf.id === 'gold'
                              ? 'bg-amber-400/20 text-amber-200'
                              : tf.id === 'silber'
                              ? 'bg-slate-300/20 text-slate-100'
                              : 'bg-white/15 text-white'
                            : 'text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        {tf.label}
                        <span className="ml-1 text-[10px] opacity-65 tabular-nums">
                          {tierCounts[tf.id]}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {viewMode === 'mosaik' && (
                  <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/[0.05] border border-white/[0.08] text-[11px] text-neutral-300 cursor-pointer shrink-0">
                    <ArrowUpDown className="w-3 h-3 text-neutral-400" />
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortOption)}
                      className="bg-transparent text-[11px] font-medium text-neutral-200 focus:outline-none cursor-pointer"
                      aria-label="Sortierung"
                    >
                      <option value="recent" className="bg-[#121215]">Zuletzt gelernt</option>
                      <option value="strength" className="bg-[#121215]">Stärkste zuerst</option>
                      <option value="az" className="bg-[#121215]">A–Z</option>
                    </select>
                  </label>
                )}
              </div>
            </div>
          )}

          {/* Third Row: CEFR Level Filters (preserving exact total count invariant) */}
          {!isStoryOpen && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
              {FILTER_LEVELS.map((lvl) => {
                const isSelected = selectedLevel === lvl;
                const count = levelCounts[lvl] ?? 0;
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setSelectedLevel(lvl)}
                    className={`px-3 py-1 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer outline-none shrink-0 ${
                      isSelected
                        ? 'bg-amber-400/15 text-amber-300 border border-amber-400/35 font-semibold'
                        : 'bg-white/[0.04] text-neutral-400 border border-white/[0.06] hover:bg-white/[0.08]'
                    }`}
                  >
                    <span>{lvl}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-md tabular-nums ${
                        isSelected ? 'bg-amber-400/20 text-amber-200' : 'bg-white/5 text-neutral-500'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. BODY: CONTEXT STORY OR BENTO MOSAIC + APPLE WORD INSPECTOR */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {isStoryOpen ? (
            <ContextStoryPanel
              story={generatedStory}
              isLoading={storyLoading}
              sourceWords={storyWords}
              onRegenerate={handleGenerateContextStory}
              onClose={() => setIsStoryOpen(false)}
            />
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 scrollbar-thin scrollbar-thumb-neutral-700/50 hover:scrollbar-thumb-neutral-600 scrollbar-track-transparent">
                {filteredWords.length === 0 ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-3 text-neutral-500">
                    <Layers className="w-10 h-10 opacity-40 stroke-[1.2]" />
                    <span className="text-sm">Keine Wörter gefunden</span>
                  </div>
                ) : viewMode === 'mosaik' ? (
                  <div
                    data-testid="bento-mosaik-grid"
                    className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5"
                  >
                    {filteredWords.map((item) => renderTile(item))}
                  </div>
                ) : (
                  <div data-testid="wortfamilien-view" className="space-y-6">
                    {/* Grouped root clusters (>= 2 words sharing root) */}
                    {groupedFamilies && groupedFamilies.families.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-neutral-500 px-1">
                          <span>Wortfamilien ({groupedFamilies.families.length})</span>
                          <span>Gemeinsame Stämme</span>
                        </div>
                        <div className="space-y-3">
                          {groupedFamilies.families.map((family) => (
                            <div
                              key={family.root}
                              data-testid="word-family-cluster"
                              className="rounded-3xl bg-white/[0.025] border border-white/[0.08] p-3.5 sm:p-4 space-y-3"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="inline-flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-amber-400/80 shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
                                  <span className="text-xs font-semibold text-neutral-200 font-mono">
                                    Wortstamm: -{family.root}
                                  </span>
                                </div>
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.06] text-neutral-400 border border-white/[0.06]">
                                  {family.items.length} Wörter
                                </span>
                              </div>

                              <div className="relative pl-3 border-l border-amber-400/25">
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                                  {family.items.map((item) => renderTile(item))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Singletons */}
                    {groupedFamilies && groupedFamilies.singletons.length > 0 && (
                      <div className="space-y-3">
                        <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 px-1">
                          Einzelwörter ({groupedFamilies.singletons.length})
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                          {groupedFamilies.singletons.map((item) => renderTile(item))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Apple Word Inspector Drawer / Mobile Sheet */}
              <WordInspector
                item={inspectorItem}
                onClose={() => {
                  stopAllGermanSpeech();
                  setInspectorItemKey(null);
                }}
                onQuickPractice={handleQuickPractice}
              />
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
