import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: Request) {
  try {
    const { title, category = 'grammatik', count = 15, images = [], level = 'B1' } = await req.json();

    if (!title || !title.trim()) {
      return NextResponse.json({ success: false, error: 'Название темы обязательно' }, { status: 400 });
    }

    const isGrammar = category.toLowerCase().includes('grammatik');
    const targetCount = Math.max(5, Math.min(50, Number(count) || 15));

    const systemPrompt = `Ты — ведущий немецкий филолог, составитель учебных тестов уровня B1/B2 (Klett / Duden).
Твоя цель — создать ровно ${targetCount} АТОМАРНЫХ учебных карточек на основе материалов скриншотов учебника.

ФУНДАМЕНТАЛЬНЫЕ ПРАВИЛА (ZERO HALLUCINATION & CLEAN SYNTAX):
1. ПРАВИЛО ОДНОГО ПРЕДЛОЖЕНИЯ (СТРОГО):
   - 1 карточка = РОВНО 1 КОРОТКОЕ ЗАКОНЧЕННОЕ ПРЕДЛОЖЕНИЕ (8–14 слов).
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО объединять несколько предложений в одну карточку!
   - Если в тексте учебника идет длинный связный рассказ — выдели ТОЛЬКО ОДНО конкретное предложение с целевой лексикой/грамматикой.
   - ❌ ЗАПРЕЩЕНО: "Mit fünf Jahren ging ich in die Vorschule. Das war 1998. Ein Jahr später kam ich in die Grundschule."
   - ✅ ИДЕАЛЬНО: "Ein Jahr später ___ ich in die Grundschule." (targetWord: "kam")

2. НЕМЕЦКАЯ РАМОЧНАЯ КОНСТРУКЦИЯ (SATZKLAMMER & SYNTAX):
   - Предложение ОБЯЗАНО быть синтаксически полным и естественным по нормам Duden.
   - Если используется составное сказуемое (Perfekt, Passiv, модальные глаголы) — смысловой причастие/инфинитив ОБЯЗАТЕЛЬНО стоит на последнем месте:
     "Ich ___ 1993 in Homs geboren." (targetWord: "wurde")
   - Если глагол с отделяемой приставкой — приставка стоит строго в конце предложения:
     "Und so schloss ich meine Ausbildung mit der Note 2 ___ ." (targetWord: "ab")

3. ДИСТРАКТОРЫ (ВАРИАНТЫ ВЫБОРА):
   - Все 4 варианта (1 правильный + 3 дистрактора) обязаны быть строго ОДНОЙ части речи и состоять строго из ОДНОГО слова.
   - Запрещены составные фразы в вариантах ответа.

4. РЕЖИМЫ:
   - Grammatik: фокус на грамматических структурах темы (падежи, окончания, временные формы, предлоги).
   - Wörter: фокус на ключевых лексических единицах, устойчивых выражениях (Nomen-Verb-Verbindungen).

ФОРМАТ JSON:
{
  "deckTitle": "${title}",
  "cards": [
    {
      "sentence": "Одно законченное предложение с пропуском ___",
      "targetWord": "пропущенное слово",
      "translation": "Качественный русский перевод этого одного предложения",
      "hint": "Краткая грамматическая подсказка",
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

    // Чистый пост-процессинг без регулярных выражений и манипуляций со словами:
    // Только базовая техническая типографика (удаление двойных пробелов и пробелов перед знаками препинания)
    const cards = rawCards.map((card: any) => {
      let sentence = String(card.sentence || '').replace(/\s+([.,!?;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
      let targetWord = String(card.targetWord || '').trim();
      let translation = String(card.translation || '').replace(/\s+([.,!?;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
      let hint = String(card.hint || '').trim();
      let options = Array.isArray(card.options) ? card.options.map((o: any) => String(o).trim()) : [targetWord];

      // Обеспечиваем наличие "___", если модель выдала готовое предложение без пропуска
      if (!sentence.includes('___') && targetWord) {
        const escapedTw = targetWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const wordRegex = new RegExp(`\\b${escapedTw}\\b`, 'i');
        if (wordRegex.test(sentence)) {
          sentence = sentence.replace(wordRegex, '___');
        }
      }

      // Убедиться, что целевое слово присутствует среди вариантов
      if (!options.includes(targetWord)) {
        options[0] = targetWord;
      }

      return {
        sentence,
        targetWord,
        translation,
        hint,
        options
      };
    });

    return NextResponse.json({ success: true, cards });
  } catch (error: any) {
    console.error('Deck generation error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error?.message || 'Ошибка генерации карточек' 
    }, { status: 500 });
  }
}
