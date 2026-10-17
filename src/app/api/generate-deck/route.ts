import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: Request) {
  try {
    const { title, category = 'grammatik', count = 15, images = [], level = 'B1' } = await req.json();

    const isGrammar = category.toLowerCase() === 'grammatik';
    const targetCount = Math.max(5, Math.min(50, Number(count) || 15));
    const model = images.length > 0 ? 'llama-3.2-11b-vision-preview' : 'llama-3.3-70b-versatile';

    const systemPrompt = `Ты — ведущий преподаватель и методист немецкого языка.
Твоя задача — проанализировать предоставленные материалы учебника (скриншоты/текст) и сгенерировать ровно ${targetCount} качественных учебных карточек уровня ${level}.

РЕЖИМ: ${isGrammar ? 'ОТРАБОТКА ГРАММАТИКИ' : 'ИЗУЧЕНИЕ СЛОВ И ВЫРАЖЕНИЙ'}
${isGrammar 
  ? `Найди на страницах ключевую грамматическую конструкцию темы "${title}". Составь ${targetCount} предложений с пропуском целевой грамматической формы (артикль, окончание, модальный глагол, предлог или форма глагола). В предложении пропуск должен обозначаться строго как "___" (три подчеркивания).`
  : `Выдели из материалов страниц ${targetCount} самых полезных и частотных слов/фраз урока. Составь с каждым живое предложение из рабочего или бытового немецкого контекста с пропуском этого слова в виде "___".`
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
      "sentence": "Ich habe ___ neuen Laptop gekauft.",
      "targetWord": "einen",
      "translation": "Я купил новый ноутбук.",
      "hint": "Akkusativ, Maskulin",
      "options": ["einen", "ein", "einem", "eines"]
    }
  ]
}`;

    // Формируем контент с поддержкой Vision (base64 images):
    const userContent: any[] = [
      { type: 'text', text: `Тема: "${title}". Создай ${targetCount} карточек по прикрепленным материалам.` }
    ];

    images.forEach((imgBase64: string) => {
      userContent.push({
        type: 'image_url',
        image_url: { url: imgBase64.startsWith('data:') ? imgBase64 : `data:image/jpeg;base64,${imgBase64}` }
      });
    });

    const completion = await groq.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: images.length > 0 ? (userContent as any) : `Тема: "${title}". Создай ${targetCount} карточек.` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    let raw = completion.choices[0]?.message?.content || '{}';
    raw = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const result = JSON.parse(raw);
    return NextResponse.json({ success: true, cards: result.cards || [] });
  } catch (error) {
    console.error('Deck generation error:', error);
    return NextResponse.json({ success: false, error: 'Generation failed' }, { status: 500 });
  }
}
