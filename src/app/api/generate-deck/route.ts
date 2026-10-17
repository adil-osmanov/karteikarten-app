import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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
    // Определяем категорию для подбора запасных вариантов
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

    // Дополнительная страховка: если выбранного пула не хватило
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

  // Обрезаем до ровно 4
  finalOptions = finalOptions.slice(0, 4);

  // 3. Перемешиваем варианты (Fisher-Yates shuffle), чтобы правильный ответ не стоял всегда первым
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

    const isGrammar = category.toLowerCase().includes('grammat');
    const targetCount = Math.max(5, Math.min(50, Number(count) || 15));

    const systemPrompt = `Ты — строгий экзаменатор немецкого языка уровня B1/B2 (Goethe-Institut / telc).
Твоя цель — составить ${targetCount} безупречных предложений.

1. ЖЕЛЕЗНЫЙ ЗАКОН НЕМЕЦКОЙ РАМКИ (SATZKLAMMER & AUSKLAMMERUNGSVERBOT):
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО ставить Partizip II или Infinitiv в середину предложения перед обстоятельствами времени и места (калька с английского)!
   - ❌ ЗАПРЕЩЕНО: "Ich wurde geboren am 25. Oktober in Homs."
   - ✅ СТРОГО ОБЯЗАТЕЛЬНО: "Ich wurde am 25. Oktober 1993 in der Stadt Homs GEBOREN."
   - ❌ ЗАПРЕЩЕНО: "Er hat gearbeitet drei Jahre in Berlin."
   - ✅ СТРОГО ОБЯЗАТЕЛЬНО: "Er hat drei Jahre in Berlin GEARBEITET."
   - Причастия прошедшего времени (geboren, gearbeitet, studiert) и инфинитивы с модальными глаголами ВСЕГДА замыкают предложение в самом конце!

2. РЕЖИМ ГРАММАТИКА (GRAMMATIK):
   - Пропуск "___" делается СТРОГО на грамматической конструкции темы:
     • В теме Passiv/Perfekt: пропуск на вспомогательном глаголе ("Ich ___ 1993 in Homs geboren.") или на причастии ("Ich wurde 1993 in Homs ___ .").
     • В теме Präteritum: пропуск на форме глагола ("Er ___ als Ingenieur tätig.").
   - Поле "hint" — чистая формула через точку "·":
     • "Passiv Präteritum · wurde ... geboren"
     • "Präteritum · konnte (können)"
     • "Perfekt · hat ... gearbeitet"

3. РЕЖИМ СЛОВА (WÖRTER):
   - Пропуск "___" делается на целевом слове, которое тренируется.
   - Поле "hint" формируется строго:
     • Существительные: "артикль Слово, -мн.число — перевод" (например: "die Grundschule, -n — начальная школа", "der Ingenieur, -e — инженер", "das Fach, -er — предмет, специальность"). БЕЗ суффикса родительного падежа (-s)!
     • Глаголы: "3 формы — перевод" (например: "sich bewerben, bewarb sich, hat sich beworben — подавать заявление").
     • Прилагательные: "слово — перевод" (например: "anspruchsvoll — требовательный").

4. ДИСТРАКТОРЫ (OPTIONS):
   - 4 варианта ответа, идеально подходящие по смыслу и грамматике на место пропуска. Никаких повторов.

ФОРМАТ JSON:
{
  "deckTitle": "${title}",
  "cards": [
    {
      "sentence": "Немецкое предложение с идеальным порядком слов и пропуском ___",
      "targetWord": "пропущенная форма",
      "translation": "Естественный русский перевод",
      "hint": "Унифицированная подсказка",
      "options": ["ответ1", "ответ2", "ответ3", "ответ4"]
    }
  ]
}
`;

    // Подготовка контента
    const hasImages = Array.isArray(images) && images.length > 0;
    const userContent: any[] = [];

    if (hasImages) {
      images.forEach((imgBase64: string) => {
        userContent.push({
          type: 'image_url',
          image_url: { url: imgBase64.startsWith('data:') ? imgBase64 : `data:image/jpeg;base64,${imgBase64}` }
        });
      });
    }

    userContent.push({ 
      type: 'text', 
      text: `Тема: "${title}" (${level}). Режим: ${isGrammar ? 'Grammatik' : 'Wörter'}. Создай ровно ${targetCount} атомарных карточек строго по 1 короткому законченному предложению на карточку на основе учебника.` 
    });

    // Модели на Groq:
    // llama-3.2-11b-vision-preview при наличии изображений (fallback qwen/qwen3.8-27b),
    // llama-3.3-70b-versatile для текста (fallback openai/gpt-oss-120b, qwen/qwen3.8-27b)
    const modelsToTry = hasImages 
      ? ['llama-3.2-11b-vision-preview', 'qwen/qwen3.8-27b'] 
      : ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b'];

    let completion: any = null;
    let lastError: any = null;

    for (const model of modelsToTry) {
      try {
        completion = await groq.chat.completions.create({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: hasImages ? (userContent as any) : `Тема: "${title}". Создай ровно ${targetCount} карточек строго по теме ${isGrammar ? 'Grammatik' : 'Wörter'}. 1 карточка = строго 1 короткое предложение.` }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.15,
        });
        if (completion?.choices?.[0]?.message?.content) {
          break;
        }
      } catch (err: any) {
        console.warn(`Model ${model} failed, trying next:`, err.message);
        lastError = err;
      }
    }

    if (!completion?.choices?.[0]?.message?.content) {
      throw lastError || new Error('Не удалось получить ответ от Groq');
    }

    let raw = completion.choices[0]?.message?.content || '{}';
    raw = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const result = JSON.parse(raw);

    const rawCards = Array.isArray(result.cards) ? result.cards : [];
    if (rawCards.length === 0) {
      throw new Error('Модель вернула пустой список карточек');
    }

    // Применяем валидатор ко всем сгенерированным карточкам (дедупликация, fallback и Fisher-Yates shuffle)
    const validatedCards = rawCards.map(sanitizeAndValidateCard);

    return NextResponse.json({ success: true, cards: validatedCards });
  } catch (error: any) {
    console.error('Deck generation error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error?.message || 'Ошибка генерации карточек' 
    }, { status: 500 });
  }
}
