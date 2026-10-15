'use client';

import React from 'react';
import { Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DueCardsBadgeProps {
  count?: number;
  onClick?: () => void;
  className?: string;
}

export function DueCardsBadge({ count = 0, onClick, className }: DueCardsBadgeProps) {
  // If no due cards, completely hide the badge (clean Apple HIG)
  if (!count || count <= 0) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 md:py-1.5 rounded-full backdrop-blur-md",
        "bg-black/[0.04] hover:bg-black/[0.08] active:bg-black/[0.12]",
        "dark:bg-white/[0.08] dark:hover:bg-white/[0.14] dark:active:bg-white/[0.18]",
        "border border-black/[0.08] dark:border-white/[0.12]",
        "shadow-sm active:scale-[0.96] transition-all duration-150 cursor-pointer select-none group",
        className
      )}
      title={`${count} карточек ждут повторения`}
    >
      <Layers className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-800 dark:group-hover:text-white transition-colors shrink-0" />
      <span className="text-xs font-semibold text-zinc-900 dark:text-white tabular-nums transition-colors">
        {count}
      </span>
      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">
        к повторению
      </span>
    </button>
  );
}
