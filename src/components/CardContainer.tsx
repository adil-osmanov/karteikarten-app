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
 * Apple Seasonal System & WoW Word Rarity Styling:
 * 
 * Dark Mode (Alpine Winter / Deep Nordic Night):
 * - Round 1 (Common): Silver frosty contour with deep shadow
 * - Round 2 (Uncommon): Frosty emerald / northern lights glow
 * - Round 3 (Rare): Deep arctic sapphire aura
 * - Round 4 (Epic): Twilight frosty amethyst glow
 * - Legendary (SRS Repeat / Sealed Mastered): Cold northern gold/amber aura
 * 
 * Light Mode (Nordic Summer / Apple Solstice):
 * - Round 1 (Common): Clean white monolith with soft ambient shadow
 * - Round 2 (Uncommon): Fresh meadow green aura
 * - Round 3 (Rare): Azure sky aura
 * - Round 4 (Epic): Warm sunset twilight purple aura
 * - Legendary (SRS Repeat / Sealed Mastered): Warm midday sun / golden amber aura
 */
export function getRarityCardClasses(round?: number, isArchivingPulse?: boolean, isSealed?: boolean, isLegendary?: boolean): string {
  const isGold = isSealed || isLegendary || (round !== undefined && round >= 5);
  if (isGold) {
    return cn(
      "border border-amber-500/45 shadow-[0_20px_60px_rgba(245,158,11,0.22)]",
      "dark:border-amber-300/40 dark:shadow-[0_0_90px_rgba(251,191,36,0.28),0_25px_60px_rgba(0,0,0,0.9)]",
      "transition-all duration-500 ease-out"
    );
  }
  if (!round || round <= 1) {
    return cn(
      "border border-black/[0.05] shadow-[0_20px_50px_rgba(0,0,0,0.05)]",
      "dark:border-white/[0.08] dark:shadow-[0_25px_60px_rgba(0,0,0,0.95)]",
      "transition-all duration-500 ease-out"
    );
  }
  if (round === 2) {
    return cn(
      "border border-emerald-600/25 shadow-[0_15px_45px_rgba(16,185,129,0.14)]",
      "dark:border-emerald-400/25 dark:shadow-[0_0_50px_-5px_rgba(52,211,153,0.15),0_25px_60px_rgba(0,0,0,0.9)]",
      "transition-all duration-500 ease-out"
    );
  }
  if (round === 3) {
    return cn(
      "border border-sky-600/30 shadow-[0_15px_50px_rgba(14,165,233,0.18)]",
      "dark:border-sky-400/30 dark:shadow-[0_0_65px_-5px_rgba(56,189,248,0.22),0_25px_60px_rgba(0,0,0,0.9)]",
      "transition-all duration-500 ease-out"
    );
  }
  // Round 4 (Epic)
  return cn(
    "border border-purple-600/30 shadow-[0_15px_55px_rgba(147,51,234,0.18)]",
    "dark:border-purple-400/35 dark:shadow-[0_0_80px_-5px_rgba(192,132,252,0.28),0_25px_60px_rgba(0,0,0,0.9)]",
    "transition-all duration-500 ease-out",
    isArchivingPulse && "animate-pulse"
  );
}

/**
 * Apple HIG Surface styling for cards:
 * High-density glass surface with backdrop-blur-3xl and theme-adaptive text.
 */
export const CARD_CONTAINER_SURFACE_CLASSES = cn(
  "rounded-[36px] select-none kraft-card-surface transition-all duration-300",
  // Light Mode (Nordic Summer / Apple Solstice)
  "bg-white/75 text-[#1D1D1F] backdrop-blur-3xl border border-black/[0.06] shadow-[0_30px_70px_rgba(0,0,0,0.06)]",
  // Dark Mode (Alpine Frost / Deep Nordic Night)
  "dark:bg-neutral-900/40 dark:text-[#F5F5F7] dark:backdrop-blur-3xl dark:border-white/[0.09]"
);

export const CARD_CONTAINER_BASE_CLASSES = cn(
  "relative w-full max-w-4xl lg:max-w-5xl h-[70vh] min-h-[560px] max-h-[720px] mx-auto p-8 md:p-12 rounded-[36px] flex flex-col justify-between items-center group animate-card-enter select-none overflow-hidden transition-all duration-300",
  CARD_CONTAINER_SURFACE_CLASSES
);

export const AUDIO_BUTTON_CLASSES = cn(
  "w-11 h-11 shrink-0 rounded-full bg-black/[0.04] hover:bg-black/[0.08] text-[#1D1D1F] dark:bg-white/[0.08] dark:hover:bg-white/[0.14] dark:text-[#F5F5F7] border border-black/[0.06] dark:border-white/[0.1] backdrop-blur-md flex items-center justify-center transition-all duration-150 active:scale-95 disabled:opacity-40 cursor-pointer shadow-sm"
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
  const isGold = isSealed || isLegendary || level >= 5;

  const getDotStyles = (index: number) => {
    // 4 Золотые точки (Запечатано / Повторение / Ранг >= 5)
    if (isGold) {
      return 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.9)] scale-100';
    }

    // Раунд 4: 3 фиолетовые точки (индексы 0, 1, 2)
    if (level === 4 && index < 3) {
      return 'bg-purple-400 shadow-[0_0_10px_rgba(192,132,252,0.8)] scale-100';
    }

    // Раунд 3: 2 синие точки (индексы 0, 1)
    if (level === 3 && index < 2) {
      return 'bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.75)] scale-100';
    }

    // Раунд 2: 1 зеленая точка (индекс 0)
    if (level === 2 && index < 1) {
      return 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)] scale-100';
    }

    // Раунд 1 (0 точек) или неактивный слот:
    return 'bg-black/10 dark:bg-white/[0.12] scale-90';
  };

  return (
    <div className={cn("flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/[0.03] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/10 backdrop-blur-md select-none shrink-0", className)}>
      {Array.from({ length: max }, (_, idx) => (
        <div
          key={idx}
          className={cn(
            "w-2 h-2 rounded-full transition-all duration-300 ease-out",
            getDotStyles(idx)
          )}
        />
      ))}
    </div>
  );
}

export const RoundDots = ProgressDots;

export const CardContainer = forwardRef<HTMLDivElement, CardContainerProps>(
  ({ children, className, is3DFace = false, rarityRound, isArchivingPulse, isSealed, isLegendary, isVaporizing = false, style, ...props }, ref) => {
    const rarityClasses = getRarityCardClasses(rarityRound, isArchivingPulse, isSealed || isVaporizing, isLegendary);

    return (
      <div
        ref={ref}
        className={cn(
          is3DFace
            ? cn("absolute inset-0 w-full h-full p-8 md:p-12 flex flex-col justify-between items-center backface-hidden group rounded-[36px]", CARD_CONTAINER_SURFACE_CLASSES)
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
