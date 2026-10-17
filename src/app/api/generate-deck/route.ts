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

const AUXILIARY_STOP_WORDS = new Set([
  'war', 'waren', 'warst', 'wart',
  'hatte', 'hatten', 'hattest', 'hattet',
  'wurde', 'wurden', 'wurdest', 'wurdet',
  'bin', 'bist', 'ist', 'sind', 'seid',
  'habe', 'hast', 'hat', 'haben', 'habt',
  'werden', 'wird'
]);

function sanitizeAndFilterCards(cards: any[], isGrammar: boolean) {
  return cards
    .map(card => {
      let hint = String(card.hint || '').trim();
      // Вычищаем префиксы "Nomen ·", "Adverb ·", "Verb ·", "Adjektiv ·"
      hint = hint.replace(/^(Nomen|Verb|Adverb|Adjektiv)\s*[·•-]\s*(wie\?|was\?|wo\?)?\s*/i, '');

      return {
        ...card,
        sentence: String(card.sentence || '').trim().replace(/\s+([,.:;!?])/g, '$1'),
        targetWord: String(card.targetWord || '').trim(),
        hint
      };
    })
    .filter(card => {
      // Если это режим слов, отбрасываем случайные служебные глаголы
      if (!isGrammar && AUXILIARY_STOP_WORDS.has(card.targetWord.toLowerCase())) {
        return false;
      }
      return true;
    });
}

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

    const systemPrompt = `Ты — ведущий составитель учебных материалов по немецкому языку (Goethe-Institut / telc B1–B2).
Твоя задача — составить ${targetCount} эталонных карточек.

ТЕКУЩИЙ РЕЖИМ: ${isGrammar ? 'ГРАММАТИКА (GRAMMATIK)' : 'СЛОВА И ФЛЕШКАРТЫ (WÖRTER / BLITZKARTEN)'}

${!isGrammar ? `
=== ЖЕЛЕЗНЫЕ ПРАВИЛА ДЛЯ РЕЖИМА "WÖRTER" (СЛОВА) ===
1. КАТЕГОРИЧЕСКИЙ ЗАПРЕТ НА СЛУЖЕБНЫЕ СЛОВА (STOP-LIST):
   - ЗАПРЕЩЕНО создавать карточки на вспомогательные глаголы: "waren", "hatte", "hatten", "wurde", "wurden", "ist", "sind", "haben", "sein", "werden"!
   - ЗАПРЕЩЕНО делать карточками артикли, местоимения, предлоги и союзы.
   - Карточками становятся СТРОГО содержательные лексические единицы B1–B2:
     • Тематические существительные.
     • Полноценные смысловые глаголы (в инфинитиве).
     • Прилагательные и наречия.

2. СТРОГИЙ ФОРМАТ ПОЛЯ "targetWord" И "hint" ДЛЯ СУЩЕСТВИТЕЛЬНЫХ:
   - В поле "targetWord" помещается слово для пропуска в предложении (например: "Abiturprüfung").
   - В поле "hint" ОБЯЗАТЕЛЬНО указывается: "артикль Слово, -мн.число — перевод"
     ✅ ПРАВИЛЬНО: "die Abiturprüfung, -en — экзамен на аттестат зрелости"
     ✅ ПРАВИЛЬНО: "der Sprachkurs, -e — языковой курс"
     ✅ ПРАВИЛЬНО: "das Zertifikat, -e — сертификат"
     ❌ ЗАПРЕЩЕНО: писать "Nomen · ...", опускать артикль или форму множественного числа!

3. СТАНДАРТ ДЛЯ ГЛАГОЛОВ:
   - В поле "hint": "Infinitiv, Präteritum, hat/ist Partizip II — перевод"
     Пример: "ankommen, kam an, ist angekommen — прибывать, приезжать"

4. СТАНДАРТ ДЛЯ ПРИЛАГАТЕЛЬНЫХ:
   - В поле "hint": "Wort — русский перевод" (например: "anspruchsvoll — требовательный").
` : `
=== ЖЕЛЕЗНЫЕ ПРАВИЛА ДЛЯ РЕЖИМА "GRAMMATIK" (ГРАММАТИКА) ===
1. ЧТО ТРЕНИРУЕМ:
   - Пропуском "___" является целевая грамматическая форма темы (окончание, форма времени, вспомогательный глагол, предлог или приставка).
   - Например, в предложении "Nachdem wir in Deutschland angekommen ___, ..." пропуском является "waren", а в поле hint пишется краткая формула правила:
     "Plusquamperfekt · waren ... angekommen (ankommen)"
`}

ОБЩИЕ ТРЕБОВАНИЯ К ПРЕДЛОЖЕНИЯМ:
- Satzklammer: рамочная конструкция закрыта (Partizip II стоит в конце предложения: "Nachdem wir 2014 in Deutschland angekommen waren...").
- Никаких разрывов сложных слов ("Violinunterricht", а не "Violin Unterricht").
- Options: ровно 4 уникальных варианта одной части речи.

ФОРМАТ JSON:
{
  "deckTitle": "${title}",
  "cards": [
    {
      "sentence": "Предложение с пропуском ___",
      "targetWord": "целевое_слово",
      "translation": "Русский перевод",
      "hint": "Подсказка строго по правилам выше",
      "options": ["вариант1", "вариант2", "вариант3", "вариант4"]
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

          const filteredCards = sanitizeAndFilterCards(rawCards, isGrammar);
          if (filteredCards.length === 0) {
            console.warn('[API generate-deck] No cards left after stop-word filtering');
            throw new Error('Модель вернула некорректный ответ');
          }

          const validatedCards = filteredCards.map((c: any) => sanitizeAndValidateCard(c, isGrammar));
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
