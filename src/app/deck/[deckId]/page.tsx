"use client";

import { use, useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useStore, Flashcard } from "@/lib/store";
import { ArrowLeft, CheckCircle2, Volume2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export default function DeckPage({ params }: { params: { deckId: string } | Promise<{ deckId: string }> }) {
  const router = useRouter();
  const resolvedParams = params instanceof Promise ? use(params) : params;
  const deckId = resolvedParams.deckId;

  const { decks, answerCard } = useStore();
  const deck = decks.find((d) => d.id === deckId);

  const [activeCards, setActiveCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    if (deck) {
      const cardsToStudy = deck.cards.filter((c) => !c.isArchived);
      setActiveCards(cardsToStudy);
    }
  }, [deck]);

  if (!isMounted) return null;

  if (!deck) {
    return <div className="p-12 text-center text-gray-500">Deck nicht gefunden.</div>;
  }

  if (activeCards.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-24 text-center">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-8">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-4">Großartig!</h1>
          <p className="text-lg text-gray-500 mb-10">Du hast alle Karten in diesem Deck gemeistert.</p>
          <button
            onClick={() => router.push("/")}
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
    <main className="max-w-3xl mx-auto px-6 py-8 min-h-screen flex flex-col">
      <header className="flex items-center justify-between mb-8">
        <Link href="/" className="text-gray-400 hover:text-gray-900 transition-colors p-3 -ml-3">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div className="text-sm font-medium text-gray-400">
          Karte {currentIndex + 1} von {activeCards.length}
        </div>
      </header>

      <div className="flex-1 flex flex-col justify-center pb-12">
        <AnimatePresence mode="wait">
          <StudyCard
            key={currentCard.id + currentIndex} 
            card={currentCard}
            onAnswer={(correct) => {
              answerCard(deckId, currentCard.id, correct);
            }}
            onNext={handleNext}
          />
        </AnimatePresence>
      </div>
    </main>
  );
}

function StudyCard({
  card,
  onAnswer,
  onNext,
}: {
  card: Flashcard;
  onAnswer: (correct: boolean) => void;
  onNext: () => void;
}) {
  const isMultipleChoice = card.masteryLevel === 0 || card.masteryLevel === 1;
  const [phase, setPhase] = useState<"Question" | "Answer">("Question");
  const [mistakeMade, setMistakeMade] = useState(false);
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
      console.warn("TTS fetch failed", e);
      setIsPlayingAudio(false);
    }
  }, []);

  const handleReveal = useCallback((correct: boolean) => {
    setPhase("Answer");
    const fullSentence = card.sentence.replace("___", card.targetWord);
    playAudio(fullSentence);
  }, [card.sentence, card.targetWord, playAudio]);

  const handleOptionClick = (option: string) => {
    if (phase !== "Question") return;
    
    const correct = option === card.targetWord;
    onAnswer(correct);
    if (!correct) {
      setMistakeMade(true);
    }
    handleReveal(correct);
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
      onAnswer(!mistakeMade);
      handleReveal(true);
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
      if (!mistakeMade) {
        setMistakeMade(true);
        onAnswer(false);
      }
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
      className="bg-white rounded-[28px] p-8 md:p-12 shadow-[0_4px_20px_rgb(0,0,0,0.03)] flex flex-col min-h-[500px]"
    >
      {/* 4 dots for Mastery Level */}
      <div className="absolute top-8 right-8 flex gap-1.5">
        {[1, 2, 3, 4].map((levelIndicator) => (
          <div 
            key={levelIndicator}
            className={cn(
              "w-2 h-2 rounded-full transition-colors duration-500",
              card.masteryLevel >= levelIndicator ? "bg-blue-600" : "bg-[#F5F5F7]"
            )}
          />
        ))}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center">
        
        {/* Speaker Icon Centered Above Text */}
        <button 
          onClick={() => playAudio(card.sentence.replace("___", card.targetWord))}
          className={cn(
            "w-12 h-12 flex items-center justify-center rounded-full transition-colors mb-8 focus:outline-none",
            isPlayingAudio ? "bg-blue-50 text-blue-600" : "bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          )}
          title="Vorlesen"
        >
          <Volume2 className="w-5 h-5" />
        </button>

        <div className="text-2xl md:text-3xl font-medium tracking-tight leading-relaxed text-gray-900 w-full max-w-lg">
          {parts[0]}
          
          {phase === "Answer" ? (
            <span className="text-blue-600 mx-1">
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
      </div>

      <div className="mt-8">
        {phase === "Question" && isMultipleChoice && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-3"
          >
            {card.options.map((opt) => (
              <button
                key={opt}
                onClick={() => handleOptionClick(opt)}
                className="py-4 px-6 rounded-2xl text-[17px] font-medium bg-gray-50 text-gray-900 hover:bg-gray-100 transition-colors active:scale-95"
              >
                {opt}
              </button>
            ))}
          </motion.div>
        )}

        {/* Answer Phase: Translation and Weiter Button */}
        {phase === "Answer" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center w-full"
          >
            <div className="text-center mb-10 w-full">
              <p className="text-sm font-medium text-gray-400 mb-2">Übersetzung</p>
              <p className="text-lg text-gray-500">{card.translation}</p>
            </div>
            
            {mistakeMade && (
              <div className="mb-8 flex items-center justify-center gap-2 text-red-500 text-sm font-medium">
                <AlertCircle className="w-4 h-4" />
                <span>Nicht ganz richtig. Du musst diese Karte nochmal üben.</span>
              </div>
            )}

            <button
              onClick={onNext}
              autoFocus
              className="w-full py-4 rounded-2xl text-[17px] font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors active:scale-95"
            >
              Weiter
            </button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
