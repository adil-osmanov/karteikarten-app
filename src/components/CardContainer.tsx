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
  if (isSealed || isLegendary || (round !== undefined && round >= 5)) {
    return "border border-amber-400/40 shadow-[0_0_80px_-5px_rgba(245,158,11,0.28),0_0_25px_rgba(251,191,36,0.14),0_25px_60px_rgba(0,0,0,0.9)] transition-all duration-500 ease-out";
  }
  if (!round || round <= 1) {
    // Раунд 1 (Старт / 0 активных точек)
    return "border border-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.85)] transition-all duration-500 ease-out";
  }
  if (round === 2) {
    // Раунд 2 (Зеленый / 1 активная точка)
    return "border border-emerald-500/25 shadow-[0_0_40px_-5px_rgba(16,185,129,0.12),0_15px_40px_rgba(0,0,0,0.8)] transition-all duration-500 ease-out";
  }
  if (round === 3) {
    // Раунд 3 (Синий / 2 активные точки)
    return "border border-blue-500/30 shadow-[0_0_60px_-5px_rgba(59,130,246,0.20),0_0_20px_rgba(59,130,246,0.08),0_20px_50px_rgba(0,0,0,0.8)] transition-all duration-500 ease-out";
  }
  // Раунд 4 (Фиолетовый / 3 активные точки)
  return cn(
    "border border-purple-400/35 shadow-[0_0_75px_-5px_rgba(168,85,247,0.28),0_0_25px_rgba(168,85,247,0.12),0_20px_50px_rgba(0,0,0,0.85)] transition-all duration-500 ease-out",
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
  "w-full max-w-3xl min-h-[480px] h-[480px] p-8 md:p-10 flex flex-col justify-between items-center mx-auto relative group animate-card-enter select-none overflow-hidden",
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
  const isGold = isSealed || isLegendary || level >= 5;

  const getDotStyles = (index: number) => {
    // 4 Золотые точки (Запечатано / Повторение / Ранг >= 5)
    if (isGold) {
      return 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.85)] scale-100';
    }

    // Раунд 4: 3 фиолетовые точки (индексы 0, 1, 2)
    if (level === 4 && index < 3) {
      return 'bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.7)] scale-100';
    }

    // Раунд 3: 2 синие точки (индексы 0, 1)
    if (level === 3 && index < 2) {
      return 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.65)] scale-100';
    }

    // Раунд 2: 1 зеленая точка (индекс 0)
    if (level === 2 && index < 1) {
      return 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] scale-100';
    }

    // Раунд 1 (0 точек) или неактивный слот:
    return 'bg-white/10 dark:bg-white/[0.08] scale-90';
  };

  return (
    <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/[0.03] border border-white/5 backdrop-blur-sm select-none shrink-0", className)}>
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
            ? cn("absolute inset-0 w-full min-h-[480px] h-full p-8 md:p-10 flex flex-col justify-between items-center backface-hidden group", CARD_CONTAINER_SURFACE_CLASSES)
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
