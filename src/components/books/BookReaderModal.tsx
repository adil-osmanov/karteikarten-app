'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';

export interface BookReaderModalProps {
  book: any;
  onClose: () => void;
  onStartLearning?: (bookId: string) => void;
}

export function BookReaderModal({ book, onClose, onStartLearning }: BookReaderModalProps) {
  const [isCoverOpened, setIsCoverOpened] = useState(false);

  // Extract cover URLs
  const initialCoverStr = book?.coverImage || (book?.coverType === 'image' ? book?.coverValue : null) || book?.coverUrl;
  let lightCover = initialCoverStr;
  let darkCover = initialCoverStr;

  if (initialCoverStr && typeof initialCoverStr === 'string' && initialCoverStr.startsWith('{"light":')) {
    try {
      const parsed = JSON.parse(initialCoverStr);
      lightCover = parsed.light || null;
      darkCover = parsed.dark || null;
    } catch {}
  }

  const coverUrl = lightCover || darkCover || book?.coverUrl || '';
  const tintColor = book?.tintColor || book?.coverValue || '#1C1C1E';
  const cleanTitle = (book?.title || '').replace(/^[🟢🟠🟣🔵●🔴🟡]\s*/, '');
  const levelDisplay = book?.activeLevels?.length 
    ? book.activeLevels.join(' · ') 
    : (book?.level || 'B1-B2');

  const accuracyDisplay = typeof book?.accuracy === 'number'
    ? `${book.accuracy}%`
    : (book?.accuracy ? `${book.accuracy}` : '—');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-hidden">
      {/* 1. Матовая подложка с мягким затемнением */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-md cursor-pointer"
      />

      {/* 2. Контейнер книги в пространстве 3D-перспективы */}
      <div className="relative z-10 w-[92vw] max-w-md sm:max-w-xl aspect-[2/3] sm:aspect-[4/3] [perspective:1400px]">
        <motion.div
          layoutId={`book-container-${book.id}`}
          className="relative w-full h-full flex"
          onLayoutAnimationComplete={() => {
            // Как только карточка долетела до центра, распахиваем обложку
            setIsCoverOpened(true);
          }}
          transition={{ type: "spring", stiffness: 280, damping: 28 }}
        >
          {/* СТРАНИЦА С СОДЕРЖИМЫМ (Внутренний блок книги) */}
          <div className="w-full h-full bg-[#fbfbfd] dark:bg-zinc-900 rounded-r-xl rounded-l-md shadow-2xl p-6 sm:p-8 flex flex-col justify-between border border-zinc-200/50 dark:border-white/10 select-none">
            <div>
              <div className="flex justify-between items-start gap-4">
                <div className="min-w-0">
                  <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    {levelDisplay}
                  </span>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mt-1 line-clamp-2">
                    {cleanTitle}
                  </h2>
                  {book.subtitle && (
                    <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                      {book.subtitle}
                    </p>
                  )}
                </div>
                <button 
                  onClick={onClose}
                  type="button"
                  className="w-8 h-8 rounded-full bg-zinc-200/60 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors shrink-0 cursor-pointer"
                  title="Schließen"
                >
                  ✕
                </button>
              </div>

              {/* Статистика и показатели книги */}
              <div className="mt-6 sm:mt-8 grid grid-cols-2 gap-3 sm:gap-4">
                <div className="p-3.5 sm:p-4 rounded-xl bg-zinc-100/80 dark:bg-zinc-800/60 border border-black/[0.04] dark:border-white/[0.06]">
                  <div className="text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400 font-medium">Karten gesamt</div>
                  <div className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-0.5 tabular-nums">
                    {book.totalCards || 0}
                  </div>
                </div>
                <div className="p-3.5 sm:p-4 rounded-xl bg-zinc-100/80 dark:bg-zinc-800/60 border border-black/[0.04] dark:border-white/[0.06]">
                  <div className="text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400 font-medium">Genauigkeit</div>
                  <div className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-0.5 tabular-nums">
                    {accuracyDisplay}
                  </div>
                </div>
              </div>
            </div>

            <button 
              onClick={() => {
                if (onStartLearning) {
                  onStartLearning(book.id);
                }
              }}
              type="button"
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold tracking-tight shadow-md hover:shadow-lg transition-all active:scale-[0.99] cursor-pointer"
            >
              Lernen starten
            </button>
          </div>

          {/* ПЕРЕДНЯЯ ОБЛОЖКА (Распахивается в 3D) */}
          <motion.div
            layoutId={`book-cover-${book.id}`}
            animate={{
              rotateY: isCoverOpened ? -120 : 0,
              opacity: isCoverOpened ? 0 : 1,
            }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: "left center" }}
            className="absolute inset-0 w-full h-full rounded-r-[5px] rounded-l-[2px] overflow-hidden pointer-events-none [transform-style:preserve-3d] shadow-2xl bg-zinc-900"
          >
            {coverUrl ? (
              <img 
                src={coverUrl} 
                alt={cleanTitle} 
                className="w-full h-full object-cover select-none" 
              />
            ) : (
              <div 
                className="w-full h-full flex flex-col items-center justify-center p-6 text-center select-none text-white"
                style={{ backgroundColor: tintColor }}
              >
                <span className="font-bold text-lg line-clamp-3">{cleanTitle}</span>
              </div>
            )}

            {/* Анатомический сгиб корешка и фаска */}
            <div className="absolute inset-y-0 left-0 pointer-events-none z-10 select-none overflow-hidden rounded-l-[2px] w-[6%] min-w-[7px] max-w-[14px]">
              <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-black/20 via-white/15 to-transparent mix-blend-overlay" />
              <div className="absolute inset-y-0 right-[2px] w-full bg-gradient-to-r from-transparent via-black/10 to-black/30 dark:to-black/60 mix-blend-multiply" />
              <div className="absolute inset-y-0 right-[1px] w-[1px] bg-black/35 dark:bg-black/70 mix-blend-multiply" />
              <div className="absolute inset-y-0 right-0 w-[1px] bg-white/40 dark:bg-white/20 mix-blend-screen" />
            </div>
            <div className="absolute inset-0 rounded-r-[5px] rounded-l-[2px] ring-1 ring-inset ring-black/10 dark:ring-white/10 pointer-events-none z-20" />
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
