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
/**
 * Apple Ambient Rarity Glow Styles (WoW Word Rarity + Apple HIG):
 * 
 * - Round 1 (Common): Silver frosty contour with deep shadow
 * - Round 2 (Uncommon): Emerald / northern lights glow
 * - Round 3 (Rare): Sapphire / deep arctic blue glow (Screenshot 3)
 * - Round 4 (Epic): Amethyst / magical purple glow
 * - Legendary (SRS Repeat / Sealed Mastered): Amber / gold aura
 */
/**
 * Apple Tactile Card System (300g Bristol Paper in Light Mode / Alpine OLED in Dark Mode):
 * - Light Mode: Clean physical paper shadow without any colored neon halos.
 *   Rarity is indicated via subtle border tint and enamel ProgressDots.
 * - Dark Mode: Deep OLED shadow + atmospheric colored rarity aura.
 */
export const getRarityBorderClasses = (round: number = 1, isSealed: boolean = false, isLegendary: boolean = false): string => {
  if (isSealed || isLegendary || round >= 5) {
    return 'border-amber-500/40 dark:border-amber-400/40';
  }
  if (round === 4) {
    return 'border-purple-600/30 dark:border-purple-400/35';
  }
  if (round === 3) {
    return 'border-blue-600/30 dark:border-blue-500/35';
  }
  if (round === 2) {
    return 'border-emerald-600/25 dark:border-emerald-500/25';
  }
  return 'border-black/[0.08] dark:border-white/[0.09]';
};

const LIGHT_MODE_PAPER_SHADOW =
  'shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_16px_-4px_rgba(0,0,0,0.06),0_20px_40px_-10px_rgba(0,0,0,0.07),inset_0_1px_0_rgba(255,255,255,0.95)]';

export const getRarityShadowClasses = (round: number = 1, isSealed: boolean = false, isLegendary: boolean = false): string => {
  if (isSealed || isLegendary || round >= 5) {
    return `${LIGHT_MODE_PAPER_SHADOW} dark:shadow-[0_0_80px_-5px_rgba(245,158,11,0.28),0_0_25px_rgba(251,191,36,0.14),0_25px_60px_rgba(0,0,0,0.9)]`;
  }
  if (round === 4) {
    return `${LIGHT_MODE_PAPER_SHADOW} dark:shadow-[0_0_75px_-5px_rgba(168,85,247,0.28),0_0_25px_rgba(168,85,247,0.12),0_20px_50px_rgba(0,0,0,0.85)]`;
  }
  if (round === 3) {
    return `${LIGHT_MODE_PAPER_SHADOW} dark:shadow-[0_0_75px_-5px_rgba(59,130,246,0.28),0_0_20px_rgba(59,130,246,0.12),0_20px_50px_rgba(0,0,0,0.85)]`;
  }
  if (round === 2) {
    return `${LIGHT_MODE_PAPER_SHADOW} dark:shadow-[0_0_50px_-5px_rgba(16,185,129,0.16),0_15px_40px_rgba(0,0,0,0.8)]`;
  }
  return `${LIGHT_MODE_PAPER_SHADOW} dark:shadow-[0_25px_60px_rgba(0,0,0,0.95)]`;
};

export const getCardGlowStyles = (round: number = 1, isLegendary: boolean = false): string => {
  return cn(
    getRarityBorderClasses(round, false, isLegendary),
    getRarityShadowClasses(round, false, isLegendary)
  );
};

export function getRarityCardClasses(round?: number, isArchivingPulse?: boolean, isSealed?: boolean, isLegendary?: boolean): string {
  const r = round ?? 1;
  return cn(
    getRarityBorderClasses(r, isSealed, isLegendary),
    getRarityShadowClasses(r, isSealed, isLegendary),
    "transition-shadow duration-300 ease-out"
  );
}

/**
 * Apple HIG Surface styling for cards:
 * Light Mode: Tactile 300g Bristol Cardstock (bg-[#FAF9F6]).
 * Dark Mode: Deep OLED monolith (dark:bg-[#121214]/80 dark:backdrop-blur-3xl).
 */
export const CARD_CONTAINER_SURFACE_CLASSES = cn(
  "rounded-[28px] sm:rounded-[36px] select-none",
  // Light Mode (300g Bristol Cardstock)
  "bg-[#FAF9F6] text-[#1D1D1F]",
  // Dark Mode (Deep OLED Monolith)
  "dark:bg-[#121214]/80 dark:text-[#F5F5F7] dark:backdrop-blur-3xl"
);

export const CARD_CONTAINER_BASE_CLASSES = cn(
  "relative w-full max-w-4xl lg:max-w-5xl min-h-[320px] sm:min-h-[540px] h-auto sm:h-[600px] sm:max-h-[600px] mx-auto p-5 sm:p-10 rounded-[28px] sm:rounded-[36px] border flex flex-col justify-between items-center group select-none overflow-hidden",
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
      return 'bg-amber-400 dark:shadow-[0_0_10px_rgba(251,191,36,0.9)] scale-100';
    }

    // Раунд 4: 3 фиолетовые точки (индексы 0, 1, 2)
    if (level === 4 && index < 3) {
      return 'bg-purple-500 dark:bg-purple-400 dark:shadow-[0_0_10px_rgba(192,132,252,0.8)] scale-100';
    }

    // Раунд 3: 2 синие точки (индексы 0, 1)
    if (level === 3 && index < 2) {
      return 'bg-blue-500 dark:bg-sky-400 dark:shadow-[0_0_10px_rgba(56,189,248,0.75)] scale-100';
    }

    // Раунд 2: 1 зеленая точка (индекс 0)
    if (level === 2 && index < 1) {
      return 'bg-emerald-500 dark:bg-emerald-400 dark:shadow-[0_0_10px_rgba(52,211,153,0.7)] scale-100';
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
    const r = rarityRound ?? 1;
    const isSeal = Boolean(isSealed || isVaporizing);
    // Each 3D face carries its own background, border, and shadow so nothing remains stationary on CardStage
    const rarityClasses = getRarityCardClasses(r, isArchivingPulse, isSeal, isLegendary);

    return (
      <div
        ref={ref}
        className={cn(
          is3DFace
            ? cn("absolute inset-0 w-full h-full p-5 sm:p-10 border flex flex-col justify-between items-center [backface-visibility:hidden] group rounded-[28px] sm:rounded-[36px] overflow-hidden", CARD_CONTAINER_SURFACE_CLASSES)
            : CARD_CONTAINER_BASE_CLASSES,
          rarityClasses,
          isVaporizing && "opacity-0 scale-[1.01] transition-all duration-150 ease-out pointer-events-none",
          className
        )}
        style={{
          contain: is3DFace ? 'layout size' : 'layout',
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
