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
    ["SHIFT", "y", "x", "c", "v", "b", "n", "m", "ß"],
    ["SPACE", "BACKSPACE"]
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
    let extraClasses = "flex-1"; // Proportional width (1 unit)

    const isFunctional = key === "SHIFT" || key === "BACKSPACE";

    if (key === "SHIFT") {
      content = <ArrowBigUp size={22} className={cn(isShifted ? "fill-current" : "")} strokeWidth={isShifted ? 2.5 : 2} />;
      extraClasses = "flex-[3]"; // Exactly 3 units to balance 8 letters = 11 total
    } else if (key === "BACKSPACE") {
      content = <Delete size={22} strokeWidth={2.5} />;
      extraClasses = "flex-[3]"; // Exactly 3 units (same size as Shift)
    } else if (key === "SPACE") {
      content = <span className="text-[15px] font-semibold opacity-40">Leerzeichen</span>;
      extraClasses = "flex-[8]"; // Exactly 8 units (3 + 8 = 11 total for the row)
    }

    // Active state classes for premium feeling
    const baseClasses = "flex items-center justify-center rounded-[8px] shadow-sm h-12 text-[20px] font-medium transition-all duration-75 select-none";
    
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
    <div className={cn("w-full max-w-[600px] mx-auto p-2.5 bg-gray-200/80 dark:bg-[#252525] rounded-2xl flex flex-col gap-2.5", className)}>
      {rows.map((row, idx) => (
        <div key={idx} className="flex justify-center gap-1.5 w-full">
          {row.map(key => renderKey(key))}
        </div>
      ))}
    </div>
  );
}
