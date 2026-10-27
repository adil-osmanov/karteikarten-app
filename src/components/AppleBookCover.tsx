'use client';

import React, { useState, useRef, useEffect } from 'react';

interface AppleBookCoverProps {
  imageSrc?: string;
  lightImageSrc?: string | null;
  darkImageSrc?: string | null;
  tintColor?: string;
  title: string;
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
  className = '',
  onEdit,
  onDelete,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [menuOpen]);

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

      {/* 2. Основной блок обложки книги: подъем -translate-y-1.5 и усиление тени строго на обложке */}
      <div 
        className="relative overflow-hidden aspect-[1/1.38] rounded-l-[3px] rounded-r-[8px] bg-zinc-900 shadow-[-3px_6px_16px_rgba(0,0,0,0.6),_10px_20px_32px_rgba(0,0,0,0.45)] transition-all duration-300 ease-out group-hover:-translate-y-1.5 group-hover:shadow-[-4px_10px_24px_rgba(0,0,0,0.65),_14px_28px_40px_rgba(0,0,0,0.5)] z-10"
        style={hasImage ? undefined : { backgroundColor: tintColor || '#1C1C1E' }}
      >
        {/* Изображение обложки */}
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

        {/* 5. Минималистичная кнопка действий «···» (три точки) */}
        {(onEdit || onDelete) && (
          <div ref={menuRef} className="absolute top-2.5 right-2.5 z-40">
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }} 
              className="w-7 h-7 rounded-full bg-black/40 backdrop-blur-md text-white/70 hover:text-white hover:bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-md cursor-pointer"
              title="Aktionen"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <circle cx="5" cy="12" r="1.75"/>
                <circle cx="12" cy="12" r="1.75"/>
                <circle cx="19" cy="12" r="1.75"/>
              </svg>
            </button>

            {menuOpen && (
              <div 
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-8 w-36 py-1 bg-white/95 dark:bg-zinc-800/95 backdrop-blur-xl rounded-xl shadow-xl border border-black/5 dark:border-white/10 z-50 text-left animate-in fade-in zoom-in-95 duration-100"
              >
                {onEdit && (
                  <button
                    type="button"
                    onClick={(e) => {
                      setMenuOpen(false);
                      onEdit(e);
                    }}
                    className="w-full px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <svg className="w-3.5 h-3.5 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                    </svg>
                    Bearbeiten
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={(e) => {
                      setMenuOpen(false);
                      onDelete(e);
                    }}
                    className="w-full px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <svg className="w-3.5 h-3.5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    Löschen
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
