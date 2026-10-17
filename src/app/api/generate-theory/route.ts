import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: Request) {
  try {
    const { topicTitle, level = 'B1' } = await req.json();

    if (!topicTitle) {
      return NextResponse.json({ error: 'Topic title is required' }, { status: 400 });
    }

    const systemPrompt = `Ты — ведущий методист немецкого языка. Объясняй грамматику максимально понятно, наглядно и структурно, без академической воды.
Все правила, пояснения и переводы пиши на русском языке, а грамматические формы и примеры — на немецком.
Ответ верни СТРОГО в виде валидного JSON без разметки markdown и вступительного текста.`;

    const userPrompt = `Тема: "${topicTitle}" (Уровень: ${level}).
Сформируй конспект по следующей JSON-структуре:
{
  "title": "${topicTitle}",
  "oneLiner": "Главная суть правила в 1 емкую понятную фразу с ключевым инсайтом",
  "matrix": {
    "headers": ["Maskulin (der)", "Neutral (das)", "Feminin (die)", "Plural (die)"],
    "forms": ["форма/окончание", "форма/окончание", "форма/окончание", "форма/окончание"],
    "pronouns": ["местоимение", "местоимение", "местоимение", "местоимение"]
  },
  "triggers": {
    "verbs": ["глагол 1", "глагол 2", "глагол 3", "глагол 4", "глагол 5"],
    "prepositions": ["предлог 1", "предлог 2", "предлог 3", "предлог 4"],
    "explanation": "Когда и почему включается это правило (триггеры, падеж, вопросы)"
  },
  "examples": [
    {
      "de": "Немецкое предложение с ключевым фрагментом",
      "highlight": "ключевой фрагмент",
      "ru": "Точный естественный перевод на русский язык",
      "note": "Краткое понятное пояснение грамматического выбора"
    },
    {
      "de": "Второй наглядный пример",
      "highlight": "ключевой фрагмент",
      "ru": "Перевод на русский язык",
      "note": "Пояснение"
    },
    {
      "de": "Третий контрастный пример",
      "highlight": "ключевой фрагмент",
      "ru": "Перевод на русский язык",
      "note": "Пояснение"
    }
  ],
  "trap": {
    "title": "Ловушка или типичная ошибка студентов",
    "desc": "Как не ошибиться в реальной речи или тестах"
  }
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

    const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
    return NextResponse.json({ success: true, data: parsed });
  } catch (error) {
    console.error('Groq generation error:', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
