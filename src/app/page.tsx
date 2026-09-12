"use client";

import { useStore } from "@/lib/store";
import { MOCK_CATEGORIES, ALL_CARDS } from "@/lib/data";
import Link from "next/link";
import { ChevronRight, ArchiveRestore, Archive } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import LevelProgress from "@/components/LevelProgress";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export default function Home() {
  const getDeckProgress = useStore((state) => state.getDeckProgress);
  const progress = useStore((state) => state.progress);
  const resetCard = useStore((state) => state.resetCard);

  const [isMounted, setIsMounted] = useState(false);
  const [showArchive, setShowArchive] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return <main className="max-w-3xl mx-auto px-6 py-12 md:py-24 animate-pulse opacity-0" />;
  }

  const archivedCards = ALL_CARDS.filter(c => progress[c.id]?.level >= 4);

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 md:py-24">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <header className="flex items-start justify-between mb-16">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 mb-2">Meine Bibliothek</h1>
            <p className="text-lg text-gray-500">Was möchtest du heute lernen?</p>
          </div>
          <LevelProgress />
        </header>

        <div className="space-y-12">
          {MOCK_CATEGORIES.map((category) => (
            <section key={category.id}>
              <h2 className="text-xl font-bold text-gray-900 mb-6 px-1">{category.name}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {category.decks.map((deck) => {
                  const { total, mastered } = getDeckProgress(deck.id);
                  const progressPercentage = total > 0 ? (mastered / total) * 100 : 0;

                  return (
                    <Link key={deck.id} href={`/deck/${deck.id}`}>
                      <div className="group block bg-white rounded-3xl p-6 shadow-sm shadow-black/5 transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 border border-gray-100 h-full flex flex-col">
                        <div className="flex items-start justify-between mb-8">
                          <div>
                            <h3 className="text-lg font-bold text-gray-900 mb-1 group-hover:text-blue-500 transition-colors">
                              {deck.name}
                            </h3>
                            <p className="text-sm text-gray-500 line-clamp-2">{deck.description}</p>
                          </div>
                          <div className="bg-gray-50 p-2 rounded-full group-hover:bg-blue-50 transition-colors shrink-0">
                            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
                          </div>
                        </div>
                        
                        <div className="mt-auto pt-4 border-t border-gray-50">
                          <div className="flex items-center justify-between text-xs font-semibold text-gray-500 mb-2">
                            <span>Fortschritt</span>
                            <span>
                              {mastered} / {total} gemeistert
                            </span>
                          </div>
                          
                          {/* Progress bar */}
                          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all duration-700 ease-out"
                              style={{ width: `${progressPercentage}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}

          {/* Archive Section */}
          <section className="pt-8 border-t border-gray-200">
            <button 
              onClick={() => setShowArchive(!showArchive)}
              className="flex items-center justify-between w-full py-4 px-2 hover:bg-gray-50 rounded-2xl transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gray-100 rounded-full text-gray-500">
                  <Archive className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <h2 className="text-lg font-bold text-gray-900">Archiv ({archivedCards.length})</h2>
                  <p className="text-sm text-gray-500">Gemeisterte Karten ansehen oder zurücksetzen</p>
                </div>
              </div>
              <ChevronRight className={cn("w-5 h-5 text-gray-400 transition-transform", showArchive && "rotate-90")} />
            </button>

            <AnimatePresence>
              {showArchive && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-6 space-y-4 px-2">
                    {archivedCards.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">Dein Archiv ist leer.</p>
                    ) : (
                      archivedCards.map(card => (
                        <div key={card.id} className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                          <div>
                            <p className="font-medium text-gray-900 mb-1">{card.sentence.replace("___", card.targetWord)}</p>
                            <p className="text-sm text-gray-500">{card.translation}</p>
                          </div>
                          <button
                            onClick={() => resetCard(card.id)}
                            className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-colors"
                            title="Zurücksetzen (Lernen wiederholen)"
                          >
                            <ArchiveRestore className="w-5 h-5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>
      </motion.div>
    </main>
  );
}
