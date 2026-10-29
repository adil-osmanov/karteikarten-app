'use client';

import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface CardContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  className?: string;
  is3DFace?: boolean;
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
  "rounded-[32px] border transition-all duration-200 select-none",
  // Light Mode (Apple Pure White Card)
  "bg-white border-black/[0.06] shadow-[0_12px_32px_rgba(0,0,0,0.05),_0_2px_6px_rgba(0,0,0,0.03)]",
  // Dark Mode (Apple Dark Mode clean, deep & matte)
  "dark:bg-[#1c1c1e] dark:border-white/[0.08] dark:shadow-2xl dark:shadow-black/50"
);

export const CARD_CONTAINER_BASE_CLASSES = cn(
  "w-full max-w-[760px] min-h-[460px] p-8 sm:p-12 pb-9 sm:pb-12 flex flex-col justify-between mx-auto relative animate-card-appear",
  CARD_CONTAINER_SURFACE_CLASSES
);

export const AUDIO_BUTTON_CLASSES = cn(
  "w-9 h-9 shrink-0 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] dark:text-zinc-300 border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-center transition-colors duration-150 active:scale-95 disabled:opacity-50 cursor-pointer"
);

export function ProgressDots({ 
  level = 0, 
  max = 4, 
  className 
}: { 
  level: number; 
  max?: number; 
  className?: string; 
}) {
  return (
    <div className={cn("flex items-center gap-1.5 select-none shrink-0", className)}>
      {Array.from({ length: max }, (_, idx) => {
        const step = idx + 1;
        const isCompleted = step <= level;
        return (
          <span
            key={step}
            className={cn(
              "w-2.5 h-2.5 shrink-0 rounded-full transition-all duration-200",
              isCompleted
                ? "bg-blue-600 dark:bg-blue-500 shadow-[0_0_8px_rgba(37,99,235,0.4)] dark:shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                : "bg-zinc-200 dark:bg-white/10"
            )}
          />
        );
      })}
    </div>
  );
}

export const CardContainer = forwardRef<HTMLDivElement, CardContainerProps>(
  ({ children, className, is3DFace = false, style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          is3DFace
            ? cn("absolute inset-0 p-8 sm:p-12 flex flex-col justify-between backface-hidden", CARD_CONTAINER_SURFACE_CLASSES)
            : CARD_CONTAINER_BASE_CLASSES,
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
