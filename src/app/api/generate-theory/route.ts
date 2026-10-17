import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: Request) {
  try {
    const { topicTitle, level = 'B1' } = await req.json();

    if (!topicTitle) {
      return NextResponse.json({ error: 'Topic title required' }, { status: 400 });
    }

    const systemPrompt = `Ты — лучший, самый харизматичный преподаватель немецкого языка в Германии.
Твоя задача — объяснить тему "${topicTitle}" (${level}) так, чтобы студент понял её с первого раза и навсегда.
Без академической скуки и воды. Объясняй логику: почему немцы так говорят, какая за этим стоит мысль, как это легко запомнить.
Все объяснения, переводы и подсказки пиши на русском языке. Все конструкции, схемы и примеры — на немецком.
КРИТИЧЕСКИ ВАЖНО: Весь контент должен быть СТРОГО о теме "${topicTitle}". Не упоминай модальные глаголы или другие темы, если тема запроса о другом!
В примерах следи, чтобы перед точкой или знаком препинания в конце предложения не было лишнего пробела (пиши „... Buch.“, а не „... Buch .“).
В схемах используй правильную типографическую стрелку → вместо ->.
Верни ответ СТРОГО в виде валидного JSON без преамбул и markdown-обёрток.`;

    const userPrompt = `Составь увлекательный, глубокий и кристально понятный конспект по теме: "${topicTitle}" (${level}).
Сформируй адаптивный JSON по следующей схеме:
{
  "title": "${topicTitle}",
  "catchyHeadline": "Яркая фраза-инсайт, которая за 3 секунды передает суть темы",
  "explanation": "Живое, простое и понятное объяснение: в чем логика правила, в каких жизненных ситуациях оно нужно и как устроено",
  "visualFormula": "Наглядная формула или схема правила (например: Subjekt + Verb + ... или форма изменения)",
  "visualBreakdown": {
    "type": "matrix",
    "title": "Название наглядного блока (например: Склонение артиклей / Спряжение глагола / Порядок слов)",
    "items": [
      {
        "label": "Категория (например: Мужской род / ich / Шаг 1)",
        "badge": "der / глагол / маркер",
        "value": "Ключевая форма или окончание",
        "hint": "Важный комментарий или подсказка",
        "accent": "sky"
      }
    ]
  },
  "keyRules": [
    {
      "title": "Главный нюанс / Правило 1",
      "desc": "Четкое и понятное описание логики без лишней воды"
    },
    {
      "title": "Главный нюанс / Правило 2",
      "desc": "Следующий шаг или логика исключения"
    }
  ],
  "examples": [
    {
      "de": "Живое немецкое предложение из реальной жизни",
      "highlight": "Ключевая часть фразы, иллюстрирующая правило",
      "ru": "Точный естественный русский перевод",
      "note": "Краткое объяснение, почему здесь использована именно эта форма"
    },
    {
      "de": "Второй наглядный пример",
      "highlight": "Фрагмент для подсветки",
      "ru": "Перевод на русский",
      "note": "Пояснение"
    },
    {
      "de": "Третий контрастный пример",
      "highlight": "Фрагмент для подсветки",
      "ru": "Перевод на русский",
      "note": "Пояснение"
    }
  ],
  "traps": [
    {
      "wrong": "Частая типичная ошибка иностранцев ❌",
      "right": "Как сказать правильно ✅",
      "explanation": "Почему именно так и как не попадаться в эту ловушку"
    }
  ]
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
          temperature: 0.25,
        });
        if (completion?.choices?.[0]?.message?.content) {
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Groq model ${model} failed, trying fallback:`, err.message || err);
      }
    }

    if (!completion?.choices?.[0]?.message?.content) {
      throw lastError || new Error('No completion returned from Groq');
    }

    let raw = completion.choices[0]?.message?.content || '{}';
    raw = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(raw);

    // Sanitize punctuation spacing in examples
    if (parsed.examples && Array.isArray(parsed.examples)) {
      parsed.examples = parsed.examples.map((ex: any) => ({
        ...ex,
        de: (ex.de || '').replace(/\s+([.,!?:;])/g, '$1').trim()
      }));
    }

    return NextResponse.json({ success: true, data: parsed });
  } catch (error) {
    console.error('Groq Error:', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
