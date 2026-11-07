'use client';

import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface CardContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  className?: string;
  is3DFace?: boolean;
  rarityRound?: number; // 1: Common, 2: Uncommon (Emerald), 3: Rare (Sapphire), 4: Epic (Purple)
  isArchivingPulse?: boolean;
  isSealed?: boolean;
  isLegendary?: boolean;
  isVaporizing?: boolean;
}

/**
 * World of Warcraft Word Rarity Styling:
 * - Round 1 (Common): Matte minimal border, no glow.
 * - Round 2 (Uncommon): Soft emerald contour with subtle green ambient glow.
 * - Round 3 (Rare): Sapphire contour with noble blue ambient glow.
 * - Round 4 (Epic): Amethyst contour with magical purple ambient glow.
 * - Legendary (SRS Repeat / Sealed Mastered): Noble gold contour with golden aura.
 */
export function getRarityCardClasses(round?: number, isArchivingPulse?: boolean, isSealed?: boolean, isLegendary?: boolean): string {
  if (isSealed || isLegendary) {
    return "border border-amber-400/55 dark:border-amber-400/55 shadow-[0_0_120px_rgba(245,158,11,0.55),0_0_45px_rgba(251,191,36,0.30)] transition-all duration-500 ease-out";
  }
  if (!round || round <= 1) {
    // Раунд 1 (Серый / Стартовый)
    return "border border-black/10 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8)] transition-all duration-500 ease-out";
  }
  if (round === 2) {
    // Раунд 2 (Зеленый / Необычный — минимальная насыщенность)
    return "border border-emerald-500/20 dark:border-emerald-500/20 shadow-[0_0_50px_-10px_rgba(16,185,129,0.18)] transition-all duration-500 ease-out";
  }
  if (round === 3) {
    // Раунд 3 (Синий / Редкий — средняя насыщенность)
    return "border border-blue-500/30 dark:border-blue-500/30 shadow-[0_0_75px_-8px_rgba(59,130,246,0.28),0_0_20px_rgba(59,130,246,0.12)] transition-all duration-500 ease-out";
  }
  // Раунд 4 (Фиолетовый / Эпический — высокая насыщенность)
  return cn(
    "border border-purple-500/40 dark:border-purple-500/40 shadow-[0_0_95px_-5px_rgba(168,85,247,0.40),0_0_30px_rgba(168,85,247,0.20)] transition-all duration-500 ease-out",
    isArchivingPulse && "animate-pulse"
  );
}

/**
 * Apple HIG Surface styling for cards:
 * Important: do NOT set shadow-<color> here because Tailwind's --tw-shadow-color variable
 * would override the colored ambient glow shadows from getRarityCardClasses!
 */
export const CARD_CONTAINER_SURFACE_CLASSES = cn(
  "rounded-3xl select-none",
  // Light Mode (Apple Premium Glass Card)
  "bg-white/90 text-neutral-900 backdrop-blur-2xl",
  // Dark Mode (Apple Dark Mode clean, deep & matte)
  "dark:bg-neutral-900/90 dark:text-neutral-100"
);

export const CARD_CONTAINER_BASE_CLASSES = cn(
  "w-full max-w-3xl min-h-[500px] h-[500px] p-8 md:p-10 flex flex-col justify-between items-center mx-auto relative group animate-card-enter select-none overflow-hidden",
  CARD_CONTAINER_SURFACE_CLASSES
);

export const AUDIO_BUTTON_CLASSES = cn(
  "w-9 h-9 shrink-0 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] dark:text-zinc-300 border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-center transition-colors duration-150 active:scale-95 disabled:opacity-50 cursor-pointer"
);

export function ProgressDots({ 
  level = 1, 
  max = 4, 
  isSealed = false,
  isLegendary = false,
  className 
}: { 
  level: number; 
  max?: number; 
  isSealed?: boolean;
  isLegendary?: boolean;
  className?: string; 
}) {
  // If sealed / vaporizing / legendary: all 4 dots burst into pure glowing gold
  if (isSealed || isLegendary) {
    return (
      <div className={cn("flex items-center gap-1.5 select-none shrink-0", className)}>
        {Array.from({ length: max }, (_, idx) => (
          <span
            key={idx}
            className="w-2 h-2 shrink-0 rounded-full transition-transform duration-200 bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,1)] scale-110 border-transparent"
          />
        ))}
      </div>
    );
  }

  const round = Math.max(1, Math.min(4, level || 1));
  // Round 1: 0 filled, 4 empty
  // Round 2: 1 filled (emerald), 3 empty
  // Round 3: 2 filled (blue), 2 empty
  // Round 4: 3 filled (purple), 1 empty
  const filledCount = round - 1;

  const getDotStyle = (idx: number) => {
    const isFilled = idx < filledCount;
    if (!isFilled) {
      return "w-2 h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 border border-black/10 dark:border-neutral-700/40 shadow-none";
    }
    if (round === 2) {
      return "w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] border-transparent";
    }
    if (round === 3) {
      return "w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)] border-transparent";
    }
    // round === 4
    return "w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.8)] border-transparent";
  };

  return (
    <div className={cn("flex items-center gap-1.5 select-none shrink-0", className)}>
      {Array.from({ length: max }, (_, idx) => (
        <span
          key={idx}
          className={cn(
            "shrink-0 transition-all duration-300",
            getDotStyle(idx)
          )}
        />
      ))}
    </div>
  );
}

export const CardContainer = forwardRef<HTMLDivElement, CardContainerProps>(
  ({ children, className, is3DFace = false, rarityRound, isArchivingPulse, isSealed, isLegendary, isVaporizing = false, style, ...props }, ref) => {
    const rarityClasses = getRarityCardClasses(rarityRound, isArchivingPulse, isSealed || isVaporizing, isLegendary);

    return (
      <div
        ref={ref}
        className={cn(
          is3DFace
            ? cn("absolute inset-0 w-full min-h-[500px] h-full p-8 md:p-10 flex flex-col justify-between items-center backface-hidden group", CARD_CONTAINER_SURFACE_CLASSES)
            : CARD_CONTAINER_BASE_CLASSES,
          rarityClasses,
          "transition-all duration-500 ease-out will-change-transform",
          isVaporizing && "opacity-0 blur-sm scale-[1.01] -translate-y-1 transition-all duration-250 ease-out pointer-events-none",
          className
        )}
        style={{
          contain: 'layout size',
          ...(is3DFace
            ? {
                WebkitBackfaceVisibility: 'hidden',
                backfaceVisibility: 'hidden',
              }
            : {}),
          ...style,
        }}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardContainer.displayName = 'CardContainer';
