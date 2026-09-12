"use client";

import { use, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { MOCK_DECKS, Flashcard } from "@/lib/data";
import { ArrowLeft, CheckCircle2, Volume2 } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import LevelProgress from "@/components/LevelProgress";

export default function DeckPage({ params }: { params: { deckId: string } | Promise<{ deckId: string }> }) {
  const router = useRouter();
  const resolvedParams = params instanceof Promise ? use(params) : params;
  const deckId = resolvedParams.deckId;

  const deck = MOCK_DECKS.find((d) => d.id === deckId);
  const { progress, answerCard, getUserStats } = useStore();

  const [activeCards, setActiveCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (deck && activeCards.length === 0 && currentIndex === 0) {
      const cardsToStudy = deck.cards.filter((c) => (progress[c.id]?.level || 0) < 4);
      setActiveCards(cardsToStudy);
    }
  }, [deck]);

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
            className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-4 rounded-2xl font-semibold text-lg transition-colors shadow-sm active:scale-95"
          >
            Zurück zur Übersicht
          </button>
        </motion.div>
      </div>
    );
  }

  const currentCard = activeCards[currentIndex];
  const cardProgress = progress[currentCard.id] || { level: 0 };
  const level = cardProgress.level;
  
  const handleNext = () => {
    if (currentIndex < activeCards.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      const nextRoundCards = deck.cards.filter((c) => (progress[c.id]?.level || 0) < 4);
      setActiveCards(nextRoundCards);
      setCurrentIndex(0);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-6 py-8 min-h-screen flex flex-col">
      <header className="flex items-center justify-between mb-8">
        <Link href="/" className="text-gray-400 hover:text-gray-900 transition-colors p-2 -ml-2 bg-white rounded-full shadow-sm">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <LevelProgress />
      </header>

      <div className="flex-1 flex flex-col justify-center pb-20">
        <AnimatePresence mode="wait">
          <StudyCard
            key={currentCard.id + currentIndex} 
            card={currentCard}
            level={level}
            onAnswer={(correct) => {
              answerCard(currentCard.id, correct);
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
  level,
  onAnswer,
  onNext,
}: {
  card: Flashcard;
  level: number;
  onAnswer: (correct: boolean) => void;
  onNext: () => void;
}) {
  const isMultipleChoice = level === 0 || level === 1;
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [mistakeMade, setMistakeMade] = useState(false);
  const [inputText, setInputText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isMultipleChoice && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isMultipleChoice]);

  const playTTS = () => {
    if ("speechSynthesis" in window) {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      
      const fullSentence = card.sentence.replace("___", card.targetWord);
      const utterance = new SpeechSynthesisUtterance(fullSentence);
      utterance.lang = "de-DE";
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleReveal = (correct: boolean) => {
    setIsCorrect(correct);
    setAnswered(true);
    // Auto-play TTS on reveal
    playTTS();
  };

  const handleOptionClick = (option: string) => {
    if (answered) return;
    
    const correct = option === card.targetWord;
    onAnswer(correct);
    handleReveal(correct);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (answered) return;
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
    if (answered) return;
    
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
      }
      const currentIsWrong = Array.from(inputText).some((char, i) => char.toLowerCase() !== card.targetWord[i]?.toLowerCase());
      if (currentIsWrong) {
        e.preventDefault();
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
      className="bg-white rounded-3xl p-8 md:p-12 shadow-sm shadow-black/5 relative border border-gray-100"
    >
      <div className="absolute top-6 right-6 px-3 py-1 bg-gray-50 rounded-full text-xs font-semibold text-gray-400">
        Mastery {level}
      </div>

      <div className="flex items-start justify-center gap-4 mb-12 mt-4 relative">
        <button 
          onClick={playTTS}
          className="mt-1.5 p-2 text-gray-400 hover:text-blue-500 bg-gray-50 hover:bg-blue-50 rounded-full transition-colors active:scale-95"
          title="Vorlesen"
        >
          <Volume2 className="w-6 h-6" />
        </button>
        <div className="text-2xl md:text-3xl font-medium leading-relaxed text-gray-900 max-w-lg">
          {parts[0]}
          
          {isMultipleChoice ? (
            <span className={cn(
              "inline-block px-4 py-1 rounded-xl mx-2 transition-colors",
              answered && isCorrect ? "bg-green-100 text-green-700 font-semibold" : "bg-gray-100 text-transparent"
            )}>
              {answered && isCorrect ? card.targetWord : "________"}
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
                disabled={answered}
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
              />
            </span>
          )}
          
          {parts[1]}
        </div>
      </div>

      {!answered && isMultipleChoice && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {card.options.map((opt) => (
            <button
              key={opt}
              disabled={answered}
              onClick={() => handleOptionClick(opt)}
              className="py-5 px-6 rounded-2xl text-lg font-semibold bg-gray-50 text-gray-700 hover:bg-blue-500 hover:text-white transition-all active:scale-95 border border-transparent hover:shadow-md"
            >
              {opt}
            </button>
          ))}
        </motion.div>
      )}

      <AnimatePresence>
        {answered && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 32 }}
            className="overflow-hidden"
          >
            <div className="pt-6 border-t border-gray-100">
              <div className="mb-8">
                <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Übersetzung</p>
                <p className="text-lg text-gray-700">{card.translation}</p>
              </div>
              
              {!isCorrect && (
                <div className="mb-8 p-4 bg-red-50 rounded-2xl border border-red-100 text-red-800">
                  <p className="font-semibold mb-1">Nicht ganz richtig.</p>
                  <p>Die richtige Antwort ist: <span className="font-bold">{card.targetWord}</span></p>
                </div>
              )}

              <button
                onClick={onNext}
                autoFocus
                className="w-full py-4 rounded-2xl text-lg font-bold bg-blue-500 text-white hover:bg-blue-600 transition-all active:scale-95 shadow-sm shadow-blue-500/20"
              >
                Weiter
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
