'use client';

import React, { useState, useRef } from 'react';

interface TiltBookCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const TiltBookCard: React.FC<TiltBookCardProps> = ({
  children,
  className = '',
  onClick,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [transformStyle, setTransformStyle] = useState('');
  const [glareStyle, setGlareStyle] = useState({ opacity: 0, x: 50, y: 50 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -4;
    const rotateY = ((x - centerX) / centerX) * 4;

    setTransformStyle(
      `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.02, 1.02, 1.02)`
    );
    setGlareStyle({
      opacity: 0.14,
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
    });
  };

  const handleMouseLeave = () => {
    setTransformStyle('perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)');
    setGlareStyle((prev) => ({ ...prev, opacity: 0 }));
  };

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: transformStyle,
        transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      className={`relative cursor-pointer will-change-transform ${className}`}
    >
      {children}

      {/* Интерактивный блик по поверхности кожи */}
      <div
        className="pointer-events-none absolute inset-0 rounded-l-[3px] rounded-r-[5px] transition-opacity duration-300 z-30"
        style={{
          opacity: glareStyle.opacity,
          background: `radial-gradient(circle 260px at ${glareStyle.x}% ${glareStyle.y}%, rgba(255,255,255,0.7), transparent 75%)`,
          mixBlendMode: 'overlay',
        }}
      />
    </div>
  );
};
