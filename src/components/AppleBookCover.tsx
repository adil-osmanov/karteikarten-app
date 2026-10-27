'use client';

import React from 'react';

interface AppleBookCoverProps {
  imageSrc?: string;
  lightImageSrc?: string | null;
  darkImageSrc?: string | null;
  tintColor?: string;
  title: string;
  badge?: string;
  badgeIcon?: React.ComponentType<{ className?: string }>;
  badgeColor?: string;
  className?: string;
  onEdit?: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
}

export const AppleBookCover: React.FC<AppleBookCoverProps> = ({
  imageSrc,
  lightImageSrc,
  darkImageSrc,
  tintColor,
  title,
  badge,
  badgeIcon: BadgeIcon,
  badgeColor,
  className = '',
  onEdit,
  onDelete,
}) => {
  const light = lightImageSrc || imageSrc;
  const dark = darkImageSrc || imageSrc;
  const hasImage = Boolean(light || dark);

  return (
    <div className={`relative group select-none ${className}`}>
      {/* 1. Срез страниц сзади (толщина книги) */}
      <div 
        aria-hidden="true"
        className="absolute top-[3px] bottom-[3px] right-[-4px] w-[8px] rounded-r-[4px] bg-gradient-to-r from-zinc-400 via-zinc-200 to-zinc-300 dark:from-zinc-700 dark:via-zinc-600 dark:to-zinc-500 shadow-sm z-0"
      />

      {/* 2. Основной блок обложки книги */}
      <div 
        className="relative overflow-hidden aspect-[1/1.38] rounded-l-[3px] rounded-r-[8px] bg-zinc-900 shadow-[-3px_6px_16px_rgba(0,0,0,0.6),_10px_20px_32px_rgba(0,0,0,0.45)] transition-transform duration-300 ease-out group-hover:-translate-y-1 z-10"
        style={hasImage ? undefined : { backgroundColor: tintColor || '#1C1C1E' }}
      >
        {/* Изображение обложки (с поддержкой светлой/темной темы) */}
        {hasImage ? (
          <>
            {light && (
              <img
                src={light}
                alt={title}
                className={`w-full h-full object-cover object-center ${dark && light !== dark ? 'dark:hidden' : ''}`}
                loading="lazy"
              />
            )}
            {dark && light !== dark && (
              <img
                src={dark}
                alt={title}
                className="w-full h-full object-cover object-center hidden dark:block"
                loading="lazy"
              />
            )}
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
            <span className="text-white/80 font-bold text-sm line-clamp-3">{title}</span>
          </div>
        )}

        {/* 3. Реалистичный корешок (Spine Crease & Highlights) */}
        <div 
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-[24px] z-20"
          style={{
            background: 'linear-gradient(90deg, rgba(0,0,0,0.45) 0%, rgba(255,255,255,0.22) 28%, rgba(0,0,0,0.35) 75%, rgba(0,0,0,0.02) 100%)',
          }}
        />

        {/* Тонкий желобок сгиба обложки (Hinge line) */}
        <div 
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-[20px] w-[1px] bg-black/25 dark:bg-black/40 z-20"
        />

        {/* 4. Мягкий виньетирующий градиент по краю обложки */}
        <div 
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-l-[3px] rounded-r-[8px] ring-1 ring-inset ring-white/10 z-20"
        />

        {/* Action Buttons: Native macOS Buttons on hover */}
        {(onEdit || onDelete) && (
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-40">
            {onEdit && (
              <button 
                type="button"
                onClick={onEdit} 
                className="w-7 h-7 rounded-full bg-zinc-900/80 hover:bg-zinc-800 border border-white/15 flex items-center justify-center text-zinc-300 hover:text-white transition-all active:scale-95 shadow-md cursor-pointer backdrop-blur-sm"
                title="Bearbeiten"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                </svg>
              </button>
            )}
            {onDelete && (
              <button 
                type="button"
                onClick={onDelete} 
                className="w-7 h-7 rounded-full bg-zinc-900/80 hover:bg-zinc-800 border border-white/15 flex items-center justify-center text-zinc-300 hover:text-white transition-all active:scale-95 shadow-md cursor-pointer backdrop-blur-sm"
                title="Löschen"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Плашка Blitzkarten / режима книги внизу */}
        {badge && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none w-max max-w-[90%]">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold tracking-wider uppercase bg-black/60 dark:bg-black/75 backdrop-blur-md text-amber-300/90 border border-amber-400/20 shadow-md">
              {BadgeIcon ? (
                <BadgeIcon className={`w-3 h-3 ${badgeColor || 'text-amber-400'}`} />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              )}
              <span className="truncate">{badge}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
