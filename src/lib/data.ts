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

// Flat array of decks for easy lookup, but nested in categories for display
export const MOCK_CATEGORIES: Category[] = [
  {
    id: "cat-grammatik",
    name: "Grammatik",
    decks: [
      {
        id: "grammatik-b1-prep",
        categoryId: "cat-grammatik",
        name: "Präpositionen B1+",
        description: "Feste Präpositionen und Verben",
        cards: [
          {
            id: "c1",
            deckId: "grammatik-b1-prep",
            sentence: "Ich warte ___ dich am Bahnhof.",
            targetWord: "auf",
            translation: "Я жду тебя на вокзале.",
            options: ["an", "auf", "für", "über"],
          },
          {
            id: "c2",
            deckId: "grammatik-b1-prep",
            sentence: "Er interessiert sich sehr ___ Geschichte.",
            targetWord: "für",
            translation: "Он очень интересуется историей.",
            options: ["an", "für", "über", "von"],
          },
          {
            id: "c3",
            deckId: "grammatik-b1-prep",
            sentence: "Wir haben uns ___ das Wetter beschwert.",
            targetWord: "über",
            translation: "Мы жаловались на погоду.",
            options: ["um", "über", "an", "auf"],
          },
        ],
      },
      {
        id: "grammatik-b2-konj",
        categoryId: "cat-grammatik",
        name: "Konjunktionen B2",
        description: "Satzverbindungen und Struktur",
        cards: [
          {
            id: "c6",
            deckId: "grammatik-b2-konj",
            sentence: "Ich gehe spazieren, ___ es regnet.",
            targetWord: "obwohl",
            translation: "Я иду гулять, хотя идет дождь.",
            options: ["weil", "obwohl", "damit", "als"],
          }
        ]
      }
    ]
  },
  {
    id: "cat-wortschatz",
    name: "Wortschatz",
    decks: [
      {
        id: "wortschatz-b2-business",
        categoryId: "cat-wortschatz",
        name: "Business B2",
        description: "Vokabeln für den Beruf",
        cards: [
          {
            id: "c4",
            deckId: "wortschatz-b2-business",
            sentence: "Ihre ___ an der Konferenz war sehr hilfreich.",
            targetWord: "Teilnahme",
            translation: "Ее участие в конференции было очень полезным.",
            options: ["Teilnahme", "Ausnahme", "Zunahme", "Abnahme"],
          },
          {
            id: "c5",
            deckId: "wortschatz-b2-business",
            sentence: "Wir müssen die ___ unserer Kunden erfüllen.",
            targetWord: "Erwartungen",
            translation: "Мы должны оправдать ожидания наших клиентов.",
            options: ["Erwartungen", "Bedingungen", "Entscheidungen", "Erfahrungen"],
          },
        ],
      }
    ]
  }
];

export const MOCK_DECKS: Deck[] = MOCK_CATEGORIES.flatMap(cat => cat.decks);
