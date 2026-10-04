import React, { useState, useCallback } from "react";
import { ArrowBigUp, Delete, CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface VirtualKeyboardProps {
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  onSubmit: () => void;
  className?: string;
}

export function VirtualKeyboard({ onKeyPress, onBackspace, onSubmit, className }: VirtualKeyboardProps) {
  const [isShifted, setIsShifted] = useState(false);

  const rows = [
    ["q", "w", "e", "r", "t", "z", "u", "i", "o", "p", "ü"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l", "ö", "ä"],
    ["SHIFT", "y", "x", "c", "v", "b", "n", "m", "ß", "BACKSPACE"],
    ["SPACE", "ENTER"]
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
    
    if (key === "ENTER") {
      onSubmit();
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
  }, [isShifted, onKeyPress, onBackspace, onSubmit]);

  const renderKey = (key: string) => {
    let content: React.ReactNode = isShifted ? key.toUpperCase() : key;
    let extraClasses = "flex-1 min-w-[28px]"; // Default proportional width

    if (key === "SHIFT") {
      content = <ArrowBigUp size={20} className={cn(isShifted ? "fill-current" : "")} strokeWidth={isShifted ? 2.5 : 2} />;
      extraClasses = "w-[44px] flex-none bg-gray-300/60 dark:bg-[#3A3A3A]"; // Slightly distinct background for functional keys
    } else if (key === "BACKSPACE") {
      content = <Delete size={20} strokeWidth={2.5} />;
      extraClasses = "w-[44px] flex-none bg-gray-300/60 dark:bg-[#3A3A3A]";
    } else if (key === "SPACE") {
      content = <span className="text-[13px] font-semibold opacity-40">Leerzeichen</span>;
      extraClasses = "flex-[3]";
    } else if (key === "ENTER") {
      content = <CornerDownLeft size={18} strokeWidth={2.5} />;
      extraClasses = "flex-1 bg-blue-500 text-white dark:bg-blue-600 border-none";
    }

    // Active state classes for premium feeling
    const baseClasses = "flex items-center justify-center rounded-lg shadow-sm h-11 text-[17px] font-semibold transition-all duration-75 select-none";
    const colorClasses = key === "ENTER" 
      ? "active:bg-blue-600 dark:active:bg-blue-700 active:scale-[0.97]"
      : "bg-white dark:bg-[#4A4A4A] text-black dark:text-white active:bg-gray-300 dark:active:bg-[#5A5A5A] active:scale-[0.97]";

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
    <div className={cn("w-full max-w-[500px] mx-auto p-2 bg-gray-200/80 dark:bg-[#252525] rounded-xl flex flex-col gap-2", className)}>
      {rows.map((row, idx) => (
        <div key={idx} className="flex justify-center gap-1.5 w-full">
          {row.map(key => renderKey(key))}
        </div>
      ))}
    </div>
  );
}
