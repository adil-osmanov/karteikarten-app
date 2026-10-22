'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { triggerHaptic } from '@/lib/haptics';

export interface MobileKeyboardProps {
  onKeyPress: (char: string) => void;
  onBackspace: () => void;
  onSpace: () => void;
}

export function MobileKeyboard({ onKeyPress, onBackspace, onSpace }: MobileKeyboardProps) {
  const [mounted, setMounted] = useState(false);
  const [isShift, setIsShift] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Классическая немецкая раскладка iOS QWERTZ
  const row1 = ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p'];
  const row2 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'];
  const row3 = ['y', 'x', 'c', 'v', 'b', 'n', 'm'];
  const rowUmlauts = ['ä', 'ö', 'ü', 'ß'];

  const handleKey = (ch: string) => {
    triggerHaptic('light');
    onKeyPress(isShift ? ch.toUpperCase() : ch);
    if (isShift) setIsShift(false);
  };

  const keyboardContent = (
    <div 
      className="fixed bottom-0 left-0 right-0 w-full bg-[#d2d4dc]/95 dark:bg-[#18181b]/98 border-t border-black/10 dark:border-white/[0.08] px-1.5 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] z-[9999] select-none touch-manipulation flex flex-col items-center gap-[6px] shadow-[0_-8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_-10px_35px_rgba(0,0,0,0.7)] backdrop-blur-2xl"
      style={{ touchAction: 'none' }}
    >
      {/* Ряд 1 (10 клавиш: q w e r t z u i o p) */}
      <div className="flex w-full justify-center gap-[5px]">
        {row1.map((ch) => (
          <button
            key={ch}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              handleKey(ch);
            }}
            className="flex-1 h-[44px] rounded-[8px] bg-white dark:bg-[#2c2c2e] active:bg-[#b0b3ba] dark:active:bg-[#48484a] text-zinc-900 dark:text-white text-[19px] font-normal flex items-center justify-center border border-black/[0.04] dark:border-white/[0.06] shadow-[0_1px_1px_rgba(0,0,0,0.18)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.35)] transition-colors"
          >
            {isShift ? ch.toUpperCase() : ch}
          </button>
        ))}
      </div>

      {/* Ряд 2 (9 клавиш: a s d f g h j k l с боковыми отступами) */}
      <div className="flex w-full justify-center gap-[5px] px-[14px]">
        {row2.map((ch) => (
          <button
            key={ch}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              handleKey(ch);
            }}
            className="flex-1 h-[44px] rounded-[8px] bg-white dark:bg-[#2c2c2e] active:bg-[#b0b3ba] dark:active:bg-[#48484a] text-zinc-900 dark:text-white text-[19px] font-normal flex items-center justify-center border border-black/[0.04] dark:border-white/[0.06] shadow-[0_1px_1px_rgba(0,0,0,0.18)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.35)] transition-colors"
          >
            {isShift ? ch.toUpperCase() : ch}
          </button>
        ))}
      </div>

      {/* Ряд 3: [ ⇧ Shift ] + 7 клавиш (y x c v b n m) + [ ⌫ Backspace ] */}
      <div className="flex w-full justify-center gap-[5px]">
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            triggerHaptic('light');
            setIsShift(prev => !prev);
          }}
          className={`w-[44px] h-[44px] rounded-[8px] flex items-center justify-center transition-colors border shadow-[0_1px_1px_rgba(0,0,0,0.18)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.35)] ${
            isShift
              ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 border-transparent'
              : 'bg-[#b8bcc4] dark:bg-[#222224] text-zinc-800 dark:text-white/90 border-black/[0.04] dark:border-white/[0.06] active:bg-white dark:active:bg-[#38383a]'
          }`}
          aria-label="Shift"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill={isShift ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4L4 12h5v8h6v-8h5L12 4z" />
          </svg>
        </button>

        <div className="flex flex-1 justify-center gap-[5px]">
          {row3.map((ch) => (
            <button
              key={ch}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                handleKey(ch);
              }}
              className="flex-1 h-[44px] rounded-[8px] bg-white dark:bg-[#2c2c2e] active:bg-[#b0b3ba] dark:active:bg-[#48484a] text-zinc-900 dark:text-white text-[19px] font-normal flex items-center justify-center border border-black/[0.04] dark:border-white/[0.06] shadow-[0_1px_1px_rgba(0,0,0,0.18)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.35)] transition-colors"
            >
              {isShift ? ch.toUpperCase() : ch}
            </button>
          ))}
        </div>

        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            triggerHaptic('light');
            onBackspace();
          }}
          className="w-[44px] h-[44px] rounded-[8px] bg-[#b8bcc4] dark:bg-[#222224] active:bg-white dark:active:bg-[#38383a] text-zinc-800 dark:text-white/90 flex items-center justify-center border border-black/[0.04] dark:border-white/[0.06] transition-colors shadow-[0_1px_1px_rgba(0,0,0,0.18)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
          aria-label="Backspace"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
            <line x1="18" y1="9" x2="12" y2="15" />
            <line x1="12" y1="9" x2="18" y2="15" />
          </svg>
        </button>
      </div>

      {/* Ряд 4: Немецкие спецсимволы (ä, ö, ü, ß) */}
      <div className="flex w-full justify-center gap-[8px] px-6 mt-[1px]">
        {rowUmlauts.map((ch) => (
          <button
            key={ch}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              handleKey(ch);
            }}
            className="flex-1 max-w-[70px] h-[40px] rounded-[8px] bg-white dark:bg-[#2c2c2e] active:bg-[#b0b3ba] dark:active:bg-[#48484a] text-zinc-900 dark:text-white text-[18px] font-normal flex items-center justify-center border border-black/[0.04] dark:border-white/[0.06] shadow-[0_1px_1px_rgba(0,0,0,0.18)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.35)] transition-colors"
          >
            {isShift ? ch.toUpperCase() : ch}
          </button>
        ))}
      </div>

      {/* Ряд 5: Чистый пробел без текста */}
      <div className="flex w-full justify-center px-6 mt-[1px]">
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            triggerHaptic('medium');
            onSpace();
          }}
          className="w-[58%] max-w-[260px] h-[42px] rounded-[8px] bg-white dark:bg-[#2c2c2e] active:bg-[#b0b3ba] dark:active:bg-[#48484a] border border-black/[0.04] dark:border-white/[0.06] shadow-[0_1px_1px_rgba(0,0,0,0.18)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.35)] transition-colors"
          aria-label="Пробел"
        />
      </div>
    </div>
  );

  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(keyboardContent, document.body);
}
