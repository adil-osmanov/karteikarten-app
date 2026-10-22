import React, { useState } from 'react';
import { triggerHaptic } from '@/lib/haptics';

export interface MobileKeyboardProps {
  onKeyPress: (char: string) => void;
  onBackspace: () => void;
  onSpace: () => void;
}

export function MobileKeyboard({ onKeyPress, onBackspace, onSpace }: MobileKeyboardProps) {
  const [isShift, setIsShift] = useState(false);

  const row1 = ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p', 'ü'];
  const row2 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ö', 'ä'];
  const row3 = ['y', 'x', 'c', 'v', 'b', 'n', 'm', 'ß'];

  const handleChar = (ch: string) => {
    triggerHaptic('light');
    onKeyPress(isShift ? ch.toUpperCase() : ch);
    if (isShift) setIsShift(false);
  };

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 w-full bg-[#1c1c1e] border-t border-white/[0.08] px-[3px] pt-2 pb-[max(8px,env(safe-area-inset-bottom))] z-40 select-none touch-manipulation flex flex-col items-center gap-[6px] shadow-[0_-8px_25px_rgba(0,0,0,0.6)]"
      style={{ touchAction: 'none' }}
    >
      {/* Ряд 1 */}
      <div className="flex w-full justify-center gap-[4px]">
        {row1.map((ch) => (
          <button
            key={ch}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              handleChar(ch);
            }}
            className="flex-1 h-[42px] rounded-[5px] bg-[#424244] active:bg-[#68686a] text-white text-[19px] font-normal flex items-center justify-center shadow-[0_1px_0_rgba(0,0,0,0.35)] cursor-pointer"
          >
            {isShift ? ch.toUpperCase() : ch}
          </button>
        ))}
      </div>

      {/* Ряд 2 */}
      <div className="flex w-full justify-center gap-[4px] px-[4px]">
        {row2.map((ch) => (
          <button
            key={ch}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              handleChar(ch);
            }}
            className="flex-1 h-[42px] rounded-[5px] bg-[#424244] active:bg-[#68686a] text-white text-[19px] font-normal flex items-center justify-center shadow-[0_1px_0_rgba(0,0,0,0.35)] cursor-pointer"
          >
            {isShift ? ch.toUpperCase() : ch}
          </button>
        ))}
      </div>

      {/* Ряд 3 */}
      <div className="flex w-full justify-center gap-[4px]">
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            triggerHaptic('light');
            setIsShift(!isShift);
          }}
          className={`w-[42px] h-[42px] rounded-[5px] flex items-center justify-center text-[18px] shadow-[0_1px_0_rgba(0,0,0,0.35)] cursor-pointer ${
            isShift ? 'bg-white text-black' : 'bg-[#2c2c2e] active:bg-[#48484a] text-white'
          }`}
        >
          ⇧
        </button>

        {row3.map((ch) => (
          <button
            key={ch}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              handleChar(ch);
            }}
            className="flex-1 h-[42px] rounded-[5px] bg-[#424244] active:bg-[#68686a] text-white text-[19px] font-normal flex items-center justify-center shadow-[0_1px_0_rgba(0,0,0,0.35)] cursor-pointer"
          >
            {isShift ? ch.toUpperCase() : ch}
          </button>
        ))}

        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            triggerHaptic('light');
            onBackspace();
          }}
          className="w-[42px] h-[42px] rounded-[5px] bg-[#2c2c2e] active:bg-[#48484a] text-white flex items-center justify-center text-[18px] shadow-[0_1px_0_rgba(0,0,0,0.35)] cursor-pointer"
        >
          ⌫
        </button>
      </div>

      {/* Ряд 4: Пробел */}
      <div className="flex w-full justify-center px-4">
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            triggerHaptic('medium');
            onSpace();
          }}
          className="w-[68%] h-[42px] rounded-[5px] bg-[#424244] active:bg-[#68686a] text-zinc-300 text-xs tracking-wider uppercase font-medium flex items-center justify-center shadow-[0_1px_0_rgba(0,0,0,0.35)] cursor-pointer"
        >
          Leerzeichen
        </button>
      </div>
    </div>
  );
}
