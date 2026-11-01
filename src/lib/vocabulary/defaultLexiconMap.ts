import { GOETHE_A1_DICTIONARY } from './goetheA1Dictionary';
import { C1_DICTIONARY } from './c1Dictionary';

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';

export const CEFR_TARGETS = {
  A1: { target: 1100, cumulative: 1100, label: 'A1 • Grundlagen' },
  A2: { target: 1500, cumulative: 2600, label: 'A2 • Alltag' },
  B1: { target: 2600, cumulative: 5200, label: 'B1 • Selbstständig' },
  B2: { target: 4800, cumulative: 10000, label: 'B2 • Beruf & Fach' },
  C1: { target: 5000, cumulative: 15000, label: 'C1 • Fließend' },
} as const;

export const TOTAL_WORLD_LEXICON_GOAL = 15000;

export const CEFR_LEVEL_COLORS: Record<CEFRLevel, {
  badge: string;
  bar: string;
  glow: string;
  text: string;
}> = {
  A1: {
    badge: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-black/5 dark:border-white/5',
    bar: 'bg-blue-500',
    glow: 'rgba(59, 130, 246, 0.4)',
    text: 'text-zinc-600 dark:text-zinc-400',
  },
  A2: {
    badge: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-black/5 dark:border-white/5',
    bar: 'bg-blue-500',
    glow: 'rgba(59, 130, 246, 0.4)',
    text: 'text-zinc-600 dark:text-zinc-400',
  },
  B1: {
    badge: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-black/5 dark:border-white/5',
    bar: 'bg-blue-500',
    glow: 'rgba(59, 130, 246, 0.4)',
    text: 'text-zinc-600 dark:text-zinc-400',
  },
  B2: {
    badge: 'bg-blue-600 text-white font-bold border border-blue-500 shadow-sm',
    bar: 'bg-blue-500',
    glow: 'rgba(59, 130, 246, 0.5)',
    text: 'text-blue-500',
  },
  C1: {
    badge: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-black/5 dark:border-white/5',
    bar: 'bg-blue-500',
    glow: 'rgba(59, 130, 246, 0.4)',
    text: 'text-zinc-600 dark:text-zinc-400',
  },
};

// Build canonical Goethe A1 entries mapping
const A1_ENTRIES: Record<string, CEFRLevel> = {};
for (const key of Object.keys(GOETHE_A1_DICTIONARY)) {
  A1_ENTRIES[key] = 'A1';
}

// Build canonical C1 entries mapping (~4,895 academic & professional lemmas)
const C1_ENTRIES: Record<string, CEFRLevel> = {};
for (const key of Object.keys(C1_DICTIONARY)) {
  C1_ENTRIES[key] = 'C1';
}

/**
 * Curated reference map of German lemmas to CEFR levels (Goethe-Institut / telc standard).
 * A1 lemmas strictly follow the official Start Deutsch 1 / telc A1 canon (~1,050 base lemmas).
 */
export const DEFAULT_LEXICON_MAP: Record<string, CEFRLevel> = {
  // --- Canonical A1 (Goethe-Institut Start Deutsch 1) ---
  ...A1_ENTRIES,

  // --- A2 ---
  beginnen: 'A2',
  verstehen: 'A2',
  bekommen: 'A2',
  erzaehlen: 'A2',
  erzählen: 'A2',
  versuchen: 'A2',
  sitzen: 'A2',
  ziehen: 'A2',
  gewinnen: 'A2',
  schliessen: 'A2',
  schließen: 'A2',
  fuehlen: 'A2',
  fühlen: 'A2',
  bieten: 'A2',
  interessieren: 'A2',
  erinnern: 'A2',
  helfen: 'A2',
  treffen: 'A2',
  hoffen: 'A2',
  freuen: 'A2',
  besuchen: 'A2',
  verlieren: 'A2',
  gefallen: 'A2',
  gehoeren: 'A2',
  gehören: 'A2',
  passen: 'A2',
  fehlen: 'A2',
  bedeuten: 'A2',
  beruf: 'A2',
  urlaub: 'A2',
  wohnung: 'A2',
  geschaeft: 'A2',
  geschäft: 'A2',
  geld: 'A2',
  rechnung: 'A2',
  wetter: 'A2',
  gesundheit: 'A2',
  arzt: 'A2',
  familie: 'A2',
  schule: 'A2',
  sprache: 'A2',
  termin: 'A2',
  einladung: 'A2',
  unterwegs: 'A2',
  wichtig: 'A2',
  richtig: 'A2',
  falsch: 'A2',
  schnell: 'A2',
  langsam: 'A2',
  schwer: 'A2',
  leicht: 'A2',
  moeglich: 'A2',
  möglich: 'A2',
  deutlich: 'A2',

  // --- B1 ---
  erwarten: 'B1',
  erreichen: 'B1',
  entwickeln: 'B1',
  entscheiden: 'B1',
  waehlen: 'B1',
  wählen: 'B1',
  verbinden: 'B1',
  vergleichen: 'B1',
  erklaeren: 'B1',
  erklären: 'B1',
  erfahren: 'B1',
  schaffen: 'B1',
  entstehen: 'B1',
  fordern: 'B1',
  planen: 'B1',
  diskutieren: 'B1',
  informieren: 'B1',
  organisieren: 'B1',
  vertreten: 'B1',
  verzichten: 'B1',
  vermeiden: 'B1',
  empfehlen: 'B1',
  ueberzeugen: 'B1',
  überzeugen: 'B1',
  teilnehmen: 'B1',
  bewerben: 'B1',
  beschweren: 'B1',
  vorschlagen: 'B1',
  erfahrung: 'B1',
  entscheidung: 'B1',
  beziehung: 'B1',
  meinung: 'B1',
  vorschlag: 'B1',
  umwelt: 'B1',
  erfolg: 'B1',
  zukunft: 'B1',
  gefahr: 'B1',
  voraussetzung: 'B1',
  ausbildung: 'B1',
  ergebnis: 'B1',
  loesung: 'B1',
  lösung: 'B1',
  thema: 'B1',
  unterschied: 'B1',
  vorteil: 'B1',
  nachteil: 'B1',
  grund: 'B1',
  ziel: 'B1',
  interesse: 'B1',
  erfolgreich: 'B1',
  interessant: 'B1',
  notwendig: 'B1',
  selbstaendig: 'B1',
  selbstständig: 'B1',
  persoenlich: 'B1',
  persönlich: 'B1',

  // --- B2 ---
  beruecksichtigen: 'B2',
  berücksichtigen: 'B2',
  beurteilen: 'B2',
  begruenden: 'B2',
  begründen: 'B2',
  verhandeln: 'B2',
  vermitteln: 'B2',
  unterstuetzen: 'B2',
  unterstützen: 'B2',
  feststellen: 'B2',
  analysieren: 'B2',
  bearbeiten: 'B2',
  umsetzen: 'B2',
  ueberpruefen: 'B2',
  überprüfen: 'B2',
  ausdruecken: 'B2',
  ausdrücken: 'B2',
  auswirken: 'B2',
  vereinbaren: 'B2',
  zusammenarbeiten: 'B2',
  gewaehrleisten: 'B2',
  gewährleisten: 'B2',
  ermitteln: 'B2',
  recherchieren: 'B2',
  formulieren: 'B2',
  strukturieren: 'B2',
  praesentieren: 'B2',
  präsentieren: 'B2',
  optimieren: 'B2',
  koordinieren: 'B2',
  zusammenhang: 'B2',
  massnahme: 'B2',
  maßnahme: 'B2',
  auswirkung: 'B2',
  wirtschaft: 'B2',
  gesellschaft: 'B2',
  herausforderung: 'B2',
  unternehmen: 'B2',
  arbeitsmarkt: 'B2',
  dienstleistung: 'B2',
  verantwortung: 'B2',
  fortbildung: 'B2',
  qualifikation: 'B2',
  wettbewerb: 'B2',
  kompetenz: 'B2',
  rahmenbedingung: 'B2',
  arbeitsverhaeltnis: 'B2',
  arbeitsverhältnis: 'B2',
  kuendigung: 'B2',
  kündigung: 'B2',
  wesentlich: 'B2',
  angemessen: 'B2',
  zuverlaessig: 'B2',
  zuverlässig: 'B2',
  effizient: 'B2',
  ausfuehrlich: 'B2',
  ausführlich: 'B2',
  relevant: 'B2',
  fachlich: 'B2',

  // --- C1 (Canonical C1 Goethe / telc Hochschule Corpus) ---
  ...C1_ENTRIES,
};

/**
 * Determines the CEFR level for a given lemma.
 * First consults the curated dictionary; if missing, parses fallback levels or defaults to B2.
 */
export function resolveCEFRLevel(lemma: string, fallbackLevel?: string | null): CEFRLevel {
  const clean = (lemma || '').toLowerCase().trim();
  if (DEFAULT_LEXICON_MAP[clean]) {
    return DEFAULT_LEXICON_MAP[clean];
  }

  // Parse fallback level string (e.g. 'B1/B2', 'A1', 'B2', 'C1-C2')
  if (fallbackLevel) {
    const upper = fallbackLevel.toUpperCase();
    if (upper.includes('C1') || upper.includes('C2')) return 'C1';
    if (upper.includes('B2')) return 'B2';
    if (upper.includes('B1')) return 'B1';
    if (upper.includes('A2')) return 'A2';
    if (upper.includes('A1')) return 'A1';
  }

  // Length heuristic: long complex composite words in German tend to be B2+
  if (clean.length >= 12) return 'B2';
  return 'B1';
}
