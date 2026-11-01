'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download } from 'lucide-react';
import { useWortschatzMatrix, getMasteredLemmasSet } from '@/hooks/useWortschatzMatrix';
import { CEFRLevel, CEFR_TARGETS, TOTAL_WORLD_LEXICON_GOAL, DEFAULT_LEXICON_MAP, resolveCEFRLevel } from '@/lib/vocabulary/defaultLexiconMap';
import { GOETHE_A1_DICTIONARY } from '@/lib/vocabulary/goetheA1Dictionary';
import { extractGermanLemma, isValidGermanLemma } from '@/lib/vocabulary/normalizer';
import { useStore } from '@/app/page';

interface WortschatzMatrixPopoverProps {
  className?: string;
}

const LEVEL_TARGETS: Record<CEFRLevel, number> = {
  C1: CEFR_TARGETS.C1.target,
  B2: CEFR_TARGETS.B2.target,
  B1: CEFR_TARGETS.B1.target,
  A2: CEFR_TARGETS.A2.target,
  A1: CEFR_TARGETS.A1.target,
};

const CEFR_ORDER: CEFRLevel[] = ['C1', 'B2', 'B1', 'A2', 'A1'];

export const WortschatzMatrixPopover: React.FC<WortschatzMatrixPopoverProps> = ({
  className = '',
}) => {
  const [isMatrixOpen, setIsMatrixOpen] = useState(false);
  const { counts: stats, totalWords: totalMastered, activeLevel: currentLevel } = useWortschatzMatrix();
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    if (!isMatrixOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsMatrixOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMatrixOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMatrixOpen]);

  // Export remaining unlearned words of a given level for AI prompt generation
  const exportRemainingWords = useCallback((levelKey: CEFRLevel) => {
    const mastered = getMasteredLemmasSet();
    const wordSet = new Set<string>();

    if (levelKey === 'A1') {
      // 100% clean canonical Goethe-Institut A1 lemmas
      Object.values(GOETHE_A1_DICTIONARY).forEach((canonicalLemma) => {
        if (!mastered.has(canonicalLemma.toLowerCase())) {
          wordSet.add(canonicalLemma);
        }
      });
    } else {
      // For other levels (A2, B1, B2, C1):
      // 1. All lemmas from default dictionary mapped to this level
      Object.entries(DEFAULT_LEXICON_MAP).forEach(([lemma, lvl]) => {
        if (lvl === levelKey) {
          wordSet.add(lemma);
        }
      });

      // 2. Also harvest words from user's loaded decks matching this level
      try {
        const decks = useStore.getState().decks;
        const books = useStore.getState().books;
        const bookLevelMap = new Map<string, string>();
        books.forEach((b: any) => {
          const bLevel = b.activeLevels?.[0] || b.title || 'B2';
          bookLevelMap.set(b.id, bLevel);
        });

        decks.forEach((d: any) => {
          const bLevel = d.bookId ? bookLevelMap.get(d.bookId) : (d.level || 'B2');
          const upper = (bLevel || '').toUpperCase();
          if (upper.includes(levelKey)) {
            if (d.cards) {
              d.cards.forEach((c: any) => {
                const raw = c.targetWord || (c as any).missingWord || (c as any).infinitive || (c as any).front || '';
                const lemma = extractGermanLemma(raw);
                if (lemma && isValidGermanLemma(lemma)) {
                  const resolved = resolveCEFRLevel(lemma, bLevel);
                  if (resolved === levelKey) {
                    wordSet.add(lemma);
                  }
                }
              });
            }
          }
        });
      } catch (e) {}
    }

    // Exclude already mastered lemmas and sort
    const remaining = Array.from(wordSet)
      .filter((w) => !mastered.has(w.toLowerCase()))
      .sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));

    // Build clean text document matching prompt specification
    const header = `Невыученные слова уровня ${levelKey} (осталось: ${remaining.length}):\n\n`;
    const content = header + (remaining.length > 0 ? remaining.map((w) => `- ${w}`).join('\n') : '(Все слова этого уровня выучены!)');

    // Trigger download in browser
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${levelKey}_restliche_woerter.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const percentTotal = Math.min(100, (totalMastered / TOTAL_WORLD_LEXICON_GOAL) * 100);

  return (
    <div className={`relative inline-block ${className}`}>
      {/* 2. СИНХРОНИЗИРОВАННАЯ КНОПКА-ТРИГГЕР В ХЕДЕРЕ */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsMatrixOpen(!isMatrixOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-150 select-none bg-zinc-100 hover:bg-zinc-200/80 border-zinc-200/80 text-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-850 dark:border-white/10 dark:text-zinc-200 shadow-sm active:scale-95 cursor-pointer"
        title="Wortschatz-Matrix"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        <span className="text-xs font-semibold tracking-tight">{totalMastered} Wörter</span>
        <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">• {currentLevel || 'A1'}</span>
      </button>

      {/* РЕДИЗАЙН ПОПОВЕРА БЕЗ МЕРЦАНИЯ С АППАРАТНЫМ УСКОРЕНИЕМ */}
      <AnimatePresence>
        {isMatrixOpen && (
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{ willChange: 'transform, opacity' }}
            className="fixed inset-x-4 top-20 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 w-80 sm:w-96 p-5 rounded-2xl shadow-2xl backdrop-blur-2xl border bg-white/95 border-black/10 text-zinc-900 dark:bg-zinc-900/95 dark:border-white/10 dark:text-zinc-100 z-50 select-none text-left transform-gpu will-change-transform"
          >
            {/* ОЧИЩЕННАЯ ШАПКА: ТОЛЬКО ЦИФРЫ И СИНИЙ БЕЙДЖ % */}
            <div className="flex items-center justify-between mb-5">
              <div className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
                {totalMastered.toLocaleString('de-DE')} <span className="text-sm font-normal text-zinc-400 dark:text-zinc-500">/ 15.000</span>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                {percentTotal.toFixed(1)}% Gesamt
              </span>
            </div>

            {/* СПИСОК УРОВНЕЙ C1 -> A1 */}
            <div className="space-y-3">
              {CEFR_ORDER.map((levelKey) => {
                const target = LEVEL_TARGETS[levelKey];
                const count = stats[levelKey] || 0;
                const percent = Math.min(Math.round((count / target) * 100), 100);
                const isActive = currentLevel === levelKey;

                return (
                  <div key={levelKey} className="flex flex-col gap-1.5">
                    {/* Строка заголовка уровня: бейдж слева, цифры и кнопка экспорта справа */}
                    <div className="flex justify-between items-center text-xs">
                      {/* Apple HIG monochrome badge: active is Apple blue, inactive is monochrome */}
                      <span
                        className={
                          isActive
                            ? 'w-7 h-5 flex items-center justify-center rounded font-mono text-[11px] font-bold bg-blue-600 text-white shadow-sm border border-blue-500'
                            : 'w-7 h-5 flex items-center justify-center rounded font-mono text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-black/5 dark:border-white/5'
                        }
                      >
                        {levelKey}
                      </span>

                      {/* Числа прогресса и кнопка экспорта оставшихся слов */}
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-zinc-500 dark:text-zinc-400">
                          <strong className="text-zinc-900 dark:text-zinc-100 font-semibold">{count}</strong> / {target}
                        </span>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            exportRemainingWords(levelKey);
                          }}
                          title="Оставшиеся слова уровня для создания карточек в ИИ"
                          className="w-6 h-6 rounded flex items-center justify-center text-zinc-400 hover:text-blue-600 dark:text-zinc-500 dark:hover:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                          aria-label={`Export ${levelKey}`}
                        >
                          <Download className="w-3.5 h-3.5 stroke-[2]" />
                        </button>
                      </div>
                    </div>

                    {/* 3. СИНЯЯ ПОЛОСА ПРОГРЕССА У ВСЕХ УРОВНЕЙ */}
                    <div className="w-full h-1.5 rounded-full bg-zinc-200/70 dark:bg-zinc-800 overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-500 bg-blue-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
