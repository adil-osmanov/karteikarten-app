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

    const isGrammar = category.toLowerCase().includes('grammatik');
    const targetCount = Math.max(5, Math.min(50, Number(count) || 15));

    const systemPrompt = `Ты — эксперт по составлению стандартизированных тестов по немецкому языку (Goethe-Zertifikat / telc B1–B2).
Твоя цель — сгенерировать ${targetCount} качественных атомарных карточек с пропуском "___" и безупречными вариантами ответов (options).

ЖЕЛЕЗНЫЕ ПРАВИЛА ДЛЯ ПРЕДЛОЖЕНИЙ:
1. ПРАВИЛО ОДНОГО ПРЕДЛОЖЕНИЯ (СТРОГО):
   - 1 карточка = РОВНО 1 КОРОТКОЕ ЗАКОНЧЕННОЕ ПРЕДЛОЖЕНИЕ (8–14 слов).
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО объединять несколько предложений в одну карточку!
   - Если в тексте учебника идет длинный связный рассказ — выдели ТОЛЬКО ОДНО конкретное предложение с целевой лексикой/грамматикой.
   - ❌ ЗАПРЕЩЕНО: "Mit fünf Jahren ging ich in die Vorschule. Das war 1998. Ein Jahr später kam ich in die Grundschule."
   - ✅ ИДЕАЛЬНО: "Ein Jahr später ___ ich in die Grundschule." (targetWord: "kam")

2. НЕМЕЦКАЯ РАМОЧНАЯ КОНСТРУКЦИЯ (SATZKLAMMER & SYNTAX):
   - Предложение ОБЯЗАНО быть синтаксически полным и естественным по нормам Duden.
   - Если используется составное сказуемое (Perfekt, Passiv, модальные глаголы) — смысловое причастие/инфинитив ОБЯЗАТЕЛЬНО стоит на последнем месте:
     "Ich ___ 1993 in Homs geboren." (targetWord: "wurde")
   - Если глагол с отделяемой приставкой — приставка стоит строго в конце предложения:
     "Und so schloss ich meine Ausbildung mit der Note 2 ___ ." (targetWord: "ab")

ЖЕЛЕЗНЫЕ ПРАВИЛА ДЛЯ ВАРИАНТОВ ОТВЕТОВ (OPTIONS):
1. СТРОГАЯ УНИКАЛЬНОСТЬ (4 РАЗНЫХ СЛОВА):
   - Массив "options" ОБЯЗАН содержать ровно 4 СТРОГО УНИКАЛЬНЫХ варианта: 1 правильный ответ + 3 правдоподобных дистрактора.
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО дублировать слова! Никаких повторов (например: ["Berufstraining", "Berufstraining", ...] — грубейшая ошибка!).

2. ОДНОРОДНОСТЬ И СОПОСТАВИМАЯ ДЛИНА (HOMOGENEITY & LENGTH):
   - Все 4 варианта ответа обязаны принадлежать к ОДНОЙ части речи и стоять в ОДНОЙ грамматической форме (падеж, число, род или форма глагола).
   - Длина вариантов должна быть визуально сопоставимой: правильный ответ не должен выделяться тем, что он в два раза длиннее или короче остальных.
   - ПРИМЕР ДЛЯ СУЩЕСТВИТЕЛЬНЫХ (контекст "...an einem ___ teil"):
     ✅ ИДЕАЛЬНО: ["Bewerbungstraining", "Fachpraktikum", "Sprachseminar", "Vorstellungsgespräch"] (все 4 — сложные существительные среднего рода в Dativ).
     ❌ ЗАПРЕЩЕНО: ["Berufstraining", "Berufstraining", "kurs", "machen"]
   - ПРИМЕР ДЛЯ ПРИЛАГАТЕЛЬНЫХ / ПРИЧАСТИЙ (контекст "...war manchmal richtig ___"):
     ✅ ИДЕАЛЬНО: ["verzweifelt", "überfordert", "enttäuscht", "erschöpft"] (все 4 — эмоциональные состояния в форме предикатива).
     ❌ ЗАПРЕЩЕНО: ["verzweifelt", "verzweifelte", "verzweifelt", "verzweifeln"] (повторы и формы, ломающие синтаксис).
   - ПРИМЕР ДЛЯ ГЛАГОЛОВ (Präteritum):
     ✅ ИДЕАЛЬНО: ["schloss", "begann", "beendete", "unterbrach"]
     ❌ ЗАПРЕЩЕНО: ["schloss", "schließen", "geschlossen", "schloss"]

3. СОДЕРЖАНИЕ ВАРИАНТА:
   - Каждый вариант состоит строго из ОДНОГО слова (или отделяемой приставки), без предлогов, артиклей и знаков препинания.

4. РЕЖИМЫ:
   - Grammatik: фокус на грамматических структурах темы (падежи, окончания, временные формы, предлоги).
   - Wörter: фокус на ключевых лексических единицах, устойчивых выражениях (Nomen-Verb-Verbindungen).

ФОРМАТ JSON:
{
  "deckTitle": "${title}",
  "cards": [
    {
      "sentence": "Немецкое предложение с пропуском ___",
      "targetWord": "правильное слово",
      "translation": "Естественный русский перевод",
      "hint": "Краткая подсказка",
      "options": ["правильное", "дистрактор1", "дистрактор2", "дистрактор3"]
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
