import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: Request) {
  try {
    const { topicTitle, level = 'B1' } = await req.json();

    if (!topicTitle) {
      return NextResponse.json({ error: 'Topic title required' }, { status: 400 });
    }

    const systemPrompt = `Ты — строгий профессор и методист немецкого языка (Duden / Goethe-Institut), а также харизматичный наставник.
Твоя цель — безупречная грамматическая точность и кристальная понятность по теме: "${topicTitle}" (${level}).

КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО:
- Запрещено придумывать искусственные составные слова вроде "meinder", "meinedie", "meindas"! В немецком языке таких форм нет.
- Для притяжательных местоимений (Possessivartikel) формы строго:
  • Maskulin: mein / meinen (+ существительное: mein Vater, meinen Bruder)
  • Neutral: mein (+ существительное: mein Kind, mein Buch)
  • Feminin: meine (+ существительное: meine Mutter, meine Schwester)
  • Plural: meine (+ существительное: meine Eltern, meine Freunde)
- Каждая форма в матрице должна быть реальным немецким словом или словосочетанием.
- Никогда не смешивай артикль и местоимение в одно несуществующее слово-мутант!

ГРАММАТИЧЕСКАЯ И МЕТОДИЧЕСКАЯ СТРУКТУРА:
- Без академической скуки и воды. Объясняй логику: почему немцы так говорят, какая за этим стоит мысль, как это легко запомнить.
- Все объяснения, переводы и подсказки пиши на русском языке. Все конструкции, схемы и примеры — на грамотном немецком языке.
- КРИТИЧЕСКИ ВАЖНО: Весь контент должен быть СТРОГО о теме "${topicTitle}". Не упоминай модальные глаголы или другие темы, если тема запроса о другом!
- ПРАВИЛО ПУНКТУАЦИИ В ПРИМЕРАХ: Не допускай пробелов перед знаками препинания в конце строки. Строго "... den Apfel." вместо "... den Apfel .".
- В схемах используй правильную типографическую стрелку → вместо ->.
- Верни ответ СТРОГО в виде валидного JSON без преамбул и markdown-обёрток.`;

    const userPrompt = `Составь увлекательный, глубокий и безупречный конспект по теме: "${topicTitle}" (${level}).
Сформируй адаптивный JSON по следующей схеме:
{
  "title": "${topicTitle}",
  "catchyHeadline": "Яркая фраза-инсайт, которая за 3 секунды передает суть темы",
  "explanation": "Живое, простое и понятное объяснение: в чем логика правила, в каких жизненных ситуациях оно нужно и как устроено",
  "visualFormula": "Наглядная формула или схема правила (например: Possessiv + Nomen или Subjekt + Verb + ...)",
  "visualBreakdown": {
    "type": "matrix",
    "title": "Название наглядного блока (например: Формы притяжательных артиклей / Склонение артиклей)",
    "items": [
      {
        "label": "Maskulin (der)",
        "badge": "der",
        "value": "mein / meinen",
        "hint": "В Akkusativ добавляется окончание -en",
        "accent": "sky"
      },
      {
        "label": "Neutral (das)",
        "badge": "das",
        "value": "mein",
        "hint": "Окончания нет (совпадает с ein)",
        "accent": "emerald"
      },
      {
        "label": "Feminin (die)",
        "badge": "die",
        "value": "meine",
        "hint": "Окончание -e",
        "accent": "rose"
      },
      {
        "label": "Plural (die)",
        "badge": "die",
        "value": "meine",
        "hint": "Окончание -e во всех формах",
        "accent": "amber"
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
      "de": "Das ist mein neuer Kollege.",
      "highlight": "mein neuer Kollege",
      "gender": "maskulin",
      "accent": "sky",
      "ru": "Это мой новый коллега.",
      "note": "Мужской род в Nominativ: mein без окончания"
    },
    {
      "de": "Ich habe mein altes Buch gefunden.",
      "highlight": "mein altes Buch",
      "gender": "neutral",
      "accent": "emerald",
      "ru": "Я нашел свою старую книгу.",
      "note": "Средний род: mein без окончания"
    },
    {
      "de": "Wo ist meine Tasche?",
      "highlight": "meine Tasche",
      "gender": "feminin",
      "accent": "rose",
      "ru": "Где моя сумка?",
      "note": "Женский род: meine с окончанием -e"
    },
    {
      "de": "Ich rufe meine Eltern an.",
      "highlight": "meine Eltern",
      "gender": "plural",
      "accent": "amber",
      "ru": "Я звоню своим родителям.",
      "note": "Множественное число: meine с окончанием -e"
    }
  ],
  "traps": [
    {
      "wrong": "Das ist meinder Hund ❌",
      "right": "Das ist mein Hund ✅",
      "explanation": "Притяжательный артикль не соединяется со словом der! Для мужского рода в Nominativ форма 'mein'."
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
