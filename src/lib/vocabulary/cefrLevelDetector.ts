export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';

/**
 * Нормализует слово или фразу для поиска в лексиконе:
 * - приведение к нижнему регистру
 * - удаление разделителей приставок (|)
 * - удаление артиклей (der, die, das, ein...), возвратных местоимений (sich) и пунктуации
 */
export function normalizeWordForLexicon(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let clean = raw.toLowerCase().trim();

  // Удаляем вертикальную черту отделяемой приставки (auf|schrauben -> aufschrauben)
  clean = clean.replace(/\|/g, '');

  // Удаляем скобки, кавычки и знаки препинания
  clean = clean.replace(/[()[\]{}.,!?:;/"'„“”«»`~*^%$#@]/g, ' ');

  // Удаляем возвратное местоимение sich
  clean = clean.replace(/\b(sich)\b/g, ' ');

  // Удаляем немецкие и английские артикли
  clean = clean.replace(/\b(der|die|das|den|dem|des|ein|eine|einer|einem|einen|eines|the|a|an)\b/g, ' ');

  // Схлопываем пробелы
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean;
}

/**
 * Извлекает CEFR-уровень (A1, A2, B1, B2, C1) из названия колоды, секции или книги.
 * Корректно разбирает сложные случаи:
 * - "Aspekte Beruf B1-B2 - Kapitel 1" -> "B1" (главы 1-3 -> B1, главы >3 -> B2)
 * - "B1-B2" -> "B2" (дефолт при диапазоне без номера главы)
 * - "A1-Kurs", "Stufe B2", "C1 Intensiv", "Kapitel 2 (A2)"
 */
export function parseDeckLevel(deckLevel?: string | null): CEFRLevel | null {
  if (!deckLevel || typeof deckLevel !== 'string') return null;

  const raw = deckLevel.trim();
  if (!raw) return null;

  const upper = raw.toUpperCase();

  // 1. Прямое точное совпадение
  if (['A1', 'A2', 'B1', 'B2', 'C1'].includes(upper)) {
    return upper as CEFRLevel;
  }

  // 2. Обработка диапазонов (B1-B2, A1-A2, B2-C1)
  const isB1B2Range = /(?:B1\s*[-/&+]+\s*B2|B1\s+BIS\s+B2)/i.test(upper);
  const isA1A2Range = /(?:A1\s*[-/&+]+\s*A2|A1\s+BIS\s+A2)/i.test(upper);
  const isB2C1Range = /(?:B2\s*[-/&+]+\s*C1|B2\s+BIS\s+C1)/i.test(upper);

  if (isB1B2Range || isA1A2Range || isB2C1Range) {
    const chapterMatch = upper.match(/(?:KAPITEL|KAP\.?|LEKTION|MODUL|EINHEIT|CH(?:APTER)?)\s*[:#\-]?\s*(\d+)/i)
      || upper.match(/(?:^|\s)K(\d+)(?:\s|$|\.)/i)
      || upper.match(/(?:^|\s)M(\d+)(?:\s|$|\.)/i);

    const chapterNum = chapterMatch ? parseInt(chapterMatch[1], 10) : null;

    if (isB1B2Range) {
      if (chapterNum !== null) {
        return chapterNum <= 3 ? 'B1' : 'B2';
      }
      return 'B2'; // Дефолт при неоднозначности B1-B2
    }

    if (isA1A2Range) {
      if (chapterNum !== null) {
        return chapterNum <= 3 ? 'A1' : 'A2';
      }
      return 'A2';
    }

    if (isB2C1Range) {
      if (chapterNum !== null) {
        return chapterNum <= 3 ? 'B2' : 'C1';
      }
      return 'C1';
    }
  }

  // 3. Поиск отдельных маркеров уровней C1, B2, B1, A2, A1
  // Проверяем с границами слов/не-алфавитных символов
  if (/(?:^|[^A-Z0-9])C1(?:[^A-Z0-9]|$)/i.test(upper)) return 'C1';
  if (/(?:^|[^A-Z0-9])B2(?:[^A-Z0-9]|$)/i.test(upper)) return 'B2';
  if (/(?:^|[^A-Z0-9])B1(?:[^A-Z0-9]|$)/i.test(upper)) return 'B1';
  if (/(?:^|[^A-Z0-9])A2(?:[^A-Z0-9]|$)/i.test(upper)) return 'A2';
  if (/(?:^|[^A-Z0-9])A1(?:[^A-Z0-9]|$)/i.test(upper)) return 'A1';

  return null;
}

// ==========================================
// CORE CEFR LEXICONS (НЕМЕЦКИЙ ЯЗЫК DE)
// ==========================================

export const CORE_A1_DE = new Set<string>([
  // Бытовые длинные слова и составные понятия A1/A2, ошибочно попадавшие в B2
  'fahrkarte', 'fahrkarten', 'fahrkartenautomat', 'fahrkartenautomaten',
  'automat', 'automaten', 'schlüssel', 'zimmerschlüssel', 'zimmerschlüsseln',
  'hausaufgabe', 'hausaufgaben', 'kühlschrank', 'kühlschränke',
  'bahnhof', 'bahnhöfe', 'hauptbahnhof', 'flughafen', 'flughäfen',
  'krankenhaus', 'krankenhäuser', 'supermarkt', 'supermärkte',
  'frühstück', 'abendessen', 'mittagessen', 'kindergarten', 'kindergärten',
  'geburtstag', 'geburtstage', 'wörterbuch', 'wörterbücher',
  'sehenswürdigkeit', 'sehenswürdigkeiten', 'stadtplan', 'speisekarte',
  'reisebüro', 'u-bahn', 's-bahn', 'straßenbahn', 'haltestelle',
  'flugzeug', 'fahrrad', 'fahrräder', 'wochenende', 'arbeitsplatz',

  // Базовые глаголы A1
  'sein', 'haben', 'werden', 'können', 'müssen', 'wollen', 'dürfen', 'sollen', 'mögen', 'möchten',
  'gehen', 'kommen', 'machen', 'fahren', 'essen', 'trinken', 'schlafen', 'wohnen', 'arbeiten',
  'lernen', 'sprechen', 'lesen', 'schreiben', 'hören', 'sehen', 'kaufen', 'verkaufen', 'verstehen',
  'fragen', 'antworten', 'brauchen', 'finden', 'wissen', 'kennen', 'denken', 'geben', 'nehmen',
  'bringen', 'bringen', 'holen', 'zeigen', 'sagen', 'bleiben', 'stehen', 'liegen', 'sitzen',
  'stellen', 'legen', 'setzen', 'öffnen', 'schließen', 'anfangen', 'aufhören', 'anrufen',
  'aufstehen', 'einkaufen', 'einladen', 'mitbringen', 'mitkommen', 'umsteigen', 'einsteigen',
  'aussteigen', 'zahlen', 'bezahlen', 'kosten', 'helfen', 'warten', 'glauben', 'gefallen',
  'treffen', 'besuchen', 'reisen', 'kochen', 'spielen', 'lachen', 'weinen', 'wünschen',

  // Семья и люди A1
  'vater', 'mutter', 'eltern', 'sohn', 'tochter', 'bruder', 'schwester', 'geschwister',
  'kind', 'kinder', 'baby', 'mann', 'männer', 'frau', 'frauen', 'familie', 'familien',
  'freund', 'freunde', 'freundin', 'freundinnen', 'mensch', 'menschen', 'leute',
  'junge', 'jungen', 'mädchen', 'nachbar', 'nachbarn', 'arzt', 'ärztin', 'lehrer',
  'lehrerin', 'schüler', 'schülerin', 'student', 'studentin', 'kollege', 'kollegin',

  // Дом, быт, предметы A1
  'haus', 'häuser', 'wohnung', 'wohnungen', 'zimmer', 'küche', 'küchen', 'bad', 'badezimmer',
  'tisch', 'tische', 'stuhl', 'stühle', 'bett', 'betten', 'schrank', 'schränke', 'sofa',
  'tür', 'türen', 'fenster', 'lampe', 'lampen', 'computer', 'handy', 'handys', 'telefon',
  'buch', 'bücher', 'heft', 'stift', 'stifte', 'kugelschreiber', 'bleistift', 'tasche',
  'auto', 'autos', 'bus', 'busse', 'zug', 'züge', 'bahn', 'taxi', 'ticket', 'karte',
  'straße', 'straßen', 'platz', 'plätze', 'stadt', 'städte', 'dorf', 'land', 'apotheke',
  'hotel', 'hotels', 'restaurant', 'restaurants', 'café', 'bank', 'post', 'kasse',

  // Еда и напитки A1
  'brot', 'brötchen', 'wasser', 'kaffee', 'tee', 'milch', 'bier', 'wein', 'saft',
  'apfel', 'äpfel', 'banane', 'bananen', 'fleisch', 'fisch', 'käse', 'ei', 'eier',
  'butter', 'zucker', 'salz', 'suppe', 'salat', 'gemüse', 'obst', 'kartoffel', 'kartoffeln',
  'reis', 'nudeln', 'pizza', 'kuchen', 'schokolade', 'eis', 'öl', 'hähnchen',

  // Время, числа, календарь A1
  'tag', 'tage', 'woche', 'wochen', 'monat', 'monate', 'jahr', 'jahre', 'stunde', 'stunden',
  'minute', 'minuten', 'sekunde', 'sekunden', 'morgen', 'mittag', 'abend', 'nacht', 'nächte',
  'heute', 'gestern', 'morgen', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag',
  'samstag', 'sonntag', 'uhr', 'uhrzeit', 'zeit', 'frühling', 'sommer', 'herbst', 'winter',
  'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn',
  'elf', 'zwölf', 'hundert', 'tausend', 'null',

  // Прилагательные и базовые наречия A1
  'gut', 'schlecht', 'groß', 'klein', 'alt', 'neu', 'jung', 'schön', 'teuer', 'billig',
  'schnell', 'langsam', 'früh', 'spät', 'warm', 'kalt', 'hell', 'dunkel', 'einfach',
  'schwer', 'richtig', 'falsch', 'wichtig', 'fertig', 'frei', 'voll', 'leer', 'nah',
  'weit', 'kurz', 'lang', 'gern', 'gerne', 'bitte', 'danke', 'hallo', 'tschüss',
  'viel', 'wenig', 'mehr', 'hier', 'da', 'dort', 'oben', 'unten', 'rechts', 'links',
]);

export const CORE_A2_DE = new Set<string>([
  // Слова A2 с суффиксами, ошибочно попадавшие в B2 (-schaft, -keit, -heit, -ung)
  'freundschaft', 'freundschaften', 'krankheit', 'krankheiten', 'gesundheit',
  'möglichkeit', 'möglichkeiten', 'sauberkeit', 'höflichkeit', 'pünktlichkeit',
  'sicherheit', 'sicherheiten', 'wahrheit', 'wahrheiten', 'freiheit', 'freiheiten',
  'schönheit', 'dunkelheit', 'müdigkeit', 'einsamkeit', 'schwierigkeit', 'schwierigkeiten',
  'kleinigkeit', 'kleinigkeiten', 'gesellschaft', 'gesellschaften', 'mannschaft', 'mannschaften',
  'nachbarschaft', 'bekanntschaft',

  // Понятия A2 с суффиксом -ung
  'erfahrung', 'erfahrungen', 'ausbildung', 'ausbildungen', 'rechnung', 'rechnungen',
  'einladung', 'einladungen', 'entschuldigung', 'entschuldigungen', 'unterkunft', 'unterkünfte',
  'anmeldung', 'anmeldungen', 'abmeldung', 'abmeldungen', 'bestellung', 'bestellungen',
  'lieferung', 'lieferungen', 'heizung', 'heizungen', 'kleidung', 'zeitung', 'zeitungen',
  'bedeutung', 'bedeutungen', 'meinung', 'meinungen', 'wohnung', 'prüfungen', 'prüfung',
  'überraschung', 'erklärung', 'erklärungen', 'erinnerung', 'hoffnung', 'übung', 'übungen',
  'begründung', 'begrüßung', 'sendung', 'sendungen', 'abteilung', 'abteilungen',

  // Работа, документы, быт A2
  'arbeitgeber', 'arbeitnehmer', 'chef', 'chefin', 'beruf', 'berufe', 'job', 'jobs',
  'gehalt', 'gehälter', 'vertrag', 'verträge', 'bewerbung', 'bewerbungen', 'praktikum',
  'lebenslauf', 'termin', 'termine', 'besprechung', 'anruf', 'nachricht', 'nachrichten',
  'brief', 'briefe', 'e-mail', 'paket', 'adresse', 'adressen', 'telefonnummer',
  'unterschrift', 'formular', 'formulare', 'antrag', 'anträge', 'ausweis', 'pass', 'pässe',
  'visum', 'visen', 'miete', 'vermieter', 'mieter', 'kaution', 'nebenkosten', 'aufzug',
  'balkon', 'garten', 'gärten', 'keller', 'garage', 'garagen',

  // Здоровье и тело A2
  'körper', 'kopf', 'köpfe', 'auge', 'augen', 'ohr', 'ohren', 'nase', 'nasen', 'mund',
  'zahn', 'zähne', 'hals', 'arm', 'arme', 'hand', 'hände', 'finger', 'bein', 'beine',
  'fuß', 'füße', 'bauch', 'rücken', 'herz', 'herzen', 'schmerz', 'schmerzen',
  'fieber', 'husten', 'schnupfen', 'medikament', 'medikamente', 'tablette', 'tabletten',
  'rezept', 'rezepte', 'praxis', 'krankenwagen', 'notarzt', 'unfall', 'unfälle',
  'verletzung', 'pflaster', 'verband',

  // Путешествия, досуг, погода A2
  'urlaub', 'urlaube', 'reise', 'reisen', 'koffer', 'gepäck', 'ausflug', 'ausflüge',
  'strand', 'strände', 'meer', 'meere', 'see', 'seen', 'berg', 'berge', 'wald', 'wälder',
  'wetter', 'sonne', 'regen', 'schnee', 'wind', 'wolke', 'wolken', 'temperatur', 'grad',
  'museum', 'museen', 'kino', 'kinos', 'theater', 'konzert', 'konzerte', 'ausstellung',
  'sport', 'fitness', 'schwimmbad', 'verein', 'vereine', 'hobby', 'hobbys', 'freizeit',

  // Глаголы A2
  'abfahren', 'ankommen', 'abholen', 'aufstehen', 'aufhören', 'aufräumen', 'aussehen',
  'fernsehen', 'stattfinden', 'vorstellen', 'zurückkommen', 'empfehlen', 'gehören',
  'gewinnen', 'verlieren', 'hoffen', 'passen', 'schenken', 'schmecken', 'feiern',
  'reparieren', 'reservieren', 'organisieren', 'informieren', 'funktionieren',
  'überweisen', 'passieren', 'wehtun', 'gefallen', 'interessieren', 'freuen',
  'ärgern', 'kümmern', 'erinnern', 'beschweren', 'fühlen', 'bewegen',
]);

export const CORE_B1_DE = new Set<string>([
  // Профессиональная деятельность, право и документы B1
  'arbeitsvertrag', 'arbeitsverträge', 'bewerbung', 'bewerbungen', 'überweisung', 'überweisungen',
  'kündigung', 'kündigungen', 'versicherung', 'versicherungen', 'erlaubnis', 'abmachung', 'abmachungen',
  'weiterbildung', 'fortbildung', 'arbeitslosigkeit', 'teilzeit', 'vollzeit', 'überstunden',
  'schichtarbeit', 'urlaubsanspruch', 'gehaltserhöhung', 'steuer', 'steuern', 'krankenkasse',
  'rentenversicherung', 'haftpflichtversicherung', 'unfallversicherung', 'beitrag', 'beiträge',
  'mitgliedschaft', 'gewerkschaft', 'betriebsrat', 'kündigungsfrist', 'zeugnis', 'arbeitszeugnis',
  'anschreiben', 'vorstellungsgespräch', 'qualifikation', 'qualifikationen', 'kenntnisse',
  'fähigkeit', 'fähigkeiten', 'kompetenz', 'kompetenzen',

  // Общество, право, политика, среда B1
  'staat', 'staaten', 'regierung', 'regierungen', 'bürger', 'bürgerin', 'demokratie',
  'gesetz', 'gesetze', 'recht', 'rechte', 'gerechtigkeit', 'umwelt', 'umweltschutz',
  'klimawandel', 'energie', 'mülltrennung', 'recycling', 'verkehr', 'verkehrsmittel',
  'stau', 'nachhaltigkeit', 'ressourcen', 'konsum', 'bevölkerung', 'generation',
  'zukunft', 'vergangenheit', 'tradition', 'traditionen', 'kultur', 'kulturen',
  'diskussion', 'diskussionen', 'debatte', 'debatten', 'konflikt', 'konflikte',
  'lösung', 'lösungen', 'frieden', 'krise', 'krisen',

  // Медиа, технологии, образование B1
  'medien', 'nachrichten', 'bericht', 'berichte', 'artikel', 'internet', 'datenschutz',
  'werbung', 'öffentlichkeit', 'bildung', 'abitur', 'studium', 'universität', 'universitäten',
  'hochschule', 'abschluss', 'erfolg', 'misserfolg',

  // Абстрактные понятия B1
  'beziehung', 'beziehungen', 'eindruck', 'eindrücke', 'vertrauen', 'respekt',
  'verantwortung', 'entscheidung', 'entscheidungen', 'vermutung', 'absicht',
  'vorschlag', 'vorschläge', 'vereinbarung', 'kompromiss', 'kompromisse', 'bedingung',
  'bedingungen', 'forderung', 'forderungen', 'wirkung', 'ursache', 'ursachen',
  'folge', 'folgen', 'unterschied', 'unterschiede', 'gegensatz', 'vorteil', 'vorteile',
  'nachteil', 'nachteile', 'zusammenhang', 'überzeugung', 'zweifel', 'begeisterung',
  'enttäuschung', 'sorge', 'sorgen', 'angst', 'ängste', 'mut', 'geduld', 'vorsicht',

  // Глаголы B1
  'beeinflussen', 'berücksichtigen', 'beschließen', 'bestätigen', 'beteiligen',
  'beurteilen', 'beweisen', 'bewirken', 'darstellen', 'durchführen', 'entwickeln',
  'entscheiden', 'erfahren', 'erfinden', 'erkennen', 'erreichen', 'erwarten',
  'feststellen', 'fördern', 'fordern', 'gewährleisten', 'handeln', 'leisten',
  'lösen', 'mitteilen', 'nachweisen', 'regeln', 'schützen', 'überzeugen',
  'unterstützen', 'verändern', 'verbessern', 'verbinden', 'vereinbaren',
  'verhandeln', 'vermeiden', 'verursachen', 'verzichten', 'voraussetzen',
  'widersprechen', 'zusammenarbeiten', 'zweifeln',
]);

// ==========================================
// CORE CEFR LEXICONS (АНГЛИЙСКИЙ ЯЗЫК EN)
// ==========================================

export const CORE_A1_EN = new Set<string>([
  'hello', 'goodbye', 'please', 'thank', 'thanks', 'yes', 'no', 'water', 'food', 'bread',
  'coffee', 'tea', 'milk', 'apple', 'book', 'pen', 'car', 'bus', 'train', 'house', 'home',
  'room', 'door', 'window', 'table', 'chair', 'bed', 'phone', 'computer', 'cat', 'dog',
  'day', 'night', 'morning', 'evening', 'sun', 'rain', 'man', 'woman', 'child', 'children',
  'family', 'mother', 'father', 'brother', 'sister', 'friend', 'city', 'street', 'name',
  'time', 'hour', 'minute', 'money', 'price', 'shop', 'hotel', 'ticket', 'school',
  'teacher', 'student', 'doctor', 'work', 'job', 'eat', 'drink', 'sleep', 'go', 'come',
  'see', 'hear', 'speak', 'read', 'write', 'learn', 'buy', 'pay', 'help', 'like', 'love',
  'live', 'open', 'close', 'start', 'stop', 'good', 'bad', 'big', 'small', 'new', 'old',
  'hot', 'cold', 'happy', 'sad', 'easy', 'right', 'wrong', 'fast', 'slow',
]);

export const CORE_A2_EN = new Set<string>([
  'airport', 'station', 'subway', 'journey', 'vacation', 'holiday', 'weather', 'summer',
  'winter', 'spring', 'autumn', 'mountain', 'beach', 'river', 'sea', 'nature', 'clothes',
  'shirt', 'shoes', 'jacket', 'dress', 'apartment', 'kitchen', 'bathroom', 'garden',
  'neighbour', 'colleague', 'office', 'company', 'meeting', 'letter', 'message', 'email',
  'problem', 'mistake', 'health', 'illness', 'pain', 'medicine', 'hospital', 'advice',
  'choice', 'hobby', 'sports', 'cinema', 'concert', 'museum', 'travel', 'arrive', 'depart',
  'forget', 'remember', 'understand', 'explain', 'decide', 'agree', 'belong', 'borrow',
  'change', 'clean', 'cook', 'cost', 'enjoy', 'finish', 'happen', 'invite', 'join',
  'leave', 'meet', 'order', 'prefer', 'prepare', 'receive', 'relax', 'return', 'save',
  'send', 'spend', 'suggest', 'visit', 'wait', 'wear', 'win', 'active', 'afraid', 'angry',
  'busy', 'careful', 'clever', 'comfortable', 'dangerous', 'different', 'difficult',
  'expensive', 'famous', 'friendly', 'funny', 'healthy', 'important', 'interesting',
  'lucky', 'modern', 'necessary', 'nervous', 'polite', 'poor', 'popular', 'quiet',
  'ready', 'rich', 'safe', 'simple', 'special', 'strange', 'strong', 'tired', 'useful',
]);

export const CORE_B1_EN = new Set<string>([
  'ability', 'advantage', 'advertisement', 'agreement', 'application', 'appointment',
  'argument', 'arrangement', 'attitude', 'audience', 'background', 'behavior', 'benefit',
  'candidate', 'career', 'celebration', 'challenge', 'charity', 'climate', 'collection',
  'communication', 'community', 'competition', 'complaint', 'conclusion', 'condition',
  'conference', 'connection', 'consequence', 'construction', 'contract', 'contribution',
  'conversation', 'culture', 'customer', 'decision', 'delay', 'delivery', 'description',
  'development', 'difference', 'direction', 'disadvantage', 'discovery', 'discussion',
  'economy', 'education', 'efficiency', 'election', 'employee', 'employer', 'employment',
  'environment', 'equipment', 'evidence', 'exchange', 'experience', 'experiment',
  'explanation', 'failure', 'feature', 'financial', 'freedom', 'generation', 'government',
  'growth', 'guidance', 'habit', 'improvement', 'income', 'industry', 'influence',
  'information', 'insurance', 'intention', 'interview', 'invention', 'investigation',
  'investment', 'knowledge', 'leadership', 'location', 'management', 'movement',
  'negotiation', 'opportunity', 'opinion', 'option', 'organization', 'participation',
  'performance', 'permission', 'personality', 'perspective', 'policy', 'population',
  'possibility', 'poverty', 'preference', 'preparation', 'presentation', 'priority',
  'procedure', 'production', 'profession', 'progress', 'promotion', 'property',
  'proposal', 'protection', 'qualification', 'reaction', 'recommendation', 'relationship',
  'responsibility', 'result', 'security', 'selection', 'service', 'situation', 'society',
  'solution', 'statement', 'strategy', 'structure', 'suggestion', 'support', 'technology',
  'tradition', 'traffic', 'training', 'transportation', 'treatment', 'trend', 'trust',
  'unemployment', 'variety', 'warning', 'wealth',
]);

/**
 * Проверяет наличие слова (или его основы/компонентов) в лексиконе.
 */
function isInLexicon(clean: string, lexicon: Set<string>): boolean {
  if (!clean) return false;
  if (lexicon.has(clean)) return true;

  // Проверка без дефиса (z.B. u-bahn -> ubahn)
  const noHyphen = clean.replace(/-/g, '');
  if (lexicon.has(noHyphen)) return true;

  // Если строка содержит несколько слов (z.B. "fahrkarten kaufen")
  if (clean.includes(' ')) {
    const tokens = clean.split(' ').filter((t) => t.length > 2);
    for (const token of tokens) {
      if (lexicon.has(token)) return true;
    }
  }

  return false;
}

/**
 * Основная функция детекции CEFR-уровня (A1, A2, B1, B2, C1):
 * 1. ПРИОРИТЕТ 1: Явный уровень в карточке (card.level / cardLevel).
 * 2. ПРИОРИТЕТ 2: Контекст колоды / секции / книги (parseDeckLevel).
 * 3. ПРИОРИТЕТ 3: Встроенные компактные словари ядерных слов (CORE_*).
 * 4. ПРИОРИТЕТ 4: Умная суффиксальная и морфологическая эвристика.
 *    - Никаких проверок длины строки (length <= 5 или length >= 14)!
 *    - DE: иерунг/измус/логия -> C1; дефолт -> B2 (редкие слова jäh, karg, feil).
 *    - EN: академ. суффиксы -> C1/B2; дефолт -> B1.
 */
export function detectWordLevel(
  word: string,
  deckLevel?: string | null,
  cardLevel?: string | null,
  lang: string = 'de'
): CEFRLevel {
  // 1. Приоритет 1: Явный уровень в карточке (абсолютный приоритет)
  if (cardLevel) {
    const norm = cardLevel.toUpperCase().trim();
    if (['A1', 'A2', 'B1', 'B2', 'C1'].includes(norm)) {
      return norm as CEFRLevel;
    }
  }

  // 2. Приоритет 2: Контекст колоды или книги
  if (deckLevel) {
    const parsed = parseDeckLevel(deckLevel);
    if (parsed) {
      return parsed;
    }
  }

  const normLang = (lang || 'de').toLowerCase().trim();
  const clean = normalizeWordForLexicon(word);

  // 3. Приоритет 3: Встроенные компактные словари
  if (normLang === 'de') {
    if (isInLexicon(clean, CORE_A1_DE)) return 'A1';
    if (isInLexicon(clean, CORE_A2_DE)) return 'A2';
    if (isInLexicon(clean, CORE_B1_DE)) return 'B1';

    // 4. Приоритет 4: Умная суффиксальная эвристика для немецкого языка
    // Высокоабстрактные / академические / научные суффиксы -> C1
    if (/(?:ierung|isation|ismus|zentrismus|logie|graphie)$/i.test(clean)) {
      return 'C1';
    }

    // Аналитические / научные / бизнес-композиты -> B2
    if (/(?:wirtschaft|forschung|verfahren|konzept|hypothese|analyse|theorie|synthese|kriterium|struktur|phänomen|diskurs|kompetenz|perspektive|strategie|methodik|prozess)$/i.test(clean)) {
      return 'B2';
    }

    // Безопасный дефолт для немецкого языка: B2!
    // Неизвестные редкие слова (включая короткие 'jäh', 'karg', 'feil', 'stur')
    // попадают в B2, а не ошибочно в A1.
    return 'B2';
  }

  if (normLang === 'en') {
    if (isInLexicon(clean, CORE_A1_EN)) return 'A1';
    if (isInLexicon(clean, CORE_A2_EN)) return 'A2';
    if (isInLexicon(clean, CORE_B1_EN)) return 'B1';

    // Английские академические / C1 суффиксы
    if (/(?:ology|isation|ization|ousness|lessness|itarian)$/i.test(clean)) {
      return 'C1';
    }

    // Английские B2 суффиксы
    if (/(?:tion|sion|ity|ment|ence|ance|ative|itive|ological)$/i.test(clean)) {
      return 'B2';
    }

    // Безопасный дефолт для английского
    return 'B1';
  }

  // Общий дефолт
  return 'B1';
}
