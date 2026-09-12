"use client";

import { useStore, Flashcard } from "@/lib/store";
import Link from "next/link";
import { ChevronRight, Trash2, Edit2, Upload, FileUp } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";

export default function Home() {
  const { decks, addDeck, deleteDeck, renameDeck } = useStore();
  const [isMounted, setIsMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim().length > 0);
      
      const cards: Flashcard[] = [];
      
      lines.forEach((line) => {
        const parts = line.split(';').map(p => p.trim());
        // Expected format: TargetWord; Sentence_with_blank; Translation; Wrong1; Wrong2; Wrong3
        if (parts.length >= 6) {
          const targetWord = parts[0];
          const sentence = parts[1];
          const translation = parts[2];
          const wrong1 = parts[3];
          const wrong2 = parts[4];
          const wrong3 = parts[5];
          
          // Shuffle options
          const options = [targetWord, wrong1, wrong2, wrong3].sort(() => Math.random() - 0.5);

          cards.push({
            id: crypto.randomUUID(),
            targetWord,
            sentence,
            translation,
            options,
            masteryLevel: 0,
            isArchived: false
          });
        }
      });

      if (cards.length > 0) {
        const deckName = file.name.replace('.csv', '');
        addDeck({
          id: crypto.randomUUID(),
          name: deckName,
          cards
        });
      } else {
        alert("Fehler: Keine gültigen Karten gefunden. Bitte CSV-Format überprüfen.");
      }
      
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (window.confirm("Bist du sicher, dass du dieses Deck löschen möchtest?")) {
      deleteDeck(id);
    }
  };

  const handleRename = (e: React.MouseEvent, id: string, oldName: string) => {
    e.preventDefault();
    const newName = window.prompt("Neuer Name für das Deck:", oldName);
    if (newName && newName.trim().length > 0) {
      renameDeck(id, newName.trim());
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 md:py-24">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900 mb-2">Meine Bibliothek</h1>
            <p className="text-base md:text-lg text-gray-500">Wähle ein Deck oder importiere ein neues.</p>
          </div>
          
          <div>
            <input 
              type="file" 
              accept=".csv" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 bg-white text-blue-600 border border-gray-200 shadow-sm px-6 py-3 rounded-full font-medium transition-all hover:bg-gray-50 active:scale-95"
            >
              <FileUp className="w-5 h-5" />
              <span>CSV Importieren</span>
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {decks.length === 0 ? (
            <div className="col-span-full py-24 text-center bg-white rounded-[28px] shadow-[0_4px_20px_rgb(0,0,0,0.03)]">
              <Upload className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-900 font-semibold mb-1">Noch keine Decks vorhanden.</p>
              <p className="text-sm text-gray-500">Importiere eine CSV-Datei, um zu starten.</p>
            </div>
          ) : (
            decks.map((deck) => {
              const total = deck.cards.length;
              const mastered = deck.cards.filter(c => c.isArchived).length;
              const progressPercentage = total > 0 ? (mastered / total) * 100 : 0;

              return (
                <Link key={deck.id} href={`/deck/${deck.id}`}>
                  <div className="group block bg-white rounded-[28px] p-8 shadow-[0_4px_20px_rgb(0,0,0,0.03)] transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-1 active:scale-[0.98] active:translate-y-0 h-full flex flex-col relative">
                    
                    {/* Action Buttons - Top Right */}
                    <div className="absolute top-6 right-6 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => handleRename(e, deck.id, deck.name)}
                        className="p-2 text-gray-300 hover:text-blue-600 transition-colors"
                        title="Umbenennen"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => handleDelete(e, deck.id)}
                        className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                        title="Löschen"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="mb-10">
                      <h3 className="text-2xl font-bold tracking-tight text-gray-900 mb-1 pr-16 group-hover:text-blue-600 transition-colors">
                        {deck.name}
                      </h3>
                      <p className="text-sm text-gray-500">{total} Karten</p>
                    </div>
                    
                    <div className="mt-auto">
                      <div className="flex items-center justify-between text-sm font-medium text-gray-500 mb-3">
                        <span>Fortschritt</span>
                        <span>
                          {mastered} / {total} gemeistert
                        </span>
                      </div>
                      
                      <div className="h-1.5 w-full bg-[#F5F5F7] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full transition-all duration-700 ease-out"
                          style={{ width: `${progressPercentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </motion.div>
    </main>
  );
}
