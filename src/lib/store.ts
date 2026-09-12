import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Flashcard {
  id: string;
  sentence: string; 
  targetWord: string; 
  translation: string;
  options: string[]; 
  masteryLevel: 0 | 1 | 2 | 3 | 4;
  isArchived: boolean;
}

export interface Deck {
  id: string;
  name: string;
  cards: Flashcard[];
}

interface AppState {
  decks: Deck[];
  addDeck: (deck: Deck) => void;
  deleteDeck: (id: string) => void;
  renameDeck: (id: string, newName: string) => void;
  answerCard: (deckId: string, cardId: string, correct: boolean) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      decks: [],

      addDeck: (deck) => set((state) => ({ decks: [...state.decks, deck] })),
      
      deleteDeck: (id) => set((state) => ({ 
        decks: state.decks.filter(d => d.id !== id) 
      })),
      
      renameDeck: (id, newName) => set((state) => ({
        decks: state.decks.map(d => d.id === id ? { ...d, name: newName } : d)
      })),

      answerCard: (deckId, cardId, correct) => set((state) => {
        return {
          decks: state.decks.map(deck => {
            if (deck.id !== deckId) return deck;
            
            return {
              ...deck,
              cards: deck.cards.map(card => {
                if (card.id !== cardId) return card;
                
                let newLevel = card.masteryLevel;
                if (correct) {
                  newLevel = Math.min(newLevel + 1, 4) as any;
                } else {
                  newLevel = 0;
                }
                
                return {
                  ...card,
                  masteryLevel: newLevel,
                  isArchived: newLevel === 4
                };
              })
            };
          })
        };
      })
    }),
    {
      name: "karten-storage-v2", // New version to avoid conflicts
    }
  )
);
