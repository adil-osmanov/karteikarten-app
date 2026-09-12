"use client";

import { use, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { MOCK_DECKS, Flashcard } from "@/lib/data";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

// In Next.js 15, params is a promise. In Next.js 14, it's an object but can be used with `use()`.
// For compatibility, we assume standard usage. We'll type it broadly.
export default function DeckPage({ params }: { params: { deckId: string } | Promise<{ deckId: string }> }) {
  const router = useRouter();
  // Handle both Promise and synchronous params
  const resolvedParams = params instanceof Promise ? use(params) : params;
  const deckId = resolvedParams.deckId;

  const deck = MOCK_DECKS.find((d) => d.id === deckId);
  const { progress, answerCard } = useStore();

  const [activeCards, setActiveCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Load cards that are not mastered (level < 4) ONLY ONCE when session starts
  useEffect(() => {
    if (deck && activeCards.length === 0 && currentIndex === 0) {
      const cardsToStudy = deck.cards.filter((c) => (progress[c.id]?.level || 0) < 4);
      setActiveCards(cardsToStudy);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck]);

  if (!deck) {
    return <div className="p-12 text-center">Deck nicht gefunden.</div>;
  }

  if (activeCards.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-24 text-center">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-6" />
          <h1 className="text-2xl font-bold mb-4">Glückwunsch!</h1>
          <p className="text-gray-500 mb-8">Du hast alle Karten in diesem Deck gemeistert.</p>
          <button
            onClick={() => router.push("/")}
            className="bg-foreground text-background px-6 py-3 rounded-full font-medium"
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
      // End of round: refresh the list to exclude newly mastered cards
      const nextRoundCards = deck.cards.filter((c) => (progress[c.id]?.level || 0) < 4);
      setActiveCards(nextRoundCards);
      setCurrentIndex(0);
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-6 py-8 h-screen flex flex-col">
      <header className="flex items-center justify-between mb-8">
        <Link href="/" className="text-gray-400 hover:text-foreground transition-colors p-2 -ml-2">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div className="text-sm font-medium text-gray-500">
          Karten übrig: {activeCards.length}
        </div>
      </header>

      <div className="flex-1 flex flex-col justify-center">
        <AnimatePresence mode="wait">
          <StudyCard
            key={currentCard.id + currentIndex} // force remount on new card
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

  // Focus input automatically if in text mode
  useEffect(() => {
    if (!isMultipleChoice && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isMultipleChoice]);

  const handleOptionClick = (option: string) => {
    if (answered) return;
    
    const correct = option === card.targetWord;
    setIsCorrect(correct);
    setAnswered(true);
    onAnswer(correct);

    if (correct) {
      setTimeout(onNext, 1500);
    } else {
      setTimeout(onNext, 2000);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (answered) return;
    const value = e.target.value;
    
    // Character by character validation
    let isValidSoFar = true;
    for (let i = 0; i < value.length; i++) {
      if (value[i].toLowerCase() !== card.targetWord[i]?.toLowerCase()) {
        isValidSoFar = false;
        break;
      }
    }

    setInputText(value);

    // If completely correct
    if (isValidSoFar && value.toLowerCase() === card.targetWord.toLowerCase()) {
      setIsCorrect(true);
      setAnswered(true);
      // Only count as correct if no mistakes were made during typing
      onAnswer(!mistakeMade);
      setTimeout(onNext, 1500);
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

  // Render the sentence with parts
  const parts = card.sentence.split("___");
  
  // Prepare input chars for styling
  const renderInputChars = () => {
    const chars = [];
    for (let i = 0; i < card.targetWord.length; i++) {
      const typed = inputText[i];
      if (!typed) {
        chars.push(<span key={i} className="text-gray-300 border-b-2 border-gray-200 mx-[1px] inline-block w-4 text-center">_</span>);
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
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className="bg-card rounded-3xl p-8 md:p-12 shadow-sm relative overflow-hidden"
    >
      <div className="absolute top-6 right-6 text-xs font-semibold text-gray-400 bg-gray-200 px-3 py-1 rounded-full">
        Lvl {level}
      </div>

      <div className="text-2xl md:text-3xl font-medium leading-relaxed text-center mb-12 mt-4">
        {parts[0]}
        
        {isMultipleChoice ? (
          <span className={cn(
            "inline-block px-4 py-1 rounded-lg mx-2 transition-colors",
            answered && isCorrect ? "bg-green-100 text-green-700" : "bg-gray-200 text-transparent"
          )}>
            {answered && isCorrect ? card.targetWord : "________"}
          </span>
        ) : (
          <span className="inline-block relative mx-2">
            <span className="flex">{renderInputChars()}</span>
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              className="absolute inset-0 opacity-0 cursor-text"
              disabled={answered}
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
            />
          </span>
        )}
        
        {parts[1]}
      </div>

      {isMultipleChoice && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {card.options.map((opt) => (
            <button
              key={opt}
              disabled={answered}
              onClick={() => handleOptionClick(opt)}
              className={cn(
                "py-4 px-6 rounded-2xl text-lg font-medium transition-all active:scale-[0.98]",
                !answered ? "bg-white hover:shadow-sm border border-gray-100 text-foreground" : "",
                answered && opt === card.targetWord ? "bg-green-500 text-white" : "",
                answered && opt !== card.targetWord ? "bg-white opacity-50" : ""
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {answered && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "mt-8 p-6 rounded-2xl text-center",
              isCorrect ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
            )}
          >
            <p className="font-medium mb-1">
              {isCorrect ? "Richtig!" : `Falsch. Die richtige Antwort ist: ${card.targetWord}`}
            </p>
            <p className="text-sm opacity-80">{card.translation}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
