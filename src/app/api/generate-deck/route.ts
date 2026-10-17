import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

// Получаем список ключей из переменной окружения (поддерживаем разделение запятой)
function getGroqApiKeys(): string[] {
  const raw = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '';
  return raw
    .split(',')
    .map((k) => k.trim().replace(/^["']|["']$/g, ''))
    .filter((k) => k.length > 0);
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

function sanitizeAndValidateCard(card: any) {
  let sentence = String(card.sentence || '').replace(/\s+([.,!?;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  const targetWord = String(card.targetWord || '').trim();
  let translation = String(card.translation || '').replace(/\s+([.,!?;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  let hint = String(card.hint || '').trim();

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

    if (!title || !title.trim()) {
      return NextResponse.json({ success: false, error: 'Название темы обязательно' }, { status: 400 });
    }

    const keys = getGroqApiKeys();
    if (keys.length === 0) {
      return NextResponse.json({ success: false, error: 'API-ключи Groq не настроены.' }, { status: 500 });
    }

    const isGrammar = category.toLowerCase().includes('grammat');
    const targetCount = Math.max(5, Math.min(50, Number(count) || 15));

    // Актуальная рабочая Vision-модель Groq (llama-3.2-11b отключена):
    const model = images && images.length > 0 
      ? 'qwen/qwen3.8-27b' 
      : 'llama-3.3-70b-versatile';

    const systemPrompt = `Ты — ведущий немецкий методист и экзаменатор уровня B1–B2 (Goethe-Institut / Duden).
Твоя задача — составить ровно ${targetCount} карточек для тренировки.

ТЕКУЩИЙ РЕЖИМ: ${isGrammar ? 'ОТРАБОТКА ГРАММАТИКИ (GRAMMATIK)' : 'ИЗУЧЕНИЕ СЛОВ (WÖRTER)'}

КРИТИЧЕСКИЕ ЛИНГВИСТИЧЕСКИЕ ПРАВИЛА:
1. НЕМЕЦКИЕ СЛОЖНЫЕ СЛОВА (KOMPOSITA):
   - Все сложные существительные пишутся СТРОГО СЛИТНО В ОДНО СЛОВО!
   - ❌ ЗАПРЕЩЕНО: "Violin Unterricht", "Bewerbung Training", "Sprach Kurs".
   - ✅ СТРОГО: "Violinunterricht", "Bewerbungstraining", "Sprachkurs".
   - Пропуск "___" делается СТРОГО на ВСЕМ сложном слове целиком, а не на его части!

2. ЖЕЛЕЗНЫЙ SATZKLAMMER (РАМОЧНАЯ КОНСТРУКЦИЯ):
   - Причастия (Partizip II) и инфинитивы с модальными глаголами ОБЯЗАНЫ стоять в абсолютном конце предложения!
   - ❌ ЗАПРЕЩЕНО: "Ich wurde geboren am 25. Oktober 1993 in der Stadt Homs."
   - ✅ СТРОГО: "Ich wurde am 25. Oktober 1993 in der Stadt Homs geboren."
   - ❌ ЗАПРЕЩЕНО: "Er hat gearbeitet drei Jahre in Berlin."
   - ✅ СТРОГО: "Er hat drei Jahre in Berlin gearbeitet."

3. ПРИНЦИП АТОМАРНОСТИ:
   - 1 карточка = строго 1 короткое законченное предложение (8–14 слов). Никаких параграфов из 2-3 предложений.

4. ДИСТРАКТОРЫ (OPTIONS):
   - Ровно 4 УНИКАЛЬНЫХ варианта ответа, идеально подходящих по грамматике и смыслу на место пропуска. Никаких дубликатов!

5. ПОДСКАЗКА (HINT):
   ${isGrammar ? `
   - В режиме "Grammatik": пропуск на грамматической форме темы. В поле hint — краткая формула через точку "·":
     "Passiv Präteritum · wurde ... geboren"
     "Perfekt · habe ... beworben"
     "Präteritum · ging (gehen)"
   ` : `
   - В режиме "Wörter": пропуск на ключевом слове. В поле hint:
     Существительные: строго "артикль Слово, -мн.число — перевод" (например: "der Violinunterricht, -e — уроки игры на скрипке", "die Grundschule, -n — начальная школа", "das Fach, -er — предмет"). Без родительного падежа -s!
     Глаголы: "3 формы — перевод" (например: "sich bewerben, bewarb sich, hat sich beworben — подавать заявление").
     Прилагательные: "слово — перевод" (например: "anspruchsvoll — требовательный").
   `}

ФОРМАТ JSON:
{
  "deckTitle": "${title}",
  "cards": [
    {
      "sentence": "Предложение с пропуском ___",
      "targetWord": "пропущенное слово",
      "translation": "Естественный русский перевод",
      "hint": "Подсказка",
      "options": ["слово1", "слово2", "слово3", "слово4"]
    }
  ]
}`;

    const userContent: any[] = [
      { type: 'text', text: `Тема: "${title}" (${level}). Режим: ${isGrammar ? 'Grammatik' : 'Wörter'}. Сгенерируй ровно ${targetCount} карточек.` }
    ];

    if (images && images.length > 0) {
      images.forEach((imgBase64: string) => {
        userContent.push({
          type: 'image_url',
          image_url: { url: imgBase64.startsWith('data:') ? imgBase64 : `data:image/jpeg;base64,${imgBase64}` }
        });
      });
    }

    let lastError: any = null;

    // Последовательно перебираем ключи, если ловим Rate Limit (429)
    for (let i = 0; i < keys.length; i++) {
      const apiKey = keys[i];
      try {
        const groq = new Groq({ apiKey });

        const completion = await groq.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: images && images.length > 0 ? (userContent as any) : `Тема: "${title}". Сгенерируй ровно ${targetCount} карточек.` }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.15,
        });

        let raw = completion.choices[0]?.message?.content || '{}';
        raw = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        const result = JSON.parse(raw);
        const rawCards = Array.isArray(result.cards) ? result.cards : [];

        if (rawCards.length === 0) {
          throw new Error('Модель вернула пустой список карточек');
        }

        const validatedCards = rawCards.map(sanitizeAndValidateCard);

        // Успешно сгенерировано
        return NextResponse.json({ success: true, cards: validatedCards });
      } catch (err: any) {
        lastError = err;
        const isRateLimit = err?.status === 429 || (err?.message && err.message.includes('429'));
        console.warn(`[Groq Key ${i + 1}/${keys.length}] Ошибка:`, err?.status || err?.message);

        // Если это ошибка 429 (Rate Limit) и есть следующий ключ — пробуем его
        if (isRateLimit && i < keys.length - 1) {
          console.info(`Переключаемся на резервный API-ключ (${i + 2}/${keys.length})...`);
          continue;
        }

        // Если это не 429 или ключи закончились — выходим из цикла
        break;
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
    console.error('Deck generation error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error?.message || 'Ошибка генерации карточек' 
    }, { status: 500 });
  }
}
