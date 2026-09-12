"use client";

import { useStore } from "@/lib/store";
import { useEffect, useState } from "react";

export default function LevelProgress() {
  // We need to re-render when correctAnswersTotal changes, so we select it.
  const correctAnswersTotal = useStore((state) => state.correctAnswersTotal);
  const getUserStats = useStore((state) => state.getUserStats);
  
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return <div className="h-10 w-32" />; // Placeholder during SSR
  }

  const stats = getUserStats();
  const progressPercentage = (stats.xpInCurrentLevel / stats.xpForNextLevel) * 100;

  return (
    <div className="flex flex-col items-end">
      <div className="text-sm font-bold text-gray-900 mb-1.5">
        Lvl {stats.level} <span className="text-gray-300 font-normal mx-1.5">•</span> 
        <span className="text-gray-500 font-semibold">{stats.xpInCurrentLevel} / {stats.xpForNextLevel} XP</span>
      </div>
      <div className="h-1.5 w-32 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className="h-full bg-blue-500 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
    </div>
  );
}
