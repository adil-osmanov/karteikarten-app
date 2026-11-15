'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Volume2 } from 'lucide-react';
import {
  findMasteredRelatives,
  type MasteredRelativeSourceCard,
} from '@/lib/utils/findMasteredRelatives';
import { findGermanSynonyms } from '@/lib/utils/findGermanSynonyms';
import { formatSeparableWord } from '@/lib/utils/formatSeparableWord';
import {
  resolveGermanExample,
  resolveWordTranslation,
  type PillMetadataInput,
} from '@/lib/utils/resolvePillMetadata';

interface ComparisonEntry extends PillMetadataInput {
  key: string;
}

interface WortfamilieAnchorProps {
  currentCard: MasteredRelativeSourceCard;
  cardsPool?: MasteredRelativeSourceCard[];
  archivedCards?: MasteredRelativeSourceCard[];
  lookupPool?: MasteredRelativeSourceCard[];
  visible: boolean;
  onSpeakWord?: (text: string) => void;
  cardKey?: string | number;
  className?: string;
}

export function WortfamilieAnchor({
  currentCard,
  cardsPool,
  archivedCards = [],
  lookupPool,
  visible,
  onSpeakWord,
  cardKey,
  className = '',
}: WortfamilieAnchorProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    setActiveKey(null);
  }, [cardKey, currentCard?.id, visible]);

  const effectivePool = cardsPool ?? archivedCards;
  const effectiveLookupPool = lookupPool && lookupPool.length > 0 ? lookupPool : effectivePool;
  const currentLang = (currentCard?.language || 'de').toLowerCase();

  const wortfamilie = useMemo(() => {
    if (!visible) return [];
    return findMasteredRelatives(currentCard, effectivePool, 3);
  }, [visible, currentCard, effectivePool]);

  const synonyme = useMemo(() => {
    if (!visible) return [];
    return findGermanSynonyms(currentCard, effectivePool, 3);
  }, [visible, currentCard, effectivePool]);

  const allEntries = useMemo<ComparisonEntry[]>(() => {
    return [
      ...wortfamilie.map((item) => ({
        key: `wortfamilie:${item.id}`,
        id: item.id,
        word: item.word,
        translation: item.translation,
        forms: item.forms,
        sentence: item.sentence,
        sentenceTranslation: item.sentenceTranslation,
        language: currentLang,
      })),
      ...synonyme.map((item) => ({
        key: `synonyme:${item.id}`,
        id: item.id,
        word: item.word,
        translation: item.translation,
        forms: item.forms,
        sentence: item.sentence,
        sentenceTranslation: item.sentenceTranslation,
        language: currentLang,
      })),
    ];
  }, [wortfamilie, synonyme, currentLang]);

  const activeEntry = useMemo(
    () => allEntries.find((entry) => entry.key === activeKey) ?? null,
    [allEntries, activeKey]
  );

  const resolvedTranslation = useMemo(
    () => resolveWordTranslation(activeEntry, effectiveLookupPool),
    [activeEntry, effectiveLookupPool]
  );

  const resolvedExample = useMemo(
    () => resolveGermanExample(activeEntry, effectiveLookupPool),
    [activeEntry, effectiveLookupPool]
  );

  if (!visible || (wortfamilie.length === 0 && synonyme.length === 0)) {
    return null;
  }

  const handlePillClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    entryKey: string,
    word: string
  ) => {
    e.stopPropagation();

    if (activeKey === entryKey) {
      setActiveKey(null);
      return;
    }

    setActiveKey(entryKey);
    if (onSpeakWord) {
      const cleanSpoken = word.replace(/[|·•\u2506\u250A]/g, '');
      onSpeakWord(cleanSpoken);
    }
  };

  const renderPillRow = (
    label: 'Wortfamilie' | 'Synonyme',
    group: 'wortfamilie' | 'synonyme',
    items: Array<{ id: string; word: string }>
  ) => {
    if (items.length === 0) return null;

    return (
      <div
        className="flex flex-wrap items-center justify-center gap-1.5"
        data-testid={`${group}-row`}
      >
        <span className="text-[11px] tracking-wider uppercase text-neutral-500 dark:text-neutral-500 select-none mr-1.5">
          {label}
        </span>
        {items.map((item) => {
          const entryKey = `${group}:${item.id}`;
          const isActive = activeKey === entryKey;
          return (
            <button
              key={entryKey}
              type="button"
              onClick={(e) => handlePillClick(e, entryKey, item.word)}
              aria-pressed={isActive}
              data-testid={`${group}-pill`}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs tracking-[-0.01em] border transition-all duration-150 cursor-pointer active:scale-[0.97] ${
                isActive
                  ? 'bg-black/[0.07] border-black/[0.18] text-neutral-950 dark:bg-white/[0.12] dark:border-white/[0.22] dark:text-white shadow-xs'
                  : 'bg-black/[0.03] hover:bg-black/[0.06] border-black/[0.08] text-neutral-700 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] dark:border-white/[0.08] dark:text-white/75 hover:dark:text-white'
              }`}
            >
              {formatSeparableWord(item.word)}
              {isActive && (
                <Volume2
                  className="w-3 h-3 text-neutral-400 dark:text-white/45 shrink-0"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      onClick={(e) => e.stopPropagation()}
      className={`w-full mt-7 flex flex-col items-center gap-2.5 ${className}`}
      data-testid="wortfamilie-anchor"
    >
      {renderPillRow('Wortfamilie', 'wortfamilie', wortfamilie)}
      {renderPillRow('Synonyme', 'synonyme', synonyme)}

      <AnimatePresence mode="wait">
        {activeEntry && (resolvedTranslation || resolvedExample) && (
          <motion.div
            key={activeEntry.key}
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            data-testid="wortfamilie-comparison"
            className="mt-3 px-4 py-3 rounded-2xl bg-black/[0.035] dark:bg-white/[0.035] border border-black/[0.06] dark:border-white/[0.06] max-w-md w-full text-center select-text"
          >
            {resolvedTranslation && (
              <p
                data-testid="wortfamilie-caption"
                className="text-[13px] font-medium text-neutral-900 dark:text-neutral-100 leading-snug"
              >
                {resolvedTranslation}
              </p>
            )}
            {resolvedExample && (
              <button
                type="button"
                data-testid="wortfamilie-detail"
                onClick={(e) => {
                  e.stopPropagation();
                  onSpeakWord?.(resolvedExample);
                }}
                title="Пример озвучить"
                aria-label={`Озвучить пример: ${resolvedExample}`}
                className="block w-full text-center text-[12px] text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 italic mt-1.5 leading-relaxed cursor-pointer transition-colors bg-transparent border-0 p-0 focus:outline-none select-text"
              >
                {resolvedExample}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
