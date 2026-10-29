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
      {/* Контейнер книги с составной 3D-тенью Apple Books */}
      <div 
        className="relative aspect-[2/3] w-full rounded-r-[5px] rounded-l-[3px] overflow-hidden bg-zinc-900 shadow-[0_12px_24px_-6px_rgba(0,0,0,0.18),0_4px_10px_-2px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-[0_20px_45px_-10px_rgba(0,0,0,0.9),0_6px_18px_-4px_rgba(0,0,0,0.7)] group-hover:-translate-y-1.5 group-hover:shadow-[0_20px_35px_-8px_rgba(0,0,0,0.25),0_8px_16px_-4px_rgba(0,0,0,0.12)] dark:group-hover:shadow-[0_30px_60px_-12px_rgba(0,0,0,1),0_10px_24px_-4px_rgba(0,0,0,0.85)] transition-all duration-300 ease-out transform-gpu will-change-transform"
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

        {/* КОНТЕЙНЕР КОРЕШКА И ЖЕЛОБКА (SPINE & HINGE GROOVE) */}
        <div className="absolute inset-y-0 left-0 pointer-events-none z-10 select-none overflow-hidden rounded-l-[3px] w-[6%] min-w-[7px] max-w-[14px]">
          {/* 1. Объемное скругление самого левого ребра корешка (мягкий цилиндрический свет) */}
          <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-black/20 via-white/15 to-transparent mix-blend-overlay" />
          
          {/* 2. Мягкая тень ската желобка (не дает черных пятен на белом фоне) */}
          <div className="absolute inset-y-0 right-[2px] w-full bg-gradient-to-r from-transparent via-black/10 to-black/30 dark:to-black/60 mix-blend-multiply" />
          
          {/* 3. Физическая канавка шва (желобок переплета глубиной 1px) */}
          <div className="absolute inset-y-0 right-[1px] w-[1px] bg-black/35 dark:bg-black/70 mix-blend-multiply" />
          
          {/* 4. Световой реберный блик прямо рядом с канавкой (создает эффект продавленности) */}
          <div className="absolute inset-y-0 right-0 w-[1px] bg-white/40 dark:bg-white/20 mix-blend-screen" />
        </div>

        {/* Деликатный диагональный блик ламинации (чистый объем) */}
        <div className="absolute inset-0 pointer-events-none rounded-r-[5px] rounded-l-[3px] bg-gradient-to-tr from-black/10 via-transparent to-white/10 dark:from-black/30 dark:to-white/5 opacity-70" />

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
