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
  getDeckProgress: (deckId: string) => { total: number; mastered: number };
  level: number;
}

const calculateLevel = (correctAnswers: number) => {
  return Math.floor(correctAnswers / 10) + 1;
};

export const useStore = create<UserState>()(
  persist(
    (set, get) => ({
      progress: {},
      correctAnswersTotal: 0,
      level: 1,

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
            level: calculateLevel(newTotal),
          };
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
    }),
    {
      name: "karten-storage",
    }
  )
);
