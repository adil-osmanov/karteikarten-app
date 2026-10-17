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
  DE: { badge: 'wiederholen', title: 'Karten zu wiederholen' },
  EN: { badge: 'review', title: 'cards to review' },
  RU: { badge: 'повторить', title: 'карточек ждут повторения' },
} as const;

export function DueCardsBadge({ count = 0, language = 'DE', onClick, className }: DueCardsBadgeProps) {
  // If no due cards, completely hide the badge (clean Apple HIG)
  if (!count || count <= 0) {
    return null;
  }

  const langKey = (language in TEXT_MAP ? language : 'DE') as keyof typeof TEXT_MAP;
  const { badge, title } = TEXT_MAP[langKey];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 px-3 rounded-full flex items-center gap-2 text-xs font-medium transition-all active:scale-95 shadow-sm",
        "bg-white border border-zinc-200/80 text-zinc-800 hover:bg-zinc-100 active:bg-zinc-200 hover:border-zinc-300",
        "dark:bg-blue-500/15 dark:border-blue-500/30 dark:text-blue-300 dark:hover:bg-blue-500/25",
        "cursor-pointer select-none",
        className
      )}
      title={`${count} ${title}`}
    >
      <RotateCcw className="w-3 h-3 text-zinc-700 dark:text-blue-400 shrink-0" />
      <span className="font-semibold text-zinc-900 dark:text-white font-mono tabular-nums">
        {count}
      </span>
      <span className="text-zinc-700 dark:text-blue-300/80">
        {badge}
      </span>
    </button>
  );
}
