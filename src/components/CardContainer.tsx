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
  isVaporizing?: boolean;
}

/**
 * World of Warcraft Word Rarity Styling:
 * - Round 1 (Common): Matte minimal border, no glow.
 * - Round 2 (Uncommon): Soft emerald contour with subtle green ambient glow.
 * - Round 3 (Rare): Sapphire contour with noble blue ambient glow.
 * - Round 4 (Epic): Amethyst contour with magical purple ambient glow.
 * - The Sealing Ritual (Round 4 Mastered): Noble gold contour with golden aura.
 */
export function getRarityCardClasses(round?: number, isArchivingPulse?: boolean, isSealed?: boolean): string {
  if (isSealed) {
    return "border border-amber-400/40 shadow-[0_0_120px_rgba(245,158,11,0.45)] transition-all duration-300";
  }
  if (!round || round <= 1) {
    return "border border-white/10 dark:border-white/5 bg-neutral-900/90 shadow-2xl transition-all duration-700";
  }
  if (round === 2) {
    return "border border-emerald-500/20 shadow-[0_0_80px_-15px_rgba(16,185,129,0.25)] transition-all duration-700";
  }
  if (round === 3) {
    return "border border-blue-500/20 shadow-[0_0_90px_-15px_rgba(59,130,246,0.28)] transition-all duration-700";
  }
  // Round 4 (Purple / Epic)
  return cn(
    "border border-purple-500/25 shadow-[0_0_100px_-12px_rgba(168,85,247,0.32)] transition-all duration-700",
    isArchivingPulse && "shadow-[0_0_110px_rgba(168,85,247,0.45)] animate-pulse"
  );
}

/**
 * Apple HIG Surface styling for cards:
 * - Light Mode: Pure white background 'bg-white' popping off Apple's system grouped '#f2f2f7' background,
 *   with an ultra-thin 'border-black/[0.06]' border and diffused multi-layer shadow 'shadow-[0_12px_32px_rgba(0,0,0,0.05),_0_2px_6px_rgba(0,0,0,0.03)]'.
 * - Dark Mode: Subtle vertical gradient 'from-[#1e1e22] to-[#141416]', border 'border-white/[0.08]',
 *   deep shadow 'shadow-[0_20px_50px_rgba(0,0,0,0.6)]', and backdrop-blur.
 * - Top specular highlight rim light on dark mode.
 */
export const CARD_CONTAINER_SURFACE_CLASSES = cn(
  "rounded-[32px] border transition-all duration-300 select-none",
  // Light Mode (Apple Pure White Card)
  "bg-white",
  // Dark Mode (Apple Dark Mode clean, deep & matte)
  "dark:bg-[#1c1c1e]"
);

export const CARD_CONTAINER_BASE_CLASSES = cn(
  "w-full max-w-[760px] min-h-[460px] p-8 sm:p-12 pb-9 sm:pb-12 flex flex-col justify-between mx-auto relative group animate-card-enter",
  CARD_CONTAINER_SURFACE_CLASSES
);

export const AUDIO_BUTTON_CLASSES = cn(
  "w-9 h-9 shrink-0 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] dark:text-zinc-300 border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-center transition-colors duration-150 active:scale-95 disabled:opacity-50 cursor-pointer"
);

export function ProgressDots({ 
  level = 1, 
  max = 4, 
  isSealed = false,
  className 
}: { 
  level: number; 
  max?: number; 
  isSealed?: boolean;
  className?: string; 
}) {
  // If sealed / vaporizing: all 4 dots burst synchronously into pure glowing gold
  if (isSealed) {
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
      return "w-2 h-2 rounded-full bg-neutral-800 border border-neutral-700/40 shadow-none";
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
  ({ children, className, is3DFace = false, rarityRound, isArchivingPulse, isSealed, isVaporizing = false, style, ...props }, ref) => {
    const rarityClasses = getRarityCardClasses(rarityRound, isArchivingPulse, isSealed || isVaporizing);

    return (
      <div
        ref={ref}
        className={cn(
          is3DFace
            ? cn("absolute inset-0 p-8 sm:p-12 flex flex-col justify-between backface-hidden group", CARD_CONTAINER_SURFACE_CLASSES)
            : CARD_CONTAINER_BASE_CLASSES,
          rarityClasses,
          "relative transition-all duration-400 ease-out will-change-transform",
          isVaporizing && "scale-[1.02] -translate-y-2 opacity-0 blur-md brightness-150 shadow-[0_0_120px_rgba(245,158,11,0.45)] border-amber-400/40 pointer-events-none",
          className
        )}
        style={{
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
