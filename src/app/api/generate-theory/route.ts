import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: Request) {
  try {
    const { topicId, topicTitle, level = 'B1' } = await req.json();

    if (!topicTitle) {
      return NextResponse.json({ error: 'Topic title is required' }, { status: 400 });
    }

    const systemPrompt = `Ты — лучший преподаватель немецкого языка. Твоя цель — объяснить грамматическую тему максимально доходчиво, понятно и подробно, но без академической воды.
Все объяснения пиши на русском языке, а немецкие примеры и грамматические термины — на немецком.
Форматируй ответ строго в виде валидного JSON без разметки markdown и вводных слов.`;

    const userPrompt = `Тема: "${topicTitle}" (Уровень: ${level}).
Составь подробную и наглядную шпаргалку по следующей JSON-структуре:
{
  "title": "${topicTitle}",
  "formula": "Краткая визуальная формула или ключевой шаблон правила (например: der/ein -> meinen)",
  "simpleExplanation": "Подробное, простое и понятное объяснение сути правила: зачем это нужно, когда используется и как устроена логика",
  "matrix": [
    { "label": "Maskulin (der)", "value": "форма / окончание" },
    { "label": "Neutral (das)", "value": "форма / окончание" },
    { "label": "Feminin (die)", "value": "форма / окончание" },
    { "label": "Plural (die)", "value": "форма / окончание" }
  ],
  "rules": [
    { "title": "Шаг 1: Основа", "desc": "Подробное описание первого важного нюанса" },
    { "title": "Шаг 2: Изменение по падежам/лицам", "desc": "Подробное описание логики окончаний" }
  ],
  "examples": [
    { "de": "Немецкое предложение с выделением ключевого слова", "ru": "Точный естественный перевод на русский", "note": "Краткий комментарий, почему именно такая форма использована" },
    { "de": "Второй наглядный пример", "ru": "Перевод на русский", "note": "Комментарий к падежу или структуре" },
    { "de": "Третий контрастный пример", "ru": "Перевод на русский", "note": "Комментарий" }
  ],
  "commonMistakes": "Частая ловушка или ошибка, которую допускают студенты на этом правиле, и как её избежать"
}`;

    const candidateModels = [
      'llama-3.3-70b-versatile',
      'openai/gpt-oss-120b',
      'qwen/qwen3.8-27b'
    ];

    let completion = null;
    let lastError = null;

    for (const model of candidateModels) {
      try {
        completion = await groq.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        });
        if (completion?.choices?.[0]?.message?.content) {
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Groq model ${model} unavailable, trying fallback:`, err.message || err);
      }
    }

    if (!completion?.choices?.[0]?.message?.content) {
      throw lastError || new Error('No completion returned from Groq');
    }

    const parsedData = JSON.parse(completion.choices[0]?.message?.content || '{}');
    return NextResponse.json({ success: true, data: parsedData });
  } catch (error) {
    console.error('Groq generation error:', error);
    return NextResponse.json({ success: false, error: 'Generation failed' }, { status: 500 });
  }
}
