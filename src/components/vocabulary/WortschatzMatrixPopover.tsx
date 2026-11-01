'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download } from 'lucide-react';
import { useWortschatzMatrix, getMasteredLemmasSet } from '@/hooks/useWortschatzMatrix';
import {
  CEFRLevel,
  getCanonicalLevelWords,
  normalizeLanguageCode,
} from '@/lib/vocabulary/defaultLexiconMap';
import { useStore } from '@/app/page';

interface WortschatzMatrixPopoverProps {
  className?: string;
}

export const WortschatzMatrixPopover: React.FC<WortschatzMatrixPopoverProps> = ({
  className = '',
}) => {
  const [isMatrixOpen, setIsMatrixOpen] = useState(false);
  const appLanguage = useStore((state) => state.appLanguage);
  const {
    counts: stats,
    totalWords: totalMastered,
    activeLevel: currentLevel,
    currentLanguage,
    wordLabel,
    totalGoal,
    levels,
  } = useWortschatzMatrix(appLanguage);

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
  const exportRemainingWords = useCallback(
    (levelKey: CEFRLevel, target: number, learnedCount: number) => {
      const activeLang = normalizeLanguageCode(appLanguage);
      const mastered = getMasteredLemmasSet(activeLang);

      // 1. Take canonical authoritative array of words of this level (exactly target words)
      const fullLevelWords = getCanonicalLevelWords(activeLang, levelKey);

      // 2. Filter: keep only words that are not in masteredLemmasSet
      const unlearned = fullLevelWords.filter((w) => !mastered.has(w.toLowerCase()));

      // 3. Strict mathematical guarantee: [Learned] + [Remaining in file] = TARGET
      const targetRemainingCount = Math.max(0, target - learnedCount);
      const remainingWords = unlearned.slice(0, targetRemainingCount);

      // 4. Formatted header: [ЯЗЫК: DE/EN/RU] Невыученные слова уровня [LEVEL] (осталось: [X] из [TARGET]):
      const langUpper = activeLang.toUpperCase();
      const header = `[ЯЗЫК: ${langUpper}] Невыученные слова уровня ${levelKey} (осталось: ${remainingWords.length} из ${target}):\n\n`;
      const body =
        remainingWords.length > 0
          ? remainingWords.map((w) => `- ${w}`).join('\n')
          : '(Все слова этого уровня выучены!)';
      const content = header + body;

      // 5. Trigger download in browser
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeLang}_${levelKey}_restliche_woerter.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [appLanguage]
  );

  const percentTotal = totalGoal > 0 ? Math.min(100, (totalMastered / totalGoal) * 100) : 0;
  // Order from C1 down to A1
  const reversedLevels = [...levels].reverse();

  return (
    <div className={`relative inline-block ${className}`}>
      {/* 1. HEADER-BUTTON IM LIGHT MODE (REINWEISS) */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsMatrixOpen(!isMatrixOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all select-none active:scale-95 cursor-pointer bg-white hover:bg-zinc-50 border border-black/[0.08] text-zinc-800 shadow-sm dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:border-white/10 dark:text-zinc-200"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        <span className="text-xs font-semibold tracking-tight">
          {totalMastered.toLocaleString()} {wordLabel}
        </span>
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
            {/* ШАПКА МАТРИЦЫ: ТОЛЬКО ЧИСЛА И СИНИЙ БЕЙДЖ % */}
            <div className="flex items-center justify-between mb-5">
              <div className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
                {totalMastered.toLocaleString()}{' '}
                <span className="text-sm font-normal text-zinc-400 dark:text-zinc-500">
                  / {totalGoal.toLocaleString()}
                </span>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                {percentTotal.toFixed(1)}% Gesamt
              </span>
            </div>

            {/* UNIFORM MONOCHROME BADGES & DOWNLOAD BUTTON (NO TOOLTIP) */}
            <div className="space-y-3">
              {reversedLevels.map((lvl) => {
                const target = lvl.target;
                const count = stats[lvl.key] || 0;
                const percent = Math.min(Math.round((count / target) * 100), 100);

                return (
                  <div key={lvl.key} className="flex flex-col gap-1.5">
                    {/* Строка уровня: плашка слева, цифры и чистая иконка скачивания справа */}
                    <div className="flex justify-between items-center text-xs">
                      <span className="w-7 h-5 flex items-center justify-center rounded font-mono text-[11px] font-semibold bg-zinc-150 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-black/5 dark:border-white/5">
                        {lvl.key}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-zinc-500 dark:text-zinc-400">
                          <strong className="text-zinc-900 dark:text-zinc-100 font-semibold">{count}</strong> / {target}
                        </span>

                        {/* Кнопка скачивания: ПОЛНОСТЬЮ БЕЗ ТУЛТИПА / TITLE */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            exportRemainingWords(lvl.key, target, count);
                          }}
                          className="w-6 h-6 rounded flex items-center justify-center text-zinc-400 hover:text-blue-600 dark:text-zinc-500 dark:hover:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                          aria-label={`Export ${lvl.key}`}
                        >
                          <Download className="w-3.5 h-3.5 stroke-[2]" />
                        </button>
                      </div>
                    </div>

                    {/* Полоса прогресса единого синего цвета для всех уровней */}
                    <div className="w-full h-1.5 rounded-full bg-zinc-200/70 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 bg-blue-500 dark:bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.35)]"
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
