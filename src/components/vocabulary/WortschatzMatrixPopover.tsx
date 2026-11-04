'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import {
  useWortschatzMatrix,
  C1_TARGET_WORDS,
  CEFRLevel,
  normalizeLanguageCode,
} from '@/hooks/useWortschatzMatrix';
import { MasteredWordsModal } from './MasteredWordsModal';

export { C1_TARGET_WORDS };

interface WortschatzMatrixPopoverProps {
  className?: string;
  language?: string;
}

const DISPLAY_LEVELS: CEFRLevel[] = ['C1', 'B2', 'B1', 'A2', 'A1'];

export const WortschatzMatrixPopover: React.FC<WortschatzMatrixPopoverProps> = ({
  className = '',
  language,
}) => {
  const [isMatrixOpen, setIsMatrixOpen] = useState(false);
  const [isWordsModalOpen, setIsWordsModalOpen] = useState(false);
  const [modalInitialLevel, setModalInitialLevel] = useState<'Alle' | CEFRLevel>('Alle');
  const [fallbackLang, setFallbackLang] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('selected_language') || 'DE';
      } catch {}
    }
    return 'DE';
  });

  useEffect(() => {
    const syncLang = () => {
      try {
        const saved = localStorage.getItem('selected_language');
        if (saved) setFallbackLang(saved);
      } catch {}
    };
    window.addEventListener('storage', syncLang);
    window.addEventListener('stats-update', syncLang);
    return () => {
      window.removeEventListener('storage', syncLang);
      window.removeEventListener('stats-update', syncLang);
    };
  }, []);

  const appLanguage = language || fallbackLang;
  const currentLang = normalizeLanguageCode(appLanguage);

  const {
    counts: stats,
    totalWords: totalMastered,
    activeLevel: currentLevel,
    currentLanguage,
    wordLabel,
    wordsLearnedToday,
    todayCounts,
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

  const targetWordsForLang = C1_TARGET_WORDS[currentLang] || 10000;
  const percentTotal =
    targetWordsForLang > 0 ? Math.min(100, (totalMastered / targetWordsForLang) * 100) : 0;
  const percentToday =
    targetWordsForLang > 0 ? ((wordsLearnedToday / targetWordsForLang) * 100).toFixed(2) : '0.00';

  const localeStr =
    currentLanguage === 'de' ? 'de-DE' : currentLanguage === 'ru' ? 'ru-RU' : 'en-US';

  return (
    <div className={`relative inline-block ${className}`}>
      {/* КНОПКА МАТРИЦЫ В ШАПКЕ */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsMatrixOpen(!isMatrixOpen)}
        className="group flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/80 dark:bg-neutral-900/60 border border-black/5 dark:border-white/10 backdrop-blur-xl text-xs font-medium text-neutral-700 dark:text-neutral-300 shadow-sm hover:border-black/10 dark:hover:border-white/20 transition-all select-none active:scale-95 cursor-pointer"
        title="Wortschatz-Matrix öffnen"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        <span className="text-xs font-semibold tracking-tight group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">
          {totalMastered.toLocaleString(localeStr)} {wordLabel}
        </span>
        <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">
          • {totalMastered === 0 ? 'A1' : currentLevel || 'A1'}
        </span>
        <ChevronDown
          className={`w-3 h-3 text-zinc-400 transition-transform duration-200 ${
            isMatrixOpen ? 'rotate-180 text-blue-500' : 'group-hover:translate-y-0.5'
          }`}
        />
      </button>

      {/* ПОПОВЕР МАТРИЦЫ СЛОВАРНОГО ЗАПАСА */}
      <AnimatePresence>
        {isMatrixOpen && (
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{ willChange: 'transform, opacity' }}
            className="fixed inset-x-4 top-20 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 w-80 sm:w-96 p-5 rounded-3xl shadow-2xl backdrop-blur-2xl border bg-white/95 border-black/10 text-zinc-900 dark:bg-[#141416]/98 dark:border-white/[0.08] dark:text-zinc-100 z-50 select-none text-left transform-gpu will-change-transform"
          >
            {/* ШАПКА МАТРИЦЫ: СЧЕТЧИК СЛОВ, ГАРАНТИРОВАННЫЙ БЕЙДЖ ЗА СЕГОДНЯ И % ОТ ЦЕЛИ C1 */}
            <div className="flex items-start justify-between mb-5">
              <div className="flex flex-col gap-1.5">
                {/* Главная цифра кликабельна с чистой типографикой */}
                <div className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-baseline gap-2">
                  <span
                    onClick={() => {
                      setModalInitialLevel('Alle');
                      setIsWordsModalOpen(true);
                      setIsMatrixOpen(false);
                    }}
                    className="hover:text-blue-500 dark:hover:text-blue-400 cursor-pointer transition-colors duration-150"
                    title="Gelernte Wörter anzeigen"
                  >
                    {totalMastered.toLocaleString(localeStr)}
                  </span>
                  <span className="text-sm font-normal text-zinc-400 dark:text-zinc-500 select-none">
                    / {targetWordsForLang.toLocaleString(localeStr)}
                  </span>
                </div>

                {wordsLearnedToday > 0 ? (
                  <div className="text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full text-xs font-medium inline-flex items-center gap-1 w-fit">
                    +{wordsLearnedToday} heute (+{percentToday}%)
                  </div>
                ) : (
                  <div className="text-zinc-500 dark:text-neutral-500 bg-zinc-200/60 dark:bg-neutral-800/40 px-2.5 py-0.5 rounded-full text-xs font-medium inline-flex items-center gap-1 w-fit">
                    0 heute
                  </div>
                )}
              </div>

              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                {percentTotal.toFixed(1)}%
              </span>
            </div>

            {/* СТРОКИ УРОВНЕЙ A1..C1 (ЧИСТО ИНФОРМАЦИОННЫЕ, НЕКЛИКАБЕЛЬНЫЕ, С РАЗДЕЛИТЕЛЯМИ) */}
            <div className="divide-y divide-black/5 dark:divide-white/[0.06]">
              {DISPLAY_LEVELS.map((levelKey) => {
                const count = stats[levelKey] || 0;
                const levelTodayCount = todayCounts?.[levelKey] || 0;
                const sharePercent =
                  totalMastered > 0 ? Math.min(Math.round((count / totalMastered) * 100), 100) : 0;

                return (
                  <div
                    key={levelKey}
                    className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0 select-none"
                  >
                    <div className="flex justify-between items-center text-xs">
                      <span className="w-7 h-5 flex items-center justify-center rounded font-mono text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-black/5 dark:border-white/5">
                        {levelKey}
                      </span>

                      <div className="flex items-center gap-1.5">
                        {levelTodayCount > 0 && (
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded-full font-mono">
                            +{levelTodayCount}
                          </span>
                        )}
                        <div className="flex items-center gap-1">
                          <span className={`font-semibold font-mono ${count > 0 ? 'text-zinc-900 dark:text-white' : 'text-zinc-400 dark:text-zinc-500'}`}>
                            {count}
                          </span>
                          <span className="text-xs text-zinc-500 dark:text-neutral-400">
                            Wörter
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Индикаторная полоска: доля уровня (только если count > 0) */}
                    {count > 0 && (
                      <div className="w-full h-1 rounded-full bg-zinc-200/70 dark:bg-zinc-800/80 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500 bg-blue-500 dark:bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.35)]"
                          style={{ width: `${sharePercent}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* МОДАЛЬНОЕ ОКНО ПРОСМОТРА И ПОИСКА ВЫУЧЕННЫХ СЛОВ */}
      <MasteredWordsModal
        isOpen={isWordsModalOpen}
        onClose={() => setIsWordsModalOpen(false)}
        language={currentLang}
        initialLevelFilter={modalInitialLevel}
      />
    </div>
  );
};
