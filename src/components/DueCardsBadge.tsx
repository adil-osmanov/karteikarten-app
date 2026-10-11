'use client';

import React from 'react';
import { Layers } from 'lucide-react';

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
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full backdrop-blur-md bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 transition-all duration-200 cursor-pointer select-none group shadow-sm ${className || ''}`}
      title={`${count} карточек ждут повторения`}
    >
      <Layers className="w-3.5 h-3.5 text-white/60 group-hover:text-white transition-colors shrink-0" />
      <span className="text-xs font-medium tracking-wide text-white/80 group-hover:text-white transition-colors tabular-nums">
        {count} к повторению
      </span>
    </button>
  );
}
