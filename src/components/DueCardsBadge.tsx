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
        "h-8 px-3.5 rounded-full flex items-center gap-2 text-xs font-medium transition-all duration-200 active:scale-95 shadow-sm",
        "bg-white/80 dark:bg-zinc-900/80 border border-black/[0.08] dark:border-white/10 backdrop-blur-xl",
        "hover:bg-white hover:shadow-md hover:shadow-black/[0.04] hover:border-black/[0.12] dark:hover:bg-zinc-800/90 dark:hover:border-white/20",
        "text-zinc-800 dark:text-zinc-200 cursor-pointer select-none group",
        className
      )}
      title={`${count} ${title}`}
    >
      <RotateCcw className="w-3 h-3 text-blue-600 dark:text-blue-400 transition-transform duration-300 group-hover:-rotate-45 shrink-0" />
      <span className="font-semibold text-zinc-900 dark:text-white font-mono tabular-nums">
        {count}
      </span>
      <span className="text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">
        {badge}
      </span>
    </button>
  );
}
