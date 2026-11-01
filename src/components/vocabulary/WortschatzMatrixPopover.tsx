'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWortschatzMatrix } from '@/hooks/useWortschatzMatrix';
import { CEFRLevel, CEFR_TARGETS, TOTAL_WORLD_LEXICON_GOAL } from '@/lib/vocabulary/defaultLexiconMap';

interface WortschatzMatrixPopoverProps {
  className?: string;
}

const levels: Array<{ key: CEFRLevel; target: number; label: string }> = [
  { key: 'C1', target: CEFR_TARGETS.C1.target, label: CEFR_TARGETS.C1.label },
  { key: 'B2', target: CEFR_TARGETS.B2.target, label: CEFR_TARGETS.B2.label },
  { key: 'B1', target: CEFR_TARGETS.B1.target, label: CEFR_TARGETS.B1.label },
  { key: 'A2', target: CEFR_TARGETS.A2.target, label: CEFR_TARGETS.A2.label },
  { key: 'A1', target: CEFR_TARGETS.A1.target, label: CEFR_TARGETS.A1.label },
];

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

  const percentTotal = Math.min(100, (totalMastered / TOTAL_WORLD_LEXICON_GOAL) * 100);

  return (
    <div className={`relative inline-block ${className}`}>
      {/* 3. КНОПКА-ТРИГГЕР В ВЕРХНЕМ ХЕДЕРЕ */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsMatrixOpen(!isMatrixOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-200 select-none
          bg-zinc-100 hover:bg-zinc-200/80 border-black/5 text-zinc-800
          dark:bg-zinc-900/90 dark:hover:bg-zinc-800 dark:border-white/10 dark:text-zinc-200 shadow-sm active:scale-95 cursor-pointer"
        title="Wortschatz-Matrix"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.6)]" />
        <span className="text-xs font-semibold tracking-tight">{totalMastered} Wörter</span>
        <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">• {currentLevel || 'A1'}</span>
      </button>

      {/* 4. РЕДИЗАЙН ОКНА СТАТИСТИКИ (APPLE CONTROL CENTER LOOK) */}
      <AnimatePresence>
        {isMatrixOpen && (
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-4 top-20 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 w-80 sm:w-96 p-5 rounded-2xl shadow-2xl backdrop-blur-2xl transition-all border bg-white/85 border-black/10 text-zinc-900 dark:bg-zinc-900/85 dark:border-white/10 dark:text-zinc-100 z-50 select-none text-left"
          >
            {/* ШАПКА ПОПОВЕРА */}
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <h3 className="text-xs font-semibold tracking-wider uppercase text-zinc-400 dark:text-zinc-500">
                  Wortschatz-Matrix
                </h3>
                <div className="text-2xl font-bold tracking-tight mt-0.5">
                  {totalMastered.toLocaleString('de-DE')} <span className="text-sm font-normal text-zinc-500">/ 15.000</span>
                </div>
              </div>
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                {percentTotal.toFixed(1)}% Gesamt
              </span>
            </div>

            {/* СПИСОК УРОВНЕЙ (ЧИСТАЯ АРХИТЕКТУРА СТРОК) */}
            <div className="space-y-1">
              {levels.map((lvl) => {
                const count = stats[lvl.key] || 0;
                const percent = Math.min(Math.round((count / lvl.target) * 100), 100);
                const isCurrent = currentLevel === lvl.key;

                return (
                  <div key={lvl.key} className="py-2 first:pt-0 last:pb-0">
                    <div className="flex justify-between items-center text-xs mb-1.5">
                      <span className="flex items-center gap-1.5 font-medium">
                        <span className={`w-6 text-center font-mono font-semibold rounded py-0.5 ${
                          isCurrent 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-zinc-200/70 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                        }`}>
                          {lvl.key}
                        </span>
                        <span className="text-zinc-500 dark:text-zinc-400">{lvl.label}</span>
                      </span>
                      <span className="font-mono text-zinc-500 dark:text-zinc-400">
                        <strong className="text-zinc-900 dark:text-zinc-100 font-semibold">{count}</strong> / {lvl.target}
                      </span>
                    </div>

                    {/* Тонкий прогресс-бар */}
                    <div className="w-full h-1.5 rounded-full bg-zinc-200/80 dark:bg-zinc-800 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          isCurrent 
                            ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' 
                            : 'bg-zinc-400 dark:bg-zinc-600'
                        }`}
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
