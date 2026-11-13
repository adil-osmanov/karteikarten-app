import { NextRequest, NextResponse } from 'next/server';

function getGroqApiKeys(): string[] {
  const sources = [
    process.env.GROQ_API_KEYS,
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.NEXT_PUBLIC_GROQ_API_KEY,
  ].filter(Boolean) as string[];

  const allKeys: string[] = [];
  for (const src of sources) {
    const parts = src.split(',').map((k) => k.trim().replace(/^["']|["']$/g, ''));
    for (const p of parts) {
      if (p && p.startsWith('gsk_') && !allKeys.includes(p)) {
        allKeys.push(p);
      }
    }
  }
  return allKeys;
}

interface InputWordItem {
  word: string;
  translation?: string;
  sentence?: string;
  level?: string;
}

function buildLocalFallbackStory(words: InputWordItem[]) {
  const cleanWords = words
    .map((w) => String(w.word || '').replace(/[|·•\u2506\u250A]/g, '').trim())
    .filter(Boolean);

  const linesDe: string[] = [];
  const linesRu: string[] = [];

  const withExamples = words.filter((w) => w.sentence && w.sentence.trim().length > 10);
  if (withExamples.length >= 2) {
    withExamples.slice(0, 5).forEach((item) => {
      const s = item.sentence!.replace(/\|/g, '').trim();
      linesDe.push(s.endsWith('.') || s.endsWith('!') || s.endsWith('?') ? s : `${s}.`);
      const cleanW = item.word.replace(/[|·•\u2506\u250A]/g, '').trim();
      linesRu.push(item.translation ? `${cleanW} — ${item.translation}.` : `${cleanW}.`);
    });
    const remaining = cleanWords.filter(
      (w) => !linesDe.some((line) => line.toLowerCase().includes(w.toLowerCase().split(' ').pop() || w.toLowerCase()))
    );
    if (remaining.length > 0) {
      linesDe.push(`Im Alltag und im Beruf begegnen uns diese Ausdrücke täglich: ${remaining.join(', ')}.`);
      linesRu.push(`В повседневной жизни и на работе эти выражения встречаются нам каждый день.`);
    }
  } else {
    linesDe.push(
      `Heute im Büro in Berlin besprechen wir ein wichtiges Thema und achten besonders auf Begriffe wie ${cleanWords.slice(0, 3).join(', ')}.`
    );
    linesDe.push(
      cleanWords.length > 3
        ? `Außerdem spielen ${cleanWords.slice(3).join(' und ')} im Gespräch eine entscheidende Rolle, damit alle Details klar bleiben.`
        : `Dadurch bleiben alle Vereinbarungen für das gesamte Team klar und verständlich.`
    );
    linesRu.push(
      `Сегодня в офисе в Берлине мы обсуждаем важную тему и обращаем особое внимание на изученную лексику: ${cleanWords
        .map((w, i) => (words[i]?.translation ? `${w} (${words[i].translation})` : w))
        .join(', ')}.`
    );
  }

  return {
    germanText: linesDe.join(' '),
    russianTranslation: linesRu.join(' '),
    usedWords: cleanWords,
    source: 'fallback' as const,
  };
}

export async function POST(req: NextRequest) {
  let parsedWords: InputWordItem[] = [];
  let level = 'B1-B2';

  try {
    const body = await req.json();
    if (Array.isArray(body?.words)) {
      parsedWords = body.words.slice(0, 7);
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

  const formattedList = parsedWords
    .map((w) => {
      const clean = String(w.word || '').replace(/[|·•\u2506\u250A]/g, '').trim();
      return `- ${clean}${w.translation ? ` (${w.translation})` : ''}`;
    })
    .join('\n');

  const prompt = `Du bist ein erfahrener Deutschlehrer (${level}).
Schreibe einen kurzen, lebendigen und natürlichen deutschen Absatz oder Mini-Dialog (5 bis 7 Sätze, Niveau ${level}, realistische Alltags- oder Arbeitssituation in Deutschland).
Du MUSST alle 5-7 folgenden Wörter sinnvoll und grammatikalisch natürlich im Text verwenden:
${formattedList}

Antworte ausschließlich mit einem validen JSON-Objekt ohne Markdown-Blöcke in genau diesem Format:
{
  "germanText": "Der komplette deutsche Text (5-7 Sätze) mit korrekter Rechtschreibung.",
  "russianTranslation": "Natürliche, flüssige Übersetzung des gesamten Textes ins Russische.",
  "usedWords": ["Liste der genau so verwendeten Zielwörter aus der Vorgabe"]
}`;

  // 1. Try Gemini API if configured in environment
  const geminiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (geminiKey) {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.65,
              responseMimeType: 'application/json',
            },
          }),
        }
      );
      if (geminiRes.ok) {
        const gJson = await geminiRes.json();
        const rawText = gJson?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const parsed = JSON.parse(rawText);
          if (parsed?.germanText && parsed?.russianTranslation) {
            return NextResponse.json({
              germanText: String(parsed.germanText),
              russianTranslation: String(parsed.russianTranslation),
              usedWords: Array.isArray(parsed.usedWords)
                ? parsed.usedWords.map(String)
                : parsedWords.map((w) => w.word.replace(/[|·•\u2506\u250A]/g, '').trim()),
              source: 'ai',
            });
          }
        }
      }
    } catch {}
  }

  // 2. Fallback to configured project Groq API keys
  const keys = getGroqApiKeys();
  const candidateModels = [
    'llama-3.3-70b-versatile',
    'openai/gpt-oss-120b',
    'llama-3.1-70b-versatile',
    'openai/gpt-oss-20b',
  ];

  for (const apiKey of keys) {
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
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.65,
            max_tokens: 900,
          }),
        });
        if (!res.ok) continue;
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content) continue;
        const parsed = JSON.parse(content);
        if (parsed?.germanText && parsed?.russianTranslation) {
          return NextResponse.json({
            germanText: String(parsed.germanText),
            russianTranslation: String(parsed.russianTranslation),
            usedWords: Array.isArray(parsed.usedWords)
              ? parsed.usedWords.map(String)
              : parsedWords.map((w) => w.word.replace(/[|·•\u2506\u250A]/g, '').trim()),
            source: 'ai',
          });
        }
      } catch {}
    }
  }

  // 3. Clean deterministic fallback assembled from user cards so UI never fails
  return NextResponse.json(buildLocalFallbackStory(parsedWords));
}
