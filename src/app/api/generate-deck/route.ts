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

    const systemPrompt = `Ты — методист немецкого языка по учебникам Klett (Aspekte Beruf B1/B2).
Твоя задача — извлечь и адаптировать ровно ${targetCount} учебных карточек уровня ${level} СТРОГО на основе текста и упражнений из прикрепленных скриншотов учебника.

ЖЕЛЕЗНЫЕ ПРАВИЛА (СТРОГИЙ КОНТЕКСТ):
1. ЗАПРЕТ НА ВЫДУМЫВАНИЕ СЛОВ (ZERO HALLUCINATION):
   - Запрещено использовать слова и глаголы, которых нет на странице! Например, если на странице написано "schloss meine Ausbildung ab" или "das Studium beenden", ЗАПРЕЩЕНО заменять их на книжное "absolvieren".
   - Используй ТОЛЬКО лексику, устойчивые выражения (Nomen-Verb-Verbindungen) и грамматические структуры из текста на фото.

2. ПРИОРИТЕТ ОРИГИНАЛЬНЫХ ПРЕДЛОЖЕНИЙ И УНИКАЛЬНОСТЬ:
   - В первую очередь бери РЕАЛЬНЫЕ предложения из текста (например, из биографии "Mein Weg nach Deutschland" или упражнений).
   - Каждая карточка должна содержать УНИКАЛЬНОЕ предложение (запрещено дублировать одно и то же предложение).
   - Если предложений на фото меньше, чем ${targetCount} — составляй недостающие предложения МАКСИМАЛЬНО естественно, строго в контексте урока (поиск работы, учеба, резюме, биография), с естественной немецкой логикой, используя лексику и грамматику страницы, а не механический перевод.

3. ПРАВИЛО ПРОПУСКА (TARGET WORD):
   - РЕЖИМ ГРАММАТИКИ (Grammatik):
     Пропуском "___" должна быть именно целевая грамматическая форма урока (в данном модуле: формы Präteritum глаголов: "kam", "wurde", "schloss ... ab", "konnte", "hatte", "begann", либо связки предлогов).
   - РЕЖИМ СЛОВ (Wörter):
     Пропуском "___" должно быть ключевое профессиональное слово или устойчивая связка урока (например: "tätig", "bewerben", "Ausbildung", "Abschluss", "Praktikum").

4. ПЕРЕВОД:
   - Перевод на русский язык должен звучать живо и естественно для носителя, без дословного машинного подстрочника.

ТРЕБОВАНИЯ К ДАННЫМ:
1. "sentence": Немецкое предложение с пропуском "___" (ровно три подчеркивания).
2. "targetWord": Точное правильное слово или грамматическая форма для вставки.
3. "translation": Естественный качественный русский перевод всего предложения.
4. "hint": Контекстная подсказка (например: Präteritum от beginnen / Akk).
5. "options": Массив ровно из 4 вариантов (1 правильный ответ + 3 правдоподобных дистрактора).

ФОРМАТ JSON:
{
  "deckTitle": "${title}",
  "cards": [
    {
      "sentence": "Немецкое предложение из текста с пропуском ___",
      "targetWord": "пропущенное слово в нужной форме",
      "translation": "Естественный русский перевод всего предложения",
      "hint": "Контекстная подсказка (например: Präteritum от beginnen / Akk)",
      "options": ["правильное слово", "неправильное1", "неправильное2", "неправильное3"]
    }
  ]
}`;

    // Подготовка контента
    const hasImages = Array.isArray(images) && images.length > 0;
    const userContent: any[] = [
      { 
        type: 'text', 
        text: `Тема: "${title}". Извлеки ровно ${targetCount} карточек СТРОГО из текста и упражнений на прикрепленных страницах учебника без выдумывания сторонних слов.` 
      }
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
            { role: 'user', content: hasImages ? (userContent as any) : `Тема: "${title}". Создай ровно ${targetCount} карточек строго по теме ${isGrammar ? 'Grammatik' : 'Wörter'}.` }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
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
