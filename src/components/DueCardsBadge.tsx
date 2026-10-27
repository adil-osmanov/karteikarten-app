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
        "inline-flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700/80 text-zinc-600 dark:text-zinc-400 text-xs px-2.5 py-1 rounded-full font-medium transition-all duration-150 cursor-pointer select-none active:scale-95",
        className
      )}
      title={`${count} ${title}`}
    >
      <RotateCcw className="w-3 h-3 text-blue-500 dark:text-blue-400 shrink-0" />
      <span className="font-semibold text-zinc-900 dark:text-zinc-100 font-mono tabular-nums">
        {count}
      </span>
      <span>
        {badge}
      </span>
    </button>
  );
}
