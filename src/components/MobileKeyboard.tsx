import React, { useState } from 'react';
import { triggerHaptic } from '@/lib/haptics';

export interface MobileKeyboardProps {
  onKeyPress: (char: string) => void;
  onBackspace: () => void;
  onSpace: () => void;
}

export function MobileKeyboard({ onKeyPress, onBackspace, onSpace }: MobileKeyboardProps) {
  const [isShift, setIsShift] = useState(false);

  // Классическая раскладка iOS QWERTZ
  const row1 = ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p'];
  const row2 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'];
  const row3 = ['y', 'x', 'c', 'v', 'b', 'n', 'm'];
  const rowUmlauts = ['ä', 'ö', 'ü', 'ß'];

  const handleKey = (ch: string) => {
    triggerHaptic('light');
    onKeyPress(isShift ? ch.toUpperCase() : ch);
    if (isShift) setIsShift(false);
  };

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 w-full bg-[#d1d5dc]/98 dark:bg-[#1c1c1e]/98 border-t border-black/[0.08] dark:border-white/[0.08] px-1 pt-2 pb-[max(32px,env(safe-area-inset-bottom))] z-50 select-none touch-manipulation flex flex-col items-center gap-[6px] shadow-[0_-8px_30px_rgba(0,0,0,0.15)] dark:shadow-[0_-10px_35px_rgba(0,0,0,0.7)] backdrop-blur-xl"
      style={{ touchAction: 'none' }}
    >
      {/* Ряд 1 (10 стандартных клавиш) */}
      <div className="flex w-full justify-center gap-[5px]">
        {row1.map((ch) => (
          <button
            key={ch}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              handleKey(ch);
            }}
            className="flex-1 h-[42px] rounded-[5px] bg-white dark:bg-[#424244] active:bg-[#b0b3ba] dark:active:bg-[#68686a] text-black dark:text-white text-[20px] font-normal flex items-center justify-center shadow-[0_1px_0_rgba(0,0,0,0.3)] dark:shadow-[0_1px_0_rgba(0,0,0,0.35)] transition-colors"
          >
            {isShift ? ch.toUpperCase() : ch}
          </button>
        ))}
      </div>

      {/* Ряд 2 (9 стандартных клавиш с боковым отступом для симметрии iOS) */}
      <div className="flex w-full justify-center gap-[5px] px-[16px]">
        {row2.map((ch) => (
          <button
            key={ch}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              handleKey(ch);
            }}
            className="flex-1 h-[42px] rounded-[5px] bg-white dark:bg-[#424244] active:bg-[#b0b3ba] dark:active:bg-[#68686a] text-black dark:text-white text-[20px] font-normal flex items-center justify-center shadow-[0_1px_0_rgba(0,0,0,0.3)] dark:shadow-[0_1px_0_rgba(0,0,0,0.35)] transition-colors"
          >
            {isShift ? ch.toUpperCase() : ch}
          </button>
        ))}
      </div>

      {/* Ряд 3: [ ⇧ ] + 7 клавиш + [ ⌫ ] */}
      <div className="flex w-full justify-center gap-[5px]">
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            triggerHaptic('light');
            setIsShift(prev => !prev);
          }}
          className={`w-[44px] h-[42px] rounded-[5px] flex items-center justify-center text-[18px] font-medium transition-colors shadow-[0_1px_0_rgba(0,0,0,0.3)] dark:shadow-[0_1px_0_rgba(0,0,0,0.35)] ${
            isShift
              ? 'bg-black text-white dark:bg-white dark:text-black'
              : 'bg-[#adb2bd] dark:bg-[#2c2c2e] text-black dark:text-white active:bg-white dark:active:bg-[#48484a]'
          }`}
        >
          ⇧
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
              className="flex-1 h-[42px] rounded-[5px] bg-white dark:bg-[#424244] active:bg-[#b0b3ba] dark:active:bg-[#68686a] text-black dark:text-white text-[20px] font-normal flex items-center justify-center shadow-[0_1px_0_rgba(0,0,0,0.3)] dark:shadow-[0_1px_0_rgba(0,0,0,0.35)] transition-colors"
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
          className="w-[44px] h-[42px] rounded-[5px] bg-[#adb2bd] dark:bg-[#2c2c2e] active:bg-white dark:active:bg-[#48484a] text-black dark:text-white flex items-center justify-center text-[19px] transition-colors shadow-[0_1px_0_rgba(0,0,0,0.3)] dark:shadow-[0_1px_0_rgba(0,0,0,0.35)]"
        >
          ⌫
        </button>
      </div>

      {/* Ряд 4: Немецкие спецсимволы (ä, ö, ü, ß) над пробелом */}
      <div className="flex w-full justify-center gap-[8px] px-8 mt-[1px]">
        {rowUmlauts.map((ch) => (
          <button
            key={ch}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              handleKey(ch);
            }}
            className="flex-1 max-w-[68px] h-[38px] rounded-[5px] bg-[#e3e5ea] dark:bg-[#3a3a3c] active:bg-[#c8cbd3] dark:active:bg-[#58585a] text-black dark:text-white text-[18px] font-medium flex items-center justify-center shadow-[0_1px_0_rgba(0,0,0,0.25)] transition-colors"
          >
            {isShift ? ch.toUpperCase() : ch}
          </button>
        ))}
      </div>

      {/* Ряд 5: Чистый пробел без надписи */}
      <div className="flex w-full justify-center px-6 mt-[2px]">
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            triggerHaptic('medium');
            onSpace();
          }}
          className="w-[65%] h-[42px] rounded-[5px] bg-white dark:bg-[#424244] active:bg-[#b0b3ba] dark:active:bg-[#68686a] shadow-[0_1px_0_rgba(0,0,0,0.3)] dark:shadow-[0_1px_0_rgba(0,0,0,0.35)] transition-colors"
          aria-label="Пробел"
        />
      </div>
      {/* Снизу зарезервирована зона под пальцы pb-[max(32px,env(safe-area-inset-bottom))] */}
    </div>
  );
}
