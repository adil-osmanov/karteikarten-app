"use client";

import { useStore } from "@/lib/store";
import { MOCK_DECKS } from "@/lib/data";
import Link from "next/link";
import { ChevronRight, Award } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  const level = useStore((state) => state.level);
  const getDeckProgress = useStore((state) => state.getDeckProgress);

  return (
    <main className="max-w-2xl mx-auto px-6 py-12 md:py-24">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <header className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-1">Entdecken</h1>
            <p className="text-gray-500">Wähle dein Deck, um zu lernen</p>
          </div>
          <div className="flex items-center space-x-2 bg-card px-4 py-2 rounded-2xl">
            <Award className="w-5 h-5 text-blue-500" />
            <span className="font-semibold text-sm">Level {level}</span>
          </div>
        </header>

        <div className="space-y-4">
          {MOCK_DECKS.map((deck) => {
            const { total, mastered } = getDeckProgress(deck.id);
            const progressPercentage = total > 0 ? (mastered / total) * 100 : 0;

            return (
              <Link key={deck.id} href={`/deck/${deck.id}`}>
                <div className="group block bg-card rounded-3xl p-6 transition-all hover:scale-[1.02] active:scale-[0.98]">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-xl font-semibold mb-1 group-hover:text-blue-500 transition-colors">
                        {deck.name}
                      </h2>
                      <p className="text-sm text-gray-500">{deck.description}</p>
                    </div>
                    <ChevronRight className="text-gray-400 group-hover:text-blue-500 transition-colors" />
                  </div>
                  
                  <div className="flex items-center justify-between text-xs font-medium text-gray-500 mb-2">
                    <span>Fortschritt</span>
                    <span>
                      {mastered} / {total} gemeistert
                    </span>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${progressPercentage}%` }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </motion.div>
    </main>
  );
}
