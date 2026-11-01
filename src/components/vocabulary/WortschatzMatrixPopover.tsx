'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, CheckCircle2, X } from 'lucide-react';
import { useWortschatzMatrix } from '@/hooks/useWortschatzMatrix';
import { CEFRLevel, CEFR_TARGETS, CEFR_LEVEL_COLORS } from '@/lib/vocabulary/defaultLexiconMap';

interface WortschatzMatrixPopoverProps {
  className?: string;
}

const CEFR_ORDER: CEFRLevel[] = ['C1', 'B2', 'B1', 'A2', 'A1'];

export const WortschatzMatrixPopover: React.FC<WortschatzMatrixPopoverProps> = ({
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { counts, totalWords, activeLevel } = useWortschatzMatrix();
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className={`relative inline-block ${className}`}>
      {/* Кнопка-капсула в шапке */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 h-9 px-3.5 rounded-full bg-zinc-100/90 dark:bg-zinc-850/90 hover:bg-zinc-200/90 dark:hover:bg-zinc-800 border border-black/5 dark:border-white/5 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200 text-xs font-medium cursor-pointer shadow-sm select-none active:scale-95"
        title="Wortschatz-Matrix (CEFR)"
      >
        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
        <span className="font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap tabular-nums">
          {totalWords.toLocaleString()} Wörter
        </span>
        <span className="text-zinc-400 dark:text-zinc-500 font-semibold shrink-0">
          • {activeLevel}
        </span>
      </button>

      {/* Матовый поповер (стиль macOS / Apple Health) */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-4 top-20 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 w-auto sm:w-[360px] p-5 rounded-2xl bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-2xl border border-black/[0.08] dark:border-white/[0.1] shadow-2xl z-50 select-none text-left"
          >
            {/* Шапка поповера */}
            <div className="flex items-start justify-between pb-3.5 mb-4 border-b border-black/[0.06] dark:border-white/[0.08]">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                  <span>Wortschatz-Matrix</span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white tabular-nums">
                    {totalWords.toLocaleString()}
                  </span>
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    gemeisterte Wörter
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                  Aktiver Wortschatz nach CEFR-Referenzrahmen
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-white/[0.06] dark:hover:bg-white/[0.12] flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                aria-label="Schließen"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Полосы уровней CEFR (C1 -> A1) */}
            <div className="space-y-3">
              {CEFR_ORDER.map((level) => {
                const count = counts[level] || 0;
                const target = CEFR_TARGETS[level];
                const percentage = Math.min(100, Math.round((count / target) * 100));
                const isActive = level === activeLevel;
                const colorConfig = CEFR_LEVEL_COLORS[level];

                return (
                  <div key={level} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[11px] font-bold border ${colorConfig.badge}`}
                        >
                          {level}
                        </span>
                        {isActive && (
                          <span className="text-[10px] uppercase font-semibold tracking-wide text-blue-600 dark:text-blue-400">
                            Aktuelles Niveau
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-xs tabular-nums">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {count}
                        </span>
                        <span className="text-zinc-400 dark:text-zinc-500">/ {target}</span>
                        <span className="text-[11px] text-zinc-400 dark:text-zinc-500 w-9 text-right font-medium">
                          {percentage}%
                        </span>
                      </div>
                    </div>

                    {/* Полоса прогресса */}
                    <div
                      className={`relative w-full h-2 rounded-full overflow-hidden ${
                        isActive
                          ? 'bg-blue-950/10 dark:bg-blue-950/40 ring-1 ring-blue-500/20'
                          : 'bg-zinc-100 dark:bg-white/[0.06]'
                      }`}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                        className={`h-full rounded-full bg-gradient-to-r ${colorConfig.bar} ${
                          isActive ? 'shadow-[0_0_10px_rgba(37,99,235,0.4)]' : ''
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Подвал с деликатной надписью */}
            <div className="mt-4 pt-3 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>Keine Duplikate • Nur gemeisterte Wörter (Stufe 4)</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
