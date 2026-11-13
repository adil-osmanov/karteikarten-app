import { NextRequest, NextResponse } from 'next/server';

export interface ContextStoryWordItem {
  word: string;
  translation?: string;
  sentence?: string;
  level?: string;
}

export interface GeneratedStoryUsedWord {
  lemma: string;
  surfaceForm: string;
  translation: string;
}

export interface ContextStoryResponsePayload {
  title: string;
  paragraphs: string[];
  russianTranslation: string;
  usedWords: GeneratedStoryUsedWord[];
  source: 'ai' | 'fallback';
}

function getGroqApiKeys(): string[] {
  const rawKeys = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '';
  const uniqueKeys: string[] = [];

  for (const part of rawKeys.split(',')) {
    const cleaned = part.trim().replace(/^["']|["']$/g, '');
    if (cleaned && !uniqueKeys.includes(cleaned)) {
      uniqueKeys.push(cleaned);
    }
  }

  return uniqueKeys;
}

function cleanSeparators(text: string): string {
  return String(text || '').replace(/[|·•\u2506\u250A]/g, '').trim();
}

function buildLocalFallbackStory(words: ContextStoryWordItem[]): ContextStoryResponsePayload {
  const usedWords: GeneratedStoryUsedWord[] = words
    .map((item) => {
      const clean = cleanSeparators(item.word);
      return {
        lemma: clean,
        surfaceForm: clean.replace(/^(der|die|das|ein|eine)\s+/i, ''),
        translation: item.translation || '—',
      };
    })
    .filter((w) => w.lemma.length > 0);

  const listPreview = usedWords.map((w) => w.surfaceForm).join(', ');
  const firstHalf = usedWords.slice(0, Math.ceil(usedWords.length / 2)).map((w) => w.surfaceForm);
  const secondHalf = usedWords.slice(Math.ceil(usedWords.length / 2)).map((w) => w.surfaceForm);

  const paragraphs = [
    `Am späten Nachmittag saß Lena in einem kleinen Café in Berlin-Mitte und bereitete sich auf ein wichtiges Gespräch vor. In ihren Notizen standen mehrere Ausdrücke wie ${firstHalf.join(', ')}, die sie im Alltag ständig brauchte.`,
    secondHalf.length > 0
      ? `Als ihr Kollege Jonas ankam, unterhielten sich beide ausführlich über ihre Pläne für den kommenden Monat. Dabei fielen ganz natürlich Begriffe wie ${secondHalf.join(', ')}, sodass die Diskussion lebendig und präzise blieb.`
      : `Gemeinsam gingen sie alle Punkte noch einmal durch, bevor sie zufrieden aufbrachen.`,
  ];

  const russianTranslation = `Поздним вечером Лена сидела в небольшом кафе в центре Берлина и готовилась к важному разговору. В её заметках были выражения (${listPreview}), которые постоянно пригождаются в жизни и на работе. Когда пришёл её коллега Йонас, они подробно обсудили планы на следующий месяц, и дискуссия получилась живой и содержательной.`;

  return {
    title: 'Ein Nachmittag in Berlin',
    paragraphs,
    russianTranslation,
    usedWords,
    source: 'fallback',
  };
}

function normalizeUsedWords(
  rawUsedWords: unknown,
  inputWords: ContextStoryWordItem[]
): GeneratedStoryUsedWord[] {
  const inputByLower = new Map<string, { lemma: string; translation: string }>();
  for (const w of inputWords) {
    const clean = cleanSeparators(w.word);
    if (clean) {
      inputByLower.set(clean.toLowerCase(), {
        lemma: clean,
        translation: String(w.translation || '').trim() || '—',
      });
    }
  }

  const normalized: GeneratedStoryUsedWord[] = [];
  if (Array.isArray(rawUsedWords)) {
    for (const item of rawUsedWords) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      const lemma = cleanSeparators(String(obj.lemma || ''));
      const surfaceForm = cleanSeparators(String(obj.surfaceForm || lemma));
      const matchedInput = inputByLower.get(lemma.toLowerCase());
      const translation =
        String(obj.translation || '').trim() || matchedInput?.translation || '—';

      if (surfaceForm) {
        normalized.push({
          lemma: matchedInput?.lemma || lemma || surfaceForm,
          surfaceForm,
          translation,
        });
      }
    }
  }

  if (normalized.length > 0) return normalized;

  return inputWords.map((w) => {
    const clean = cleanSeparators(w.word);
    return {
      lemma: clean,
      surfaceForm: clean.replace(/^(der|die|das|ein|eine)\s+/i, ''),
      translation: String(w.translation || '').trim() || '—',
    };
  });
}

export async function POST(req: NextRequest) {
  let parsedWords: ContextStoryWordItem[] = [];
  let level = 'B1–B2';

  try {
    const body = await req.json();
    if (Array.isArray(body?.words)) {
      parsedWords = body.words.slice(0, 10);
    }
    if (typeof body?.level === 'string' && body.level.trim() && body.level !== 'Alle') {
      level = body.level.trim();
    }
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  }

  if (parsedWords.length === 0) {
    return NextResponse.json({ error: 'Keine Wörter übergeben' }, { status: 400 });
  }

  const formattedWordList = parsedWords
    .map((w) => {
      const clean = cleanSeparators(w.word);
      return `- ${clean}${w.translation ? ` (${w.translation})` : ''}`;
    })
    .join('\n');

  const systemPrompt = `Du bist ein erfahrener deutscher Autor für Sprachlernende auf dem Niveau B1–B2.
Schreibe eine zusammenhängende, lebendige und realistische Kurzgeschichte oder Alltagsszene in Deutschland (150–220 Wörter, aufgeteilt in 2 bis 3 sinnvolle Absätze).
Verwende dabei alle vorgegebenen Zielwörter natürlich und grammatikalisch korrekt im Kontext (konjugierte Verben, passende Artikel und Fälle sind erwünscht).
Erfinde keine unzusammenhängenden Einzelsätze und liste am Ende keine Wörter auf.

Antworte ausschließlich als valides JSON-Objekt mit genau dieser Struktur:
{
  "title": "Kurzer passender deutscher Titel",
  "paragraphs": ["Absatz 1...", "Absatz 2...", "Absatz 3..."],
  "russianTranslation": "Natürliche, flüssige russische Übersetzung der gesamten Geschichte",
  "usedWords": [
    {
      "lemma": "Originalwort aus der Liste",
      "surfaceForm": "Exakte gebeugte Form, wie sie im Text vorkommt",
      "translation": "Russische Übersetzung"
    }
  ]
}`;

  const userPrompt = `Niveau-Fokus: ${level}
Verwende folgende ${parsedWords.length} gelernte Zielwörter natürlich in einer einzigen zusammenhängenden Geschichte (2–3 Absätze, 150–220 Wörter):
${formattedWordList}`;

  const candidateModels = [
    'llama-3.3-70b-versatile',
    'openai/gpt-oss-120b',
    'qwen/qwen3.8-27b',
    'openai/gpt-oss-20b',
  ];

  const apiKeys = getGroqApiKeys();
  if (apiKeys.length > 0) {
    const startIdx = Math.floor(Math.random() * apiKeys.length);

    for (let i = 0; i < apiKeys.length; i++) {
      const apiKey = apiKeys[(startIdx + i) % apiKeys.length];

      for (const model of candidateModels) {
        try {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              temperature: 0.7,
              max_tokens: 2048,
              response_format: { type: 'json_object' },
            }),
          });

          // Rate limit on key -> rotate immediately to the next API key
          if (res.status === 429 || res.status === 401 || res.status === 403) {
            break;
          }

          if (!res.ok) {
            // e.g. 404 model_not_found -> try next model on the same key
            continue;
          }

          const data = await res.json();
          const content = data?.choices?.[0]?.message?.content;
          if (!content || typeof content !== 'string') continue;

          const parsed = JSON.parse(content);
          const rawParagraphs: string[] = Array.isArray(parsed?.paragraphs)
            ? parsed.paragraphs
                .map((p: unknown) => String(p || '').trim())
                .filter(Boolean)
            : [];

          if (
            rawParagraphs.length > 0 &&
            typeof parsed?.russianTranslation === 'string' &&
            parsed.russianTranslation.trim().length > 0
          ) {
            const payload: ContextStoryResponsePayload = {
              title: String(parsed.title || 'Kurzgeschichte').trim(),
              paragraphs: rawParagraphs,
              russianTranslation: parsed.russianTranslation.trim(),
              usedWords: normalizeUsedWords(parsed.usedWords, parsedWords),
              source: 'ai',
            };
            return NextResponse.json(payload);
          }
        } catch {
          // Try next model / rotate key on network or JSON parse error
        }
      }
    }
  }

  return NextResponse.json(buildLocalFallbackStory(parsedWords));
}
