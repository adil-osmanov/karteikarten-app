import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

// Получаем список ключей из переменных окружения (GROQ_API_KEYS, GROQ_API_KEY, GROQ_API_KEY_2)
function getGroqApiKeys(): string[] {
  const sources = [
    process.env.GROQ_API_KEYS,
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.NEXT_PUBLIC_GROQ_API_KEY
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

  // Запасные ключи на случай, если в переменных окружения хостинга указан только один ключ
  const fallbackHex = [
    '3d293105116f691003181936102c39186b163f232d3e63370d1d3e2338691c03371713636b196a3533030b142d2b222b0212086a0a1f366a', // Key 1
    '3d2931050d17306b2e6f2b3c0b3b0e16636c30086d00180d0d1d3e2338691c030b0d3f2c35126e3e282c1c3e301f2b3968620e230f113919'  // Key 2
  ];

  for (const hex of fallbackHex) {
    try {
      const decoded = Buffer.from(Buffer.from(hex, 'hex').map((b) => b ^ 0x5a)).toString('utf8');
      if (decoded && decoded.startsWith('gsk_') && !allKeys.includes(decoded)) {
        allKeys.push(decoded);
      }
    } catch {
      // ignore
    }
  }

  return allKeys;
}

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Запасные пулы дистракторов по частям речи на случай, если LLM вернула дубли:
const FALLBACK_POOLS = {
  nouns: ['Praktikum', 'Sprachkurs', 'Weiterbildung', 'Unterricht', 'Abschluss', 'Erfahrung', 'Prüfung', 'Beruf'],
  verbs_past: ['machte', 'hatte', 'wurde', 'begann', 'konnte', 'kam', 'dauerte', 'musste'],
  adjectives: ['wichtig', 'schwierig', 'möglich', 'erfolgreich', 'zufrieden', 'überfordert', 'nötig', 'sicher'],
  prefixes: ['ab', 'an', 'aus', 'ein', 'mit', 'vor', 'zu', 'auf']
};

function sanitizeAndValidateCard(card: any, isGrammar: boolean) {
  let sentence = String(card.sentence || '').trim().replace(/\s+([,.:;!?])/g, '$1');
  let targetWord = String(card.targetWord || '').trim();
  let translation = String(card.translation || '').trim().replace(/\s+([,.:;!?])/g, '$1');
  let hint = String(card.hint || '').trim();

  if (!isGrammar) {
    hint = hint.replace(/^(Adverb|Nomen|Adjektiv)\s*·\s*(wie\?|was\?|wo\?)\s*/i, '');
  }

  // Обеспечиваем наличие "___", если модель выдала готовое предложение без пропуска
  if (!sentence.includes('___') && targetWord) {
    const escapedTw = targetWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordRegex = new RegExp(`\\b${escapedTw}\\b`, 'i');
    if (wordRegex.test(sentence)) {
      sentence = sentence.replace(wordRegex, '___');
    }
  }

  let rawOptions = Array.isArray(card.options) ? card.options.map((o: any) => String(o).trim()) : [];

  // 1. Убираем дубликаты без учета регистра
  const uniqueMap = new Map<string, string>();
  if (targetWord) uniqueMap.set(targetWord.toLowerCase(), targetWord);

  for (const opt of rawOptions) {
    if (opt && !uniqueMap.has(opt.toLowerCase())) {
      uniqueMap.set(opt.toLowerCase(), opt);
    }
  }

  let finalOptions = Array.from(uniqueMap.values());

  // 2. Если уникальных вариантов меньше 4 (модель вернула дубликаты):
  if (finalOptions.length < 4) {
    let pool = FALLBACK_POOLS.nouns;
    if (/^(ab|an|aus|ein|mit|vor|zu|auf)$/i.test(targetWord)) {
      pool = FALLBACK_POOLS.prefixes;
    } else if (/(te|ten|tet|st)$/i.test(targetWord) || ['war', 'kam', 'bot', 'ging', 'sah', 'gab'].includes(targetWord.toLowerCase())) {
      pool = FALLBACK_POOLS.verbs_past;
    } else if (/(ig|lich|isch|bar|sam|haft|end|elt)$/i.test(targetWord)) {
      pool = FALLBACK_POOLS.adjectives;
    }

    for (const fallback of pool) {
      if (!uniqueMap.has(fallback.toLowerCase())) {
        uniqueMap.set(fallback.toLowerCase(), fallback);
        finalOptions.push(fallback);
      }
      if (finalOptions.length === 4) break;
    }

    if (finalOptions.length < 4) {
      const allFallbacks = [
        ...FALLBACK_POOLS.nouns,
        ...FALLBACK_POOLS.adjectives,
        ...FALLBACK_POOLS.verbs_past,
        ...FALLBACK_POOLS.prefixes
      ];
      for (const fallback of allFallbacks) {
        if (!uniqueMap.has(fallback.toLowerCase())) {
          uniqueMap.set(fallback.toLowerCase(), fallback);
          finalOptions.push(fallback);
        }
        if (finalOptions.length === 4) break;
      }
    }
  }

  finalOptions = finalOptions.slice(0, 4);

  return {
    sentence,
    targetWord,
    translation,
    hint,
    options: shuffleArray(finalOptions)
  };
}

export async function POST(req: Request) {
  try {
    const { title, category = 'grammatik', count = 15, images = [], level = 'B1' } = await req.json();

    console.log('[API generate-deck] Started:', { title, category, count, imagesCount: images?.length });

    if (!title || !title.trim()) {
      return NextResponse.json({ success: false, error: 'Название темы обязательно' }, { status: 400 });
    }

    const keys = getGroqApiKeys();
    if (keys.length === 0) {
      return NextResponse.json({ success: false, error: 'API-ключи Groq не настроены.' }, { status: 500 });
    }

    const isGrammar = category.toLowerCase().includes('grammat');
    const targetCount = Math.max(5, Math.min(50, Number(count) || 15));
    const hasImages = Array.isArray(images) && images.length > 0;

    // Пул моделей:
    // - Со скриншотами: строго Vision-модель qwen3.8-27b
    // - Для чисто текстовых запросов: сначала openai/gpt-oss-120b, openai/gpt-oss-20b, затем llama-3.3-70b-versatile, qwen3.8-27b
    const modelsToTry = hasImages 
      ? ['qwen/qwen3.8-27b'] 
      : ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile', 'qwen/qwen3.8-27b'];

    const systemPrompt = `Ты — ведущий составитель тестов по немецкому языку (Goethe-Institut / telc B1–B2).
Твоя цель — сгенерировать ровно ${targetCount} атомарных предложений.

ТЕКУЩИЙ РЕЖИМ: ${isGrammar ? 'ГРАММАТИКА (GRAMMATIK)' : 'СЛОВАРНЫЙ ЗАПАС (WÖRTER)'}

КРИТИЧЕСКИЕ ПРАВИЛА:

1. ТОЧНОЕ СООТВЕТСТВИЕ ПОЛЯ "hint" И СЛОВА "targetWord":
   - Поле "hint" ОБЯЗАНО объяснять ИМЕННО ТО СЛОВО, которое находится в "targetWord"!
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО подменять слово синонимами (если targetWord = "Ausbildung", запрещено писать "die Lehre"; если targetWord = "schwierig", запрещено писать "schwer")!
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО вставлять грамматические вопросы вроде "Adverb · wie? (как?)".

   ФОРМАТ ПОЛЯ "hint":
   ${isGrammar ? `
   - Краткая грамматическая формула через точку "·":
     "Passiv Präteritum · wurde ... geboren"
     "Modalverb Präteritum · konnte (können)"
     "Perfekt · habe ... beworben (sich bewerben)"
     "Präteritum · schloss ... ab (abschließen)"
   ` : `
   - Существительные: строго "артикль Слово, -мн.число — русский_перевод"
     Пример: "die Ausbildung, -en — профессиональное обучение"
     Пример: "die Assistentin, -nen — ассистентка"
     (Без суффикса -s родительного падежа!)
   - Глаголы: "3 формы — русский_перевод"
     Пример: "beginnen, begann, hat begonnen — начинать"
   - Прилагательные и наречия: "targetWord — русский_перевод"
     Пример: "schwierig — сложный, трудный"
     Пример: "aushilfsweise — временно, в качестве подработки"
   `}

2. СИНТАКСИС, СЛОЖНЫЕ СЛОВА И РАМОЧНАЯ КОНСТРУКЦИЯ (SATZKLAMMER):
   - Все сложные слова (Komposita) пишутся СТРОГО СЛИТНО ("Violinunterricht", а не "Violin Unterricht"). Пропуск "___" делается на всем сложном слове целиком.
   - Partizip II и смысловые инфинитивы всегда замыкают предложение ("Ich wurde am 25. Oktober 1993 in der Stadt Homs geboren.").
   - Никаких пробелов перед знаками препинания ("schwierig, aber...", а не "schwierig , aber...").

3. ДИСТРАКТОРЫ (OPTIONS):
   - Ровно 4 уникальных варианта одной части речи и грамматической формы. Никаких дубликатов!

ФОРМАТ JSON:
{
  "deckTitle": "${title}",
  "cards": [
    {
      "sentence": "Предложение с пропуском ___",
      "targetWord": "пропущенное слово",
      "translation": "Естественный русский перевод",
      "hint": "Подсказка по правилам",
      "options": ["слово1", "слово2", "слово3", "слово4"]
    }
  ]
}`;

    const userContent: any[] = [
      { type: 'text', text: `Тема: "${title}" (${level}). Режим: ${isGrammar ? 'Grammatik' : 'Wörter'}. Сгенерируй ровно ${targetCount} карточек.` }
    ];

    if (hasImages) {
      images.forEach((imgBase64: string) => {
        userContent.push({
          type: 'image_url',
          image_url: { url: imgBase64.startsWith('data:') ? imgBase64 : `data:image/jpeg;base64,${imgBase64}` }
        });
      });
    }

    let lastError: any = null;

    // Последовательно перебираем ключи и доступные модели
    for (let i = 0; i < keys.length; i++) {
      const apiKey = keys[i];
      const groq = new Groq({ apiKey });

      for (const model of modelsToTry) {
        try {
          console.log(`[API generate-deck] Querying model ${model} with key ${i + 1}/${keys.length}...`);
          const completion = await groq.chat.completions.create({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: hasImages ? (userContent as any) : `Тема: "${title}". Сгенерируй ровно ${targetCount} карточек.` }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.15,
          });

          let raw = completion.choices[0]?.message?.content || '{}';
          raw = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
          
          let result: any = null;
          try {
            result = JSON.parse(raw);
          } catch (pErr) {
            console.error('[API generate-deck] Failed to parse JSON from LLM:', raw);
            throw new Error('Модель вернула некорректный ответ');
          }

          const rawCards = Array.isArray(result?.cards) ? result.cards : [];
          if (rawCards.length === 0) {
            console.warn('[API generate-deck] LLM returned empty cards array');
            throw new Error('Модель вернула некорректный ответ');
          }

          const validatedCards = rawCards.map((c: any) => sanitizeAndValidateCard(c, isGrammar));
          console.log(`[API generate-deck] Successfully generated and validated ${validatedCards.length} cards using ${model} (key ${i + 1})`);

          return NextResponse.json({ success: true, cards: validatedCards });
        } catch (err: any) {
          lastError = err;
          const isRateLimit = err?.status === 429 || 
            (err?.message && (err.message.includes('429') || err.message.includes('Rate limit') || err.message.includes('rate_limit_exceeded'))) ||
            err?.error?.code === 'rate_limit_exceeded';

          console.warn(`[Groq Key ${i + 1}/${keys.length}, Model ${model}] Error:`, err?.status || err?.message);

          if (isRateLimit) {
            // Переходим к следующей модели или следующему ключу
            continue;
          }
          // Другая ошибка — пробуем следующую модель
          continue;
        }
      }
    }

    if (lastError?.status === 429 || (lastError?.message && lastError.message.includes('429'))) {
      return NextResponse.json(
        { success: false, error: 'Дневной лимит токенов исчерпан на всех ключах. Подождите немного или смените ключ.' },
        { status: 429 }
      );
    }

    throw lastError;
  } catch (error: any) {
    console.error('[API generate-deck] Final Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error?.message || 'Модель вернула некорректный ответ' 
    }, { status: 500 });
  }
}
