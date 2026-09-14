"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Trash2, Edit2, Upload, FileUp, 
  ArrowLeft, CheckCircle2, Volume2, AlertCircle, 
  Archive, ArchiveRestore, LifeBuoy, Search, ChevronRight, Sun, Moon, HelpCircle,
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
const audioCache = new Map<string, string>();

const playTockSound = () => {
  if (typeof window === 'undefined') return;
  try {
    const ctx = cachedAudioCtx || new (window.AudioContext || (window as any).webkitAudioContext)();
    if (!cachedAudioCtx) cachedAudioCtx = ctx;
    if (ctx.state === 'suspended') ctx.resume();
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.02);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.04);
  } catch (e) {}
};

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

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1-C2';

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
  level?: CEFRLevel;
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
      category: deck.category,
      level: deck.level || 'A1'
    });
    
    if (deckError) {
      console.error("Supabase Deck Insert Error:", deckError.message);
      alert(`Fehler beim Speichern des Decks in der Datenbank: ${deckError.message}`);
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
      alert(`Fehler beim Speichern der Karten: ${cardsError.message}`);
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

  // PRELOAD NEXT AUDIO
  useEffect(() => {
    if (activeCards.length > currentIndex + 1) {
      const nextCard = activeCards[currentIndex + 1].card;
      const fullSentence = nextCard.sentence.replace("___", nextCard.targetWord);
      if (!audioCache.has(fullSentence)) {
        fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: fullSentence })
        })
        .then(res => { if (res.ok) return res.blob(); throw new Error(); })
        .then(blob => {
          const url = URL.createObjectURL(blob);
          audioCache.set(fullSentence, url);
        })
        .catch(() => {});
      }
    }
  }, [currentIndex, activeCards]);

  if (activeCards.length === 0) {
    return (
      <div className="flex-1 flex flex-col justify-center max-w-2xl mx-auto px-6 py-24 text-center">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-8">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-[#F5F5F7] mb-4">Großartig!</h1>
          <p className="text-lg text-gray-500 mb-10">
            {reviewCards ? "Alle fälligen Karten wurden wiederholt." : "Du hast alle Karten in diesem Deck gemeistert."}
          </p>
          <button
            onClick={onBack}
            className="w-full md:w-auto bg-[#007AFF] hover:bg-[#0062CC] text-white px-10 py-4 rounded-2xl font-semibold text-lg transition-all active:scale-[0.98]"
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
    <>
      <div className="flex flex-col h-full items-center justify-center pt-8 relative z-50">
      <div className="w-full max-w-2xl mx-auto flex items-center justify-between px-2 mb-4">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-900 transition-colors p-2 -ml-2 rounded-full hover:bg-white">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="text-sm font-semibold text-gray-400 tabular-nums">
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
    </>
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
      let audioUrl = audioCache.get(text);
      if (!audioUrl) {
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        if (!response.ok) throw new Error("TTS API Error");
        const blob = await response.blob();
        audioUrl = URL.createObjectURL(blob);
        audioCache.set(text, audioUrl);
      }
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

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      if (phase === "Question" && isMultipleChoice) {
        if (e.code === 'Digit1' || e.code === 'Numpad1') { e.preventDefault(); handleOptionClick(card.options[0]); }
        if (e.code === 'Digit2' || e.code === 'Numpad2') { e.preventDefault(); handleOptionClick(card.options[1]); }
        if (e.code === 'Digit3' || e.code === 'Numpad3') { e.preventDefault(); handleOptionClick(card.options[2]); }
        if (e.code === 'Digit4' || e.code === 'Numpad4') { e.preventDefault(); handleOptionClick(card.options[3]); }
      }

      if (phase === "Answer") {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          onNext();
        }
      }

      if (e.code === 'KeyR') {
        e.preventDefault();
        const fullSentence = card.sentence.replace("___", card.targetWord);
        playAudio(fullSentence);
      }
      
      if (e.code === 'KeyH' && !isMultipleChoice && phase === "Question") {
        e.preventDefault();
        handleHilfe();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [phase, isMultipleChoice, card, playAudio, onNext]);

  
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
    playTockSound();
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

  const GERMAN_KEY_MAP: Record<string, { base: string, shift: string }> = {
    'KeyA': { base: 'a', shift: 'A' }, 'KeyB': { base: 'b', shift: 'B' }, 'KeyC': { base: 'c', shift: 'C' },
    'KeyD': { base: 'd', shift: 'D' }, 'KeyE': { base: 'e', shift: 'E' }, 'KeyF': { base: 'f', shift: 'F' },
    'KeyG': { base: 'g', shift: 'G' }, 'KeyH': { base: 'h', shift: 'H' }, 'KeyI': { base: 'i', shift: 'I' },
    'KeyJ': { base: 'j', shift: 'J' }, 'KeyK': { base: 'k', shift: 'K' }, 'KeyL': { base: 'l', shift: 'L' },
    'KeyM': { base: 'm', shift: 'M' }, 'KeyN': { base: 'n', shift: 'N' }, 'KeyO': { base: 'o', shift: 'O' },
    'KeyP': { base: 'p', shift: 'P' }, 'KeyQ': { base: 'q', shift: 'Q' }, 'KeyR': { base: 'r', shift: 'R' },
    'KeyS': { base: 's', shift: 'S' }, 'KeyT': { base: 't', shift: 'T' }, 'KeyU': { base: 'u', shift: 'U' },
    'KeyV': { base: 'v', shift: 'V' }, 'KeyW': { base: 'w', shift: 'W' }, 'KeyX': { base: 'x', shift: 'X' },
    'KeyY': { base: 'z', shift: 'Z' }, 'KeyZ': { base: 'y', shift: 'Y' }, 'Minus': { base: 'ß', shift: '?' },
    'BracketLeft': { base: 'ü', shift: 'Ü' }, 'Quote': { base: 'ä', shift: 'Ä' }, 'Semicolon': { base: 'ö', shift: 'Ö' },
    'Space': { base: ' ', shift: ' ' }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (phase !== "Question") return;
    
    const isSpecialKey = e.key === "Backspace" || e.key.startsWith("Arrow") || e.metaKey || e.ctrlKey || e.altKey || e.key === 'Enter' || e.key === 'Tab';
    if (isSpecialKey) return;

    const mapEntry = GERMAN_KEY_MAP[e.code];
    if (mapEntry) {
      e.preventDefault();
      const char = e.shiftKey ? mapEntry.shift : mapEntry.base;
      const start = e.currentTarget.selectionStart || 0;
      const end = e.currentTarget.selectionEnd || 0;
      const newValue = inputText.slice(0, start) + char + inputText.slice(end);
      
      playTockSound();
      playTockSound();
    setInputText(newValue);
      
      let isValidSoFar = true;
      for (let i = 0; i < newValue.length; i++) {
        if (newValue[i].toLowerCase() !== card.targetWord[i]?.toLowerCase()) {
          isValidSoFar = false;
          break;
        }
      }
      
      const lastCharIndex = newValue.length - 1;
      if (newValue.length > 0 && newValue[lastCharIndex].toLowerCase() !== card.targetWord[lastCharIndex]?.toLowerCase()) {
        playFeedbackSound(false);
      }

      if (isValidSoFar && newValue.toLowerCase() === card.targetWord.toLowerCase()) {
        playFeedbackSound(true);
        onAnswer(true, false);
        handleReveal();
      }
    }
  };

  const renderInputChars = () => {
    if (inputText.length === 0) {
      return <span className="text-gray-300/50 dark:text-gray-500 font-light tracking-wide text-lg">Tippen...</span>;
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
      className="relative bg-white dark:bg-[#1C1C1E] rounded-[24px] p-6 md:p-12 shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)] border border-[rgba(0,0,0,0.06)] dark:border-white/[0.08] flex flex-col items-center justify-between min-h-[400px] transition-colors duration-300"
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
          className="relative w-11 h-11 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-full transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-50"
        >
          <Volume2 className="w-5 h-5" />
          <span className="absolute -bottom-0.5 -right-0.5 text-[9px] font-bold text-gray-400 bg-white border border-gray-100 rounded-[4px] px-1 shadow-sm pointer-events-none">
            R
          </span>
        </button>
        <div className="flex gap-1.5">
          {[0, 1, 2, 3].map((step) => (
            <div 
              key={step} 
              className={cn(
                "w-2.5 h-2.5 rounded-full transition-colors",
                (card.isArchived || card.masteryLevel > step) ? "bg-[#007AFF]" : "bg-gray-200"
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col items-center text-center w-full">
        <div className="text-xl md:text-2xl font-medium tracking-tight leading-relaxed text-gray-900 w-full max-w-lg mb-4">
          {parts[0]}
          
          {phase === "Answer" ? (
            <span className="text-[#007AFF] mx-1 font-semibold">
              {card.targetWord}
            </span>
          ) : (
            <>
              {isMultipleChoice ? (
                <span className="inline-block px-6 py-0.5 rounded-xl mx-1 bg-gray-50 text-transparent border border-gray-100 align-middle">
                  ________
                </span>
              ) : (
                <span className="inline-block relative mx-1 align-bottom pb-0.5 border-b-2 border-gray-200 focus-within:border-\[#007AFF\] transition-colors w-32 md:w-40 text-center">
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

        {(phase === "Answer" || !isMultipleChoice) && (
          <div className="mb-6 w-full text-center">
            <p className="text-base text-gray-400 font-medium w-full max-w-lg mx-auto">
              {card.translation}
            </p>
          </div>
        )}


      </div>

      <div className="mt-2 w-full">
        {phase === "Question" && isMultipleChoice && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="grid grid-cols-2 gap-4"
          >
            {card.options.map((opt, idx) => (
              <button
                key={opt}
                onClick={() => handleOptionClick(opt)}
                className="py-3 px-5 rounded-xl text-base font-medium bg-gray-50 text-gray-900 hover:bg-gray-100 transition-transform duration-150 ease-out active:scale-[0.98] relative flex items-center justify-center"
              >
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-gray-400 px-1.5 py-0.5 rounded-md bg-gray-100 border border-gray-200/60 pointer-events-none">
                  {idx + 1}
                </span>
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
            <button
              onClick={onNext}
              autoFocus
              className="w-full py-4 rounded-[16px] text-lg font-semibold bg-[#007AFF] text-white hover:bg-[#0062CC] shadow-sm transition-transform duration-150 ease-out active:scale-[0.98]"
            >
              Weiter
            </button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}


function DarkModeToggle() {
  const [isDark, setIsDark] = useState(false);
  
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.theme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.theme = 'light';
    }
  };

  return (
    <button onClick={toggle} className="absolute top-5 right-6 p-2 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors z-50">
      {isDark ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
    </button>
  );
}

// --- MAIN APP COMPONENT ---


export default function App() {
  const { decks, addDeck, deleteDeck, renameDeck, setDecks, isLoaded } = useStore();
  const [isMounted, setIsMounted] = useState(false);
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [reviewCards, setReviewCards] = useState<{ deckId: string, card: Flashcard }[] | null>(null);
  const [activeTab, setActiveTab] = useState<"Grammatik" | "Wörter">("Grammatik");
  
  const [uploadTarget, setUploadTarget] = useState<{ category: string, level: CEFRLevel } | null>(null);
  const [renameModal, setRenameModal] = useState<{ id: string, name: string } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ id: string, name: string } | null>(null);
  const [renameInput, setRenameInput] = useState("");
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

  if (!isMounted || !isLoaded) return <main className="min-h-screen bg-[#FBFBFD] animate-pulse" />;

  if (activeDeckId) {
    return (
      <>
        
        <DarkModeToggle />
        <StudyInterface deckId={activeDeckId} onBack={() => setActiveDeckId(null)} />
      </>
    );
  }

  if (reviewCards) {
    return (
      <>
        
        <DarkModeToggle />
        <StudyInterface reviewCards={reviewCards} onBack={() => setReviewCards(null)} />
      </>
    );
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;

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
          category: uploadTarget.category,
          level: uploadTarget.level,
          cards
        });
      } else {
        alert("Fehler: Keine gültigen Karten gefunden.");
      }
      
      if (fileInputRef.current) fileInputRef.current.value = "";
      setUploadTarget(null);
    };
    reader.readAsText(file);
  };

  const handlePlusClick = (category: string, level: CEFRLevel) => {
    setUploadTarget({ category, level });
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
          "group cursor-pointer bg-white dark:bg-[#1C1C1E] rounded-[28px] p-8 shadow-[0_4px_20px_rgb(0,0,0,0.03)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-1 active:scale-[0.98] active:translate-y-0 min-h-[160px] flex flex-col relative border border-gray-100 dark:border-white/[0.08]",
          isCompleted && "opacity-60 hover:opacity-100"
        )}
      >
        <div className="absolute top-6 right-6 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={(e) => { e.stopPropagation(); setRenameInput(deck.name); setRenameModal({ id: deck.id, name: deck.name }); }}
            className="p-2.5 text-gray-300 hover:text-[#007AFF] transition-all duration-100 active:scale-[0.98] rounded-full"
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
          <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-[#F5F5F7] pr-24 group-hover:text-[#007AFF] transition-colors flex items-center gap-2">
            {deck.name}
            {isCompleted && <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />}
          </h3>
        </div>
        
        <div className="mt-auto">
          <div className="flex items-center justify-end text-sm font-bold mb-3">
            <span className={isCompleted ? "text-green-600" : "text-gray-400"}>{mastered} / {total}</span>
          </div>
          <div className="h-2 w-full bg-[#FBFBFD] rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700 ease-out",
                isCompleted ? "bg-green-500" : "bg-[#007AFF]"
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
      

      {/* RENAME MODAL */}
      <DarkModeToggle />
      <AnimatePresence>
        {renameModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setRenameModal(null)} 
            />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#1C1C1E] rounded-[32px] p-8 w-full max-w-sm shadow-[0_20px_60px_rgb(0,0,0,0.1)] relative z-10 text-center"
            >
              <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-[#F5F5F7] mb-6">Deck umbenennen</h3>
              <input
                type="text"
                autoFocus
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                className="w-full bg-gray-100 dark:bg-[#2C2C2E] text-gray-900 dark:text-[#F5F5F7] rounded-2xl px-5 py-4 mb-6 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                placeholder="Neuer Name"
              />
              <div className="flex gap-3">
                <button onClick={() => setRenameModal(null)} className="flex-1 py-4 font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-2xl transition-colors active:scale-[0.98]">
                  Abbrechen
                </button>
                <button onClick={() => { if (renameInput.trim()) { renameDeck(renameModal.id, renameInput.trim()); setRenameModal(null); } }} className="flex-1 py-4 font-semibold text-white bg-[#007AFF] hover:bg-[#0062CC] rounded-2xl transition-colors active:scale-[0.98]">
                  Speichern
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DELETE MODAL */}
      <DarkModeToggle />
      <AnimatePresence>
        {deleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setDeleteModal(null)} 
            />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#1C1C1E] rounded-[32px] p-8 w-full max-w-sm shadow-[0_20px_60px_rgb(0,0,0,0.1)] relative z-10 text-center"
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
          <div className="flex justify-center mb-10 pt-4">
            <div className="bg-slate-100/80 dark:bg-[#1C1C1E] p-1.5 rounded-2xl inline-flex w-full max-w-sm mx-auto border border-slate-200/50 shadow-inner">
              {(["Grammatik", "Wörter"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "flex-1 px-8 py-3.5 transition-all text-lg font-bold tracking-wide",
                    activeTab === tab
                      ? "bg-white text-[#007AFF] shadow-md rounded-xl"
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-[#F5F5F7] rounded-xl"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {dueCards.length > 0 && (
            <div className="mb-12 bg-blue-50/50 border border-blue-100/50 rounded-3xl p-5 md:p-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm text-[#007AFF] shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg md:text-xl font-bold tracking-tight text-gray-900 mb-0.5">Fällig für heute</h2>
                  <p className="text-sm text-gray-600 font-medium">{dueCards.length} {dueCards.length === 1 ? 'Karte' : 'Karten'} warten.</p>
                </div>
              </div>
              <button
                onClick={() => setReviewCards(dueCards)}
                className="w-full md:w-auto px-6 py-3 bg-[#007AFF] hover:bg-[#0062CC] text-white font-semibold rounded-xl transition-all duration-100 active:scale-[0.98] shadow-sm shrink-0"
              >
                Starten
              </button>
            </div>
          )}

          <div className="space-y-16">
            {(() => {
              const cefrLevels: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1-C2'];
              const levelConfig: Record<CEFRLevel, { label: string, badgeClass: string }> = {
                'A1': { label: 'A1', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                'A2': { label: 'A2', badgeClass: 'bg-sky-50 text-sky-700 border-sky-200' },
                'B1': { label: 'B1', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
                'B2': { label: 'B2', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
                'C1-C2': { label: 'C1-C2', badgeClass: 'bg-purple-50 text-purple-700 border-purple-200' }
              };

              return cefrLevels.map(level => {
                const sectionKey = `${activeTab}-${level}`;
                const levelDecks = decks.filter(d => d.category === activeTab && (d.level || 'A1') === level);
                const sortedDecks = [...levelDecks].sort((a, b) => {
                  const aIsCompleted = a.cards.length > 0 && a.cards.length === a.cards.filter(c => c.isArchived).length;
                  const bIsCompleted = b.cards.length > 0 && b.cards.length === b.cards.filter(c => c.isArchived).length;
                  if (aIsCompleted && !bIsCompleted) return 1;
                  if (!aIsCompleted && bIsCompleted) return -1;
                  return 0;
                });

                const limit = visibleLimits[sectionKey] || 10;
                const visibleDecks = sortedDecks.slice(0, limit);
                const inProgressDecks = visibleDecks.filter(d => d.cards.length === 0 || d.cards.length !== d.cards.filter(c => c.isArchived).length);
                const completedDecks = visibleDecks.filter(d => d.cards.length > 0 && d.cards.length === d.cards.filter(c => c.isArchived).length);
                const isExpanded = expandedCategories[sectionKey] || false;

                return (
                  <section key={sectionKey}>
                    <div className="flex items-center gap-3 mb-6 px-2">
                      <div className={cn("px-4 py-1.5 rounded-full border text-sm font-bold shadow-sm tracking-wide", levelConfig[level].badgeClass)}>
                        {levelConfig[level].label}
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => handlePlusClick(activeTab, level)}
                          className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-[#007AFF] hover:text-white text-gray-500 rounded-full transition-all duration-100 active:scale-[0.98]"
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M7 1V13M1 7H13" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    {levelDecks.length === 0 ? (
                      <div className="py-6 text-center bg-white border border-gray-100 rounded-[24px] shadow-sm">
                        <p className="text-gray-400 text-sm font-medium">Noch keine Decks in diesem Level.</p>
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
                              onClick={() => toggleCategory(sectionKey)}
                              className="flex items-center gap-2 text-sm font-semibold text-gray-400 hover:text-gray-900 transition-colors mx-2 mb-4"
                            >
                              <ChevronRight className={cn("w-4 h-4 transition-transform", isExpanded && "rotate-90")} />
                              <span>Archiv anzeigen ({completedDecks.length})</span>
                            </button>
                            <DarkModeToggle />
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
                        onClick={() => handleLoadMore(sectionKey)}
                        className="mt-6 mx-auto block px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm rounded-full transition-all"
                      >
                        Weitere {Math.min(10, sortedDecks.length - limit)} laden
                      </button>
                    )}
                  </section>
                );
              });
            })()}

          </div>
        </motion.div>
      </main>
    </>
  );
}
