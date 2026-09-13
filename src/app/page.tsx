"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Trash2, Edit2, Upload, FileUp, 
  ArrowLeft, CheckCircle2, Volume2, AlertCircle, 
  Archive, ArchiveRestore, LifeBuoy, Search, ChevronRight,
  Clock
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createClient } from "@supabase/supabase-js";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder";
const supabase = createClient(supabaseUrl, supabaseKey);

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
  targetWord: string;
  sentence: string;
  translation: string;
  options: string[];
  masteryLevel: number; // 0 to 3
  isArchived: boolean;
  nextReviewDate: number | null;
  interval: number;
  repetitions: number;
}

export interface Deck {
  id: string;
  name: string;
  category: string;
  cards: Flashcard[];
}

interface DeckState {
  decks: Deck[];
  isLoaded: boolean;
  setDecks: (decks: Deck[]) => void;
  addDeck: (deck: Deck) => void;
  deleteDeck: (deckId: string) => void;
  renameDeck: (deckId: string, newName: string) => void;
  answerCard: (deckId: string, cardId: string, isCorrect: boolean, isHilfe: boolean) => void;
}

const useStore = create<DeckState>()((set, get) => ({
  decks: [],
  isLoaded: false,
  
  setDecks: (decks) => set({ decks, isLoaded: true }),
  
  addDeck: async (deck) => {
    const previousDecks = get().decks;
    set({ decks: [...previousDecks, deck] });
    
    const { error: deckError } = await supabase.from('decks').insert({
      id: deck.id,
      name: deck.name,
      category: deck.category
    });
    
    if (deckError) {
      console.error("Supabase Deck Insert Error:", deckError.message);
      set({ decks: previousDecks });
      return;
    }
    
    const cardsToInsert = deck.cards.map(c => ({
      id: c.id,
      deck_id: deck.id,
      targetWord: c.targetWord,
      sentence: c.sentence,
      translation: c.translation,
      options: c.options,
      masteryLevel: c.masteryLevel,
      isArchived: c.isArchived,
      nextReviewDate: c.nextReviewDate,
      interval: c.interval,
      repetitions: c.repetitions
    }));
    
    const { error: cardsError } = await supabase.from('cards').insert(cardsToInsert);
    if (cardsError) {
      console.error("Supabase Cards Insert Error:", cardsError.message);
      set({ decks: previousDecks });
    }
  },
  
  deleteDeck: async (deckId) => {
    const previousDecks = get().decks;
    set({ decks: previousDecks.filter(d => d.id !== deckId) });
    
    const { error } = await supabase.from('decks').delete().eq('id', deckId);
    if (error) {
      console.error("Supabase Delete Deck Error:", error.message);
      set({ decks: previousDecks });
    }
  },
  
  renameDeck: async (deckId, newName) => {
    const previousDecks = get().decks;
    set({
      decks: previousDecks.map(d => d.id === deckId ? { ...d, name: newName } : d)
    });
    
    const { error } = await supabase.from('decks').update({ name: newName }).eq('id', deckId);
    if (error) {
      console.error("Supabase Rename Deck Error:", error.message);
      set({ decks: previousDecks });
    }
  },

  answerCard: async (deckId, cardId, isCorrect, isHilfe) => {
    const previousDecks = get().decks;
    let updatedCard: any = null;

    set((state) => {
      const newDecks = [...state.decks];
      const deck = newDecks.find((d) => d.id === deckId);
      if (!deck) return state;

      const cardIndex = deck.cards.findIndex((c) => c.id === cardId);
      if (cardIndex === -1) return state;

      const card = { ...deck.cards[cardIndex] };

      if (card.isArchived) {
        if (isCorrect && !isHilfe) {
          card.repetitions = (card.repetitions || 0) + 1;
          const r = card.repetitions;
          card.interval = r === 1 ? 1 : r === 2 ? 3 : r === 3 ? 7 : r === 4 ? 14 : 30;
          card.nextReviewDate = Date.now() + card.interval * 86400000;
        } else {
          card.repetitions = 0;
          card.interval = 0;
          card.nextReviewDate = null;
          card.isArchived = false;
          card.masteryLevel = 0;
        }
      } else {
        if (isCorrect && !isHilfe) {
          card.masteryLevel += 1;
          if (card.masteryLevel > 3) {
            card.masteryLevel = 3;
            card.isArchived = true;
            card.repetitions = 1;
            card.interval = 1;
            card.nextReviewDate = Date.now() + 86400000;
          }
        } else {
          if (!isCorrect && !isHilfe) {
            card.masteryLevel = 0; 
          } else if (isHilfe) {
            card.masteryLevel = Math.max(0, card.masteryLevel - 1); 
          }
        }
      }

      deck.cards[cardIndex] = card;
      updatedCard = card;

      return { decks: newDecks };
    });

    if (updatedCard) {
      const { error } = await supabase.from('cards').update({
        masteryLevel: updatedCard.masteryLevel,
        isArchived: updatedCard.isArchived,
        nextReviewDate: updatedCard.nextReviewDate,
        interval: updatedCard.interval,
        repetitions: updatedCard.repetitions
      }).eq('id', cardId);
      
      if (error) {
        console.error("Supabase Update Card Error:", error.message);
        set({ decks: previousDecks });
      }
    }
  }
}));

const useStats = () => {
  const decks = useStore(state => state.decks);
  let totalCorrectAnswers = 0;
  decks.forEach(deck => {
    deck.cards.forEach(card => {
      totalCorrectAnswers += card.masteryLevel;
      totalCorrectAnswers += card.repetitions;
    });
  });

  const totalXp = totalCorrectAnswers * 10;
  let currentLvl = 1;
  let xpAccumulated = 0;
  let nextLvlReq = 100;
  
  while (totalXp >= xpAccumulated + nextLvlReq) {
    xpAccumulated += nextLvlReq;
    currentLvl++;
    nextLvlReq = Math.floor(nextLvlReq * 1.5);
  }
  
  return {
    level: currentLvl,
    xpInCurrentLevel: totalXp - xpAccumulated,
    xpForNextLevel: nextLvlReq,
    totalXp
  };
};

// --- LEVEL UP MODAL ---

function LevelUpModal() {
  const stats = useStats();
  
  const [showModal, setShowModal] = useState(false);
  const [currentLevel, setCurrentLevel] = useState<number | null>(null);

  useEffect(() => {
    if (currentLevel === null) {
      setCurrentLevel(stats.level);
    } else if (stats.level > currentLevel) {
      setShowModal(true);
      setCurrentLevel(stats.level);
      playFeedbackSound(true);
    }
  }, [stats.level, currentLevel]);

  return (
    <AnimatePresence>
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative bg-white/90 backdrop-blur-xl rounded-[32px] p-8 md:p-12 w-full max-w-sm shadow-2xl border border-white text-center"
          >
            <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
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
  const [isMounted, setIsMounted] = useState(false);
  const stats = useStats();

  useEffect(() => setIsMounted(true), []);
  if (!isMounted) return <div className="h-10 w-32" />; 

  return (
    <div className="flex flex-col items-end shrink-0">
      <div className="text-sm font-bold tracking-tight text-gray-900 mb-2 bg-white px-4 py-1.5 rounded-full shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-gray-100 flex items-center gap-2">
        <span className="text-blue-600">Lvl {stats.level}</span>
        <span className="text-gray-300">•</span>
        <span className="text-gray-500">{stats.xpInCurrentLevel} / {stats.xpForNextLevel} XP</span>
      </div>
      <div className="w-48 h-2.5 bg-gray-200/60 rounded-full overflow-hidden">
        <div 
          className="h-full bg-blue-600 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${(stats.xpInCurrentLevel / stats.xpForNextLevel) * 100}%` }}
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
  const { answerCard, decks } = useStore();
  
  const [activeCards, setActiveCards] = useState<{ deckId: string, card: Flashcard }[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [roundCounter, setRoundCounter] = useState(0);

  useEffect(() => {
    if (reviewCards) {
      setActiveCards([...reviewCards].sort(() => Math.random() - 0.5));
    } else if (deckId) {
      const deck = useStore.getState().decks.find((d) => d.id === deckId);
      if (deck) {
        const active = deck.cards.filter((c) => !c.isArchived).map(c => ({ deckId, card: c }));
        setActiveCards(active.sort(() => Math.random() - 0.5));
      }
    }
  }, [deckId, reviewCards]);

  if (activeCards.length === 0) {
    return (
      <div className="flex-1 flex flex-col justify-center max-w-2xl mx-auto px-6 py-24 text-center">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-8">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-4">Großartig!</h1>
          <p className="text-lg text-gray-500 mb-10">
            {reviewCards ? "Alle fälligen Karten wurden wiederholt." : "Du hast alle Karten in diesem Deck gemeistert."}
          </p>
          <button
            onClick={onBack}
            className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-10 py-4 rounded-2xl font-semibold text-lg transition-all active:scale-[0.98]"
          >
            Zurück zur Bibliothek
          </button>
        </motion.div>
      </div>
    );
  }

  const { deckId: currentDeckId, card: currentCardSnapshot } = activeCards[currentIndex];
  // Get live card to instantly reflect masteryLevel updates (blue dots)
  const liveCard = decks.find(d => d.id === currentDeckId)?.cards.find(c => c.id === currentCardSnapshot.id) || currentCardSnapshot;
  
  const handleNext = () => {
    if (currentIndex < activeCards.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      if (reviewCards) {
        onBack(); // End of review mode
      } else {
        const deck = useStore.getState().decks.find((d) => d.id === deckId);
        if (deck) {
          const active = deck.cards.filter((c) => !c.isArchived).map(c => ({ deckId: deck.id, card: c }));
          setActiveCards(active.sort(() => Math.random() - 0.5));
          setCurrentIndex(0);
          setRoundCounter(prev => prev + 1);
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
            key={`${currentCardSnapshot.id}-${currentIndex}-${roundCounter}`}
            card={liveCard}
            forceInputMode={!!reviewCards}
            onAnswer={(correct, isHilfe) => {
              answerCard(currentDeckId, currentCardSnapshot.id, correct, isHilfe);
            }}
            onNext={handleNext}
          />
        </AnimatePresence>
      </div>
    </div>
  );
}

// --- STUDY CARD ---

function StudyCard({ 
  card, 
  onAnswer, 
  onNext,
  forceInputMode = false
}: { 
  card: Flashcard, 
  onAnswer: (correct: boolean, isHilfe: boolean) => void,
  onNext: () => void,
  forceInputMode?: boolean
}) {
  const [phase, setPhase] = useState<"Question" | "Answer">("Question");
  const [inputText, setInputText] = useState("");
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isMultipleChoice = !forceInputMode && phase === "Question" && card.masteryLevel < 2;

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
    onAnswer(correct, false);
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
      onAnswer(true, false);
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

  const parts = card.sentence.split("___");

  return (
    <motion.div 
      key={card.id + phase}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="bg-white rounded-[32px] p-6 md:p-12 shadow-[0_4px_30px_rgb(0,0,0,0.04)] border border-gray-100 flex flex-col items-center justify-between min-h-[400px]"
      onClick={() => {
        if (!isMultipleChoice && phase === "Question" && inputRef.current) {
          inputRef.current.focus();
        }
      }}
    >
      <div className="w-full flex items-center justify-between mb-8">
        <button 
          onClick={() => {
            const fullSentence = card.sentence.replace("___", phase === "Answer" ? card.targetWord : "Lücke");
            playAudio(fullSentence);
          }}
          disabled={isPlayingAudio}
          className="w-12 h-12 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-full transition-all active:scale-95 disabled:opacity-50"
        >
          <Volume2 className="w-5 h-5" />
        </button>
        <div className="flex gap-1.5">
          {[0, 1, 2, 3].map((step) => (
            <div 
              key={step} 
              className={cn(
                "w-2.5 h-2.5 rounded-full transition-colors",
                card.masteryLevel > step ? "bg-blue-600" : "bg-gray-200"
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col items-center text-center">
        <div className="text-xl md:text-2xl font-medium tracking-tight leading-relaxed text-gray-900 w-full max-w-lg mb-2">
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
            className="flex flex-col items-center w-full mt-4"
          >
            <div className="mb-10 w-full text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-2">
                Übersetzung
              </span>
              <p className="text-lg text-gray-500 font-medium w-full max-w-lg mx-auto">
                {card.translation}
              </p>
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
  const { decks, addDeck, deleteDeck, renameDeck, setDecks, isLoaded } = useStore();
  const [isMounted, setIsMounted] = useState(false);
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [reviewCards, setReviewCards] = useState<{ deckId: string, card: Flashcard }[] | null>(null);
  
  const [uploadCategory, setUploadCategory] = useState<string | null>(null);
  const [renameModal, setRenameModal] = useState<{ id: string, name: string } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ id: string, name: string } | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [visibleLimits, setVisibleLimits] = useState<Record<string, number>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsMounted(true);
    const fetchDecks = async () => {
      try {
        const { data, error } = await supabase
          .from('decks')
          .select('*, cards(*)');
          
        if (error) {
          console.error("Supabase Fetch Error:", error.message);
          setDecks([]);
        } else if (data) {
          setDecks(data as Deck[]);
        }
      } catch (err: any) {
        console.error("Network Fetch Error:", err.message);
        setDecks([]);
      }
    };
    fetchDecks();
  }, [setDecks]);

  if (!isMounted || !isLoaded) return <main className="min-h-screen bg-[#F5F5F7] animate-pulse" />;

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
            isArchived: false,
            nextReviewDate: null,
            interval: 0,
            repetitions: 0
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

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const handleLoadMore = (cat: string) => {
    setVisibleLimits(prev => ({ ...prev, [cat]: (prev[cat] || 10) + 10 }));
  };

  const categories = ["Grammatik", "Wörter"];
  
  const dueCards: { deckId: string, card: Flashcard }[] = [];
  decks.forEach(deck => {
    deck.cards.forEach(card => {
      if (card.isArchived && card.nextReviewDate && card.nextReviewDate <= Date.now()) {
        dueCards.push({ deckId: deck.id, card });
      }
    });
  });

  const archivedCards: { deckId: string, deckName: string, card: Flashcard }[] = [];
  decks.forEach(deck => {
    deck.cards.forEach(card => {
      if (card.isArchived) archivedCards.push({ deckId: deck.id, deckName: deck.name, card });
    });
  });

  const renderDeckCard = (deck: Deck, isCompleted: boolean) => {
    const total = deck.cards.length;
    const mastered = deck.cards.filter(c => c.isArchived).length;
    const progressPercentage = total > 0 ? (mastered / total) * 100 : 0;

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
  };

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
              className="bg-white rounded-[32px] p-8 w-full max-w-sm shadow-[0_20px_60px_rgb(0,0,0,0.1)] relative z-10 text-center"
            >
              <h3 className="text-xl font-bold tracking-tight text-gray-900 mb-6">Deck umbenennen</h3>
              <input
                type="text"
                autoFocus
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                className="w-full bg-gray-100 text-gray-900 rounded-2xl px-5 py-4 mb-6 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                placeholder="Neuer Name"
              />
              <div className="flex gap-3">
                <button onClick={() => setRenameModal(null)} className="flex-1 py-4 font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-2xl transition-colors active:scale-[0.98]">
                  Abbrechen
                </button>
                <button onClick={() => { if (renameInput.trim()) { renameDeck(renameModal.id, renameInput.trim()); setRenameModal(null); } }} className="flex-1 py-4 font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-2xl transition-colors active:scale-[0.98]">
                  Speichern
                </button>
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
              className="bg-white rounded-[32px] p-8 w-full max-w-sm shadow-[0_20px_60px_rgb(0,0,0,0.1)] relative z-10 text-center"
            >
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-gray-900 mb-3">Deck löschen?</h3>
              <p className="text-sm text-gray-500 font-medium mb-8">Bist du sicher, dass du "{deleteModal.name}" löschen möchtest? Dieser Vorgang kann nicht rückgängig gemacht werden.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteModal(null)} className="flex-1 py-4 font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-2xl transition-colors active:scale-[0.98]">
                  Abbrechen
                </button>
                <button onClick={() => { deleteDeck(deleteModal.id); setDeleteModal(null); }} className="flex-1 py-4 font-semibold text-white bg-red-500 hover:bg-red-600 rounded-2xl transition-colors active:scale-[0.98]">
                  Löschen
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />

      <main className="max-w-4xl mx-auto px-6 py-12 md:py-24">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="max-w-2xl mx-auto">
          <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
            <div>
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-gray-900 mb-3">Meine Bibliothek</h1>
              <p className="text-base md:text-lg text-gray-500 font-medium">Lerne Grammatik und Vokabeln.</p>
            </div>
            <LevelProgress />
          </header>

          <div className="mb-10 relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="w-full bg-white border border-gray-100 text-gray-900 rounded-2xl pl-12 pr-4 py-4 shadow-[0_4px_20px_rgb(0,0,0,0.02)] outline-none focus:ring-2 focus:ring-blue-500 font-medium transition-all"
              placeholder="Suchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {dueCards.length > 0 && (
            <div className="mb-12 bg-blue-50 border border-blue-100 rounded-[28px] p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-sm text-blue-600 shrink-0">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                </div>
                <div>
                  <h2 className="text-xl md:text-2xl font-bold tracking-tight text-gray-900 mb-1">Fällig für heute</h2>
                  <p className="text-sm md:text-base text-gray-600 font-medium">{dueCards.length} {dueCards.length === 1 ? 'Karte wartet' : 'Karten warten'} auf dich.</p>
                </div>
              </div>
              <button
                onClick={() => setReviewCards(dueCards)}
                className="w-full md:w-auto px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full transition-all duration-100 active:scale-[0.98] shadow-sm shrink-0"
              >
                Jetzt wiederholen
              </button>
            </div>
          )}

          <div className="space-y-12">
            {categories.map((categoryName) => {
              const categoryDecks = decks.filter(d => 
                d.category === categoryName && 
                d.name.toLowerCase().includes(searchQuery.toLowerCase())
              );

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

              const limit = visibleLimits[categoryName] || 10;
              const visibleDecks = sortedDecks.slice(0, limit);

              const inProgressDecks: Deck[] = [];
              const completedDecks: Deck[] = [];

              visibleDecks.forEach(deck => {
                const total = deck.cards.length;
                const mastered = deck.cards.filter(c => c.isArchived).length;
                if (total > 0 && mastered === total) {
                  completedDecks.push(deck);
                } else {
                  inProgressDecks.push(deck);
                }
              });

              const isExpanded = expandedCategories[categoryName] || false;

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
                    <div className="py-8 text-center bg-white border border-gray-100 rounded-[28px] shadow-[0_4px_20px_rgb(0,0,0,0.02)]">
                      <p className="text-gray-400 text-sm font-medium">Noch keine Decks in dieser Kategorie.</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {inProgressDecks.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {inProgressDecks.map(deck => renderDeckCard(deck, false))}
                        </div>
                      )}
                    
                    {completedDecks.length > 0 && (
                      <div className="mt-4">
                        <button 
                          onClick={() => toggleCategory(categoryName)}
                          className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900 transition-colors mx-2 mb-4 focus:outline-none"
                        >
                          <ChevronRight className={cn("w-4 h-4 transition-transform", isExpanded && "rotate-90")} />
                          <span>{completedDecks.length} erledigte Decks {isExpanded ? "ausblenden" : "anzeigen"}</span>
                        </button>
                        
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
                                {completedDecks.map(deck => renderDeckCard(deck, true))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                  )}

                  {sortedDecks.length > limit && (
                    <button 
                      onClick={() => handleLoadMore(categoryName)}
                      className="mt-8 mx-auto block px-8 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-full transition-all duration-100 active:scale-[0.98]"
                    >
                      Weitere {Math.min(10, sortedDecks.length - limit)} Decks laden
                    </button>
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
