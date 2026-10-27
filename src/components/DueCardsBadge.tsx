'use client';

import React from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DueCardsBadgeProps {
  count?: number;
  language?: 'DE' | 'EN' | 'RU';
  onClick?: () => void;
  className?: string;
}

const TEXT_MAP = {
  DE: {
    getText: (c: number) => `${c} Karten wiederholen`,
    title: 'Karten zu wiederholen',
  },
  EN: {
    getText: (c: number) => `${c} Cards to review`,
    title: 'Cards to review',
  },
  RU: {
    getText: (c: number) => `${c} Карточек повторить`,
    title: 'Карточек ждут повторения',
  },
} as const;

export function DueCardsBadge({ count = 0, language = 'DE', onClick, className }: DueCardsBadgeProps) {
  // If no due cards, completely hide the badge (clean Apple HIG)
  if (!count || count <= 0) {
    return null;
  }

  const langKey = (language in TEXT_MAP ? language : 'DE') as keyof typeof TEXT_MAP;
  const { getText, title } = TEXT_MAP[langKey];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 px-5 py-2.5 rounded-full",
        "bg-zinc-100/80 dark:bg-zinc-900/60 backdrop-blur-md",
        "border border-zinc-200/50 dark:border-zinc-800/80",
        "hover:bg-zinc-200/50 dark:hover:bg-zinc-850",
        "transition-all duration-150 active:scale-[0.98] shadow-sm cursor-pointer select-none group",
        className
      )}
      title={`${count} ${title}`}
    >
      <RotateCcw className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 group-hover:rotate-[-45deg] transition-transform duration-300 shrink-0" />
      <span className="text-xs font-semibold tracking-wide text-zinc-800 dark:text-zinc-200 uppercase font-sans">
        {getText(count)}
      </span>
    </button>
  );
}
