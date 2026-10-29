'use client';

import React from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DueCardsBadgeProps {
  count?: number;
  language?: 'DE' | 'EN' | 'RU' | string;
  onClick?: () => void;
  className?: string;
  allowZero?: boolean;
}

const TEXT_MAP = {
  de: { action: 'Karten wiederholen', title: 'Karten zu wiederholen' },
  en: { action: 'Review Cards', title: 'cards to review' },
  ru: { action: 'Повторить карточки', title: 'карточек ждут повторения' },
} as const;

export function DueCardsBadge({ count = 0, language = 'DE', onClick, className, allowZero = false }: DueCardsBadgeProps) {
  const hasDue = (count || 0) > 0;

  // If no due cards and allowZero is false, completely hide the badge
  if (!hasDue && !allowZero) {
    return null;
  }

  const normalizedLang = (language || 'DE').toLowerCase() as keyof typeof TEXT_MAP;
  const { action, title } = TEXT_MAP[normalizedLang] || TEXT_MAP.de;

  return (
    <button
      type="button"
      onClick={hasDue ? onClick : undefined}
      disabled={!hasDue}
      className={cn(
        "inline-flex items-center gap-2.5 px-4 py-2 rounded-full select-none transition-all duration-200 border",
        hasDue
          ? "cursor-pointer active:scale-95 group bg-white/90 hover:bg-blue-50/60 text-zinc-800 hover:text-blue-600 border-zinc-200/90 hover:border-blue-300 shadow-[0_2px_12px_rgba(0,0,0,0.04)] dark:bg-zinc-900/90 dark:hover:bg-blue-950/40 dark:text-zinc-100 dark:hover:text-blue-300 dark:border-white/10 dark:hover:border-blue-500/40 dark:shadow-[0_4px_20px_rgba(0,0,0,0.6)]"
          : "cursor-not-allowed opacity-60 bg-zinc-100/60 dark:bg-zinc-900/40 text-zinc-400 dark:text-zinc-500 border-zinc-200/60 dark:border-white/5",
        className
      )}
      title={hasDue ? `${count} ${title}` : undefined}
    >
      <RotateCcw className={cn(
        "w-3.5 h-3.5 shrink-0 transition-transform duration-300",
        hasDue 
          ? "text-blue-600 dark:text-blue-400 group-hover:rotate-[-45deg]" 
          : "text-zinc-400 dark:text-zinc-600"
      )} />
      <span className={cn(
        "px-2 py-0.5 rounded-full text-[11px] font-mono font-bold leading-none tabular-nums shadow-sm",
        hasDue
          ? "bg-blue-600 text-white shadow-blue-500/30 dark:bg-blue-500 dark:text-white dark:shadow-[0_0_12px_rgba(59,130,246,0.5)]"
          : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500"
      )}>
        {count || 0}
      </span>
      <span className={cn(
        "text-xs font-semibold tracking-wider uppercase transition-colors font-sans",
        hasDue
          ? "text-zinc-700 group-hover:text-zinc-950 dark:text-zinc-200 dark:group-hover:text-white"
          : "text-zinc-400 dark:text-zinc-500"
      )}>
        {action}
      </span>
    </button>
  );
}
