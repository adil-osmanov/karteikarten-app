"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { motion, AnimatePresence } from "framer-motion";

export default function LevelUpModal() {
  const getUserStats = useStore((state) => state.getUserStats);
  const correctAnswersTotal = useStore((state) => state.correctAnswersTotal);
  
  const [showModal, setShowModal] = useState(false);
  const [currentLevel, setCurrentLevel] = useState<number | null>(null);

  useEffect(() => {
    // Run on initial mount to set the base level without triggering animation
    if (currentLevel === null) {
      setCurrentLevel(getUserStats().level);
      return;
    }

    const newStats = getUserStats();
    if (newStats.level > currentLevel) {
      setCurrentLevel(newStats.level);
      setShowModal(true);
      
      // Auto close after 3 seconds
      const timer = setTimeout(() => setShowModal(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [correctAnswersTotal, getUserStats, currentLevel]);

  return (
    <AnimatePresence>
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/20 backdrop-blur-md"
            onClick={() => setShowModal(false)}
          />
          
          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative bg-white/90 backdrop-blur-xl rounded-3xl p-10 shadow-2xl shadow-black/10 flex flex-col items-center justify-center w-full max-w-sm border border-white/50"
            onClick={() => setShowModal(false)}
          >
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6">
              <span className="text-4xl font-bold text-blue-500">🏆</span>
            </div>
            <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-blue-500 to-blue-700 mb-2 text-center">
              Level Aufstieg!
            </h2>
            <p className="text-gray-500 font-medium text-lg text-center">
              Du hast Level {currentLevel} erreicht.
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
