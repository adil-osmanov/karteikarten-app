'use client';

import React, { useState, useRef, useEffect } from 'react';

interface AppleBookCoverProps {
  imageSrc?: string;
  lightImageSrc?: string | null;
  darkImageSrc?: string | null;
  tintColor?: string;
  title: string;
  className?: string;
  priority?: boolean;
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
  priority = false,
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
    <div className={`group relative cursor-pointer select-none ${className}`}>
      {/* Срез бумажных страниц справа (выглядывает сбоку из-под обложки) */}
      <div 
        className="absolute right-0 top-1.5 bottom-1.5 w-2.5 bg-gradient-to-r from-zinc-300 via-zinc-100 to-zinc-200 dark:from-zinc-800 dark:via-zinc-650 dark:to-zinc-700 rounded-r-[3px] shadow-sm transform translate-x-1 group-hover:translate-x-1.5 transition-transform duration-300 ease-out -z-10" 
        aria-hidden="true"
      />

      {/* Контейнер книги с многослойной физической тенью и физикой Apple */}
      <div 
        className="relative aspect-[2/3] w-full rounded-r-[5px] rounded-l-[2px] overflow-hidden bg-zinc-900 shadow-[0_8px_18px_-4px_rgba(0,0,0,0.35),0_2px_4px_-1px_rgba(0,0,0,0.2)] dark:shadow-[0_12px_24px_-6px_rgba(0,0,0,0.7),0_2px_6px_rgba(0,0,0,0.5)] group-hover:-translate-y-2 group-hover:shadow-[0_20px_35px_-8px_rgba(0,0,0,0.5)] dark:group-hover:shadow-[0_22px_40px_-8px_rgba(0,0,0,0.9)] transition-all duration-300 ease-out transform-gpu will-change-transform"
        style={hasImage ? undefined : { backgroundColor: tintColor || '#1C1C1E' }}
      >
        {/* Исходная обложка */}
        {hasImage ? (
          <>
            {light && (
              <img
                src={light}
                alt={title}
                className={`w-full h-full object-cover select-none pointer-events-none ${dark && light !== dark ? 'dark:hidden' : ''}`}
                loading={priority ? 'eager' : 'lazy'}
                decoding="async"
              />
            )}
            {dark && light !== dark && (
              <img
                src={dark}
                alt={title}
                className="w-full h-full object-cover select-none pointer-events-none hidden dark:block"
                loading={priority ? 'eager' : 'lazy'}
                decoding="async"
              />
            )}
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center select-none pointer-events-none">
            <span className="text-white/80 font-bold text-sm line-clamp-3">{title}</span>
          </div>
        )}

        {/* Сгиб переплёта (вертикальная светотень у корешка слева) */}
        <div className="absolute inset-y-0 left-0 w-3.5 bg-gradient-to-r from-black/45 via-white/10 to-transparent pointer-events-none z-10" />
        
        {/* Микро-шов корешка */}
        <div className="absolute inset-y-0 left-2.5 w-[1px] bg-black/25 dark:bg-black/50 pointer-events-none z-10" />

        {/* Фаска твердого переплёта (тончайший блик по периметру) */}
        <div className="absolute inset-0 rounded-r-[5px] rounded-l-[2px] ring-1 ring-inset ring-white/20 dark:ring-white/10 pointer-events-none z-10" />

        {/* Деликатный скользящий блик при наведении */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/0 to-transparent group-hover:via-white/10 dark:group-hover:via-white/5 transition-opacity duration-500 pointer-events-none z-10" />

        {/* Минималистичная кнопка действий «···» (три точки) */}
        {(onEdit || onDelete) && (
          <div ref={menuRef} className="absolute top-2.5 right-2.5 z-40">
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }} 
              className="w-7 h-7 rounded-full bg-black/50 text-white/80 hover:text-white hover:bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-md cursor-pointer"
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
                className="absolute right-0 top-8 w-36 py-1 bg-white dark:bg-zinc-800 rounded-xl shadow-xl border border-black/10 dark:border-white/10 z-50 text-left animate-in fade-in zoom-in-95 duration-100"
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
