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
import { getCleanTranslation } from '@/lib/utils';

interface ComparisonEntry {
  key: string;
  id: string;
  word: string;
  translation: string;
  forms?: string | null;
  sentence?: string | null;
}

interface WortfamilieAnchorProps {
  currentCard: MasteredRelativeSourceCard;
  cardsPool?: MasteredRelativeSourceCard[];
  archivedCards?: MasteredRelativeSourceCard[];
  visible: boolean;
  onSpeakWord?: (text: string) => void;
  cardKey?: string | number;
  className?: string;
}

function cleanFormsForComparison(rawForms?: string | null, translation?: string): string | null {
  if (!rawForms || typeof rawForms !== 'string') return null;
  let cleaned = rawForms.replace(/[|·•\u2506\u250A]/g, '').trim();
  if (!cleaned) return null;
  const dashSplit = cleaned.split(/\s+[—–]\s+/);
  if (dashSplit.length >= 2) cleaned = dashSplit[0].trim();
  cleaned = cleaned.replace(/\s+-\s+.*[а-яА-ЯёЁ].*$/u, '').trim();
  cleaned = cleaned.replace(/\s*\([^)]*[а-яА-ЯёЁ][^)]*\)\s*$/u, '').trim();
  if (translation) {
    const cleanTrans = translation.trim().toLowerCase();
    if (cleanTrans && cleaned.toLowerCase().endsWith(cleanTrans)) {
      cleaned = cleaned.slice(0, cleaned.length - cleanTrans.length).replace(/[\s—–-]+$/, '').trim();
    }
  }
  if (!cleaned || /[а-яА-ЯёЁ]/u.test(cleaned)) return null;
  return cleaned;
}

function formatComparisonDetail(entry: ComparisonEntry | null): string | null {
  if (!entry) return null;

  if (entry.sentence) {
    const cleanWord = entry.word
      .replace(/[|·•\u2506\u250A]/g, '')
      .replace(/^(der|die|das|ein|eine|sich)\s+/i, '')
      .replace(/\b(jemanden|jemandem|jemand|etwas)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    const cleanedSentence = entry.sentence
      .replace(/[|·•\u2506\u250A]/g, '')
      .replace(/(_{2,}|\[\s*_{2,}\s*\])/g, cleanWord)
      .replace(/\s+/g, ' ')
      .trim();
    if (cleanedSentence) return cleanedSentence;
  }

  return cleanFormsForComparison(entry.forms, entry.translation);
}

export function WortfamilieAnchor({
  currentCard,
  cardsPool,
  archivedCards = [],
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
      })),
      ...synonyme.map((item) => ({
        key: `synonyme:${item.id}`,
        id: item.id,
        word: item.word,
        translation: item.translation,
        forms: item.forms,
        sentence: item.sentence,
      })),
    ];
  }, [wortfamilie, synonyme]);

  const activeEntry = useMemo(
    () => allEntries.find((entry) => entry.key === activeKey) ?? null,
    [allEntries, activeKey]
  );

  const comparisonDetail = useMemo(
    () => formatComparisonDetail(activeEntry),
    [activeEntry]
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
        {activeEntry && (
          <motion.div
            key={activeEntry.key}
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            data-testid="wortfamilie-comparison"
            className="mt-3 px-4 py-2.5 rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] max-w-md text-center select-text"
          >
            <p
              data-testid="wortfamilie-caption"
              className="text-xs text-neutral-800 dark:text-neutral-200 leading-snug"
            >
              {getCleanTranslation(activeEntry.translation) || activeEntry.translation}
            </p>
            {comparisonDetail && (
              <p
                data-testid="wortfamilie-detail"
                className="text-[11px] text-neutral-500 italic mt-0.5 leading-snug"
              >
                {comparisonDetail}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
