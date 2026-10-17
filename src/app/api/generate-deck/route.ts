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

    const systemPrompt = `Ты — ведущий преподаватель и методист немецкого языка (Goethe-Institut / Duden).
Твоя задача — сгенерировать ровно ${targetCount} качественных учебных карточек уровня ${level} по теме "${title}".

РЕЖИМ: ${isGrammar ? 'ОТРАБОТКА ГРАММАТИКИ' : 'ИЗУЧЕНИЕ СЛОВ И ВЫРАЖЕНИЙ'}
${isGrammar 
  ? `Найди на прикрепленных материалах или сформулируй ключевую грамматическую конструкцию темы "${title}". Составь ${targetCount} предложений с пропуском целевой грамматической формы (артикль, окончание, модальный глагол, предлог или форма глагола). В предложении пропуск должен обозначаться строго как "___" (ровно три подчеркивания).`
  : `Выдели из материалов страниц или сформулируй ${targetCount} самых полезных и частотных слов/фраз урока. Составь с каждым живое предложение из рабочего или бытового немецкого контекста с пропуском этого слова в виде "___".`
}

ТРЕБОВАНИЯ К ДАННЫМ:
1. "sentence": Немецкое предложение с пропуском "___" (ровно три подчеркивания).
2. "targetWord": Точное правильное слово или грамматическая форма для вставки.
3. "translation": Естественный качественный русский перевод всего предложения.
4. "hint": Краткая полезная подсказка (род, падеж, управление).
5. "options": Массив ровно из 4 вариантов (1 правильный ответ + 3 правдоподобных дистрактора).

ФОРМАТ ОТВЕТА — СТРОГО JSON:
{
  "deckTitle": "${title}",
  "cards": [
    {
      "sentence": "Ich helfe ___ Vater im Garten.",
      "targetWord": "meinem",
      "translation": "Я помогаю моему отцу в саду.",
      "hint": "Dativ, Maskulin",
      "options": ["meinem", "meinen", "mein", "meines"]
    }
  ]
}`;

    // Подготовка контента
    const hasImages = Array.isArray(images) && images.length > 0;
    const userContent: any[] = [
      { type: 'text', text: `Тема: "${title}". Создай ровно ${targetCount} карточек${hasImages ? ' по прикрепленным материалам страниц' : ''}.` }
    ];

    if (hasImages) {
      images.forEach((imgBase64: string) => {
        userContent.push({
          type: 'image_url',
          image_url: { url: imgBase64.startsWith('data:') ? imgBase64 : `data:image/jpeg;base64,${imgBase64}` }
        });
      });
    }

    // Модели на Groq:
    // Для Vision (изображения): qwen/qwen3.8-27b
    // Для текста: openai/gpt-oss-120b, fallback: qwen/qwen3.8-27b
    const modelsToTry = hasImages 
      ? ['qwen/qwen3.8-27b'] 
      : ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];

    let completion: any = null;
    let lastError: any = null;

    for (const model of modelsToTry) {
      try {
        completion = await groq.chat.completions.create({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: hasImages ? (userContent as any) : `Тема: "${title}". Создай ровно ${targetCount} карточек.` }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
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

    const cards = Array.isArray(result.cards) ? result.cards : [];
    if (cards.length === 0) {
      throw new Error('Модель вернула пустой список карточек');
    }

    return NextResponse.json({ success: true, cards });
  } catch (error: any) {
    console.error('Deck generation error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error?.message || 'Ошибка генерации карточек' 
    }, { status: 500 });
  }
}
