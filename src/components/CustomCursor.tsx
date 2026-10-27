'use client';

import React, { useEffect, useRef } from 'react';

export const CustomCursor: React.FC = () => {
  const cursorRef = useRef<HTMLDivElement>(null);
  const target = useRef({ x: -100, y: -100 });
  const current = useRef({ x: -100, y: -100 });
  const isHovered = useRef(false);
  const isClicked = useRef(false);

  useEffect(() => {
    // Не запускаем на мобильных и тач-устройствах
    if (typeof window === 'undefined' || window.matchMedia('(pointer: coarse)').matches) {
      return;
    }

    // Добавляем глобальный класс для скрытия системного курсора
    document.documentElement.classList.add('custom-cursor-active');

    const handleMouseMove = (e: MouseEvent) => {
      target.current = { x: e.clientX, y: e.clientY };

      // Проверяем, находится ли курсор над интерактивным элементом
      const targetElement = e.target as HTMLElement | null;
      const isInteractive = Boolean(
        targetElement?.closest('button, a, input, select, textarea, [role="button"], .cursor-pointer')
      );
      isHovered.current = isInteractive;
    };

    const handleMouseDown = () => {
      isClicked.current = true;
    };

    const handleMouseUp = () => {
      isClicked.current = false;
    };

    const handleMouseLeave = () => {
      target.current = { x: -100, y: -100 };
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseleave', handleMouseLeave);

    let animationId: number;

    const render = () => {
      // Плавная интерполяция движения (Apple Lerp)
      const ease = isHovered.current ? 0.2 : 0.15;
      current.current.x += (target.current.x - current.current.x) * ease;
      current.current.y += (target.current.y - current.current.y) * ease;

      if (cursorRef.current) {
        const { x, y } = current.current;
        let scale = 1;
        if (isClicked.current) scale = 0.8;
        else if (isHovered.current) scale = 2.4;

        cursorRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${scale})`;
        
        // Меняем прозрачность и обводку при ховере
        if (isHovered.current) {
          cursorRef.current.classList.add('cursor-hovered');
        } else {
          cursorRef.current.classList.remove('cursor-hovered');
        }
      }

      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);

    return () => {
      document.documentElement.classList.remove('custom-cursor-active');
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div
      ref={cursorRef}
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 z-[9999] will-change-transform transition-all duration-150 ease-out hidden md:block"
      style={{
        transform: 'translate3d(-100px, -100px, 0) translate(-50%, -50%)',
      }}
    >
      {/* Ядро курсора: стеклянная точка с микро-свечением */}
      <div className="w-4 h-4 rounded-full bg-white/40 dark:bg-white/60 backdrop-blur-md border border-white/60 shadow-[0_0_12px_rgba(255,255,255,0.4)] transition-all duration-200 [.cursor-hovered_&]:w-6 [.cursor-hovered_&]:h-6 [.cursor-hovered_&]:bg-white/15 [.cursor-hovered_&]:dark:bg-white/20 [.cursor-hovered_&]:border-white/80 [.cursor-hovered_&]:shadow-[0_0_20px_rgba(255,255,255,0.6)]" />
    </div>
  );
};
