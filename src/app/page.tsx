"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useEffect, useState, useRef, useCallback } from "react";
import { 
  Trash2, Edit2, Upload, FileUp, 
  ArrowLeft, CheckCircle2, Volume2, AlertCircle, 
  Archive, ArchiveRestore, LifeBuoy
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- AUDIO FEEDBACK ---

let cachedAudioCtx: AudioContext | null = null;

const playFeedbackSound = (isCorrect: boolean) => {
  if (typeof window === 'undefined') return;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return;
  
  if (!cachedAudioCtx) {
    cachedAudioCtx = new AudioContextClass();
  }
  
  const ctx = cachedAudioCtx;
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  if (isCorrect) {
    // Success: Soft double chime (C5 -> E5)
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
    
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.03);
    gain.gain.linearRampToValueAtTime(0.02, ctx.currentTime + 0.1);
    gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.13);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } else {
    // Error: Short dull thud
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.15);
    
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.02);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  }
};

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

function StudyInterface({ 
  deckId, 
  onBack,
  reviewCards
}: { 
  deckId?: string, 
  onBack: () => void,
  reviewCards?: { deckId: string, card: Flashcard }[]
}) {
  const { decks, answerCard } = useStore();
  
  const [activeCards, setActiveCards] = useState<{ deckId: string, card: Flashcard }[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (reviewCards) {
      setActiveCards(reviewCards);
    } else if (deckId) {
      const deck = decks.find((d) => d.id === deckId);
      if (deck) {
        setActiveCards(deck.cards.filter((c) => !c.isArchived).map(c => ({ deckId, card: c })));
      }
    }
  }, [deckId, decks, reviewCards]);

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

  const { deckId: currentDeckId, card: currentCard } = activeCards[currentIndex];
  
  const handleNext = () => {
    if (currentIndex < activeCards.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      if (reviewCards) {
        onBack(); // End of review mode
      } else {
        const deck = decks.find((d) => d.id === deckId);
        if (deck) {
          setActiveCards(deck.cards.filter((c) => !c.isArchived).map(c => ({ deckId: deck.id, card: c })));
          setCurrentIndex(0);
        }
      }
    }
  };

  return (
    <div className="flex flex-col h-full items-center justify-center pt-8">
      <div className="w-full max-w-2xl mx-auto flex items-center justify-between px-2 mb-4">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-900 transition-colors p-2 -ml-2 rounded-full hover:bg-white">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="text-sm font-semibold text-gray-400">
          Karte {currentIndex + 1} von {activeCards.length}
        </div>
      </div>

      <div className="w-full max-w-2xl mx-auto flex-1 flex flex-col justify-center pb-12">
        <AnimatePresence mode="wait">
          <StudyCard
            key={currentCard.id + currentIndex} 
            card={currentCard}
            onAnswer={(correct, isHilfe) => {
              if (!reviewCards) {
                answerCard(currentDeckId, currentCard.id, correct, isHilfe);
              }
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
    playFeedbackSound(correct);
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
    
    // Play error sound if the latest typed character is wrong
    const lastCharIndex = value.length - 1;
    if (value.length > 0 && value[lastCharIndex].toLowerCase() !== card.targetWord[lastCharIndex]?.toLowerCase()) {
      playFeedbackSound(false);
    }

    if (isValidSoFar && value.toLowerCase() === card.targetWord.toLowerCase()) {
      playFeedbackSound(true);
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
    if (inputText.length === 0) {
      return <span className="text-gray-300 tracking-normal">Tippen...</span>;
    }
    return Array.from(inputText).map((char, i) => {
      const isMatch = char.toLowerCase() === card.targetWord[i]?.toLowerCase();
      return (
        <span key={i} className={cn("font-medium", isMatch ? "text-gray-900" : "text-red-500")}>
          {char}
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
      className="bg-white rounded-[28px] p-6 md:p-10 shadow-[0_4px_20px_rgb(0,0,0,0.03)] flex flex-col border border-gray-100 max-w-2xl mx-auto w-full"
    >
      {/* Top Header: Speaker Left, Dots Right */}
      <div className="flex items-center justify-between w-full mb-8">
        <button 
          onClick={() => {
            const textToPlay = phase === "Answer" 
              ? card.sentence.replace("___", card.targetWord)
              : card.sentence.replace("___", "Lücke");
            playAudio(textToPlay);
          }}
          className={cn(
            "w-10 h-10 flex items-center justify-center rounded-full transition-colors focus:outline-none shrink-0",
            isPlayingAudio ? "bg-blue-50 text-blue-600" : "bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          )}
          title="Vorlesen"
        >
          <Volume2 className="w-5 h-5" />
        </button>

        <div className="flex gap-1.5">
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
      </div>

      <div className="flex flex-col items-center text-center">
        <div className="text-xl md:text-2xl font-medium tracking-tight leading-relaxed text-gray-900 w-full max-w-lg mb-8">
          {parts[0]}
          
          {phase === "Answer" ? (
            <span className="text-blue-600 mx-1 font-semibold">
              {card.targetWord}
            </span>
          ) : (
            <>
              {isMultipleChoice ? (
                <span className="inline-block px-6 py-0.5 rounded-xl mx-1 bg-gray-50 text-transparent border border-gray-100 align-middle">
                  ________
                </span>
              ) : (
                <span className="inline-block relative mx-1 align-bottom pb-0.5 border-b-2 border-gray-200 focus-within:border-blue-600 transition-colors w-32 md:w-40 text-center">
                  <span className="flex items-center justify-center tracking-widest h-full w-full overflow-hidden whitespace-nowrap">
                    {renderInputChars()}
                  </span>
                  <input
                    ref={inputRef}
                    autoFocus
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
            className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-blue-600 transition-all duration-100 active:scale-[0.98] bg-gray-50 hover:bg-blue-50 px-4 py-2 rounded-full mb-2"
          >
            <LifeBuoy className="w-4 h-4" />
            <span>Hilfe</span>
          </button>
        )}
      </div>

      <div className="mt-4 w-full">
        {phase === "Question" && isMultipleChoice && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="grid grid-cols-2 gap-4"
          >
            {card.options.map((opt) => (
              <button
                key={opt}
                onClick={() => handleOptionClick(opt)}
                className="py-3 px-5 rounded-xl text-base font-medium bg-gray-50 text-gray-900 hover:bg-gray-100 transition-all duration-100 active:scale-[0.98]"
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
            <div className="text-center mb-6 w-full pt-6 border-t border-gray-100">
              <p className="text-[11px] font-bold tracking-widest uppercase text-gray-400 mb-2">Übersetzung</p>
              <p className="text-base text-gray-600">{card.translation}</p>
            </div>

            <button
              onClick={onNext}
              autoFocus
              className="w-full py-4 rounded-xl text-lg font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-all duration-100 active:scale-[0.98]"
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
  const [reviewCards, setReviewCards] = useState<{ deckId: string, card: Flashcard }[] | null>(null);
  
  const [uploadCategory, setUploadCategory] = useState<string | null>(null);
  const [renameModal, setRenameModal] = useState<{ id: string, name: string } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ id: string, name: string } | null>(null);
  const [renameInput, setRenameInput] = useState("");

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

  if (reviewCards) {
    return (
      <>
        <LevelUpModal />
        <StudyInterface reviewCards={reviewCards} onBack={() => setReviewCards(null)} />
      </>
    );
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadCategory) return;

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
        const defaultName = file.name.replace('.csv', '');
        addDeck({
          id: crypto.randomUUID(),
          name: defaultName,
          category: uploadCategory,
          cards
        });
      } else {
        alert("Fehler: Keine gültigen Karten gefunden.");
      }
      
      if (fileInputRef.current) fileInputRef.current.value = "";
      setUploadCategory(null);
    };
    reader.readAsText(file);
  };

  const handlePlusClick = (category: string) => {
    setUploadCategory(category);
    fileInputRef.current?.click();
  };

  const categories = ["Grammatik", "Wörter"];
  
  const archivedCards: { deckId: string, deckName: string, card: Flashcard }[] = [];
  decks.forEach(deck => {
    deck.cards.forEach(card => {
      if (card.isArchived) archivedCards.push({ deckId: deck.id, deckName: deck.name, card });
    });
  });

  return (
    <>
      <LevelUpModal />

      {/* RENAME MODAL */}
      <AnimatePresence>
        {renameModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setRenameModal(null)} 
            />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white/90 backdrop-blur-xl rounded-[24px] p-6 w-full max-w-sm shadow-2xl border border-white"
            >
              <h3 className="text-xl font-bold tracking-tight text-gray-900 mb-4">Deck umbenennen</h3>
              <input 
                type="text"
                autoFocus
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 mb-6 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <div className="flex gap-3">
                <button onClick={() => setRenameModal(null)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors">Abbrechen</button>
                <button 
                  onClick={() => {
                    if (renameInput.trim()) renameDeck(renameModal.id, renameInput.trim());
                    setRenameModal(null);
                  }}
                  className="flex-1 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors"
                >Speichern</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DELETE MODAL */}
      <AnimatePresence>
        {deleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setDeleteModal(null)} 
            />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white/90 backdrop-blur-xl rounded-[24px] p-6 w-full max-w-sm shadow-2xl border border-white text-center"
            >
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-gray-900 mb-2">Deck löschen?</h3>
              <p className="text-gray-500 mb-6 text-sm">Bist du sicher, dass du "{deleteModal.name}" unwiderruflich löschen möchtest?</p>
              
              <div className="flex gap-3">
                <button onClick={() => setDeleteModal(null)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors">Abbrechen</button>
                <button 
                  onClick={() => {
                    deleteDeck(deleteModal.id);
                    setDeleteModal(null);
                  }}
                  className="flex-1 py-3 bg-red-500 text-white font-medium rounded-xl hover:bg-red-600 transition-colors"
                >Löschen</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />

      <main className="max-w-4xl mx-auto px-6 py-12 md:py-24">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="max-w-2xl mx-auto">
          <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
            <div>
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-gray-900 mb-3">Meine Bibliothek</h1>
              <p className="text-base md:text-lg text-gray-500 font-medium">Lerne Grammatik und Vokabeln.</p>
            </div>
            <LevelProgress />
          </header>

          <div className="space-y-12">
            {categories.map((categoryName) => {
              const categoryDecks = decks.filter(d => d.category === categoryName);
              
              // Smart sort: incomplete first, completed last
              const sortedDecks = [...categoryDecks].sort((a, b) => {
                const aTotal = a.cards.length;
                const aMastered = a.cards.filter(c => c.isArchived).length;
                const aIsCompleted = aTotal > 0 && aTotal === aMastered;
                
                const bTotal = b.cards.length;
                const bMastered = b.cards.filter(c => c.isArchived).length;
                const bIsCompleted = bTotal > 0 && bTotal === bMastered;
                
                if (aIsCompleted && !bIsCompleted) return 1;
                if (!aIsCompleted && bIsCompleted) return -1;
                return 0;
              });

              return (
                <section key={categoryName}>
                  <div className="flex items-center gap-3 mb-6 px-2">
                    <h2 className="text-2xl font-bold tracking-tight text-gray-900">{categoryName}</h2>
                    <button 
                      onClick={() => handlePlusClick(categoryName)}
                      className="w-8 h-8 flex items-center justify-center bg-gray-200 hover:bg-blue-600 hover:text-white text-gray-500 rounded-full transition-all duration-100 active:scale-[0.98]"
                      title="Deck hinzufügen"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M7 1V13M1 7H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                  
                  {categoryDecks.length === 0 ? (
                    <div className="py-6 text-center">
                      <p className="text-gray-400 text-sm font-medium">Noch keine Decks</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {sortedDecks.map((deck) => {
                        const total = deck.cards.length;
                        const mastered = deck.cards.filter(c => c.isArchived).length;
                        const progressPercentage = total > 0 ? (mastered / total) * 100 : 0;
                        const isCompleted = total > 0 && mastered === total;

                        return (
                          <div 
                            key={deck.id}
                            onClick={() => setActiveDeckId(deck.id)}
                            className={cn(
                              "group cursor-pointer bg-white rounded-[28px] p-8 shadow-[0_4px_20px_rgb(0,0,0,0.03)] transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-1 active:scale-[0.98] active:translate-y-0 h-full flex flex-col relative border border-gray-100",
                              isCompleted && "opacity-60 hover:opacity-100"
                            )}
                          >
                            <div className="absolute top-6 right-6 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={(e) => { e.stopPropagation(); setRenameInput(deck.name); setRenameModal({ id: deck.id, name: deck.name }); }}
                                className="p-2.5 text-gray-300 hover:text-blue-600 transition-all duration-100 active:scale-[0.98] rounded-full"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); setDeleteModal({ id: deck.id, name: deck.name }); }}
                                className="p-2.5 text-gray-300 hover:text-red-500 transition-all duration-100 active:scale-[0.98] rounded-full"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="mb-10">
                              <h3 className="text-xl font-bold tracking-tight text-gray-900 mb-2 pr-24 group-hover:text-blue-600 transition-colors flex items-center gap-2">
                                {deck.name}
                                {isCompleted && <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />}
                              </h3>
                              <p className="text-sm font-medium text-gray-400">{total} Karten</p>
                            </div>
                            
                            <div className="mt-auto">
                              <div className="flex items-center justify-between text-sm font-semibold text-gray-500 mb-3">
                                <span>Fortschritt</span>
                                <span className={isCompleted ? "text-green-600" : "text-blue-600"}>{mastered} / {total} gemeistert</span>
                              </div>
                              <div className="h-2 w-full bg-[#F5F5F7] rounded-full overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all duration-700 ease-out",
                                    isCompleted ? "bg-green-500" : "bg-blue-600"
                                  )}
                                  style={{ width: `${progressPercentage}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}

            {/* Archive Section */}
            <section className="pt-12 border-t border-gray-200">
              <div className="bg-white p-6 rounded-[28px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-4 bg-gray-50 rounded-full text-blue-600">
                    <Archive className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-gray-900">Mein Archiv</h2>
                    <p className="text-sm text-gray-500 font-medium">{archivedCards.length} Wörter gemeistert</p>
                  </div>
                </div>
                
                <button
                  onClick={() => {
                    if (archivedCards.length > 0) setReviewCards(archivedCards);
                  }}
                  disabled={archivedCards.length === 0}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full transition-all duration-100 active:scale-[0.98] shadow-sm disabled:opacity-50 disabled:active:scale-100 shrink-0"
                >
                  Alle trainieren
                </button>
              </div>
            </section>
          </div>
        </motion.div>
      </main>
    </>
  );
}
