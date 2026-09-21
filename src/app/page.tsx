"use client";

import React, { useState, useEffect, useRef, useCallback, useTransition, useMemo } from "react";
import { 
  Trash2, BookOpen, Edit2, Upload, FileUp, 
  ArrowLeft, CheckCircle2, Volume2, AlertCircle, 
  Archive, ArchiveRestore, LifeBuoy, Search, ChevronRight, Sun, Moon, HelpCircle, RotateCw, Flame, Plus,
  Clock, Mic, Snail, Play, X, Headphones
} from "lucide-react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createClient } from "@supabase/supabase-js";
import ReactMarkdown from "react-markdown";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder";
const supabase = createClient(supabaseUrl, supabaseKey);

// --- AUDIO FEEDBACK ---

let cachedAudioCtx: AudioContext | null = null;
const audioCache = new Map<string, string>();

const initAudioCtx = () => {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    if (!cachedAudioCtx) {
      cachedAudioCtx = new AudioContextClass();
    }
    if (cachedAudioCtx.state === 'suspended') {
      cachedAudioCtx.resume();
    }
    
    // iOS Safari trick: play a silent oscillator to permanently unlock audio
    const osc = cachedAudioCtx.createOscillator();
    const gain = cachedAudioCtx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(cachedAudioCtx.destination);
    osc.start(cachedAudioCtx.currentTime);
    osc.stop(cachedAudioCtx.currentTime + 0.001);
  } catch (e) {}
};

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



export type LanguageLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1-C2';
export type CEFRLevel = LanguageLevel; // Alias for existing code

export interface BookMeta {
  id: string;
  language: 'DE' | 'EN';
  title: string;
  subtitle?: string;
  tintColor: string;
  coverImage?: string | null;
  activeLevels: LanguageLevel[];
  coverType?: 'color' | 'image';
  coverValue?: string;
  accentColor?: string;
}

const useScrollLock = (lock: boolean) => {
  useEffect(() => {
    if (lock) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [lock]);
};

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
  baseWordInfo?: string | null;
}

export interface Deck {
  id: string;
  name: string;
  category: string;
  level?: CEFRLevel;
  cards: Flashcard[];
  language?: 'DE' | 'EN';
  bookId?: string;
}

interface DeckState {
  decks: Deck[];
  isLoaded: boolean;
  setDecks: (decks: Deck[]) => void;
  addDeck: (deck: Deck) => void;
  deleteDeck: (deckId: string) => void;
  renameDeck: (deckId: string, newName: string) => void;
  answerCard: (deckId: string, cardId: string, isCorrect: boolean, isHilfe: boolean) => void;
  dailyProgress: Record<string, number>;
  incrementDailyProgress: () => void;
  appLanguage: 'DE' | 'EN';
  setAppLanguage: (lang: 'DE' | 'EN') => void;
  books: BookMeta[];
  setBooks: (books: BookMeta[]) => void;
  addBook: (book: BookMeta) => void;
  updateBook: (book: BookMeta) => void;
  deleteBook: (id: string) => void;
  syncError: string | null;
  setSyncError: (msg: string | null) => void;
  deckOrder: string[];
  setDeckOrder: (order: string[]) => void;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
}

const useStore = create<DeckState>()((set, get) => ({
  decks: [],
  isLoaded: false,
  appLanguage: 'DE',
  setAppLanguage: (lang) => {
    if (typeof window !== 'undefined') localStorage.setItem('selected_language', lang);
    set({ appLanguage: lang });
  },
  dailyProgress: {},
  syncError: null,
  setSyncError: (msg) => set({ syncError: msg }),
  deckOrder: [],
  setDeckOrder: (order) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('deck_order', JSON.stringify(order));
      syncAppStateToCloud();
    }
    set({ deckOrder: order });
  },
  playbackSpeed: 1,
  setPlaybackSpeed: (speed) => {
    if (typeof window !== 'undefined') localStorage.setItem('playback_speed', speed.toString());
    set({ playbackSpeed: speed });
  },
  
  books: [],
  setBooks: (books) => set({ books }),
  addBook: async (book) => {
    const previousBooks = get().books;
    set({ books: [...previousBooks, book] }); // Restore Optimistic UI
    
    // Clean payload: remove legacy fields (accentColor, coverType, coverValue) that cause schema cache errors
    const payload = {
      id: book.id, language: book.language, title: book.title, subtitle: book.subtitle || null,
      tintColor: book.tintColor || '#000000', coverImage: book.coverImage || null,
      activeLevels: book.activeLevels || ['A1']
    };
    
    let { error } = await supabase.from('books').insert(payload);
    
    if (error && error.message.includes('does not exist')) {
       const fallbackPayload = {
         id: book.id, language: book.language, title: book.title, subtitle: book.subtitle || null,
         tintcolor: book.tintColor || '#000000', coverimage: book.coverImage || null,
         activelevels: book.activeLevels || ['A1']
       };
       const fallbackRes = await supabase.from('books').insert(fallbackPayload);
       error = fallbackRes.error;
    }
    
    if (error) {
      console.error("SUPABASE ERROR:", error);
      if (typeof window !== 'undefined') alert("ERROR: " + JSON.stringify(error));
      set({ books: previousBooks }); // Rollback on failure
    }
  },
  updateBook: async (book) => {
    const previousBooks = get().books;
    set({ books: previousBooks.map(b => b.id === book.id ? book : b) });
    
    const payload = {
      language: book.language, title: book.title, subtitle: book.subtitle || null,
      tintColor: book.tintColor || '#000000', coverImage: book.coverImage || null,
      activeLevels: book.activeLevels || ['A1']
    };
    
    let { error } = await supabase.from('books').update(payload).eq('id', book.id);
    
    if (error && error.message.includes('does not exist')) {
       const fallbackPayload = {
         language: book.language, title: book.title, subtitle: book.subtitle || null,
         tintcolor: book.tintColor || '#000000', coverimage: book.coverImage || null,
         activelevels: book.activeLevels || ['A1']
       };
       const fallbackRes = await supabase.from('books').update(fallbackPayload).eq('id', book.id);
       error = fallbackRes.error;
    }
    
    if (error) {
      console.error("SUPABASE ERROR:", error);
      if (typeof window !== 'undefined') alert("ERROR: " + JSON.stringify(error));
      set({ books: previousBooks });
    }
  },
  deleteBook: async (id) => {
    const previousBooks = get().books;
    set({ books: previousBooks.filter(b => b.id !== id) });
    
    const { error } = await supabase.from('books').delete().eq('id', id);
    
    if (error) {
      console.error("SUPABASE ERROR:", error);
      if (typeof window !== 'undefined') alert("ERROR: " + JSON.stringify(error));
      set({ books: previousBooks });
    }
  },
  incrementDailyProgress: () => set((state) => {
    const today = new Date().toISOString().split('T')[0];
    return {
      dailyProgress: {
        ...state.dailyProgress,
        [today]: (state.dailyProgress[today] || 0) + 1
      }
    };
  }),
  
  setDecks: (decks) => set({ decks, isLoaded: true }),
  
  addDeck: async (deck) => {
    const previousDecks = get().decks;
    set({ decks: [...previousDecks, deck] });
    
    const payload: any = {
      id: deck.id,
      name: deck.name,
      category: deck.category,
      level: deck.level || 'A1',
      book_id: deck.bookId,
      language: deck.language
    };
    
    let deckRes = await supabase.from('decks').insert(payload);
    
    if (deckRes.error && deckRes.error.message.includes('not exist')) {
        console.warn("Falling back to deck insert without book_id/language columns. Please run the SQL migration.");
        const fallbackPayload = {
          id: deck.id,
          name: deck.name,
          category: deck.category,
          level: deck.level || 'A1'
        };
        deckRes = await supabase.from('decks').insert(fallbackPayload);
    }
    
    if (deckRes.error) {
      console.error("Supabase Deck Insert Error:", deckRes.error.message);
      alert(`Fehler beim Speichern des Decks in der Datenbank: ${deckRes.error.message}`);
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
      repetitions: c.repetitions,
      baseWordInfo: c.baseWordInfo || null
    }));
    
    let { error: cardsError } = await supabase.from('cards').insert(cardsToInsert);
    
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
    // Update daily progress
    if (typeof window !== 'undefined' && isCorrect) {
      const { appLanguage } = get();
      const todayStr = new Date().toLocaleDateString('en-CA');
      const key = `daily_activity_${appLanguage}`;
      const stored = localStorage.getItem(key);
      const progress = stored ? JSON.parse(stored) : {};
      
      const rawCount = progress[todayStr];
      const currentCount = typeof rawCount === 'number' ? rawCount : (rawCount?.total || (typeof rawCount === 'string' ? parseInt(rawCount) || 0 : 0));
      
      progress[todayStr] = currentCount + 1;
      
      localStorage.setItem(key, JSON.stringify(progress));
      window.dispatchEvent(new Event('storage-update'));
      
      supabase.from('user_stats').upsert({
        language: appLanguage,
        daily_activity: progress
      }, { onConflict: 'language' }).then(() => {});
    }
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
          if (r === 1) card.interval = 1;
          else if (r === 2) card.interval = 3;
          else if (r === 3) card.interval = 7;
          else if (r === 4) card.interval = 14;
          else if (r === 5) card.interval = 30;
          else if (r === 6) card.interval = 60;
          else if (r === 7) card.interval = 120;
          else card.interval = (card.interval || 120) * 2;
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
  const [initialTotal, setInitialTotal] = useState(0);
  const [masteredInSession, setMasteredInSession] = useState(0);

  useEffect(() => {
    if (reviewCards) {
      setActiveCards([...reviewCards].sort(() => Math.random() - 0.5));
      setInitialTotal(reviewCards.length);
      setMasteredInSession(0);
    } else if (deckId) {
      const deck = useStore.getState().decks.find((d) => d.id === deckId);
      if (deck) {
        const active = deck.cards.filter((c) => !c.isArchived).map(c => ({ deckId, card: c }));
        setActiveCards(active.sort(() => Math.random() - 0.5));
        setInitialTotal(active.length);
        setMasteredInSession(0);
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
          <h1 className="text-3xl font-bold tracking-tight text-gray-900  dark:text-[#F5F5F7] mb-4">Großartig!</h1>
          <p className="text-lg text-gray-500 mb-10">
            {reviewCards ? "Alle fälligen Karten wurden wiederholt." : "Du hast alle Karten in diesem Deck gemeistert."}
          </p>
          <button
            onClick={onBack}
            className="w-full md:w-auto bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-400 text-white px-10 py-4 rounded-2xl font-semibold text-lg transition-all active:scale-[0.98]"
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
          setInitialTotal(active.length);
          setMasteredInSession(0);
        }
      }
    }
  };

  return (
      <>
<div className="flex flex-col h-full items-center justify-center pt-8 relative z-50">
      <div className="w-full max-w-xl mx-auto px-2 mb-8">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors p-1.5 -ml-1.5 rounded-full hover:bg-gray-200/60 dark:hover:bg-white/10 active:scale-95">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="text-xs font-mono tabular-nums text-gray-400 dark:text-gray-500">
            {currentIndex + 1} / {activeCards.length}
          </div>
        </div>
        <div className="w-full h-1 bg-gray-200/60 dark:bg-white/10 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-600 dark:bg-blue-500 transition-all duration-300 ease-out rounded-full"
            style={{ width: `${Math.max(5, initialTotal > 0 ? (masteredInSession / initialTotal) * 100 : 0)}%` }}
          />
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
              if (correct && !isHilfe) {
                setMasteredInSession(prev => prev + 1);
              } else {
                setActiveCards(prev => [...prev, { deckId: currentDeckId, card: currentCardSnapshot }]);
              }
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
  const { playbackSpeed, setPlaybackSpeed } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (phase === "Answer" && nextButtonRef.current) {
      nextButtonRef.current.focus();
    }
  }, [phase]);

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
      audio.playbackRate = playbackSpeed;
      
      audio.onended = () => setIsPlayingAudio(false);
      audio.onerror = () => setIsPlayingAudio(false);
      await audio.play();
    } catch (e) {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "de-DE";
        utterance.rate = playbackSpeed * 0.9;
        utterance.onend = () => setIsPlayingAudio(false);
        utterance.onerror = () => setIsPlayingAudio(false);
        window.speechSynthesis.speak(utterance);
      } else {
        setIsPlayingAudio(false);
      }
    }
  }, [playbackSpeed]);

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
      
      if (e.code === 'KeyH' && phase === "Question") {
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
      return <span className="text-gray-400 dark:text-gray-500 font-light tracking-wide text-lg">Tippen...</span>;
    }
    return Array.from(inputText).map((char, i) => {
      if (shouldCapitalize && i === 0) {
        char = char.toUpperCase();
      }
      const isMatch = char.toLowerCase() === card.targetWord[i]?.toLowerCase();
      return (
        <span key={i} className={cn("font-medium", isMatch ? "text-gray-900  dark:text-[#F5F5F7] " : "text-red-500")}>
          {char}
        </span>
      );
    });
  };

  
  const parseBaseWordInfo = (text: string | undefined | null) => {
    if (!text) return { main: "", sub: "" };
    const match = text.match(/\(([^)]+)\)/);
    if (match) {
      const subText = match[1].split(',').map(s => s.trim()).join(' • ');
      const mainText = text.replace(match[0], '').replace(/\s+—/g, ' —').replace(/  +/g, ' ').trim();
      return { main: mainText, sub: subText };
    }
    return { main: text, sub: "" };
  };

  const parseNoun = (text: string) => {
    const match = text.match(/^(der|die|das)\s+(.*)$/i);
    if (!match) return null;
    const article = match[1].toLowerCase();
    
    let colorClasses = "";
    let articleClasses = "";
    let textClasses = "";
    let borderClasses = "";
    
    if (article === 'der') {
      colorClasses = "bg-blue-50 dark:bg-blue-500/10 border-blue-200/60 dark:border-blue-500/20 shadow-blue-500/5";
      articleClasses = "font-semibold text-blue-600 dark:text-blue-400";
      textClasses = "text-blue-800 dark:text-blue-200";
      borderClasses = "border-blue-600/30 dark:border-blue-500/40";
    } else if (article === 'die') {
      colorClasses = "bg-rose-50 dark:bg-rose-500/10 border-rose-200/60 dark:border-rose-500/20 shadow-rose-500/5";
      articleClasses = "font-semibold text-rose-600 dark:text-rose-400";
      textClasses = "text-rose-800 dark:text-rose-200";
      borderClasses = "border-rose-600/30 dark:border-rose-500/40";
    } else if (article === 'das') {
      colorClasses = "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/60 dark:border-emerald-500/20 shadow-emerald-500/5";
      articleClasses = "font-semibold text-emerald-600 dark:text-emerald-400";
      textClasses = "text-emerald-800 dark:text-emerald-200";
      borderClasses = "border-emerald-600/30 dark:border-emerald-500/40";
    }
    
    return { article: match[1], rest: match[2], colorClasses, articleClasses, textClasses, borderClasses };
  };

  const parsedInfo = parseBaseWordInfo(card.baseWordInfo);
  const parsedBaseWord = parsedInfo.main ? parseNoun(parsedInfo.main) : null;
  const parsedTargetWord = phase === "Answer" ? parseNoun(card.targetWord) : null;

  const parts = card.sentence.split("___");
  const shouldCapitalize = parts[0]?.trim() === "";
  const displayTargetWord = shouldCapitalize ? card.targetWord.charAt(0).toUpperCase() + card.targetWord.slice(1) : card.targetWord;

  return (
    <motion.div 
      key={card.id + phase}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="relative bg-white dark:bg-[#1C1C1E] rounded-[24px] p-6 md:p-12 border border-black/[0.08] dark:border-white/[0.08] shadow-sm dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex flex-col items-center justify-between min-h-[400px] transition-colors duration-200"
      onClick={() => {
        if (!isMultipleChoice && phase === "Question" && inputRef.current) {
          inputRef.current.focus();
        }
      }}
    >
      <div className="w-full flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              const fullSentence = card.sentence.replace("___", phase === "Answer" ? card.targetWord : "Lücke");
              playAudio(fullSentence);
            }}
            disabled={isPlayingAudio}
            className="relative w-11 h-11 flex items-center justify-center bg-gray-50 dark:bg-[#2C2C2E] hover:bg-gray-100 dark:hover:bg-[#3A3A3C] text-gray-500 dark:text-[#8E8E93] rounded-full transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-50"
          >
            <Volume2 className="w-5 h-5" />
            <span className="absolute -bottom-0.5 -right-0.5 text-[9px] font-bold text-gray-400 dark:text-[#8E8E93] bg-white dark:bg-[#3A3A3C] border border-gray-100 dark:border-white/[0.05] rounded-[4px] px-1 shadow-sm pointer-events-none">
              R
            </span>
          </button>
          
          <button
            onClick={() => setPlaybackSpeed(playbackSpeed === 1 ? 0.75 : 1)}
            className="flex items-center justify-center h-[28px] px-3 rounded-full bg-gray-50/80 dark:bg-[#2C2C2E]/60 backdrop-blur-md border border-black/[0.03] dark:border-white/[0.05] text-gray-500 dark:text-[#8E8E93] hover:bg-gray-100 dark:hover:bg-[#3A3A3C] hover:text-gray-700 dark:hover:text-[#EBEBF5] transition-all active:scale-[0.96] shadow-sm select-none"
            title="Playback Speed"
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={playbackSpeed}
                initial={{ opacity: 0, y: 4, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.9 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="text-[11px] font-semibold tabular-nums tracking-wide leading-none"
              >
                {playbackSpeed}x
              </motion.span>
            </AnimatePresence>
          </button>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleHilfe}
            disabled={phase !== "Question"}
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors",
              phase !== "Question" && "opacity-0 pointer-events-none"
            )}
            title="Hilfe (H)"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          <div className="flex gap-1.5">
            {[0, 1, 2, 3].map((step) => (
              <div 
                key={step} 
                className={cn(
                  "w-2.5 h-2.5 rounded-full transition-colors",
                  (card.isArchived || card.masteryLevel > step) ? "bg-blue-600 dark:bg-blue-500" : "bg-gray-200 dark:bg-gray-700"
                )}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center text-center w-full">
        <div className="text-xl md:text-2xl font-medium tracking-tight leading-relaxed text-gray-900  dark:text-[#F5F5F7] w-full max-w-lg mb-4">
          {parts[0]}
          
          {phase === "Answer" ? (
            <span className={cn(
              "inline-block align-baseline mx-1 border-0 border-b-2 bg-transparent outline-none rounded-none py-0 px-1 transition-colors",
              parsedTargetWord ? parsedTargetWord.borderClasses + " " + parsedTargetWord.textClasses : "border-blue-600/30 dark:border-blue-500/40 text-blue-600 dark:text-blue-500"
            )}>
              {parsedTargetWord ? (
                <><span className={parsedTargetWord.articleClasses}>{shouldCapitalize ? parsedTargetWord.article.charAt(0).toUpperCase() + parsedTargetWord.article.slice(1) : parsedTargetWord.article}</span> {parsedTargetWord.rest}</>
              ) : (
                displayTargetWord
              )}
            </span>
          ) : (
            <>
              {isMultipleChoice ? (
                <span className="inline-block align-baseline mx-1 min-w-[3rem] border-0 border-b-2 border-black/10 dark:border-white/20 bg-transparent rounded-none py-0 px-1 text-transparent">
                  {displayTargetWord}
                </span>
              ) : (
                <span className="inline-block relative align-baseline mx-1 min-w-[4rem] border-0 border-b-2 border-black/20 dark:border-white/20 focus-within:border-blue-600 dark:border-blue-500 dark:focus-within:border-blue-600 dark:border-blue-500 focus-within:ring-0 bg-transparent outline-none rounded-none py-0 px-1 transition-colors">
                  <span className="inline-block w-full text-center">
                    {renderInputChars()}
                  </span>
                  <input
                    ref={inputRef}
                    autoFocus
                    type="text"
                    value={inputText}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    className="absolute inset-0 opacity-0 cursor-text w-full h-full"
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

        <div className="mt-4 mb-6 w-full text-center">
          <p className="text-sm font-normal text-gray-500 dark:text-[#8E8E93] max-w-lg mx-auto leading-relaxed">
            {card.translation}
          </p>
          
          {phase === "Answer" && card.baseWordInfo && (
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="mt-6 flex flex-col items-center gap-2"
            >
              <div
                className={cn(
                  "px-5 py-3.5 border rounded-2xl flex items-center justify-center backdrop-blur-md shadow-sm mx-auto w-fit max-w-[95%] overflow-hidden relative",
                  parsedBaseWord 
                    ? parsedBaseWord.colorClasses 
                    : "bg-slate-800/70 dark:bg-[#2C2C2E]/80 border-white/10 dark:border-white/[0.05] shadow-lg"
                )}
              >
                {!parsedBaseWord && <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none" />}
                <span className={cn(
                  "text-xs sm:text-sm font-medium text-center tracking-wide font-sans z-10 whitespace-nowrap overflow-hidden text-ellipsis",
                  parsedBaseWord ? parsedBaseWord.textClasses : "text-slate-200 dark:text-[#EBEBF5]"
                )}>
                  {parsedBaseWord ? (
                    <><span className={parsedBaseWord.articleClasses}>{parsedBaseWord.article}</span> {parsedBaseWord.rest}</>
                  ) : (
                    parsedInfo.main
                  )}
                </span>
              </div>
              
              {parsedInfo.sub && (
                <span className="text-[13px] text-gray-500 dark:text-[#8E8E93] font-medium tracking-wide">
                  {parsedInfo.sub}
                </span>
              )}
            </motion.div>
          )}
        </div>


      </div>

      <div className="mt-2 w-full">
        {phase === "Question" && isMultipleChoice && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="grid grid-cols-2 gap-4"
          >
            {card.options.map((opt, idx) => {
              const displayOpt = shouldCapitalize ? opt.charAt(0).toUpperCase() + opt.slice(1) : opt;
              return (
              <button
                key={opt}
                onClick={() => handleOptionClick(opt)}
                className="py-3 px-5 rounded-xl text-base font-medium bg-gray-50 dark:bg-[#2C2C2E] text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-[#3A3A3C] transition-all duration-150 ease-out active:scale-[0.99] border border-black/[0.05] dark:border-white/[0.06] relative flex items-center justify-between gap-3"
              >
                <span className="flex-1 text-center pr-2">{displayOpt}</span>
                <span className="w-5 h-5 rounded bg-black/5 dark:bg-white/10 text-gray-500 dark:text-white/50 text-xs font-mono flex items-center justify-center flex-shrink-0 pointer-events-none">
                  {idx + 1}
                </span>
              </button>
            )})}
          </motion.div>
        )}

        {phase === "Answer" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center w-full mt-4"
          >
            <button
              ref={nextButtonRef}
              onClick={onNext}
              autoFocus
              className="w-full py-4 rounded-[16px] text-lg font-semibold bg-blue-600 dark:bg-blue-500 text-white hover:bg-blue-700 dark:hover:bg-blue-400 shadow-sm transition-transform duration-150 ease-out active:scale-[0.98]"
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
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  return (
    <button onClick={toggle} className="p-2 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
      {isDark ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
    </button>
  );
}

// --- MAIN APP COMPONENT ---



function ActivityWidget() {
  const { appLanguage } = useStore();
  const [daily, setDaily] = useState<Record<string, any>>({});

  useEffect(() => {
    const loadProgress = () => {
      try {
        const stored = localStorage.getItem(`daily_activity_${appLanguage}`);
        if (stored) setDaily(JSON.parse(stored));
        else setDaily({});
      } catch (e) {}
    };
    loadProgress();
    window.addEventListener('storage-update', loadProgress);
    return () => window.removeEventListener('storage-update', loadProgress);
  }, [appLanguage]);

  const todayStr = new Date().toLocaleDateString('en-CA');
  const rawCount = daily[todayStr];
  const todayCount = typeof rawCount === 'number' ? rawCount : (rawCount?.total || (typeof rawCount === 'string' ? parseInt(rawCount) || 0 : 0));

  return (
    <div className="flex flex-col items-center justify-center px-2 mr-1">
      <span className="text-[9px] uppercase tracking-[0.2em] font-medium text-gray-400 dark:text-gray-500 leading-none mb-1">Heute</span>
      <span className="text-xl font-light tabular-nums text-gray-900 dark:text-white leading-none">{todayCount}</span>
    </div>
  );
}

function LanguageSelector() {
  const { appLanguage, setAppLanguage } = useStore();
  return (
    <div className="absolute top-5 left-4 md:top-6 md:left-6 z-50 flex items-center bg-gray-100 dark:bg-[#1C1C1E] border border-black/[0.05] dark:border-white/[0.08] p-0.5 rounded-xl shadow-sm">
      {(['DE', 'EN'] as const).map(lang => (
        <button
          key={lang}
          onClick={() => setAppLanguage(lang)}
          className={cn(
            "text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors",
            appLanguage === lang 
              ? "bg-white dark:bg-white/15 text-gray-900 dark:text-white shadow-sm" 
              : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          {lang}
        </button>
      ))}
    </div>
  );
}

function HeaderWidgets({ activeBook, onBack }: { activeBook?: BookMeta | null, onBack?: () => void }) {
  return (
    <>
      {activeBook ? (
        <div className="absolute top-5 left-4 md:top-6 md:left-6 z-50">
          <button onClick={onBack} className="text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-white/70 dark:hover:text-white transition-colors flex items-center gap-1 cursor-pointer bg-white/50 dark:bg-black/20 backdrop-blur-md px-3 py-1.5 rounded-full border border-black/5 dark:border-white/10 shadow-sm hover:shadow-md">
            <span className="text-lg leading-none">&lsaquo;</span> {activeBook.title}
          </button>
        </div>
      ) : (
        <LanguageSelector />
      )}
      <div className="absolute top-5 right-4 md:top-6 md:right-6 pr-2 flex items-center gap-3.5 z-50">
        <ActivityWidget />
        <DarkModeToggle />
      </div>
    </>
  );
}



const BookCard = React.memo(({ book, onClick, onEdit, onDelete }: { book: BookMeta, onClick: () => void, onEdit: (e:any)=>void, onDelete: (e:any)=>void }) => {
  const actualCoverImage = book.coverImage || (book.coverType === 'image' ? book.coverValue : null);
  const isImage = !!actualCoverImage;
  const tintColor = book.tintColor || book.coverValue || '#1C1C1E';

  return (
    <div className="relative group w-full h-full">
      {/* Glow Behind */}
      <div 
        className="absolute inset-0 opacity-0 group-hover:opacity-60 transition-opacity duration-500 rounded-2xl transform-gpu translate-z-0 will-change-transform" 
        style={{ boxShadow: `0 20px 60px -10px ${tintColor}` }} 
      />
      {/* Card */}
      <div onClick={onClick} className="relative z-10 cursor-pointer aspect-[2/3] rounded-2xl overflow-hidden shadow-md hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 flex flex-col bg-[#0A0A0C]" style={isImage ? {} : { backgroundColor: tintColor }}>
        {isImage && (
          <img src={actualCoverImage} className="absolute inset-0 w-full h-full object-cover" alt="Cover" />
        )}
        
        {/* Inner Ring */}
        <div className="absolute inset-0 rounded-2xl ring-1 ring-white/10 pointer-events-none z-30" />
        
        <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-40">
          <button onClick={onEdit} className="p-2 text-white/70 hover:text-white bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full transition-all">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-2 text-white/70 hover:text-red-400 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full transition-all">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        
        <div className="absolute inset-y-0 left-0 w-4 bg-black/20 mix-blend-overlay border-r border-white/10 z-20 pointer-events-none" />
        {isImage && <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0C] via-[#0A0A0C]/40 to-transparent z-10 pointer-events-none" />}
        
        <div className="relative z-20 flex-1 flex flex-col justify-end p-4 md:p-5">
          <h3 className="text-lg md:text-xl font-bold text-white leading-tight mb-1">{book.title}</h3>
          {book.subtitle && <p className="text-xs md:text-sm font-medium text-white/70">{book.subtitle}</p>}
        </div>
      </div>
    </div>
  );
});
BookCard.displayName = "BookCard";


const DeckCard = React.memo(({ 
  deck, isCompleted, activeTab, onCardClick, onRename, onDelete, onEditTheory, onViewTheory, onStartDictation 
}: { 
  deck: Deck; isCompleted: boolean; activeTab: string; 
  onCardClick: (id: string) => void; onRename: (id: string, name: string) => void; 
  onDelete: (id: string, name: string) => void; 
  onEditTheory: (id: string) => void; onViewTheory: (id: string) => void; 
  onStartDictation: (id: string) => void;
}) => {
  const total = deck.cards.length;
  const mastered = deck.cards.filter(c => c.isArchived).length;
  const progressPercentage = total > 0 ? (mastered / total) * 100 : 0;

  return (
    <div 
      onClick={() => { initAudioCtx(); onCardClick(deck.id); }}
      className={cn(
        "group cursor-pointer bg-white/80 dark:bg-[#1C1C1E]/70 backdrop-blur-3xl rounded-[28px] p-8 border border-black/[0.08] dark:border-white/[0.08] shadow-sm dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-colors duration-200 hover:-translate-y-1 active:scale-[0.98] active:translate-y-0 min-h-[160px] flex flex-col relative will-change-transform transform-gpu translate-z-0",
        isCompleted && "opacity-60 hover:opacity-100"
      )}
    >
      <div className="absolute top-6 right-6 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={(e) => { e.stopPropagation(); onRename(deck.id, deck.name); }}
          className="p-2.5 text-gray-300 hover:text-blue-600 dark:text-blue-500 transition-all duration-100 active:scale-[0.98] rounded-full"
        >
          <Edit2 className="w-4 h-4" />
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(deck.id, deck.name); }}
          className="p-2.5 text-gray-300 hover:text-red-500 transition-all duration-100 active:scale-[0.98] rounded-full"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="mb-6 flex items-start min-h-[3em] leading-[1.35]">
        <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-[#F5F5F7] pr-20 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
          {deck.name}
          {isCompleted && <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 inline-block ml-2 align-text-bottom" />}
        </h3>
      </div>
      
      <div className="mt-auto">
        <div className="flex items-center justify-between w-full text-sm font-bold mb-3">
          <div className="flex items-center gap-2">
            {activeTab === 'Grammatik' && (
              <DeckTheoryIndicator 
                deckId={deck.id} 
                onOpenEdit={(e) => { e.stopPropagation(); onEditTheory(deck.id); }} 
                onOpenView={(e) => { e.stopPropagation(); onViewTheory(deck.id); }} 
              />
            )}
            <button
              onClick={(e) => { e.stopPropagation(); initAudioCtx(); onStartDictation(deck.id); }}
              className="flex items-center justify-center p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 rounded-md transition-all cursor-pointer"
              title="Dictation Mode"
            >
              <Mic className="w-4 h-4" />
            </button>
          </div>
          <span className={cn("ml-auto", isCompleted ? "text-green-600" : "text-gray-400")}>{mastered} / {total}</span>
        </div>
        <div className="h-1 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700 ease-out",
              isCompleted ? "bg-green-500" : "bg-blue-600 dark:bg-blue-500"
            )}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>
    </div>
  );
});
DeckCard.displayName = "DeckCard";

function BookEditorModal({ book, onClose, onSave }: { book?: BookMeta | null, onClose: () => void, onSave: (b: BookMeta) => void }) {
  useScrollLock(true);
  const { appLanguage } = useStore();
  const [title, setTitle] = useState(book?.title || "");
  const [subtitle, setSubtitle] = useState(book?.subtitle || "");
  const [tintColor, setTintColor] = useState(book?.tintColor || book?.accentColor || book?.coverValue || "#1C1C1E");
  const [coverImage, setCoverImage] = useState<string | null>(book?.coverImage || (book?.coverType === 'image' ? book.coverValue || null : null));
  const [activeLevels, setActiveLevels] = useState<LanguageLevel[]>(book?.activeLevels || ['A1', 'A2', 'B1', 'B2', 'C1-C2']);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const allLevels: LanguageLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1-C2'];

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;
        
        if (height > MAX_HEIGHT) {
          width = width * (MAX_HEIGHT / height);
          height = MAX_HEIGHT;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          setCoverImage(dataUrl);
        }
      };
      img.src = URL.createObjectURL(file);
    }
  };

  const toggleLevel = (lvl: LanguageLevel) => {
    setActiveLevels(prev => 
      prev.includes(lvl) ? prev.filter(l => l !== lvl) : [...prev, lvl]
    );
  };
  
  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      id: book?.id || crypto.randomUUID(),
      language: book?.language || appLanguage,
      title: title.trim(),
      subtitle: subtitle.trim(),
      tintColor,
      coverImage,
      activeLevels: activeLevels.length ? activeLevels : ['A1']
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overscroll-contain touch-none" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} onClick={e => e.stopPropagation()} className="backdrop-blur-xl bg-white/95 dark:bg-[#1C1C1E]/95 border border-gray-200 dark:border-white/10 rounded-3xl p-6 max-w-sm w-full shadow-2xl flex flex-col gap-5 max-h-[85vh] overflow-y-auto custom-scrollbar">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">{book ? 'Buch bearbeiten' : 'Neues Buch'}</h2>
        
        <div className="space-y-3">
          <input type="text" placeholder="Titel" value={title} onChange={e => setTitle(e.target.value)} className="w-full px-4 py-3 bg-gray-50 dark:bg-black/50 border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-600 dark:border-blue-500 transition-colors font-medium" />
          <input type="text" placeholder="Untertitel (optional)" value={subtitle} onChange={e => setSubtitle(e.target.value)} className="w-full px-4 py-3 bg-gray-50 dark:bg-black/50 border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-600 dark:border-blue-500 transition-colors font-medium" />
        </div>
        
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cover Foto</label>
              <button onClick={() => fileInputRef.current?.click()} className="text-xs font-medium text-blue-600 dark:text-blue-500 hover:text-[#0056b3]">
                + Foto laden
              </button>
              <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
            </div>
            
            {coverImage && (
              <div className="relative h-24 rounded-xl overflow-hidden mb-3 border border-gray-200 dark:border-white/10 group">
                <img src={coverImage} alt="Cover preview" className="w-full h-full object-cover" />
                <button onClick={() => setCoverImage(null)} className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-xs text-white font-medium bg-black/60 px-3 py-1.5 rounded-full shadow-sm">Entfernen</span>
                </button>
              </div>
            )}
          </div>
          
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">Tint Color (Akzent & Glow)</label>
            <div className="flex gap-2">
              {['#1C1C1E', '#FF3B30', '#FF9500', '#34C759', '#007AFF', '#5856D6', '#AF52DE'].map(c => (
                <button key={c} onClick={() => setTintColor(c)} className={`w-8 h-8 rounded-full border-2 transition-all ${tintColor === c ? 'border-white scale-110 shadow-md' : 'border-transparent hover:scale-105'}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">Level</label>
            <div className="flex flex-wrap gap-2">
              {allLevels.map(lvl => {
                const isActive = activeLevels.includes(lvl);
                return (
                  <button 
                    key={lvl} 
                    onClick={() => toggleLevel(lvl)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${isActive ? 'bg-blue-600 dark:bg-blue-500 border-blue-600 dark:border-blue-500 text-white' : 'bg-gray-100 dark:bg-white/5 border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10'}`}
                  >
                    {lvl}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-2">
          <button onClick={onClose} className="flex-1 py-3.5 font-semibold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 rounded-xl transition-colors">Abbrechen</button>
          <button onClick={handleSave} className="flex-1 py-3.5 font-semibold text-white bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-400 rounded-xl transition-colors shadow-sm">Speichern</button>
        </div>
      </motion.div>
    </div>
  );
}

function DeckTheoryIndicator({ deckId, onOpenEdit, onOpenView }: { deckId: string, onOpenEdit: (e:any)=>void, onOpenView: (e:any)=>void }) {
  const [hasTheory, setHasTheory] = useState(false);
  useEffect(() => {
    const check = () => setHasTheory(!!localStorage.getItem(`deck_theory_${deckId}`));
    check();
    window.addEventListener('theory-update', check);
    return () => window.removeEventListener('theory-update', check);
  }, [deckId]);

  if (hasTheory) {
    return (
      <button onClick={onOpenView} className="flex items-center gap-1.5 text-[11px] font-medium text-gray-700 dark:text-gray-300 bg-gray-100/80 dark:bg-white/10 border border-black/5 dark:border-white/[0.05] px-2.5 py-1 rounded-full hover:bg-gray-200 dark:hover:bg-white/15 transition-all cursor-pointer backdrop-blur-md">
        <BookOpen className="w-3.5 h-3.5 opacity-70" />
        Theorie
      </button>
    );
  }
  return (
    <button onClick={onOpenEdit} className="text-xs font-medium text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/80 px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-white/5 transition-all">
      + Theorie
    </button>
  );
}

function TheoryEditorModal({ deckId, onClose }: { deckId: string, onClose: () => void }) {
  useScrollLock(true);
  const [text, setText] = useState("");
  useEffect(() => {
    setText(localStorage.getItem(`deck_theory_${deckId}`) || "");
  }, [deckId]);

  const handleSave = () => {
    if (text.trim()) {
      localStorage.setItem(`deck_theory_${deckId}`, text);
    } else {
      localStorage.removeItem(`deck_theory_${deckId}`);
    }
    window.dispatchEvent(new Event('theory-update'));
    syncAppStateToCloud();
    onClose();
  };

  const handleDelete = () => {
    localStorage.removeItem(`deck_theory_${deckId}`);
    window.dispatchEvent(new Event('theory-update'));
    syncAppStateToCloud();
    onClose();
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setText(ev.target?.result as string);
      reader.readAsText(file);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overscroll-contain touch-none" onClick={onClose}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} 
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="backdrop-blur-xl bg-white/95 dark:bg-[#1C1C1E]/95 border border-gray-200 dark:border-white/10 rounded-2xl p-5 max-w-lg w-full shadow-2xl flex flex-col"
      >
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Konzept bearbeiten</h2>
        <textarea 
          value={text} 
          onChange={(e) => setText(e.target.value)}
          placeholder="Вставьте конспект в формате Markdown (# Правило, > Формула, примеры)..."
          className="w-full min-h-[150px] p-4 bg-gray-50 dark:bg-black/50 border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-[#F5F5F7] placeholder-gray-400 focus:outline-none focus:border-blue-600 dark:border-blue-500 transition-colors resize-y mb-4"
        />
        <div className="flex items-center justify-between mb-6">
          <label className="cursor-pointer flex items-center gap-2 text-sm text-blue-600 dark:text-blue-500 hover:text-[#0056b3] transition-colors">
            <Upload className="w-4 h-4" />
            <span>.md laden</span>
            <input type="file" accept=".md,.txt" className="hidden" onChange={handleFile} />
          </label>
        </div>
        <div className="flex gap-3 mt-auto">
          <button onClick={onClose} className="flex-1 py-3 font-semibold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 rounded-xl transition-colors">
            Abbrechen
          </button>
          {text && (
            <button onClick={handleDelete} className="flex-1 py-3 font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors">
              Löschen
            </button>
          )}
          <button onClick={handleSave} className="flex-1 py-3 font-semibold text-white bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-400 rounded-xl transition-colors">
            Speichern
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function TheoryViewModal({ deckId, onClose, onStartSession, onEdit }: { deckId: string, onClose: () => void, onStartSession: () => void, onEdit: () => void }) {
  useScrollLock(true);
  const [text, setText] = useState("");
  useEffect(() => {
    setText(localStorage.getItem(`deck_theory_${deckId}`) || "");
  }, [deckId]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === ' ' && !e.repeat && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        onStartSession();
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [onClose, onStartSession]);

  const MarkdownComponents = {
    p: ({ children }: any) => {
      const firstChild = Array.isArray(children) ? children[0] : children;
      if (typeof firstChild === 'string') {
        const textStr = firstChild.trim();
        if (textStr.startsWith('💡WIDGET_TEMPLATE💡')) {
          const contentStr = textStr.replace('💡WIDGET_TEMPLATE💡', '');
          const rest = Array.isArray(children) ? children.slice(1) : [];
          return (
            <div className="bg-blue-50/50 dark:bg-blue-500/10 border border-blue-600/20 dark:border-blue-500/20 rounded-2xl px-5 py-5 my-6 shadow-sm">
               <div className="text-[11px] font-semibold tracking-[0.15em] text-blue-600 dark:text-blue-500 uppercase mb-2">Ключевой шаблон</div>
               <div className="text-[16px] font-medium text-gray-900 dark:text-white leading-relaxed">
                 {contentStr}
                 {rest}
               </div>
            </div>
          );
        }
      }
      return <p className="text-[15px] leading-relaxed text-gray-700 dark:text-white/80 my-3">{children}</p>;
    },
    strong: ({ children }: any) => <strong className="font-semibold text-gray-900 dark:text-white">{children}</strong>,
    em: ({ children }: any) => <em className="italic text-gray-600 dark:text-white/70">{children}</em>,
    h1: ({ children }: any) => <h1 className="text-xl font-bold tracking-tight text-black dark:text-white mt-8 mb-4">{children}</h1>,
    h2: ({ children }: any) => <h2 className="text-lg font-bold tracking-tight text-black dark:text-white mt-8 mb-4">{children}</h2>,
    h3: ({ children }: any) => <h3 className="text-xs font-semibold tracking-[0.15em] text-gray-500 dark:text-white/40 uppercase mt-8 mb-3">{children}</h3>,
    ul: ({ children }: any) => <ul className="space-y-3 my-4 ml-5 list-disc marker:text-gray-400 dark:marker:text-white/30">{children}</ul>,
    ol: ({ children }: any) => <ol className="space-y-3 my-4 ml-5 list-decimal marker:text-gray-900 dark:marker:text-white/50 font-medium">{children}</ol>,
    li: ({ children }: any) => <li className="text-[15px] leading-relaxed text-gray-700 dark:text-white/80 pl-1">{children}</li>,
    blockquote: ({ children }: any) => {
      const checkAchtung = (node: any): boolean => {
        if (typeof node === 'string') return node.includes('⚠️');
        if (Array.isArray(node)) return node.some(checkAchtung);
        if (node && node.props && node.props.children) return checkAchtung(node.props.children);
        return false;
      };
      const isAchtung = checkAchtung(children);
      
      if (isAchtung) {
         return (
           <blockquote className="bg-amber-500/10 border border-amber-500/20 px-5 py-5 rounded-2xl my-6 shadow-sm">
             <div className="text-[15px] leading-relaxed font-medium text-amber-600 dark:text-amber-500 [&>p]:my-0">{children}</div>
           </blockquote>
         );
      }
      
      return (
        <blockquote className="bg-blue-50/50 dark:bg-blue-500/10 border border-blue-600/20 dark:border-blue-500/20 px-5 py-5 rounded-2xl my-6 shadow-sm">
          <div className="text-[15px] leading-relaxed text-gray-700 dark:text-white/80 [&>p]:my-0">{children}</div>
        </blockquote>
      );
    },
    code: ({ node, inline, className, children, ...props }: any) => {
      if (!inline) {
        return (
          <pre className="bg-gray-100 dark:bg-black/40 p-4 rounded-xl overflow-x-auto font-mono text-[13px] text-gray-800 dark:text-gray-300 my-4 border border-gray-200 dark:border-white/10 custom-scrollbar">
            <code className={className} {...props}>{children}</code>
          </pre>
        );
      }
      return (
        <code className="bg-gray-100 dark:bg-white/10 text-pink-600 dark:text-pink-400 px-1.5 py-0.5 rounded-md font-mono text-[13px]" {...props}>
          {children}
        </code>
      );
    }
  };

  const renderedContent = useMemo(() => {
    let preprocessed = (text || '').replace(/^( {4,}|\t+)/gm, '  ');
    
    // Auto-wrap ⚠️ blocks into blockquotes until the next blank line
    preprocessed = preprocessed.replace(/^(⚠️.*(?:\n(?!\s*\n).*)*)/gm, (match) => {
       return match.split('\n').map(line => line.trim().startsWith('>') ? line : '> ' + line).join('\n');
    });

    // Super robust Widget Template catcher (catches with or without **, with or without >)
    preprocessed = preprocessed.replace(/^[>\s]*(?:\*\*|__)?\s*(Ключевой шаблон|Шаблон)\s*(?:\*\*|__)?\s*[:\-]?\s*(.*)/gim, '💡WIDGET_TEMPLATE💡$2');
    
    return (
      <ReactMarkdown components={MarkdownComponents}>{preprocessed}</ReactMarkdown>
    );
  }, [text]);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm p-0 md:p-4 overscroll-contain touch-none" onClick={onClose}>
      <motion.div 
        initial={{ opacity: 0, y: 100 }} 
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl mx-auto backdrop-blur-3xl bg-white/95 dark:bg-[#1C1C1E]/90 border border-black/5 dark:border-white/[0.08] rounded-t-[32px] md:rounded-[32px] p-6 shadow-2xl flex flex-col max-h-[85vh] transform-gpu will-change-[transform,opacity]" 
      >
        <div className="w-12 h-1.5 bg-gray-300 dark:bg-white/20 rounded-full mx-auto mb-5 shrink-0" />
        
        <div 
          className="flex-1 overflow-y-auto pr-2 custom-scrollbar relative" 
          style={{ 
            maxHeight: '60vh', 
            WebkitMaskImage: 'linear-gradient(to bottom, black 85%, transparent 100%)', 
            maskImage: 'linear-gradient(to bottom, black 85%, transparent 100%)' 
          }}
        >
          <div className="pb-16">
            {text ? renderedContent : (<div className="flex flex-col items-center justify-center py-20 opacity-50"><BookOpen className="w-12 h-12 mb-4" /><p>Keine Theorie für dieses Deck gefunden.</p></div>)}
          </div>
        </div>
        
        <div className="shrink-0 pt-5 mt-2 border-t border-black/5 dark:border-white/10 bg-transparent">
          <button 
            onClick={onStartSession}
            className="w-full bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-400 text-white font-semibold py-4 rounded-2xl transition-all shadow-[0_4px_14px_0_rgba(10,132,255,0.3)] dark:shadow-[0_4px_14px_0_rgba(10,132,255,0.35)] active:scale-[0.98] text-lg mb-3"
          >
            Start
          </button>
          <button onClick={onEdit} className="w-full text-center text-xs font-medium text-gray-400 hover:text-gray-600 dark:text-white/30 dark:hover:text-white/80 transition-colors">
            Konzept bearbeiten
          </button>
        </div>
      </motion.div>
    </div>
  );
}


// --- CLOUD SYNC HELPER ---
export const syncAppStateToCloud = async () => {
  if (typeof window === 'undefined') return;
  const state: any = { theory: {} };
  
  const order = localStorage.getItem('deck_order');
  if (order) state.deckOrder = JSON.parse(order);
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('deck_theory_')) {
      state.theory[key] = localStorage.getItem(key);
    }
  }
  
  await supabase.from('user_stats').upsert({
    language: 'GLOBAL_APP_STATE',
    daily_activity: state
  }, { onConflict: 'language' });
};

export default function App() {
  const [isPending, startTransition] = useTransition();
  const { syncError, setSyncError, decks, addDeck, deleteDeck, renameDeck, setDecks, isLoaded, appLanguage, setAppLanguage, books, setBooks, addBook, updateBook, deleteBook, deckOrder, setDeckOrder } = useStore();
  const [isMounted, setIsMounted] = useState(false);
  const [draggedDeckId, setDraggedDeckId] = useState<string | null>(null);
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [dictationDeckId, setDictationDeckId] = useState<string | null>(null);
  const [reviewCards, setReviewCards] = useState<{ deckId: string, card: Flashcard }[] | null>(null);
  const [activeTab, setActiveTab] = useState<"Grammatik" | "Wörter">("Grammatik");
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [bookModal, setBookModal] = useState<{ id?: string } | null>(null);
  
  const [uploadTarget, setUploadTarget] = useState<{ category: string, level: CEFRLevel } | null>(null);
  const [renameModal, setRenameModal] = useState<{ id: string, name: string } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ id: string, name: string } | null>(null);
  const [deleteBookModal, setDeleteBookModal] = useState<{ id: string, title: string } | null>(null);
  const [renameInput, setRenameInput] = useState("");

  const handleDeckClick = useCallback((id: string) => setActiveDeckId(id), []);
  const handleRenameClick = useCallback((id: string, name: string) => { setRenameInput(name); setRenameModal({ id, name }); }, []);
  const handleDeleteClick = useCallback((id: string, name: string) => setDeleteModal({ id, name }), []);
  const handleEditTheory = useCallback((id: string) => setTheoryEditDeckId(id), []);
  const handleViewTheory = useCallback((id: string) => setTheoryViewDeckId(id), []);
  
  const handleBookClick = useCallback((id: string) => startTransition(() => setActiveBookId(id)), []);
  const handleBookEdit = useCallback((id: string) => setBookModal({ id }), []);
  const handleBookDelete = useCallback((id: string, title: string) => setDeleteBookModal({ id, title }), []);

  useEffect(() => {
    if (renameModal || deleteModal || bookModal || deleteBookModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [renameModal, deleteModal, bookModal, deleteBookModal]);


  const [theoryEditDeckId, setTheoryEditDeckId] = useState<string | null>(null);
  const [theoryViewDeckId, setTheoryViewDeckId] = useState<string | null>(null);

  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [visibleLimits, setVisibleLimits] = useState<Record<string, any>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsMounted(true);
    const savedLang = localStorage.getItem('selected_language');
    if (savedLang === 'DE' || savedLang === 'EN') {
      setAppLanguage(savedLang);
    }
    const savedOrder = localStorage.getItem('deck_order');
    if (savedOrder) {
      try {
        const parsed = JSON.parse(savedOrder);
        if (Array.isArray(parsed)) {
          useStore.getState().setDeckOrder(parsed);
        }
      } catch(e) {}
    }
    const savedSpeed = localStorage.getItem('playback_speed');
    if (savedSpeed) {
      const speed = parseFloat(savedSpeed);
      if (!isNaN(speed)) useStore.getState().setPlaybackSpeed(speed);
    }
    
    const fetchData = async () => {
      
      try {
        const cachedBooks = localStorage.getItem('cache_books');
        if (cachedBooks) setBooks(JSON.parse(cachedBooks));
        const cachedDecks = localStorage.getItem('cache_decks');
        if (cachedDecks) setDecks(JSON.parse(cachedDecks));
      } catch (e) {}
      
try {
        const [booksRes, decksRes, statsRes] = await Promise.all([
          supabase.from('books').select('*').order('created_at', { ascending: true }),
          supabase.from('decks').select('*, cards(*)').order('created_at', { ascending: true }),
          supabase.from('user_stats').select('*')
        ]);

        if (statsRes && !statsRes.error && statsRes.data) {
          const pushStats = (lang: string) => {
            const localKey = `daily_activity_${lang}`;
            const localDaily = JSON.parse(localStorage.getItem(localKey) || '{}');
            const cloudStat = statsRes.data.find((s: any) => s.language === lang) || { daily_activity: {} };
            const cloudDaily = cloudStat.daily_activity || {};
            
            let localChanged = false;
            let cloudChanged = false;
            
            const allDates = new Set([...Object.keys(localDaily), ...Object.keys(cloudDaily)]);
            allDates.forEach(date => {
              const rawCloud = cloudDaily[date];
              const rawLocal = localDaily[date];
              const cloudVal = typeof rawCloud === 'number' ? rawCloud : (rawCloud?.total || (typeof rawCloud === 'string' ? parseInt(rawCloud) || 0 : 0));
              const localVal = typeof rawLocal === 'number' ? rawLocal : (rawLocal?.total || (typeof rawLocal === 'string' ? parseInt(rawLocal) || 0 : 0));
              
              const maxVal = Math.max(cloudVal, localVal);
              
              if (maxVal > localVal || (rawLocal !== undefined && typeof rawLocal !== 'number')) {
                localDaily[date] = maxVal;
                localChanged = true;
              }
              if (maxVal > cloudVal || cloudDaily[date] === undefined) {
                cloudDaily[date] = maxVal;
                cloudChanged = true;
              }
            });

            if (localChanged) {
              localStorage.setItem(localKey, JSON.stringify(localDaily));
              window.dispatchEvent(new Event('storage-update'));
            }
            if (cloudChanged) {
              supabase.from('user_stats').upsert({
                language: lang,
                daily_activity: cloudDaily
              }, { onConflict: 'language' }).then(() => {});
            }
          };

          pushStats('DE');
          pushStats('EN');
          
          const globalStat = statsRes.data.find((s: any) => s.language === 'GLOBAL_APP_STATE');
          if (globalStat && globalStat.daily_activity) {
            const state = globalStat.daily_activity;
            if (state.deckOrder && Array.isArray(state.deckOrder)) {
              localStorage.setItem('deck_order', JSON.stringify(state.deckOrder));
              useStore.getState().setDeckOrder(state.deckOrder);
            }
            if (state.theory) {
              for (const [key, val] of Object.entries(state.theory)) {
                if (typeof val === 'string') localStorage.setItem(key, val);
              }
              window.dispatchEvent(new Event('theory-update'));
            }
          }
        }

        if (booksRes.error) {
          useStore.getState().setSyncError("Fetch Books Error: " + booksRes.error.message);
        }
        if (booksRes.data && booksRes.data.length > 0) {
          const mappedBooks = booksRes.data.map((b: any) => ({
            id: b.id,
            language: b.language,
            title: b.title,
            subtitle: b.subtitle,
            tintColor: b.tintColor || b.tintcolor || '#007AFF',
            coverImage: b.coverImage || b.coverimage || null,
            activeLevels: b.activeLevels || b.activelevels || ['A1'],
            coverType: b.coverType || b.covertype,
            coverValue: b.coverValue || b.covervalue,
            accentColor: b.accentColor || b.accentcolor
          }));
          setBooks(mappedBooks);
          localStorage.setItem('cache_books', JSON.stringify(mappedBooks));
        } else if (!booksRes.error) {
          const defaultBooks: BookMeta[] = [
            { id: 'default-de', language: 'DE', title: 'Basis Deutsch', subtitle: 'Grammatik & Wortschatz', tintColor: '#007AFF', activeLevels: ['A1', 'A2', 'B1', 'B2', 'C1-C2'] },
            { id: 'default-en', language: 'EN', title: 'Basic English', subtitle: 'Grammar & Vocabulary', tintColor: '#FF9500', activeLevels: ['A1', 'A2', 'B1', 'B2', 'C1-C2'] }
          ];
          const res = await supabase.from('books').insert(defaultBooks);
          if (res.error && res.error.message.includes('does not exist')) {
            const lowercaseDefaults = defaultBooks.map(b => ({
              id: b.id, language: b.language, title: b.title, subtitle: b.subtitle,
              tintcolor: b.tintColor, coverimage: b.coverImage, activelevels: b.activeLevels
            }));
            await supabase.from('books').insert(lowercaseDefaults);
          }
          setBooks(defaultBooks);
          localStorage.setItem('cache_books', JSON.stringify(defaultBooks));
        }

        if (decksRes.error) {
          console.error("Supabase Fetch Decks Error:", decksRes.error.message);
          // Only clear decks if we are sure it's not a network error, but for offline robustness, do NOT wipe cache.
          if (!localStorage.getItem('cache_decks')) { setDecks([]); }
        } else if (decksRes.data) {
          const langMap = JSON.parse(localStorage.getItem('deck_languages') || '{}');
          const enhancedDecks = decksRes.data.map((d: any) => ({
            ...d,
            cards: d.cards ? d.cards.map((c: any) => ({
              ...c,
              baseWordInfo: c.baseWordInfo || null
            })) : [],
            language: d.language || langMap[d.id] || 'DE',
            bookId: d.book_id || JSON.parse(localStorage.getItem('deck_books') || '{}')[d.id] || ((d.language || langMap[d.id]) === 'EN' ? 'default-en' : 'default-de')
          }));
          setDecks(enhancedDecks as Deck[]);
          localStorage.setItem('cache_decks', JSON.stringify(enhancedDecks));
        }
      } catch (err: any) {
        console.error("Network Fetch Error:", err.message);
        // Do nothing, let the cache render
      }
    };
    fetchData();
  }, [setDecks]);

  const filteredDecksList = useMemo(() => {
    return decks.filter(d => {
      if (activeBookId) return d.bookId === activeBookId;
      return (d.language || 'DE') === appLanguage;
    });
  }, [decks, activeBookId, appLanguage]);

  const groupedDecks = useMemo(() => {
    const map: Record<string, Deck[]> = {};
    filteredDecksList.forEach(d => {
      const key = `${d.category}-${d.level || 'A1'}`;
      if (!map[key]) map[key] = [];
      map[key].push(d);
    });
    
    for (const key in map) {
      map[key].sort((a, b) => {
        const indexA = deckOrder.indexOf(a.id);
        const indexB = deckOrder.indexOf(b.id);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return 0;
      });
    }
    return map;
  }, [filteredDecksList, deckOrder]);

  if (!isMounted || !isLoaded) return <main className="min-h-screen bg-[#FBFBFD] animate-pulse" />;

  if (activeDeckId) {
    return (
      <>
        <StudyInterface deckId={activeDeckId} onBack={() => setActiveDeckId(null)} />
      </>
    );
  }

  if (reviewCards) {
    return (
      <>
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
            repetitions: 0,
            baseWordInfo: parts.length >= 7 ? parts[6] : null
          });
        }
      });

      if (cards.length > 0) {
        const defaultName = file.name.replace('.csv', '');
        const newDeckId = crypto.randomUUID();
        const langMap = JSON.parse(localStorage.getItem('deck_languages') || '{}');
        langMap[newDeckId] = useStore.getState().appLanguage;
        localStorage.setItem('deck_languages', JSON.stringify(langMap));
        
        const bookMap = JSON.parse(localStorage.getItem('deck_books') || '{}');
        // If we are currently inside a book, save to that book, else use default book for language
        bookMap[newDeckId] = activeBookId || (useStore.getState().appLanguage === 'EN' ? 'default-en' : 'default-de');
        localStorage.setItem('deck_books', JSON.stringify(bookMap));
        
        addDeck({
          id: newDeckId,
          name: defaultName,
          category: uploadTarget.category,
          level: uploadTarget.level,
          cards,
          language: useStore.getState().appLanguage,
          bookId: activeBookId || (useStore.getState().appLanguage === 'EN' ? 'default-en' : 'default-de')
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



  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('deckId', id);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => setDraggedDeckId(id), 0);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('deckId');
    if (!draggedId || draggedId === targetId) return;

    const { decks, deckOrder, setDeckOrder } = useStore.getState();
    const currentOrder = deckOrder.length > 0 ? deckOrder : decks.map(d => d.id);
    
    const updatedOrder = [...currentOrder];
    if (!updatedOrder.includes(draggedId)) updatedOrder.push(draggedId);
    if (!updatedOrder.includes(targetId)) updatedOrder.push(targetId);

    const oldIndex = updatedOrder.indexOf(draggedId);
    const newIndex = updatedOrder.indexOf(targetId);

    updatedOrder.splice(oldIndex, 1);
    updatedOrder.splice(newIndex, 0, draggedId);

    setDeckOrder(updatedOrder);
    setDraggedDeckId(null);
  };

  const handleDragEnd = () => {
    setDraggedDeckId(null);
  };

  const handleLoadMore = (cat: string) => {
    setVisibleLimits(prev => ({ ...prev, [cat]: (prev[cat] || 10) + 10 }));
  };

  

  const categories = ["Grammatik", "Wörter"];
  

  
  const dueCards: { deckId: string, card: Flashcard }[] = [];
  filteredDecksList.forEach(deck => {
    deck.cards.forEach(card => {
      if (card.isArchived && card.nextReviewDate && card.nextReviewDate <= Date.now()) {
        dueCards.push({ deckId: deck.id, card });
      }
    });
  });

  const archivedCards: { deckId: string, deckName: string, card: Flashcard }[] = [];
  filteredDecksList.forEach(deck => {
    deck.cards.forEach(card => {
      if (card.isArchived) archivedCards.push({ deckId: deck.id, deckName: deck.name, card });
    });
  });

  

  const activeBook = books.find(b => b.id === activeBookId);
  const activeBookColor = activeBook?.tintColor || activeBook?.accentColor || activeBook?.coverValue || 'transparent';

  return (
      <>
        {activeBookId && (
        <div className="fixed inset-0 pointer-events-none -z-50 overflow-hidden">
          <div 
            className="absolute left-1/2 top-0 -translate-x-1/2 w-[150vw] md:w-[120vw] h-[80vh] opacity-50 dark:opacity-30 transition-colors duration-1000 transform-gpu translate-z-0 will-change-transform"
            style={{
              background: `radial-gradient(ellipse 70% 60% at 50% 0%, ${activeBookColor}40 0%, ${activeBookColor}10 45%, transparent 80%)`
            }}
          />
        </div>
      )}
        
        <HeaderWidgets activeBook={activeBook} onBack={() => startTransition(() => setActiveBookId(null))} />

      <AnimatePresence>
        {bookModal && <BookEditorModal book={bookModal.id ? books.find(b => b.id === bookModal.id) : null} onClose={() => setBookModal(null)} onSave={(b) => { if (bookModal.id) updateBook(b); else addBook(b); setBookModal(null); }} />}
        {theoryEditDeckId && <TheoryEditorModal deckId={theoryEditDeckId} onClose={() => setTheoryEditDeckId(null)} />}
        {theoryViewDeckId && <TheoryViewModal deckId={theoryViewDeckId} onClose={() => setTheoryViewDeckId(null)} onStartSession={() => { setActiveDeckId(theoryViewDeckId); setTheoryViewDeckId(null); }} onEdit={() => { setTheoryEditDeckId(theoryViewDeckId); setTheoryViewDeckId(null); }} />}
        {dictationDeckId && <DictationPlayer deck={decks.find(d => d.id === dictationDeckId)!} onClose={() => setDictationDeckId(null)} />}
      </AnimatePresence>

{/* RENAME MODAL */}
      
      <AnimatePresence>
        {renameModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overscroll-contain touch-none">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setRenameModal(null)} 
            />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#1C1C1E] rounded-[32px] p-8 w-full max-w-sm shadow-[0_20px_60px_rgb(0,0,0,0.1)] relative z-10 text-center"
            >
              <h3 className="text-xl font-bold tracking-tight text-gray-900  dark:text-[#F5F5F7] mb-6">Deck umbenennen</h3>
              <input
                type="text"
                autoFocus
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                className="w-full bg-gray-100 dark:bg-[#2C2C2E] text-gray-900  dark:text-[#F5F5F7] rounded-2xl px-5 py-4 mb-6 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                placeholder="Neuer Name"
              />
              <div className="flex gap-3">
                <button onClick={() => setRenameModal(null)} className="flex-1 py-4 font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-2xl transition-colors active:scale-[0.98]">
                  Abbrechen
                </button>
                <button onClick={() => { if (renameInput.trim()) { renameDeck(renameModal.id, renameInput.trim()); setRenameModal(null); } }} className="flex-1 py-4 font-semibold text-white bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-400 rounded-2xl transition-colors active:scale-[0.98]">
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overscroll-contain touch-none">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setDeleteModal(null)} 
            />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#1C1C1E] rounded-[32px] p-8 w-full max-w-sm shadow-[0_20px_60px_rgb(0,0,0,0.1)] relative z-10 text-center"
            >
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-gray-900  mb-3">Deck löschen?</h3>
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

      
      {/* DELETE BOOK MODAL */}
      <AnimatePresence>
        {deleteBookModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overscroll-contain touch-none">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setDeleteBookModal(null)} 
            />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#1C1C1E] rounded-[32px] p-8 w-full max-w-sm shadow-[0_20px_60px_rgb(0,0,0,0.1)] relative z-10 text-center"
            >
              <div className="w-16 h-16 bg-red-50 dark:bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white mb-3">Buch löschen?</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-8">Bist du sicher, dass du "{deleteBookModal.title}" löschen möchtest? Alle zugehörigen Decks bleiben erhalten, aber das Buch wird entfernt.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteBookModal(null)} className="flex-1 py-4 font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-[#2C2C2E] hover:bg-gray-200 dark:hover:bg-[#3A3A3C] rounded-2xl transition-colors active:scale-[0.98]">
                  Abbrechen
                </button>
                <button onClick={() => { deleteBook(deleteBookModal.id); setDeleteBookModal(null); }} className="flex-1 py-4 font-semibold text-white bg-red-500 hover:bg-red-600 rounded-2xl transition-colors active:scale-[0.98] shadow-sm">
                  Löschen
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />

      <main className="relative z-10 max-w-5xl mx-auto px-6 pt-24 pb-12 md:pt-32 md:pb-24">
        {!activeBookId ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pt-8">
            <div className="mb-12 text-center">
              <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white mb-2 tracking-tight">Bibliothek</h1>
              <p className="text-gray-500 dark:text-gray-400 font-medium">Wähle ein Buch, um zu lernen</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-10">
              {books.filter(b => b.language === appLanguage).map(book => (
                <BookCard key={book.id} book={book} onClick={() => handleBookClick(book.id)} onEdit={(e) => { e.stopPropagation(); handleBookEdit(book.id); }} onDelete={(e) => { e.stopPropagation(); handleBookDelete(book.id, book.title); }} />
              ))}
              <div onClick={() => setBookModal({})} className="cursor-pointer aspect-[2/3] rounded-[24px] border-2 border-dashed border-gray-300 dark:border-white/20 hover:border-blue-600 dark:border-blue-500 dark:hover:border-blue-600 dark:border-blue-500 hover:bg-gray-50 dark:hover:bg-white/5 transition-all flex flex-col items-center justify-center text-gray-400 hover:text-blue-600 dark:text-blue-500 group shadow-sm">
                <Plus className="w-8 h-8 mb-2 group-hover:scale-110 transition-transform" />
                <span className="font-semibold text-sm">+ Buch</span>
              </div>
            </div>
          </div>
        ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="max-w-2xl mx-auto">
          <div className="flex justify-center mb-8 pt-2">
            <div className="bg-gray-100/80 dark:bg-[#1C1C1E] p-1 rounded-xl inline-flex w-full max-w-[280px] mx-auto border border-black/[0.05] dark:border-white/[0.08]">
              {(["Grammatik", "Wörter"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => startTransition(() => setActiveTab(tab))}
                  className={cn(
                    "flex-1 px-4 py-1.5 transition-all text-xs font-medium tracking-tight rounded-lg",
                    activeTab === tab
                      ? "bg-white dark:bg-[#2C2C2E] text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-[#F5F5F7]" 
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {dueCards.length > 0 && (
            <div className="mb-10">
              <div 
                onClick={() => setReviewCards(dueCards)}
                className="bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.08] rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:border-blue-600/40 dark:hover:border-blue-500/40 transition-all shadow-sm active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-600/10 dark:bg-blue-500/10 flex items-center justify-center">
                    <RotateCw className="w-4 h-4 text-blue-600 dark:text-blue-500" />
                  </div>
                  <span className="font-medium text-sm text-gray-900 dark:text-white">Heute wiederholen</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="px-2.5 py-0.5 rounded-full bg-blue-600/10 dark:bg-blue-500/10 text-blue-600 dark:text-blue-500 text-xs font-semibold tabular-nums">
                    {dueCards.length}
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-16">
            {(() => {
              const cefrLevels: CEFRLevel[] = activeBook?.activeLevels?.length ? activeBook.activeLevels : ['A1', 'A2', 'B1', 'B2', 'C1-C2'];
              const levelConfig: Record<CEFRLevel, { label: string, badgeClass: string }> = {
                'A1': { label: 'A1', badgeClass: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-[#2C2C2E] dark:text-[#8E8E93] dark:border-white/[0.05]' },
                'A2': { label: 'A2', badgeClass: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-[#2C2C2E] dark:text-[#8E8E93] dark:border-white/[0.05]' },
                'B1': { label: 'B1', badgeClass: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-[#2C2C2E] dark:text-[#8E8E93] dark:border-white/[0.05]' },
                'B2': { label: 'B2', badgeClass: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-[#2C2C2E] dark:text-[#8E8E93] dark:border-white/[0.05]' },
                'C1-C2': { label: 'C1-C2', badgeClass: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-[#2C2C2E] dark:text-[#8E8E93] dark:border-white/[0.05]' }
              };

              return cefrLevels.map(level => {
                const sectionKey = `${activeTab}-${level}`;
                const sortedDecks = groupedDecks[`${activeTab}-${level}`] || [];

                const limit = visibleLimits[sectionKey] || 10;
                const visibleDecks = sortedDecks.slice(0, limit);
                const inProgressDecks = visibleDecks.filter(d => d.cards.length === 0 || d.cards.length !== d.cards.filter(c => c.isArchived).length);
                const completedDecks = visibleDecks.filter(d => d.cards.length > 0 && d.cards.length === d.cards.filter(c => c.isArchived).length);
                const isExpanded = expandedCategories[sectionKey] || false;

                return (
                  <section key={sectionKey}>
                    <div className="flex items-center mb-4 px-1">
                      <div className="inline-flex items-center bg-gray-100 dark:bg-[#1C1C1E] border border-black/[0.05] dark:border-white/[0.08] rounded-full p-0.5 shadow-sm">
                        <span className="h-7 px-3 flex items-center justify-center text-xs font-semibold text-gray-700 dark:text-[#8E8E93]">
                          {level}
                        </span>
                        <button 
                          onClick={() => handlePlusClick(activeTab, level)}
                          className="h-7 w-7 flex items-center justify-center rounded-full bg-white dark:bg-[#2C2C2E] text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-500 transition-colors shadow-sm"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    
                    {sortedDecks.length === 0 ? (
                      <div className="py-6 text-center bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.08] rounded-[24px] shadow-sm">
                        <p className="text-gray-400 dark:text-[#8E8E93] text-sm font-medium">
                          {appLanguage === 'EN' ? "No decks in this level yet." : "Noch keine Decks in diesem Level."}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {inProgressDecks.length > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {inProgressDecks.map(deck => (
                              <div
                                key={deck.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, deck.id)}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, deck.id)}
                                onDragEnd={handleDragEnd}
                                className={cn("transition-all duration-300", draggedDeckId === deck.id ? "opacity-30 scale-95" : "opacity-100")}
                              >
                                <DeckCard 
                                  deck={deck} 
                                  isCompleted={false} 
                                  activeTab={activeTab} 
                                  onCardClick={handleDeckClick} 
                                  onRename={handleRenameClick}
                                  onStartDictation={(id) => setDictationDeckId(id)} 
                                  onDelete={handleDeleteClick} 
                                  onEditTheory={handleEditTheory} 
                                  onViewTheory={handleViewTheory} 
                                />
                              </div>
                            ))}
                          </div>
                        )}
                        {completedDecks.length > 0 && (
                          <div className="mt-4">
                            <button 
                              onClick={() => toggleCategory(sectionKey)}
                              className="flex items-center gap-2 text-sm font-semibold text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors mx-2 mb-4"
                            >
                              <ChevronRight className={cn("w-4 h-4 transition-transform", isExpanded && "rotate-90")} />
                              <span>{appLanguage === 'EN' ? 'Archived' : 'Archiv anzeigen'}</span>
                              <span className="bg-black/5 dark:bg-white/10 text-gray-500 dark:text-gray-400 text-xs px-2 py-0.5 rounded-full ml-1">
                                {completedDecks.length}
                              </span>
                            </button>
                            
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 pb-4">
                                    {completedDecks.map(deck => (
                                      <div key={deck.id} className="opacity-70 hover:opacity-100 transition-opacity">
                                        <DeckCard 
                                          deck={deck} 
                                          isCompleted={true} 
                                          activeTab={activeTab} 
                                          onCardClick={handleDeckClick} 
                                          onRename={handleRenameClick}
                                  onStartDictation={(id) => setDictationDeckId(id)} 
                                          onDelete={handleDeleteClick} 
                                          onEditTheory={handleEditTheory} 
                                          onViewTheory={handleViewTheory} 
                                        />
                                      </div>
                                    ))}
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
        )}
      </main>
    </>
  );
}


const RU_TO_DE: Record<string, string> = {
  'й':'q', 'ц':'w', 'у':'e', 'к':'r', 'е':'t', 'н':'z', 'г':'u', 'ш':'i', 'щ':'o', 'з':'p', 'х':'ü', 'ъ':'+',
  'ф':'a', 'ы':'s', 'в':'d', 'а':'f', 'п':'g', 'р':'h', 'о':'j', 'л':'k', 'д':'l', 'ж':'ö', 'э':'ä',
  'я':'y', 'ч':'x', 'с':'c', 'м':'v', 'и':'b', 'т':'n', 'ь':'m', 'б':',', 'ю':'.', 'ё':'^',
  'Й':'Q', 'Ц':'W', 'У':'E', 'К':'R', 'Е':'T', 'Н':'Z', 'Г':'U', 'Ш':'I', 'Щ':'O', 'З':'P', 'Х':'Ü', 'Ъ':'*',
  'Ф':'A', 'Ы':'S', 'В':'D', 'А':'F', 'П':'G', 'Р':'H', 'О':'J', 'Л':'K', 'Д':'L', 'Ж':'Ö', 'Э':'Ä',
  'Я':'Y', 'Ч':'X', 'С':'C', 'М':'V', 'И':'B', 'Т':'N', 'Ь':'M', 'Б':';', 'Ю':':', 'Ё':'°',
  '«':'"', '»':'"', '„':'"', '“':'"'
};

function DictationPlayer({ deck, onClose }: { deck: Deck, onClose: () => void }) {
  useScrollLock(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [inputText, setInputText] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isPlayingRef = useRef(false);
  const audioRateRef = useRef(1.0);

  const cardsToPlay = useMemo(() => {
    let unmastered = deck.cards.filter(c => c.masteryLevel < 4 && !c.isArchived);
    if (unmastered.length === 0) unmastered = [...deck.cards];
    return unmastered.sort(() => Math.random() - 0.5);
  }, [deck]);

  const card = cardsToPlay[currentIndex];
  
  const targetSentence = useMemo(() => {
    if (!card) return "";
    return card.sentence.replace("___", card.targetWord).replace(/\s+/g, " ").trim();
  }, [card]);

  useEffect(() => {
    if (!targetSentence) return;
    let startText = "";
    while (startText.length < targetSentence.length && /[.,?!;:«»„“"'()[\]{}\-—–]/.test(targetSentence[startText.length])) {
      startText += targetSentence[startText.length];
    }
    setInputText(startText);
  }, [targetSentence, currentIndex]);

  const playMicrosoftAudio = useCallback(async (rate: number = 1.0, force: boolean = false) => {
    if (!targetSentence) return;
    if (isPlayingRef.current && !force) return;
    
    audioRateRef.current = rate;
    isPlayingRef.current = true;
    setIsPlayingAudio(true);
    
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
    }
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: targetSentence })
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.playbackRate = rate;
      audioRef.current = audio;
      
      audio.onended = () => {
        isPlayingRef.current = false;
        setIsPlayingAudio(false);
        resetIdleTimer();
      };
      audio.onerror = () => {
        isPlayingRef.current = false;
        setIsPlayingAudio(false);
      };
      
      await audio.play();
    } catch (e) {
      isPlayingRef.current = false;
      setIsPlayingAudio(false);
    }
  }, [targetSentence]);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    
    idleTimerRef.current = setTimeout(() => {
      if (!isPlayingRef.current) {
        playMicrosoftAudio(audioRateRef.current);
      }
    }, 1000);
  }, [playMicrosoftAudio]);

  useEffect(() => {
    playMicrosoftAudio(1.0);
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.onended = null;
      }
    };
  }, [playMicrosoftAudio]);

  const handleSuccess = useCallback(() => {
    setIsSuccess(true);
    playFeedbackSound(true);
    if (navigator.vibrate) navigator.vibrate(50);
    
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      isPlayingRef.current = false;
      setIsPlayingAudio(false);
    }

    setTimeout(() => {
      if (currentIndex < cardsToPlay.length - 1) {
        setCurrentIndex(prev => prev + 1);
        setIsSuccess(false);
      } else {
        onClose();
      }
    }, 1000);
  }, [currentIndex, cardsToPlay.length, onClose]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      
      if (e.key === 'Tab' || e.key === 'ArrowUp') {
        e.preventDefault();
        playMicrosoftAudio(audioRateRef.current, true);
        return;
      }
      
      if (isSuccess) return;

      resetIdleTimer();

      if (e.key === 'Backspace') {
        e.preventDefault();
        setInputText(prev => {
          if (prev.length === 0) return prev;
          if (prev[prev.length - 1] !== targetSentence[prev.length - 1]) {
            return prev.slice(0, -1);
          }
          let res = prev.slice(0, -1);
          while (res.length > 0 && /[.,?!;:«»„“"'()[\]{}\-—–]/.test(res[res.length - 1])) {
            res = res.slice(0, -1);
          }
          return res;
        });
        return;
      }

      if (e.key.length === 1) {
        e.preventDefault();
        
        if (inputText.length > 0 && inputText[inputText.length - 1] !== targetSentence[inputText.length - 1]) {
          if (navigator.vibrate) navigator.vibrate([20, 50, 20]);
          return;
        }
        
        if (inputText.length >= targetSentence.length) return;
        
        const typedChar = RU_TO_DE[e.key] || e.key;
        const expectedChar = targetSentence[inputText.length];
        
        if (typedChar === expectedChar) {
          playTockSound();
          let newText = inputText + typedChar;
          while (newText.length < targetSentence.length && /[.,?!;:«»„“"'()[\]{}\-—–]/.test(targetSentence[newText.length])) {
            newText += targetSentence[newText.length];
          }
          setInputText(newText);
          
          if (newText === targetSentence) {
            handleSuccess();
          }
        } else {
          playFeedbackSound(false);
          if (navigator.vibrate) navigator.vibrate([20, 50, 20]);
          setInputText(inputText + typedChar);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [inputText, targetSentence, isSuccess, playMicrosoftAudio, resetIdleTimer, handleSuccess]);

  if (!card) return null;

  return (
    <>
    <style>{`
      @keyframes custom-shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-3px); }
        75% { transform: translateX(3px); }
      }
      .animate-dict-shake {
        animation: custom-shake 0.2s ease-in-out;
      }
      @keyframes dict-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
      .animate-dict-pulse {
        animation: dict-pulse 0.8s ease-in-out infinite;
      }
    `}</style>
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="fixed inset-0 z-[100] flex flex-col bg-[#1C1C1E] text-[#F2F2F7] overflow-hidden"
    >
      <div className="w-full px-5 pt-12 pb-4 flex items-center justify-between shrink-0">
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="p-2 -ml-2 text-white/50 hover:text-white transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <span className="text-sm font-bold text-white/40 tabular-nums">
          {currentIndex + 1} / {cardsToPlay.length}
        </span>
      </div>
      
      <div className="w-full h-1 bg-white/5 shrink-0">
        <div 
          className="h-full bg-blue-500 transition-all duration-300" 
          style={{ width: `${((currentIndex + 1) / cardsToPlay.length) * 100}%` }} 
        />
      </div>

      {/* Completely decoupled stable block for audio controls */}
      <div className="w-full h-20 shrink-0 flex justify-center items-center gap-4 mt-6">
        <button 
          onClick={(e) => { e.stopPropagation(); playMicrosoftAudio(1.0, true); }} 
          className="transition-all duration-300 outline-none"
        >
          <Volume2 
            className={cn(
              "w-6 h-6 transition-all duration-300",
              isPlayingAudio 
                ? "animate-pulse text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)] scale-110" 
                : "text-white/30 hover:text-white/60"
            )} 
          />
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); playMicrosoftAudio(0.75, true); }} 
          className={cn(
            "text-[11px] font-bold px-2 py-1 rounded transition-colors outline-none", 
            isPlayingAudio && audioRateRef.current === 0.75 
              ? "bg-white/20 text-white" 
              : "bg-white/10 text-white/30 hover:bg-white/20 hover:text-white/60"
          )}
        >
          0.75x
        </button>
      </div>

      {/* Flexible isolated text area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 md:px-12 w-full max-w-4xl mx-auto pb-[20vh]">
        <AnimatePresence mode="wait">
          <motion.div 
            key={currentIndex}
            initial={{ opacity: 0, filter: 'blur(8px)', y: 10 }}
            animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
            exit={{ opacity: 0, filter: 'blur(8px)', y: -10 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="text-center text-3xl md:text-4xl lg:text-5xl font-sans antialiased tracking-tight whitespace-pre-wrap break-words leading-[1.6]"
          >
            {inputText.split('').map((char, i) => {
              const isMistake = i === inputText.length - 1 && char !== targetSentence[i];
              return (
                <span 
                  key={i} 
                  className={cn(
                    "transition-colors duration-200 inline",
                    isSuccess ? "text-green-400 [text-shadow:0_0_15px_rgba(74,222,128,0.5)]" : 
                    isMistake ? "text-red-500 animate-dict-shake inline-block" : "text-[#F2F2F7]"
                  )}
                >
                  {char}
                </span>
              );
            })}
            {!isSuccess && (
              <span className="inline-block w-[3px] h-[1.1em] bg-blue-500 rounded-full align-middle ml-[2px] animate-dict-pulse" style={{ transform: 'translateY(-2px)' }}></span>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
    </>
  );
}
