import { create } from "zustand";
import { persist } from "zustand/middleware";
import { MasteryLevel, MOCK_DECKS } from "./data";

export interface CardProgress {
  cardId: string;
  level: MasteryLevel;
}

interface UserState {
  progress: Record<string, CardProgress>;
  correctAnswersTotal: number;
  answerCard: (cardId: string, correct: boolean) => void;
  resetCard: (cardId: string) => void;
  getDeckProgress: (deckId: string) => { total: number; mastered: number };
  getUserStats: () => { level: number; xpInCurrentLevel: number; xpForNextLevel: number; totalXp: number };
}

export const useStore = create<UserState>()(
  persist(
    (set, get) => ({
      progress: {},
      correctAnswersTotal: 0,

      answerCard: (cardId, correct) => {
        set((state) => {
          const currentProgress = state.progress[cardId] || { cardId, level: 0 };
          let newLevel: MasteryLevel = 0;

          if (correct) {
            newLevel = Math.min(currentProgress.level + 1, 4) as MasteryLevel;
          } else {
            newLevel = 0;
          }

          const newTotal = correct ? state.correctAnswersTotal + 1 : state.correctAnswersTotal;

          return {
            progress: {
              ...state.progress,
              [cardId]: { ...currentProgress, level: newLevel },
            },
            correctAnswersTotal: newTotal,
          };
        });
      },

      resetCard: (cardId) => {
        set((state) => {
          const newProgress = { ...state.progress };
          delete newProgress[cardId];
          return { progress: newProgress };
        });
      },

      getDeckProgress: (deckId) => {
        const deck = MOCK_DECKS.find((d) => d.id === deckId);
        if (!deck) return { total: 0, mastered: 0 };

        const { progress } = get();
        const total = deck.cards.length;
        const mastered = deck.cards.filter((c) => progress[c.id]?.level === 4).length;

        return { total, mastered };
      },

      getUserStats: () => {
        const { correctAnswersTotal } = get();
        const totalXp = correctAnswersTotal * 10;
        
        // Simple scaling: Level 1 (0-100), Level 2 (100-300), Level 3 (300-600)
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
    {
      name: "karten-storage",
    }
  )
);
