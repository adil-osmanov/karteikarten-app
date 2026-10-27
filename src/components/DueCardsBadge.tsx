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
  DE: { action: 'Karten wiederholen', title: 'Karten zu wiederholen' },
  EN: { action: 'Cards to review', title: 'cards to review' },
  RU: { action: 'Карточек повторить', title: 'карточек ждут повторения' },
} as const;

export function DueCardsBadge({ count = 0, language = 'DE', onClick, className }: DueCardsBadgeProps) {
  // If no due cards, completely hide the badge
  if (!count || count <= 0) {
    return null;
  }

  const langKey = (language in TEXT_MAP ? language : 'DE') as keyof typeof TEXT_MAP;
  const { action, title } = TEXT_MAP[langKey];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full cursor-pointer select-none",
        "bg-zinc-950 text-white hover:bg-zinc-800 shadow-[0_8px_20px_rgba(0,0,0,0.16)]",
        "dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 dark:shadow-[0_0_25px_rgba(255,255,255,0.16)]",
        "transition-all duration-200 active:scale-95 group",
        className
      )}
      title={`${count} ${title}`}
    >
      <RotateCcw className="w-[15px] h-[15px] text-white/80 dark:text-zinc-950/80 group-hover:rotate-[-45deg] transition-transform duration-300 shrink-0" />
      <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-blue-600 text-white shadow-sm tabular-nums">
        {count}
      </span>
      <span className="text-xs font-semibold tracking-wider uppercase font-sans">
        {action}
      </span>
    </button>
  );
}
