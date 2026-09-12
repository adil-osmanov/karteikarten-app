"use client";

import { use, useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useStore, Flashcard } from "@/lib/store";
import { ArrowLeft, CheckCircle2, Volume2 } from "lucide-react";
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
      // Load only non-archived cards
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
          <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Großartig!</h1>
          <p className="text-lg text-gray-500 mb-10">Du hast alle Karten in diesem Deck gemeistert.</p>
          <button
            onClick={() => router.push("/")}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-3xl font-bold text-lg transition-colors shadow-sm active:scale-95"
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
      // Next round: exclude newly archived cards
      const nextRoundCards = deck.cards.filter((c) => !c.isArchived);
      setActiveCards(nextRoundCards);
      setCurrentIndex(0);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-6 py-8 min-h-screen flex flex-col">
      <header className="flex items-center justify-between mb-8">
        <Link href="/" className="text-gray-400 hover:text-gray-900 transition-colors p-3 -ml-3 bg-white rounded-full shadow-sm border border-gray-100">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="text-sm font-semibold text-gray-400">
          Karte {currentIndex + 1} von {activeCards.length}
        </div>
      </header>

      <div className="flex-1 flex flex-col justify-center pb-20">
        <AnimatePresence mode="wait">
          <StudyCard
            key={currentCard.id + currentIndex} // force remount on card change
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

    const fallbackTTS = () => {
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
    };

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
      console.warn("TTS fetch failed, fallback to browser TTS", e);
      fallbackTTS();
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

    // If fully correct
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

    // Mistake detected
    if (e.key.toLowerCase() !== expectedChar.toLowerCase()) {
      if (!mistakeMade) {
        setMistakeMade(true);
        onAnswer(false); // Immediate penalty to level 0 internally
      }
      const currentIsWrong = Array.from(inputText).some((char, i) => char.toLowerCase() !== card.targetWord[i]?.toLowerCase());
      if (currentIsWrong) {
        e.preventDefault(); // Block further input until they backspace
      }
    }
  };

  const parts = card.sentence.split("___");
  
  const renderInputChars = () => {
    const chars = [];
    for (let i = 0; i < card.targetWord.length; i++) {
      const typed = inputText[i];
      if (!typed) {
        chars.push(<span key={i} className="text-gray-300 border-b-2 border-gray-200 mx-[2px] inline-block w-4 md:w-5 text-center">_</span>);
      } else {
        const isMatch = typed.toLowerCase() === card.targetWord[i].toLowerCase();
        chars.push(
          <span key={i} className={cn("font-semibold mx-[1px]", isMatch ? "text-green-500" : "text-red-500")}>
            {typed}
          </span>
        );
      }
    }
    return chars;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="bg-white rounded-[32px] p-8 md:p-12 shadow-sm relative border border-gray-100 flex flex-col"
    >
      {/* 4 dots for Mastery Level */}
      <div className="absolute top-8 right-8 flex gap-1.5">
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

      <div className="flex flex-col items-center justify-center min-h-[160px] mb-8 relative">
        <div className="flex items-start justify-center gap-4 w-full">
          <button 
            onClick={() => playAudio(card.sentence.replace("___", card.targetWord))}
            className="mt-1.5 p-3 rounded-full transition-colors shrink-0"
            title="Vorlesen"
          >
            <Volume2 className={cn(
              "w-7 h-7 transition-colors duration-150",
              isPlayingAudio ? "text-blue-600 fill-blue-600" : "text-gray-400 hover:text-blue-600"
            )} />
          </button>

          <div className="text-2xl md:text-3xl font-medium leading-relaxed text-gray-900 w-full">
            {parts[0]}
            
            {phase === "Answer" ? (
              <span className="text-blue-600 font-bold mx-2">
                {card.targetWord}
              </span>
            ) : (
              <>
                {isMultipleChoice ? (
                  <span className="inline-block px-8 py-2 rounded-2xl mx-2 bg-gray-50 text-transparent border border-gray-100">
                    ________
                  </span>
                ) : (
                  <span className="inline-block relative mx-2 align-bottom pb-1">
                    <span className="flex">{renderInputChars()}</span>
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
      </div>

      {phase === "Question" && isMultipleChoice && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-auto"
        >
          {card.options.map((opt) => (
            <button
              key={opt}
              onClick={() => handleOptionClick(opt)}
              className="py-5 px-6 rounded-3xl text-lg font-semibold bg-gray-50 text-gray-700 hover:bg-blue-600 hover:text-white transition-all active:scale-95 border border-transparent hover:shadow-md"
            >
              {opt}
            </button>
          ))}
        </motion.div>
      )}

      {/* Answer Phase: Translation and Weiter Button */}
      {phase === "Answer" && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="overflow-hidden mt-auto"
        >
          <div className="pt-8 border-t border-gray-100 w-full">
            <div className="mb-8 px-4 text-center">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Übersetzung</p>
              <p className="text-xl text-gray-700">{card.translation}</p>
            </div>
            
            {mistakeMade && (
              <div className="mb-8 p-5 bg-red-50 rounded-3xl border border-red-100 text-red-800 text-center">
                <p className="font-bold mb-1">Nicht ganz richtig.</p>
                <p>Du musst diese Karte nochmal üben.</p>
              </div>
            )}

            <button
              onClick={onNext}
              autoFocus
              className="w-full py-5 rounded-3xl text-xl font-bold bg-blue-600 text-white hover:bg-blue-700 transition-all active:scale-95 shadow-sm"
            >
              Weiter
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
