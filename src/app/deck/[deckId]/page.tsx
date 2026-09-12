"use client";

import { use, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { MOCK_DECKS, Flashcard } from "@/lib/data";
import { ArrowLeft, CheckCircle2, Volume2, Loader2 } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import LevelProgress from "@/components/LevelProgress";

export default function DeckPage({ params }: { params: { deckId: string } | Promise<{ deckId: string }> }) {
  const router = useRouter();
  const resolvedParams = params instanceof Promise ? use(params) : params;
  const deckId = resolvedParams.deckId;

  const deck = MOCK_DECKS.find((d) => d.id === deckId);
  const { progress, answerCard } = useStore();

  const [activeCards, setActiveCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (deck && activeCards.length === 0 && currentIndex === 0) {
      const cardsToStudy = deck.cards.filter((c) => (progress[c.id]?.level || 0) < 4);
      setActiveCards(cardsToStudy);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl font-bold text-lg transition-colors shadow-sm active:scale-95"
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
        <Link href="/" className="text-gray-400 hover:text-gray-900 transition-colors p-3 -ml-3 bg-white rounded-full shadow-sm shadow-black/5 border border-gray-100">
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
  const [phase, setPhase] = useState<"Question" | "Answer">("Question");
  const [mistakeMade, setMistakeMade] = useState(false);
  const [inputText, setInputText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [isAudioLoading, setIsAudioLoading] = useState(false);

  useEffect(() => {
    if (phase === "Question" && !isMultipleChoice && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isMultipleChoice, phase]);

  const playAudio = async (text: string) => {
    setIsAudioLoading(true);
    try {
      // Future API fetch placeholder:
      // await fetch('/api/tts', { method: 'POST', body: JSON.stringify({ text }) });
      
      // Fallback: Web Speech API
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "de-DE";
        utterance.rate = 0.9;
        
        utterance.onend = () => setIsAudioLoading(false);
        utterance.onerror = () => setIsAudioLoading(false);
        
        window.speechSynthesis.speak(utterance);
      } else {
        setIsAudioLoading(false);
      }
    } catch (e) {
      setIsAudioLoading(false);
    }
  };

  const handleReveal = () => {
    setPhase("Answer");
    const fullSentence = card.sentence.replace("___", card.targetWord);
    playAudio(fullSentence);
  };

  const handleOptionClick = (option: string) => {
    if (phase !== "Question") return;
    
    const correct = option === card.targetWord;
    onAnswer(correct);
    if (!correct) {
      setMistakeMade(true);
    }
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
      onAnswer(!mistakeMade);
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
          onClick={() => playAudio(card.sentence.replace("___", card.targetWord))}
          className={cn(
            "mt-1.5 p-3 rounded-full transition-colors active:scale-95 shrink-0",
            isAudioLoading 
              ? "bg-blue-50 text-blue-500" 
              : "bg-gray-50 text-gray-400 hover:text-blue-500 hover:bg-blue-50"
          )}
          title="Vorlesen"
        >
          {isAudioLoading ? (
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
            >
              <Volume2 className="w-6 h-6 fill-current opacity-70" />
            </motion.div>
          ) : (
            <Volume2 className="w-6 h-6" />
          )}
        </button>

        <div className="text-2xl md:text-3xl font-medium leading-relaxed text-gray-900 max-w-lg">
          {parts[0]}
          
          {phase === "Answer" ? (
            <span className="text-blue-600 font-bold mx-2">
              {card.targetWord}
            </span>
          ) : (
            <>
              {isMultipleChoice ? (
                <span className="inline-block px-6 py-1 rounded-xl mx-2 bg-gray-100 text-transparent">
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
              className="py-5 px-6 rounded-2xl text-lg font-semibold bg-gray-50 text-gray-700 hover:bg-blue-600 hover:text-white transition-all active:scale-95 border border-transparent hover:shadow-md"
            >
              {opt}
            </button>
          ))}
        </motion.div>
      )}

      <AnimatePresence>
        {phase === "Answer" && (
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
              
              {mistakeMade && (
                <div className="mb-8 p-4 bg-red-50 rounded-2xl border border-red-100 text-red-800">
                  <p className="font-semibold mb-1">Nicht ganz richtig.</p>
                  <p>Du musst diese Karte nochmal üben.</p>
                </div>
              )}

              <button
                onClick={onNext}
                autoFocus
                className="w-full py-4 rounded-2xl text-lg font-bold bg-blue-600 text-white hover:bg-blue-700 transition-all active:scale-95 shadow-sm shadow-blue-600/20"
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
