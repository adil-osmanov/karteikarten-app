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

  const handleKey = (ch: string) => {
    triggerHaptic('light');
    onKeyPress(isShift ? ch.toUpperCase() : ch);
    if (isShift) setIsShift(false);
  };

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 w-full bg-[#1c1c1e] border-t border-white/[0.08] px-[3px] pt-2 pb-[max(28px,env(safe-area-inset-bottom))] z-50 select-none touch-manipulation flex flex-col items-center gap-[6px] shadow-[0_-10px_35px_rgba(0,0,0,0.7)]"
      style={{ touchAction: 'none' }}
    >
      {/* Ряд 1: q w e r t z u i o p ü */}
      <div className="flex w-full justify-center gap-[4px]">
        {row1.map((ch) => (
          <button
            key={ch}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              handleKey(ch);
            }}
            className="flex-1 h-[42px] rounded-[5px] bg-[#424244] active:bg-[#68686a] text-white text-[20px] font-normal flex items-center justify-center shadow-[0_1px_0_rgba(0,0,0,0.35)] transition-colors"
          >
            {isShift ? ch.toUpperCase() : ch}
          </button>
        ))}
      </div>

      {/* Ряд 2: a s d f g h j k l ö ä */}
      <div className="flex w-full justify-center gap-[4px] px-[4px]">
        {row2.map((ch) => (
          <button
            key={ch}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              handleKey(ch);
            }}
            className="flex-1 h-[42px] rounded-[5px] bg-[#424244] active:bg-[#68686a] text-white text-[20px] font-normal flex items-center justify-center shadow-[0_1px_0_rgba(0,0,0,0.35)] transition-colors"
          >
            {isShift ? ch.toUpperCase() : ch}
          </button>
        ))}
      </div>

      {/* Ряд 3: [ ⇧ ] y x c v b n m ß [ ⌫ ] */}
      <div className="flex w-full justify-center gap-[4px]">
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            triggerHaptic('light');
            setIsShift(prev => !prev);
          }}
          className={`w-[44px] h-[42px] rounded-[5px] flex items-center justify-center text-[18px] font-medium transition-colors shadow-[0_1px_0_rgba(0,0,0,0.35)] ${
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
              handleKey(ch);
            }}
            className="flex-1 h-[42px] rounded-[5px] bg-[#424244] active:bg-[#68686a] text-white text-[20px] font-normal flex items-center justify-center shadow-[0_1px_0_rgba(0,0,0,0.35)] transition-colors"
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
          className="w-[44px] h-[42px] rounded-[5px] bg-[#2c2c2e] active:bg-[#48484a] text-white flex items-center justify-center text-[19px] transition-colors shadow-[0_1px_0_rgba(0,0,0,0.35)]"
        >
          ⌫
        </button>
      </div>

      {/* Ряд 4: Пробел по центру (без 123, смайликов и enter) */}
      <div className="flex w-full justify-center px-6 mt-[2px]">
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            triggerHaptic('medium');
            onSpace();
          }}
          className="w-[66%] h-[42px] rounded-[5px] bg-[#424244] active:bg-[#68686a] text-zinc-300 text-xs tracking-wider uppercase font-medium flex items-center justify-center shadow-[0_1px_0_rgba(0,0,0,0.35)] transition-colors"
        >
          Leerzeichen
        </button>
      </div>
      {/* Пустое пространство внизу гарантируется отступом pb-[max(28px,env(safe-area-inset-bottom))] */}
    </div>
  );
}
