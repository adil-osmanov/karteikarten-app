'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Volume2 } from 'lucide-react';
import {
  findMasteredRelatives,
  type MasteredRelativeItem,
  type MasteredRelativeSourceCard,
} from '@/lib/utils/findMasteredRelatives';
import { formatSeparableWord } from '@/lib/utils/formatSeparableWord';
import { getCleanTranslation } from '@/lib/utils';

interface WortfamilieAnchorProps {
  currentCard: MasteredRelativeSourceCard;
  archivedCards: MasteredRelativeSourceCard[];
  visible: boolean;
  onSpeakWord?: (text: string) => void;
  cardKey?: string | number;
  className?: string;
}

export function WortfamilieAnchor({
  currentCard,
  archivedCards,
  visible,
  onSpeakWord,
  cardKey,
  className = '',
}: WortfamilieAnchorProps) {
  const [activeRelativeId, setActiveRelativeId] = useState<string | null>(null);

  useEffect(() => {
    setActiveRelativeId(null);
  }, [cardKey, currentCard?.id, visible]);

  const relatives = useMemo(() => {
    if (!visible) return [];
    return findMasteredRelatives(currentCard, archivedCards, 3);
  }, [visible, currentCard, archivedCards]);

  const activeRelative = useMemo(
    () => relatives.find((r) => r.id === activeRelativeId) ?? null,
    [relatives, activeRelativeId]
  );

  if (!visible || relatives.length === 0) {
    return null;
  }

  const handlePillClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    rel: MasteredRelativeItem
  ) => {
    e.stopPropagation();

    if (activeRelativeId === rel.id) {
      setActiveRelativeId(null);
      return;
    }

    setActiveRelativeId(rel.id);
    if (onSpeakWord) {
      const cleanSpoken = rel.word.replace(/[|·•\u2506\u250A]/g, '');
      onSpeakWord(cleanSpoken);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      onClick={(e) => e.stopPropagation()}
      className={`w-full mt-7 flex flex-col items-center gap-2 ${className}`}
      data-testid="wortfamilie-anchor"
    >
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <span className="text-[11px] font-medium text-neutral-400 dark:text-white/35 tracking-[0.02em] mr-1 select-none">
          Wortfamilie
        </span>
        {relatives.map((rel) => {
          const isActive = activeRelativeId === rel.id;
          return (
            <button
              key={rel.id}
              type="button"
              onClick={(e) => handlePillClick(e, rel)}
              aria-pressed={isActive}
              data-testid="wortfamilie-pill"
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs tracking-[-0.01em] border transition-all duration-150 cursor-pointer active:scale-[0.97] ${
                isActive
                  ? 'bg-black/[0.07] border-black/[0.18] text-neutral-950 dark:bg-white/[0.12] dark:border-white/[0.22] dark:text-white shadow-xs'
                  : 'bg-black/[0.03] hover:bg-black/[0.06] border-black/[0.08] text-neutral-700 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] dark:border-white/[0.08] dark:text-white/75 hover:dark:text-white'
              }`}
            >
              {formatSeparableWord(rel.word)}
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

      <AnimatePresence mode="wait">
        {activeRelative && (
          <motion.p
            key={activeRelative.id}
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            data-testid="wortfamilie-caption"
            className="text-xs text-neutral-500 dark:text-white/55 text-center leading-snug max-w-md px-2 select-text"
          >
            {getCleanTranslation(activeRelative.translation) || activeRelative.translation}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
