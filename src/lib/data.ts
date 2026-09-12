export type MasteryLevel = 0 | 1 | 2 | 3 | 4;

export interface Flashcard {
  id: string;
  deckId: string;
  sentence: string; // The sentence with the blank represented by ___ (or we can just keep the word and hide it)
  targetWord: string; // The word to fill in
  translation: string;
  options: string[]; // Options for multiple choice (including the correct one)
}

export interface Deck {
  id: string;
  name: string;
  description: string;
  cards: Flashcard[];
}

export const MOCK_DECKS: Deck[] = [
  {
    id: "grammatik-b1",
    name: "Grammatik B1+",
    description: "Präpositionen, Konjunktionen und mehr.",
    cards: [
      {
        id: "c1",
        deckId: "grammatik-b1",
        sentence: "Ich warte ___ dich am Bahnhof.",
        targetWord: "auf",
        translation: "Я жду тебя на вокзале.",
        options: ["an", "auf", "für", "über"],
      },
      {
        id: "c2",
        deckId: "grammatik-b1",
        sentence: "Er interessiert sich sehr ___ Geschichte.",
        targetWord: "für",
        translation: "Он очень интересуется историей.",
        options: ["an", "für", "über", "von"],
      },
      {
        id: "c3",
        deckId: "grammatik-b1",
        sentence: "Wir haben uns ___ das Wetter beschwert.",
        targetWord: "über",
        translation: "Мы жаловались на погоду.",
        options: ["um", "über", "an", "auf"],
      },
    ],
  },
  {
    id: "wortschatz-b2",
    name: "Wortschatz B2",
    description: "Fortgeschrittener Wortschatz für den Alltag.",
    cards: [
      {
        id: "c4",
        deckId: "wortschatz-b2",
        sentence: "Ihre ___ an der Konferenz war sehr hilfreich.",
        targetWord: "Teilnahme",
        translation: "Ее участие в конференции было очень полезным.",
        options: ["Teilnahme", "Ausnahme", "Zunahme", "Abnahme"],
      },
      {
        id: "c5",
        deckId: "wortschatz-b2",
        sentence: "Wir müssen die ___ unserer Kunden erfüllen.",
        targetWord: "Erwartungen",
        translation: "Мы должны оправдать ожидания наших клиентов.",
        options: ["Erwartungen", "Bedingungen", "Entscheidungen", "Erfahrungen"],
      },
    ],
  },
];
