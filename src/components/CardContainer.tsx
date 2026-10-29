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
 * - Subtle vertical gradient (from #1c1c1e to #141416 in dark mode)
 * - Thin border: border-white/[0.08] in dark mode
 * - Soft diffuse shadow: shadow-[0_20px_50px_rgba(0,0,0,0.6)]
 * - Gentle backdrop-blur for depth
 * - Top specular highlight (glass edge reflection)
 */
export const CARD_CONTAINER_SURFACE_CLASSES = cn(
  "rounded-[32px] border transition-all duration-200 select-none",
  // Light Mode (Apple clean glass depth)
  "bg-gradient-to-b from-white via-[#fafafc] to-[#f4f4f7] border-black/[0.06] shadow-[0_12px_40px_rgba(0,0,0,0.06)]",
  // Dark Mode (Apple HIG layered depth & subtle vertical gradient)
  "dark:bg-gradient-to-b dark:from-[#1c1c1e] dark:to-[#141416] dark:border-white/[0.08] dark:shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-md",
  // Top specular highlight reflection
  "before:absolute before:inset-x-0 before:top-0 before:h-px before:rounded-t-[32px] before:bg-gradient-to-r before:from-transparent before:via-white/[0.12] before:to-transparent before:pointer-events-none"
);

export const CARD_CONTAINER_BASE_CLASSES = cn(
  "w-full max-w-[760px] min-h-[460px] p-8 sm:p-12 pb-9 sm:pb-12 flex flex-col justify-between mx-auto relative animate-card-appear",
  CARD_CONTAINER_SURFACE_CLASSES
);

export const CardContainer = forwardRef<HTMLDivElement, CardContainerProps>(
  ({ children, className, is3DFace = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          is3DFace
            ? cn("absolute inset-0 p-8 sm:p-12 flex flex-col justify-between backface-hidden", CARD_CONTAINER_SURFACE_CLASSES)
            : CARD_CONTAINER_BASE_CLASSES,
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardContainer.displayName = 'CardContainer';
