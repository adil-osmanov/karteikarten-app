"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useEffect, useState, useRef, useCallback } from "react";
import { 
  ChevronRight, Trash2, Edit2, Upload, FileUp, 
  ArrowLeft, CheckCircle2, Volume2, AlertCircle, 
  Archive, ArchiveRestore, LifeBuoy
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- STORE & TYPES ---

export interface Flashcard {
  id: string;
  sentence: string; 
  targetWord: string; 
  translation: string;
  options: string[]; 
  masteryLevel: number; // 0, 1, 2, 3, 4
  isArchived: boolean;
}

export interface Deck {
  id: string;
  name: string;
  category: string;
  cards: Flashcard[];
}

interface AppState {
  decks: Deck[];
  correctAnswersTotal: number;
  addDeck: (deck: Deck) => void;
  deleteDeck: (id: string) => void;
  renameDeck: (id: string, newName: string) => void;
  answerCard: (deckId: string, cardId: string, correct: boolean, isHilfe?: boolean) => void;
  unarchiveCard: (deckId: string, cardId: string) => void;
  getUserStats: () => { level: number; xpInCurrentLevel: number; xpForNextLevel: number; totalXp: number };
}

const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      decks: [],
      correctAnswersTotal: 0,

      addDeck: (deck) => set((state) => ({ decks: [...state.decks, deck] })),
      
      deleteDeck: (id) => set((state) => ({ 
        decks: state.decks.filter(d => d.id !== id) 
      })),
      
      renameDeck: (id, newName) => set((state) => ({
        decks: state.decks.map(d => d.id === id ? { ...d, name: newName } : d)
      })),

      unarchiveCard: (deckId, cardId) => set((state) => ({
        decks: state.decks.map(deck => {
          if (deck.id !== deckId) return deck;
          return {
            ...deck,
            cards: deck.cards.map(card => {
              if (card.id !== cardId) return card;
              // Revert to level 3 so they can practice text input again
              return { ...card, isArchived: false, masteryLevel: 3 };
            })
          };
        })
      })),

      answerCard: (deckId, cardId, correct, isHilfe) => set((state) => {
        let newTotal = state.correctAnswersTotal;
        if (correct) {
          newTotal += 1;
        }

        return {
          correctAnswersTotal: newTotal,
          decks: state.decks.map(deck => {
            if (deck.id !== deckId) return deck;
            
            return {
              ...deck,
              cards: deck.cards.map(card => {
                if (card.id !== cardId) return card;
                
                let newLevel = card.masteryLevel;
                if (correct) {
                  newLevel = Math.min(newLevel + 1, 4);
                } else if (isHilfe) {
                  newLevel = Math.max(newLevel - 1, 0);
                } else {
                  newLevel = 0; // Wrong answer in multiple choice resets
                }
                
                return {
                  ...card,
                  masteryLevel: newLevel,
                  isArchived: newLevel === 4
                };
              })
            };
          })
        };
      }),

      getUserStats: () => {
        const { correctAnswersTotal } = get();
        const totalXp = correctAnswersTotal * 10;
        
        let level = 1;
        let xpRequiredForNext = 100;
        let xpAccumulated = 0;
        
        while (totalXp >= xpAccumulated + xpRequiredForNext) {
          xpAccumulated += xpRequiredForNext;
          level++;
          xpRequiredForNext = level * 100;
        }

        const xpInCurrentLevel = totalXp - xpAccumulated;

        return {
          level,
          xpInCurrentLevel,
          xpForNextLevel: xpRequiredForNext,
          totalXp
        };
      }
    }),
    { name: "karten-storage-v3" }
  )
);

// --- LEVEL UP MODAL ---

function LevelUpModal() {
  const getUserStats = useStore((state) => state.getUserStats);
  const correctAnswersTotal = useStore((state) => state.correctAnswersTotal);
  
  const [showModal, setShowModal] = useState(false);
  const [currentLevel, setCurrentLevel] = useState<number | null>(null);

  useEffect(() => {
    if (currentLevel === null) {
      setCurrentLevel(getUserStats().level);
      return;
    }

    const newStats = getUserStats();
    if (newStats.level > currentLevel) {
      setCurrentLevel(newStats.level);
      setShowModal(true);
      const timer = setTimeout(() => setShowModal(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [correctAnswersTotal, getUserStats, currentLevel]);

  return (
    <AnimatePresence>
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/20 backdrop-blur-md"
            onClick={() => setShowModal(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative bg-white/90 backdrop-blur-xl rounded-3xl p-10 shadow-2xl shadow-black/10 flex flex-col items-center justify-center w-full max-w-sm border border-white/50"
            onClick={() => setShowModal(false)}
          >
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6">
              <span className="text-4xl font-bold text-blue-600">🏆</span>
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

// --- LEVEL PROGRESS HEADER ---

function LevelProgress() {
  const correctAnswersTotal = useStore((state) => state.correctAnswersTotal);
  const getUserStats = useStore((state) => state.getUserStats);
  
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => setIsMounted(true), []);
  if (!isMounted) return <div className="h-10 w-32" />; 

  const stats = getUserStats();
  const progressPercentage = (stats.xpInCurrentLevel / stats.xpForNextLevel) * 100;

  return (
    <div className="flex flex-col items-end shrink-0">
      <div className="text-sm font-bold text-gray-900 mb-1.5 tracking-tight">
        Lvl {stats.level} <span className="text-gray-300 font-normal mx-1.5">•</span> 
        <span className="text-gray-500 font-semibold">{stats.xpInCurrentLevel} / {stats.xpForNextLevel} XP</span>
      </div>
      <div className="h-1.5 w-32 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className="h-full bg-blue-600 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
    </div>
  );
}

// --- STUDY INTERFACE ---

function StudyInterface({ deckId, onBack }: { deckId: string, onBack: () => void }) {
  const { decks, answerCard } = useStore();
  const deck = decks.find((d) => d.id === deckId);

  const [activeCards, setActiveCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (deck) {
      setActiveCards(deck.cards.filter((c) => !c.isArchived));
    }
  }, [deck]);

  if (!deck) return null;

  if (activeCards.length === 0) {
    return (
      <div className="flex-1 flex flex-col justify-center max-w-2xl mx-auto px-6 py-24 text-center">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-8">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-4">Großartig!</h1>
          <p className="text-lg text-gray-500 mb-10">Du hast alle Karten in diesem Deck gemeistert.</p>
          <button
            onClick={onBack}
            className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-10 py-4 rounded-2xl font-semibold text-lg transition-all active:scale-95"
          >
            Zurück zur Bibliothek
          </button>
        </motion.div>
      </div>
    );
  }

  const currentCard = activeCards[currentIndex];
  
  const handleNext = () => {
    if (currentIndex < activeCards.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      const nextRoundCards = deck.cards.filter((c) => !c.isArchived);
      setActiveCards(nextRoundCards);
      setCurrentIndex(0);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between mb-8 px-6">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-900 transition-colors p-3 -ml-3">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="text-sm font-medium text-gray-400">
          Karte {currentIndex + 1} von {activeCards.length}
        </div>
      </header>

      <div className="flex-1 flex flex-col justify-center pb-12 px-6">
        <AnimatePresence mode="wait">
          <StudyCard
            key={currentCard.id + currentIndex} 
            card={currentCard}
            onAnswer={(correct, isHilfe) => {
              answerCard(deckId, currentCard.id, correct, isHilfe);
            }}
            onNext={handleNext}
          />
        </AnimatePresence>
      </div>
    </div>
  );
}

function StudyCard({ card, onAnswer, onNext }: { card: Flashcard; onAnswer: (correct: boolean, isHilfe?: boolean) => void; onNext: () => void; }) {
  const isMultipleChoice = card.masteryLevel === 0 || card.masteryLevel === 1;
  const [phase, setPhase] = useState<"Question" | "Answer">("Question");
  
  const [inputText, setInputText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  useEffect(() => {
    if (phase === "Question" && !isMultipleChoice && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isMultipleChoice, phase]);

  const playAudio = useCallback(async (text: string) => {
    setIsPlayingAudio(true);
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (!response.ok) throw new Error("TTS API Error");
      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      
      audio.onended = () => setIsPlayingAudio(false);
      audio.onerror = () => setIsPlayingAudio(false);
      await audio.play();
    } catch (e) {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "de-DE";
        utterance.rate = 0.9;
        utterance.onend = () => setIsPlayingAudio(false);
        utterance.onerror = () => setIsPlayingAudio(false);
        window.speechSynthesis.speak(utterance);
      } else {
        setIsPlayingAudio(false);
      }
    }
  }, []);

  const handleReveal = useCallback(() => {
    setPhase("Answer");
    const fullSentence = card.sentence.replace("___", card.targetWord);
    playAudio(fullSentence);
  }, [card.sentence, card.targetWord, playAudio]);

  const handleOptionClick = (option: string) => {
    if (phase !== "Question") return;
    const correct = option === card.targetWord;
    onAnswer(correct);
    handleReveal();
  };

  const handleHilfe = () => {
    onAnswer(false, true); // isHilfe = true
    handleReveal();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (phase !== "Question") return;
    const value = e.target.value;
    
    let isValidSoFar = true;
    for (let i = 0; i < value.length; i++) {
      if (value[i].toLowerCase() !== card.targetWord[i]?.toLowerCase()) {
        isValidSoFar = false;
        break;
      }
    }
    setInputText(value);
    if (isValidSoFar && value.toLowerCase() === card.targetWord.toLowerCase()) {
      onAnswer(true);
      handleReveal();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (phase !== "Question") return;
    const isSpecialKey = e.key === "Backspace" || e.key.startsWith("Arrow") || e.metaKey || e.ctrlKey || e.altKey;
    if (isSpecialKey) return;

    const nextCharIndex = inputText.length;
    const expectedChar = card.targetWord[nextCharIndex];

    if (!expectedChar) {
      e.preventDefault(); 
      return;
    }

    if (e.key.toLowerCase() !== expectedChar.toLowerCase()) {
      // Wrong character typed - Text becomes red, but NO penalty to level
      const currentIsWrong = Array.from(inputText).some((char, i) => char.toLowerCase() !== card.targetWord[i]?.toLowerCase());
      if (currentIsWrong) {
        e.preventDefault();
      }
    }
  };

  const parts = card.sentence.split("___");
  
  const renderInputChars = () => {
    return Array.from({ length: card.targetWord.length }).map((_, i) => {
      const typed = inputText[i];
      if (!typed) {
        return <span key={i} className="text-gray-300 opacity-50">_</span>;
      }
      const isMatch = typed.toLowerCase() === card.targetWord[i].toLowerCase();
      return (
        <span key={i} className={cn("font-medium", isMatch ? "text-green-500" : "text-red-500")}>
          {typed}
        </span>
      );
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="bg-white rounded-[32px] p-8 md:p-12 shadow-[0_4px_20px_rgb(0,0,0,0.03)] flex flex-col min-h-[500px] border border-gray-100"
    >
      <div className="absolute top-8 right-8 flex gap-2">
        {[1, 2, 3, 4].map((levelIndicator) => (
          <div 
            key={levelIndicator}
            className={cn(
              "w-2 h-2 rounded-full transition-colors duration-500",
              card.masteryLevel >= levelIndicator ? "bg-blue-600" : "bg-gray-200"
            )}
          />
        ))}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <button 
          onClick={() => playAudio(card.sentence.replace("___", card.targetWord))}
          className={cn(
            "w-14 h-14 flex items-center justify-center rounded-full transition-colors mb-10 focus:outline-none shrink-0",
            isPlayingAudio ? "bg-blue-50 text-blue-600" : "bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          )}
          title="Vorlesen"
        >
          <Volume2 className="w-6 h-6" />
        </button>

        <div className="text-2xl md:text-3xl font-medium tracking-tight leading-relaxed text-gray-900 w-full max-w-lg">
          {parts[0]}
          
          {phase === "Answer" ? (
            <span className="text-blue-600 mx-1 font-semibold">
              {card.targetWord}
            </span>
          ) : (
            <>
              {isMultipleChoice ? (
                <span className="inline-block px-8 py-1 rounded-2xl mx-1 bg-gray-50 text-transparent border border-gray-100 align-middle">
                  ________
                </span>
              ) : (
                <span className="inline-block relative mx-1 align-bottom pb-1 border-b-2 border-gray-200 focus-within:border-blue-600 transition-colors min-w-[80px]">
                  <span className="flex items-center justify-center tracking-widest">{renderInputChars()}</span>
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputText}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    className="absolute inset-0 opacity-0 cursor-text w-full"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                  />
                </span>
              )}
            </>
          )}
          
          {parts[1]}
        </div>

        {phase === "Question" && !isMultipleChoice && (
          <button 
            onClick={handleHilfe}
            className="mt-12 flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-blue-600 transition-colors bg-gray-50 hover:bg-blue-50 px-5 py-2.5 rounded-full"
          >
            <LifeBuoy className="w-4 h-4" />
            <span>Hilfe (Antwort anzeigen)</span>
          </button>
        )}
      </div>

      <div className="mt-8">
        {phase === "Question" && isMultipleChoice && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {card.options.map((opt) => (
              <button
                key={opt}
                onClick={() => handleOptionClick(opt)}
                className="py-5 px-6 rounded-2xl text-[17px] font-medium bg-gray-50 text-gray-900 hover:bg-gray-100 transition-colors active:scale-95"
              >
                {opt}
              </button>
            ))}
          </motion.div>
        )}

        {phase === "Answer" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center w-full"
          >
            <div className="text-center mb-10 w-full pt-8 border-t border-gray-100">
              <p className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-3">Übersetzung</p>
              <p className="text-xl text-gray-600">{card.translation}</p>
            </div>

            <button
              onClick={onNext}
              autoFocus
              className="w-full py-5 rounded-2xl text-lg font-bold bg-blue-600 text-white hover:bg-blue-700 transition-all active:scale-95 shadow-sm shadow-blue-600/20"
            >
              Weiter
            </button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// --- MAIN APP COMPONENT ---

export default function App() {
  const { decks, addDeck, deleteDeck, renameDeck, unarchiveCard } = useStore();
  const [isMounted, setIsMounted] = useState(false);
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return <main className="min-h-screen bg-[#F5F5F7] animate-pulse" />;

  if (activeDeckId) {
    return (
      <>
        <LevelUpModal />
        <StudyInterface deckId={activeDeckId} onBack={() => setActiveDeckId(null)} />
      </>
    );
  }

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
        if (parts.length >= 6) {
          const targetWord = parts[0];
          const options = [targetWord, parts[3], parts[4], parts[5]].sort(() => Math.random() - 0.5);
          cards.push({
            id: crypto.randomUUID(),
            targetWord,
            sentence: parts[1],
            translation: parts[2],
            options,
            masteryLevel: 0,
            isArchived: false
          });
        }
      });

      if (cards.length > 0) {
        let defaultName = file.name.replace('.csv', '');
        const categoryName = window.prompt("Kategorie für dieses Deck (z.B. Grammatik, Wortschatz):", "Alltag");
        
        addDeck({
          id: crypto.randomUUID(),
          name: defaultName,
          category: categoryName || "Uncategorized",
          cards
        });
      } else {
        alert("Fehler: Keine gültigen Karten gefunden. Format: Wort; Satz; Übersetzung; Falsch1; Falsch2; Falsch3");
      }
      
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  // Group decks by category
  const categoriesMap = decks.reduce((acc, deck) => {
    const cat = deck.category || "Uncategorized";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(deck);
    return acc;
  }, {} as Record<string, Deck[]>);

  // Get all archived cards globally
  const archivedCards: { deck: Deck, card: Flashcard }[] = [];
  decks.forEach(deck => {
    deck.cards.forEach(card => {
      if (card.isArchived) archivedCards.push({ deck, card });
    });
  });

  return (
    <>
      <LevelUpModal />
      <main className="max-w-4xl mx-auto px-6 py-12 md:py-24">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
          <div>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-gray-900 mb-3">Meine Bibliothek</h1>
            <p className="text-base md:text-lg text-gray-500 font-medium">Wähle ein Deck oder importiere ein neues.</p>
          </div>
          <div className="flex flex-col items-end gap-6">
            <LevelProgress />
            <div>
              <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 bg-white text-blue-600 border border-gray-200 shadow-sm px-6 py-3 rounded-full font-semibold transition-all hover:bg-gray-50 active:scale-95"
              >
                <FileUp className="w-5 h-5" />
                <span>CSV Importieren</span>
              </button>
            </div>
          </div>
        </header>

        <div className="space-y-12">
          {Object.keys(categoriesMap).length === 0 ? (
            <div className="py-24 text-center bg-white rounded-[32px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100">
              <Upload className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-900 font-semibold mb-1 text-lg">Noch keine Decks vorhanden.</p>
              <p className="text-sm text-gray-500">Importiere eine CSV-Datei, um zu starten.</p>
            </div>
          ) : (
            Object.entries(categoriesMap).map(([categoryName, categoryDecks]) => (
              <section key={categoryName}>
                <h2 className="text-2xl font-bold tracking-tight text-gray-900 mb-6 px-2">{categoryName}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {categoryDecks.map((deck) => {
                    const total = deck.cards.length;
                    const mastered = deck.cards.filter(c => c.isArchived).length;
                    const progressPercentage = total > 0 ? (mastered / total) * 100 : 0;

                    return (
                      <div 
                        key={deck.id}
                        onClick={() => setActiveDeckId(deck.id)}
                        className="group cursor-pointer bg-white rounded-[32px] p-8 shadow-[0_4px_20px_rgb(0,0,0,0.03)] transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-1 active:scale-[0.98] active:translate-y-0 h-full flex flex-col relative border border-gray-100"
                      >
                        <div className="absolute top-6 right-6 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => { e.stopPropagation(); const n = window.prompt("Neuer Name:", deck.name); if (n) renameDeck(deck.id, n); }}
                            className="p-2.5 text-gray-300 hover:text-blue-600 transition-colors bg-gray-50 rounded-full"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); if (window.confirm("Wirklich löschen?")) deleteDeck(deck.id); }}
                            className="p-2.5 text-gray-300 hover:text-red-500 transition-colors bg-gray-50 rounded-full"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="mb-10">
                          <h3 className="text-2xl font-bold tracking-tight text-gray-900 mb-2 pr-24 group-hover:text-blue-600 transition-colors">
                            {deck.name}
                          </h3>
                          <p className="text-sm font-medium text-gray-400">{total} Karten in diesem Deck</p>
                        </div>
                        
                        <div className="mt-auto">
                          <div className="flex items-center justify-between text-sm font-semibold text-gray-500 mb-3">
                            <span>Fortschritt</span>
                            <span className="text-blue-600">
                              {mastered} / {total} gemeistert
                            </span>
                          </div>
                          
                          <div className="h-2 w-full bg-[#F5F5F7] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-600 rounded-full transition-all duration-700 ease-out"
                              style={{ width: `${progressPercentage}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}

          {/* Archive Section */}
          <section className="pt-12 border-t border-gray-200">
            <button 
              onClick={() => setShowArchive(!showArchive)}
              className="flex items-center justify-between w-full py-4 px-2 group"
            >
              <div className="flex items-center gap-4">
                <div className="p-4 bg-white shadow-sm border border-gray-100 rounded-full text-gray-400 group-hover:text-blue-600 transition-colors">
                  <Archive className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <h2 className="text-xl font-bold tracking-tight text-gray-900 group-hover:text-blue-600 transition-colors">Mein Archiv ({archivedCards.length})</h2>
                  <p className="text-sm text-gray-500 font-medium">Gemeisterte Karten ansehen oder wiederholen</p>
                </div>
              </div>
              <ChevronRight className={cn("w-6 h-6 text-gray-300 transition-transform", showArchive && "rotate-90")} />
            </button>

            <AnimatePresence>
              {showArchive && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-6 space-y-4 px-2 pb-10">
                    {archivedCards.length === 0 ? (
                      <p className="text-gray-400 text-center py-10 font-medium">Dein Archiv ist leer. Meistere Karten, um sie hier zu sehen.</p>
                    ) : (
                      archivedCards.map(({ deck, card }) => (
                        <div key={card.id} className="flex items-center justify-between bg-white p-5 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.02)] border border-gray-100">
                          <div>
                            <p className="font-medium text-gray-900 mb-1 text-lg tracking-tight">
                              {card.sentence.replace("___", card.targetWord)}
                            </p>
                            <p className="text-sm text-gray-500 mb-2">{card.translation}</p>
                            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
                              {deck.name}
                            </span>
                          </div>
                          <button
                            onClick={() => unarchiveCard(deck.id, card.id)}
                            className="flex items-center gap-2 p-3 text-sm font-semibold text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-colors shrink-0"
                            title="Lernen wiederholen"
                          >
                            <ArchiveRestore className="w-5 h-5" />
                            <span className="hidden md:inline">Wiederholen</span>
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
    </>
  );
}
