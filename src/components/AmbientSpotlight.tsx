'use client';

import React, { useEffect, useRef } from 'react';

export const AmbientSpotlight: React.FC = () => {
  const spotlightRef = useRef<HTMLDivElement>(null);
  const targetPos = useRef({ x: 0, y: 0 });
  const currentPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(pointer: coarse)').matches) return;

    targetPos.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    currentPos.current = { ...targetPos.current };

    const handleMouseMove = (e: MouseEvent) => {
      targetPos.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    let animationFrameId: number;

    const animate = () => {
      currentPos.current.x += (targetPos.current.x - currentPos.current.x) * 0.08;
      currentPos.current.y += (targetPos.current.y - currentPos.current.y) * 0.08;

      if (spotlightRef.current) {
        spotlightRef.current.style.transform = `translate3d(${currentPos.current.x - 300}px, ${currentPos.current.y - 300}px, 0)`;
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <div
        ref={spotlightRef}
        className="w-[600px] h-[600px] rounded-full blur-[140px] opacity-[0.04] dark:opacity-[0.05] bg-gradient-to-tr from-amber-200/40 via-sky-300/30 to-indigo-400/40 will-change-transform"
      />
    </div>
  );
};
