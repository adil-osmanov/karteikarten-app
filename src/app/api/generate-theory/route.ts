import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: Request) {
  try {
    const { topicTitle, level = 'B1' } = await req.json();

    if (!topicTitle) {
      return NextResponse.json({ error: 'Topic title required' }, { status: 400 });
    }

    const systemPrompt = `Ты — ведущий немецкий методист уровня C2/Native и Apple Technical Writer. Твоя задача — формировать безупречные, исчерпывающие и визуально структурированные грамматические конспекты уровня ${level}.
Объясняй все правила, нюансы и переводы на РУССКОМ языке, а термины, схемы, формы и примеры — на НЕМЕЦКОМ.
Ответ верни СТРОГО в виде валидного JSON без разметки markdown и вступительного текста.`;

    const userPrompt = `Тема: "${topicTitle}" (Уровень: ${level}).
Сформируй глубокий конспект по следующей JSON-структуре:
{
  "title": "${topicTitle}",
  "catchyHeadline": "Короткий, запоминающийся заголовок-девиз темы (1 предложение, отражающее суть)",
  "coreConcept": "Фундаментальное объяснение сути правила простым языком без заумных терминов (2-3 емких абзаца)",
  "formula": "Главная визуальная схема правила (например: Subjekt + Modalverb (Pos 2) + ... + Infinitiv (Ende))",
  "genderMatrix": [
    {
      "gender": "maskulin",
      "article": "der",
      "forms": "den / einen / meinen",
      "note": "Меняет форму на -en!",
      "color": "sky"
    },
    {
      "gender": "neutral",
      "article": "das",
      "forms": "das / ein / mein",
      "note": "Форма совпадает с Nominativ",
      "color": "emerald"
    },
    {
      "gender": "feminin",
      "article": "die",
      "forms": "die / eine / meine",
      "note": "Форма совпадает с Nominativ",
      "color": "rose"
    },
    {
      "gender": "plural",
      "article": "die",
      "forms": "die / - / meine",
      "note": "Окончание -e во всех формах",
      "color": "amber"
    }
  ],
  "structuralRules": [
    {
      "title": "Позиция в простом предложении",
      "scheme": "Ich + muss + heute länger arbeiten.",
      "explanation": "Спрягаемый глагол стоит строго на 2-й позиции, смысловой инфинитив уходит в абсолютный конец."
    },
    {
      "title": "Позиция в вопросе",
      "scheme": "Kannst + du + mir bitte helfen?",
      "explanation": "Модальный глагол выходит на 1-е место."
    },
    {
      "title": "В придаточном предложении (weil, dass)",
      "scheme": "...weil ich heute Überstunden machen muss.",
      "explanation": "Оба глагола уходят в конец: сначала смысловой инфинитив, затем модальный."
    }
  ],
  "nuances": [
    {
      "title": "Смысловой оттенок: müssen vs sollen",
      "desc": "Müssen — личная необходимость или объективный факт (надо спать, чтобы жить). Sollen — выполнение чужого поручения, совет врача или приказ начальства."
    },
    {
      "title": "Dürfen vs Können",
      "desc": "Können выражает физическую или интеллектуальную способность. Dürfen — наличие официального разрешения или строгого запрета (nicht dürfen)."
    }
  ],
  "examples": [
    {
      "de": "Ich habe einen neuen Laptop gekauft.",
      "highlight": "einen neuen Laptop",
      "gender": "maskulin",
      "ru": "Я купил новый ноутбук.",
      "note": "Мужской род в винительном падеже (der Laptop -> einen Laptop)"
    },
    {
      "de": "Wir brauchen das grüne Ticket.",
      "highlight": "das grüne Ticket",
      "gender": "neutral",
      "ru": "Нам нужен зеленый билет.",
      "note": "Средний род не меняется"
    },
    {
      "de": "Er sieht die schöne Stadt.",
      "highlight": "die schöne Stadt",
      "gender": "feminin",
      "ru": "Он видит красивый город.",
      "note": "Женский род остаётся die"
    },
    {
      "de": "Ich nehme meine alten Bücher mit.",
      "highlight": "meine alten Bücher",
      "gender": "plural",
      "ru": "Я беру с собой свои старые книги.",
      "note": "Множественное число с окончанием -e"
    }
  ],
  "traps": [
    {
      "wrong": "Ich muss zu lernen. ❌",
      "right": "Ich muss lernen. ✅",
      "explanation": "С модальными глаголами частица ZU НИКОГДА не используется."
    },
    {
      "wrong": "Er will kauft ein Auto. ❌",
      "right": "Er will ein Auto kaufen. ✅",
      "explanation": "Смысловой глагол в конце обязан стоять в форме чистого инфинитива."
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
    console.error('Groq Generation Error:', error);
    return NextResponse.json({ success: false, error: 'Generation failed' }, { status: 500 });
  }
}
