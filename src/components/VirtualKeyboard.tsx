import React, { useState, useCallback, useRef, useEffect } from "react";
import { ArrowBigUp, Delete } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VirtualKeyboardProps {
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  /** Expected next character for Dynamic Hit-Target Expansion (Apple patent algorithm) */
  expectedChar?: string;
  targetWord?: string;
  currentInput?: string;
  className?: string;
  docked?: boolean;
}

export const VirtualKeyboard = React.memo(function VirtualKeyboard({
  onKeyPress,
  onBackspace,
  expectedChar: explicitExpectedChar,
  targetWord,
  currentInput,
  className,
  docked = false
}: VirtualKeyboardProps) {
  const [isShifted, setIsShifted] = useState(false);
  const [activePressedKey, setActivePressedKey] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const keyRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const activeTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Compute expected character if not explicitly passed
  const expectedChar = explicitExpectedChar ?? (
    targetWord && currentInput !== undefined ? (targetWord[currentInput.length] || "") : ""
  );

  const rows = [
    ["q", "w", "e", "r", "t", "z", "u", "i", "o", "p", "ü"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l", "ö", "ä"],
    ["SHIFT", "y", "x", "c", "v", "b", "n", "m", "ß", "BACKSPACE"],
    ["_SPACER_LEFT", "SPACE", "_SPACER_RIGHT"]
  ];

  const registerKeyRef = useCallback((key: string, el: HTMLButtonElement | null) => {
    if (el) {
      keyRefs.current.set(key, el);
    } else {
      keyRefs.current.delete(key);
    }
  }, []);

  const triggerHaptic = useCallback(() => {
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(10);
      }
    } catch {
      // Haptics not supported or blocked by browser permissions
    }
  }, []);

  const triggerHighlight = useCallback((key: string) => {
    if (activeTimerRef.current) {
      clearTimeout(activeTimerRef.current);
    }
    setActivePressedKey(key);
    activeTimerRef.current = setTimeout(() => {
      setActivePressedKey(null);
    }, 100);
  }, []);

  useEffect(() => {
    return () => {
      if (activeTimerRef.current) {
        clearTimeout(activeTimerRef.current);
      }
    };
  }, []);

  const executeKeyAction = useCallback((key: string) => {
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
    const char = isShifted ? key.toUpperCase() : key.toLowerCase();
    onKeyPress(char);

    // Auto-reset Shift after typing a character (iOS Apple HIG standard)
    if (isShifted) {
      setIsShifted(false);
    }
  }, [isShifted, onKeyPress, onBackspace]);

  /**
   * Apple Dynamic Hit-Target Expansion (Weighted Distance Hit-Testing)
   * Measures touch (X,Y) and calculates Euclidean distance to all key centers:
   *   Distance = sqrt((touchX - centerX)^2 + (touchY - centerY)^2)
   * If key.toLowerCase() === expectedChar.toLowerCase(), EffectiveDistance = Distance * 0.45.
   * Otherwise EffectiveDistance = Distance * 1.0.
   */
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Prevent iOS text selection, zooming, callouts and system keyboard trigger
    e.preventDefault();

    const touchX = e.clientX;
    const touchY = e.clientY;

    const targetExpectedLower = expectedChar ? expectedChar.toLowerCase() : "";

    // 1. Direct hit on functional keys (SHIFT, BACKSPACE, SPACE) has instant priority
    let directFunctionalKey: string | null = null;
    for (const [key, el] of keyRefs.current.entries()) {
      if (key.startsWith("_SPACER_")) continue;
      if (key === "SHIFT" || key === "BACKSPACE" || key === "SPACE") {
        const rect = el.getBoundingClientRect();
        if (touchX >= rect.left && touchX <= rect.right && touchY >= rect.top && touchY <= rect.bottom) {
          directFunctionalKey = key;
          break;
        }
      }
    }

    let bestKey: string | null = directFunctionalKey;

    // 2. If not a direct functional key hit, calculate weighted Euclidean distance across all keys
    if (!bestKey) {
      let minEffectiveDistance = Infinity;

      for (const [key, el] of keyRefs.current.entries()) {
        if (key.startsWith("_SPACER_")) continue;

        const rect = el.getBoundingClientRect();
        let centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        // Wide space bar: clamp centerX to the nearest horizontal touch point within the key
        if (key === "SPACE") {
          centerX = Math.max(rect.left + 24, Math.min(rect.right - 24, touchX));
        }

        const dx = touchX - centerX;
        const dy = touchY - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Apple Dynamic Hit-Target Expansion Weight Factor:
        // Expected character gets 0.45 multiplier (>2x virtual catchment area)
        const isExpected = Boolean(
          targetExpectedLower &&
          key.length === 1 &&
          key.toLowerCase() === targetExpectedLower
        );
        const weight = isExpected ? 0.45 : 1.0;
        const effectiveDistance = distance * weight;

        if (effectiveDistance < minEffectiveDistance) {
          minEffectiveDistance = effectiveDistance;
          bestKey = key;
        }
      }
    }

    if (!bestKey) return;

    // Micro-feedback: Haptic pulse & visual highlight
    triggerHaptic();
    triggerHighlight(bestKey);

    // Execute character or command
    executeKeyAction(bestKey);
  }, [expectedChar, executeKeyAction, triggerHaptic, triggerHighlight]);

  const renderKey = (key: string) => {
    if (key.startsWith("_SPACER_")) {
      return <div key={key} style={{ flex: 1.5 }} className="pointer-events-none" />;
    }

    const isFunctional = key === "SHIFT" || key === "BACKSPACE" || key === "SPACE";
    const isPressed = activePressedKey === key;

    let content: React.ReactNode = isShifted ? key.toUpperCase() : key;
    let flexValue = 1;

    if (key === "SHIFT") {
      content = (
        <ArrowBigUp
          className={cn("w-5 h-5 transition-transform duration-75", isShifted && "fill-white text-white scale-110")}
          strokeWidth={isShifted ? 2.5 : 2}
        />
      );
      flexValue = 1.35;
    } else if (key === "BACKSPACE") {
      content = <Delete className="w-5 h-5" strokeWidth={2.2} />;
      flexValue = 1.35;
    } else if (key === "SPACE") {
      content = (
        <span className="text-[12px] sm:text-[13px] font-medium tracking-wider text-zinc-300 dark:text-zinc-400 select-none uppercase">
          Leerzeichen
        </span>
      );
      flexValue = 7;
    }

    const baseClasses = cn(
      "relative flex items-center justify-center rounded-[8px] sm:rounded-lg shadow-sm font-medium select-none touch-none transition-all duration-75 cursor-pointer",
      docked ? "h-11 sm:h-12 text-base sm:text-lg" : "h-10 sm:h-12 text-sm sm:text-base"
    );

    const keyColors = isFunctional
      ? "bg-zinc-700/85 active:bg-zinc-600 text-zinc-100"
      : "bg-zinc-800/95 active:bg-zinc-650 text-white";

    const pressedClasses = isPressed
      ? "bg-zinc-600 scale-[0.96] ring-1 ring-white/20"
      : "";

    return (
      <button
        key={key}
        ref={(el) => registerKeyRef(key, el)}
        type="button"
        tabIndex={-1}
        data-key={key}
        onTouchStart={(e) => e.preventDefault()}
        style={{ flex: flexValue, touchAction: "none" }}
        className={cn(baseClasses, keyColors, pressedClasses)}
      >
        {content}
      </button>
    );
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      className={cn(
        docked
          ? "fixed bottom-0 left-0 right-0 w-full bg-zinc-950/95 border-t border-white/10 px-1.5 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] z-40 backdrop-blur-2xl shadow-2xl flex flex-col items-center select-none touch-manipulation"
          : "w-full max-w-full mx-auto p-1.5 sm:p-2.5 bg-zinc-900/95 dark:bg-[#161618] border border-zinc-800/80 dark:border-white/[0.08] rounded-2xl flex flex-col gap-1.5 sm:gap-2 select-none touch-none shadow-lg",
        className
      )}
    >
      <div className={cn("w-full flex flex-col gap-1 sm:gap-1.5", docked && "max-w-xl mx-auto")}>
        {rows.map((row, idx) => (
          <div key={idx} className="flex justify-center gap-1 sm:gap-1.5 w-full">
            {row.map(key => renderKey(key))}
          </div>
        ))}
      </div>
    </div>
  );
});
