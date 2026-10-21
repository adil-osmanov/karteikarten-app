import React, { useState } from 'react';
import { triggerHaptic } from '@/lib/haptics';

export interface MobileKeyboardProps {
  onKeyPress: (char: string) => void;
  onBackspace: () => void;
  onSpace?: () => void;
  docked?: boolean;
}

export function MobileKeyboard({ onKeyPress, onBackspace, onSpace }: MobileKeyboardProps) {
  const [isShift, setIsShift] = useState(false);

  const row1 = ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p', 'ü'];
  const row2 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ö', 'ä'];
  const row3 = ['y', 'x', 'c', 'v', 'b', 'n', 'm', 'ß'];

  const handleCharPress = (char: string) => {
    triggerHaptic('light');
    onKeyPress(isShift ? char.toUpperCase() : char);
    if (isShift) setIsShift(false);
  };

  const handleBackspacePress = () => {
    triggerHaptic('light');
    onBackspace();
  };

  const handleSpacePress = () => {
    triggerHaptic('medium');
    if (onSpace) {
      onSpace();
    } else {
      onKeyPress(' ');
    }
  };

  const handleShiftToggle = () => {
    triggerHaptic('light');
    setIsShift(prev => !prev);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 w-full bg-zinc-950/95 border-t border-white/10 px-1 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] z-40 backdrop-blur-2xl shadow-2xl flex flex-col items-center gap-1.5 select-none touch-manipulation">
      {/* Ряд 1 */}
      <div className="flex w-full justify-center gap-1">
        {row1.map((ch) => (
          <button
            key={ch}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              handleCharPress(ch);
            }}
            className="flex-1 h-11 rounded-lg bg-zinc-800/80 active:bg-zinc-600 text-white font-medium text-base sm:text-lg flex items-center justify-center transition-transform active:scale-95 shadow-sm cursor-pointer"
          >
            {isShift ? ch.toUpperCase() : ch}
          </button>
        ))}
      </div>

      {/* Ряд 2 */}
      <div className="flex w-full justify-center gap-1 px-2">
        {row2.map((ch) => (
          <button
            key={ch}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              handleCharPress(ch);
            }}
            className="flex-1 h-11 rounded-lg bg-zinc-800/80 active:bg-zinc-600 text-white font-medium text-base sm:text-lg flex items-center justify-center transition-transform active:scale-95 shadow-sm cursor-pointer"
          >
            {isShift ? ch.toUpperCase() : ch}
          </button>
        ))}
      </div>

      {/* Ряд 3 */}
      <div className="flex w-full justify-center gap-1">
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            handleShiftToggle();
          }}
          className={`w-11 h-11 rounded-lg flex items-center justify-center text-sm font-semibold transition-transform active:scale-95 cursor-pointer ${
            isShift ? 'bg-white text-zinc-900' : 'bg-zinc-800/80 text-zinc-300 active:bg-zinc-700'
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
              handleCharPress(ch);
            }}
            className="flex-1 h-11 rounded-lg bg-zinc-800/80 active:bg-zinc-600 text-white font-medium text-base sm:text-lg flex items-center justify-center transition-transform active:scale-95 shadow-sm cursor-pointer"
          >
            {isShift ? ch.toUpperCase() : ch}
          </button>
        ))}

        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            handleBackspacePress();
          }}
          className="w-11 h-11 rounded-lg bg-zinc-800/80 active:bg-zinc-600 text-zinc-300 flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
        >
          ⌫
        </button>
      </div>

      {/* Ряд 4: Пробел */}
      <div className="flex w-full justify-center px-4 mt-0.5">
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            handleSpacePress();
          }}
          className="w-3/5 h-11 rounded-lg bg-zinc-800/80 active:bg-zinc-600 text-zinc-400 font-medium text-xs tracking-wider uppercase flex items-center justify-center transition-transform active:scale-95 shadow-sm cursor-pointer"
        >
          Leerzeichen
        </button>
      </div>
    </div>
  );
}
