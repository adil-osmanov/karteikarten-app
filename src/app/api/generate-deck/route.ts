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

    const systemPrompt = `Ты — ведущий немецкий филолог и методист издательства Klett (Aspekte Beruf B1/B2, Goethe-Institut).
Твоя задача — извлечь и адаптировать ровно ${targetCount} учебных карточек уровня ${level} СТРОГО на основе текстов, упражнений и предложений из прикрепленных скриншотов учебника.

ЖЕЛЕЗНЫЕ ПРАВИЛА (СТРОГИЙ КОНТЕКСТ И БЕЗУПРЕЧНАЯ НЕМЕЦКАЯ ГРАММАТИКА):

1. ПРИНЦИП ПРЯМОГО ИЗВЛЕЧЕНИЯ ИЗ УЧЕБНИКА (100% GROUNDING):
   - Все карточки должны быть взяты ДОСЛОВНО из текста на скриншотах (биографии людей, упражнения, тексты уроков, автобиографии)!
   - Запрещено придумывать искусственные фразы-Франкенштейны из головы.
   - Бери реальные, законченные немецкие предложения из учебника и просто заменяй целевое слово на "___".
   - Если на скриншоте дана анкета или факты (например: Geburtsdatum, Geburtsort, Beruf des Vaters), формируй простые, естественные немецкие предложения строго по образцам учебника Klett:
     • "Ich wurde am 25. Oktober 1993 in Homs geboren." (ОБЯЗАТЕЛЬНО С СЛОВОМ 'geboren'!)
     • "Mein Vater war als Ingenieur tätig." / "Mein Vater arbeitete als Ingenieur."
     • "Er hat sein Studium abgeschlossen." / "Er schloss seine Ausbildung in Damaskus ab."
   - ЗАПРЕТ НА КРИВЫЕ КОНСТРУКЦИИ: Запрещено склеивать нелепые сложноподчиненные предложения вроде "Mein Vater war als Ingenieur tätig, weil er das Studium absolvierte". Предложения должны быть чистыми, лаконичными и естественными для немецкого языка!

2. КАТЕГОРИЧЕСКИЙ ЗАПРЕТ НА "absolvieren" / "absolvierte" (ZERO HALLUCINATION):
   - Запрещено использовать слово "absolvieren"! В текстах Klett Aspekte Beruf его НЕТ — оно звучит неестественно и книжно.
   - Используй ТОЛЬКО аутентичные формулировки учебника:
     • "schloss meine Ausbildung ab" / "den Abschluss machen" (ab|schließen)
     • "das Studium / die Schule beenden" (beendete)
     • "eine Ausbildung / ein Praktikum machen"
     • "an der Universität studieren"

3. СТРОГОЕ СОБЛЮДЕНИЕ РАМОЧНОЙ КОНСТРУКЦИИ (SATZKLAMMER) — НЕ ОБРЕЗАТЬ СКАЗУЕМОЕ:
   - В немецком языке глагольная рамка (Passiv, Perfekt, модальные глаголы, отделяемые приставки) ОБЯЗАНА БЫТЬ ПОЛНОЙ!
   - НЕДОПУСТИМО обрезать предложение перед финальным Partizip II или инфинитивом!
     ❌ ГРУБЕЙШАЯ ОШИБКА: "Ich ___ am 25. Oktober 1993 in Homs." (Где слово 'geboren'?! Предложение грамматически сломано!)
     ✅ ПРАВИЛЬНО: "Ich ___ am 25. Oktober 1993 in Homs geboren." (целевое слово: "wurde")
     ❌ ГРУБЕЙШАЯ ОШИБКА: "Er ___ seine Ausbildung in Damaskus." (Где 'ab'?)
     ✅ ПРАВИЛЬНО: "Er ___ seine Ausbildung in Damaskus ab." (целевое слово: "schloss")
     ✅ ПРАВИЛЬНО: "Er hat seine Ausbildung in Damaskus ___." (целевое слово: "abgeschlossen")

4. ПРАВИЛО ПРОПУСКА (TARGET WORD) В РЕЖИМЕ ${isGrammar ? 'ГРАММАТИКИ (Grammatik)' : 'СЛОВАРЯ (Wörter)'}:
   ${isGrammar 
     ? `- Целевым пропуском "___" должна быть именно грамматическая форма урока (в данном модуле: формы глаголов в Präteritum: "wurde", "kam", "hatte", "konnte", "schloss ... ab", "begann", либо предлоги Dativ/Akkusativ, падежные окончания).
- Пропуск обозначается СТРОГО как "___" (три символа подчеркивания).` 
     : `- Целевым пропуском "___" должно быть ключевое профессиональное слово или устойчивое выражение модуля (например: "tätig", "Ausbildung", "Bewerbung", "Erfahrung", "Praktikum", "Beruf").`
   }

5. КАЧЕСТВЕННЫЙ ЖИВОЙ ПЕРЕВОД НА РУССКИЙ ЯЗЫК:
   - Перевод должен звучать естественно и литературно для носителя русского языка (например: "Я родился 25 октября 1993 года в Хомсе.", а не машинный подстрочник).

6. ДИСТРАКТОРЫ (OPTIONS):
   - Массив "options" содержит ровно 4 варианта: 1 правильный ответ + 3 грамматически правдоподобных дистрактора той же части речи и грамматической формы (например для "wurde": ["wurde", "war", "kam", "hatte"]).

7. ТИПОГРАФИКА:
   - Никаких пробелов перед знаками препинания! Пиши строго "... in Homs geboren." вместо "... in Homs .".

ФОРМАТ JSON:
{
  "deckTitle": "${title}",
  "cards": [
    {
      "sentence": "Ich ___ am 25. Oktober 1993 in Homs geboren.",
      "targetWord": "wurde",
      "translation": "Я родился 25 октября 1993 года в Хомсе.",
      "hint": "Präteritum von werden (Passiv)",
      "options": ["wurde", "war", "kam", "hatte"]
    }
  ]
}`;

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
      text: `Тема: "${title}" (${level}). Извлеки ровно ${targetCount} предложений из текста на скриншотах. Внимательно проверь рамочную конструкцию (НЕ ТЕРЯЙ "geboren", приставки и Partizip II на конце предложений!) и никогда не используй неестественное слово "absolvieren". Никаких лишних пробелов перед точками!` 
    });

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

    const rawCards = Array.isArray(result.cards) ? result.cards : [];
    if (rawCards.length === 0) {
      throw new Error('Модель вернула пустой список карточек');
    }

    // Пост-процессинг: строгая валидация и исправление типичных багов LLM
    const cards = rawCards.map((card: any) => {
      let sentence = String(card.sentence || '').trim();
      let targetWord = String(card.targetWord || '').trim();
      let translation = String(card.translation || '').trim();
      let hint = String(card.hint || '').trim();
      let options = Array.isArray(card.options) ? card.options.map(String) : [targetWord];

      // 1. Очистка типографики: убираем пробелы перед знаками препинания (например: "слово ." -> "слово.")
      sentence = sentence.replace(/\s+([.,!?;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
      translation = translation.replace(/\s+([.,!?;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();

      // 2. Исправление потери "geboren" в предложениях о рождении:
      // Пример: "Ich ___ am 25. Oktober 1993 in Homs." -> "Ich ___ am 25. Oktober 1993 in Homs geboren."
      const isBirth = 
        /(?:^|[^\p{L}])родил/iu.test(translation) ||
        /(?:^|[^\p{L}])рождени/iu.test(translation) ||
        /geburt/i.test(hint) ||
        /(?:^|[^\p{L}])geburt/iu.test(sentence) ||
        /\b(?:wurde|wurden|bin|ist|war)\b.*?\b(?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|\d{4})\b.*?\bin\b/i.test(sentence);

      if (isBirth && !/geboren/i.test(sentence) && !/geboren/i.test(targetWord)) {
        sentence = sentence.replace(/\s*\.?$/, ' geboren.');
      }

      // 3. Исправление отделяемой приставки ab для schloss ... ab (abschließen)
      const isAbschliessen = (/\bschloss\b/i.test(sentence) || /\bschloss\b/i.test(targetWord)) &&
        /(?:ausbildung|studium|schule|lehre|vertrag|gymnasium)/i.test(sentence + ' ' + targetWord + ' ' + hint + ' ' + translation);
      if (isAbschliessen && !/\bab\b/i.test(sentence) && !/\bab\b/i.test(targetWord)) {
        sentence = sentence.replace(/\s*\.?$/, ' ab.');
      }

      // 4. Исключение неестественного вымышленного слова "absolvieren" / "absolvierte"
      const hasAbsolvieren = /absolvier/i.test(sentence) || /absolvier/i.test(targetWord) || options.some((o: string) => /absolvier/i.test(o));
      if (hasAbsolvieren) {
        sentence = sentence
          .replace(/das Studium absolvierte/gi, 'das Studium beendete')
          .replace(/die Ausbildung absolvierte/gi, 'die Ausbildung beendete')
          .replace(/das Studium absolvieren/gi, 'das Studium beenden')
          .replace(/die Ausbildung absolvieren/gi, 'die Ausbildung beenden')
          .replace(/absolvierte/gi, 'beendete')
          .replace(/absolvieren/gi, 'beenden')
          .replace(/absolviert/gi, 'beendet')
          .replace(/absolviere/gi, 'beende');

        if (/absolvier/i.test(targetWord)) {
          targetWord = targetWord
            .replace(/absolvierte/gi, 'beendete')
            .replace(/absolvieren/gi, 'beenden')
            .replace(/absolviert/gi, 'beendet')
            .replace(/absolviere/gi, 'beende');
        }

        options = options.map((opt: string) => 
          opt
            .replace(/absolvierte/gi, 'beendete')
            .replace(/absolvieren/gi, 'beenden')
            .replace(/absolviert/gi, 'beendet')
            .replace(/absolviere/gi, 'beende')
        );
      }

      // 5. Обеспечение наличия "___", если модель вернула предложение без пропуска, но со словом
      if (!sentence.includes('___') && targetWord) {
        const escapedTw = targetWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const wordRegex = new RegExp(`\\b${escapedTw}\\b`, 'i');
        if (wordRegex.test(sentence)) {
          sentence = sentence.replace(wordRegex, '___');
        }
      }

      // 6. Убедиться, что варианты уникальны, их ровно 4, и целевое слово присутствует
      options = Array.from(new Set(options.map((o: string) => String(o).trim())));
      const fallbackDistractors = ['beendete', 'begann', 'machte', 'hatte', 'wurde', 'kam', 'war', 'konnte'];
      for (const d of fallbackDistractors) {
        if (options.length < 4 && !options.includes(d) && d !== targetWord) {
          options.push(d);
        }
      }
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
