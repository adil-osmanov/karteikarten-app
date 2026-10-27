'use client';

import React from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DueCardsBadgeProps {
  count?: number;
  language?: 'DE' | 'EN' | 'RU' | string;
  onClick?: () => void;
  className?: string;
}

const TEXT_MAP = {
  de: { action: 'Karten wiederholen', title: 'Karten zu wiederholen' },
  en: { action: 'Review Cards', title: 'cards to review' },
  ru: { action: 'Повторить карточки', title: 'карточек ждут повторения' },
} as const;

export function DueCardsBadge({ count = 0, language = 'DE', onClick, className }: DueCardsBadgeProps) {
  // If no due cards, completely hide the badge
  if (!count || count <= 0) {
    return null;
  }

  const normalizedLang = (language || 'DE').toLowerCase() as keyof typeof TEXT_MAP;
  const { action, title } = TEXT_MAP[normalizedLang] || TEXT_MAP.de;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2.5 px-5 py-2 rounded-full cursor-pointer select-none transition-all duration-200 active:scale-95 shadow-sm group",
        "bg-white/90 hover:bg-zinc-50 text-zinc-900 border border-zinc-200/80 hover:border-zinc-300 shadow-[0_4px_16px_rgba(0,0,0,0.06)]",
        "dark:bg-zinc-900/90 dark:hover:bg-zinc-800/90 dark:text-zinc-100 dark:border dark:border-white/10 dark:hover:border-white/20 dark:shadow-[0_4px_20px_rgba(0,0,0,0.5)]",
        className
      )}
      title={`${count} ${title}`}
    >
      <RotateCcw className="w-[15px] h-[15px] text-zinc-500 dark:text-zinc-400 group-hover:rotate-[-45deg] transition-transform duration-300 shrink-0" />
      <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-zinc-900 text-amber-300 dark:bg-white/10 dark:text-amber-400 dark:border dark:border-amber-400/20 tabular-nums">
        {count}
      </span>
      <span className="text-xs font-medium tracking-wide uppercase font-sans">
        {action}
      </span>
    </button>
  );
}
