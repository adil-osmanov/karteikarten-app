import React, { useState, useCallback } from "react";
import { ArrowBigUp, Delete } from "lucide-react";
import { cn } from "@/lib/utils";

interface VirtualKeyboardProps {
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  className?: string;
}

export function VirtualKeyboard({ onKeyPress, onBackspace, className }: VirtualKeyboardProps) {
  const [isShifted, setIsShifted] = useState(false);

  const rows = [
    ["q", "w", "e", "r", "t", "z", "u", "i", "o", "p", "ü"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l", "ö", "ä"],
    ["y", "x", "c", "v", "b", "n", "m", "ß"],
    ["SHIFT", "SPACE", "BACKSPACE"]
  ];

  const handleKeyClick = useCallback((key: string) => {
    if (key === "SHIFT") {
      setIsShifted(prev => !prev);
      return;
    }
    
    if (key === "BACKSPACE") {
      onBackspace();
      return;
    }
    
    if (key === "SPACE") {
      onKeyPress(" ");
      return;
    }
    
    // Normal character
    const char = isShifted ? key.toUpperCase() : key;
    onKeyPress(char);
    
    // Auto-reset shift after a character is typed (iOS style)
    if (isShifted) setIsShifted(false);
  }, [isShifted, onKeyPress, onBackspace]);

  const renderKey = (key: string) => {
    let content: React.ReactNode = isShifted ? key.toUpperCase() : key;
    let extraClasses = "flex-1 min-w-[28px]"; // Default proportional width

    const isFunctional = key === "SHIFT" || key === "BACKSPACE";

    if (key === "SHIFT") {
      content = <ArrowBigUp size={24} className={cn(isShifted ? "fill-current" : "")} strokeWidth={isShifted ? 2.5 : 2} />;
      extraClasses = "flex-[1.25] flex-none";
    } else if (key === "BACKSPACE") {
      content = <Delete size={24} strokeWidth={2.5} />;
      extraClasses = "flex-[1.25] flex-none";
    } else if (key === "SPACE") {
      content = <span className="text-[15px] font-semibold opacity-40">Leerzeichen</span>;
      extraClasses = "flex-[5]";
    }

    // Active state classes for premium feeling
    const baseClasses = "flex items-center justify-center rounded-[8px] shadow-sm h-[52px] text-[22px] font-medium transition-all duration-75 select-none";
    
    const bgColor = isFunctional 
      ? "bg-gray-300/80 dark:bg-[#323232]"
      : "bg-white dark:bg-[#4A4A4A]";
      
    const activeBgColor = isFunctional
      ? "active:bg-gray-400/80 dark:active:bg-[#202020]"
      : "active:bg-gray-300 dark:active:bg-[#5A5A5A]";

    const colorClasses = `${bgColor} ${activeBgColor} text-black dark:text-white active:scale-[0.96]`;

    return (
      <button
        key={key}
        type="button"
        onPointerDown={(e) => {
          e.preventDefault(); // Prevents input from losing focus
          handleKeyClick(key);
        }}
        style={{ touchAction: "manipulation" }} // Fix double-tap zoom
        className={cn(baseClasses, colorClasses, extraClasses)}
      >
        {content}
      </button>
    );
  };

  return (
    <div className={cn("w-full bg-[#D0D3D9]/90 dark:bg-[#1C1C1E]/95 backdrop-blur-xl pt-3 pb-[max(env(safe-area-inset-bottom),1.5rem)] px-1 sm:px-2 flex flex-col gap-2.5 border-t border-black/5 dark:border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]", className)}>
      {rows.map((row, idx) => (
        <div key={idx} className="flex justify-center gap-1.5 w-full">
          {row.map(key => renderKey(key))}
        </div>
      ))}
    </div>
  );
}
