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
    return "border-amber-400/90 ring-2 ring-amber-400/40 shadow-[0_0_55px_-5px_rgba(251,191,36,0.35)] transition-all duration-300";
  }
  if (!round || round <= 1) {
    return "border-black/[0.06] dark:border-neutral-800 shadow-[0_12px_32px_rgba(0,0,0,0.05),_0_2px_6px_rgba(0,0,0,0.03)] dark:shadow-2xl dark:shadow-black/50";
  }
  if (round === 2) {
    return "border border-emerald-500/40 shadow-[0_0_35px_-8px_rgba(16,185,129,0.18)]";
  }
  if (round === 3) {
    return "border border-blue-500/50 shadow-[0_0_40px_-6px_rgba(59,130,246,0.22)]";
  }
  // Round 4 (Epic / Archive)
  return cn(
    "border border-purple-500/60 shadow-[0_0_45px_-5px_rgba(168,85,247,0.25)]",
    isArchivingPulse && "ring-2 ring-purple-400/80 shadow-[0_0_55px_rgba(168,85,247,0.45)] animate-pulse"
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
  "w-full max-w-[760px] min-h-[460px] p-8 sm:p-12 pb-9 sm:pb-12 flex flex-col justify-between mx-auto relative animate-card-appear",
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
  // If sealed: all 4 dots burst into noble gold
  if (isSealed) {
    return (
      <div className={cn("flex items-center gap-1.5 select-none shrink-0", className)}>
        {Array.from({ length: max }, (_, idx) => (
          <span
            key={idx}
            className="w-2 h-2 shrink-0 rounded-full transition-all duration-300 bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.95)] border-transparent"
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
      return "w-2 h-2 rounded-full bg-neutral-800 border border-neutral-700/50 shadow-none";
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
  ({ children, className, is3DFace = false, rarityRound, isArchivingPulse, isSealed, style, ...props }, ref) => {
    const rarityClasses = getRarityCardClasses(rarityRound, isArchivingPulse, isSealed);

    return (
      <div
        ref={ref}
        className={cn(
          is3DFace
            ? cn("absolute inset-0 p-8 sm:p-12 flex flex-col justify-between backface-hidden", CARD_CONTAINER_SURFACE_CLASSES)
            : CARD_CONTAINER_BASE_CLASSES,
          rarityClasses,
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
