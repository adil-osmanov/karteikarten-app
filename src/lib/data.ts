import data from "@/data/decks.json";

export type MasteryLevel = 0 | 1 | 2 | 3 | 4;

export interface Flashcard {
  id: string;
  deckId: string;
  sentence: string; 
  targetWord: string; 
  translation: string;
  options: string[]; 
}

export interface Deck {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  cards: Flashcard[];
}

export interface Category {
  id: string;
  name: string;
  decks: Deck[];
}

export const MOCK_CATEGORIES: Category[] = data.categories;
export const MOCK_DECKS: Deck[] = MOCK_CATEGORIES.flatMap(cat => cat.decks);
export const ALL_CARDS: Flashcard[] = MOCK_DECKS.flatMap(deck => deck.cards);
