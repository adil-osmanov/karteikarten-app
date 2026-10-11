'use server';

import { createClient } from '@supabase/supabase-js';

export interface DailyTask {
  id: string;
  title: string;
  target: number;
  current: number;
  type: 'due_review' | 'new_words' | 'weak_words' | 'blitz' | 'extra';
  is_completed: boolean;
}

export interface UserDebtStats {
  dueReviewsCount: number;
  weakWordsCount: number;
  newWordsCount: number;
  totalLearnedToday: number;
  totalCards: number;
  appLanguage?: 'DE' | 'EN';
}

/**
 * Server Action: Collects user debts and asks LLM (Groq / Gemini / OpenAI)
 * to construct a balanced, personalized Daily Plan according to Apple HIG standards.
 */
export async function generateAIDailyPlanAction(clientStats?: UserDebtStats): Promise<DailyTask[]> {
  try {
    let stats: UserDebtStats = clientStats || {
      dueReviewsCount: 0,
      weakWordsCount: 0,
      newWordsCount: 0,
      totalLearnedToday: 0,
      totalCards: 0,
      appLanguage: 'DE',
    };

    // If client stats are not provided, query Supabase on the server
    if (!clientStats) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (supabaseUrl && supabaseAnonKey) {
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        const { data: cards } = await supabase.from('cards').select('*');

        if (cards && cards.length > 0) {
          const now = Date.now();
          const due = cards.filter((c: any) => c.isArchived && c.nextReviewDate && c.nextReviewDate <= now).length;
          const weak = cards.filter((c: any) => !c.isArchived && (c.masteryLevel || 0) < 2).length;
          const fresh = cards.filter((c: any) => !c.isArchived && (!c.repetitions || c.repetitions === 0)).length;

          stats = {
            dueReviewsCount: due,
            weakWordsCount: weak,
            newWordsCount: fresh,
            totalLearnedToday: 0,
            totalCards: cards.length,
            appLanguage: 'DE',
          };
        }
      }
    }

    // Call server-side LLM (Groq, Gemini, OpenAI, or intelligent fallback)
    const tasks = await callLLMForPlan(stats);
    return tasks;
  } catch (error) {
    console.error('Failed to generate AI Daily Plan on server:', error);
    return getFallbackPlan(clientStats || {
      dueReviewsCount: 5,
      weakWordsCount: 5,
      newWordsCount: 10,
      totalLearnedToday: 0,
      totalCards: 100,
    });
  }
}

/**
 * Server-side LLM caller with multi-provider support:
 * 1. Groq (Llama-3.3-70b-versatile)
 * 2. Gemini (gemini-1.5-flash / gemini-2.0-flash)
 * 3. OpenAI (gpt-4o-mini)
 * 4. Adaptive Heuristic Fallback
 */
async function callLLMForPlan(stats: UserDebtStats): Promise<DailyTask[]> {
  const prompt = `You are an intelligent language learning coach inside an iOS/Apple-style German vocabulary app.
Analyze the user's current debt statistics:
- Overdue cards needing review: ${stats.dueReviewsCount}
- Weak/unmastered cards: ${stats.weakWordsCount}
- Brand new cards waiting: ${stats.newWordsCount}
- Completed cards today: ${stats.totalLearnedToday}
- Total cards in library: ${stats.totalCards}
- Learning language: ${stats.appLanguage || 'DE'}

Generate a crisp, balanced daily plan with 3 to 4 actionable tasks.
Output strictly valid JSON with this exact schema:
{
  "tasks": [
    {
      "id": "task_1",
      "title": "Short title in Russian (e.g. Повторить забытые карточки, Закрепить сложные слова, Освоить новые глаголы)",
      "target": number (integer between 5 and 20),
      "current": 0,
      "type": "due_review" | "weak_words" | "new_words" | "blitz",
      "is_completed": false
    }
  ]
}`;

  // 1. Try Groq if GROQ_API_KEY is available
  if (process.env.GROQ_API_KEY) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: 'You are an AI language learning coach. Respond strictly in JSON format.' },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed?.tasks) && parsed.tasks.length > 0) {
          return sanitizeTasks(parsed.tasks);
        }
      }
    } catch (e) {
      console.warn('Groq call failed, trying next provider:', e);
    }
  }

  // 2. Try Gemini if GEMINI_API_KEY is available
  if (process.env.GEMINI_API_KEY) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.3,
            },
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed?.tasks) && parsed.tasks.length > 0) {
          return sanitizeTasks(parsed.tasks);
        }
      }
    } catch (e) {
      console.warn('Gemini call failed, trying next provider:', e);
    }
  }

  // 3. Try OpenAI if OPENAI_API_KEY is available
  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are an AI language learning coach. Respond strictly in JSON format.' },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed?.tasks) && parsed.tasks.length > 0) {
          return sanitizeTasks(parsed.tasks);
        }
      }
    } catch (e) {
      console.warn('OpenAI call failed, falling back to smart heuristics:', e);
    }
  }

  // 4. Fallback heuristic generator (Calculated based on actual debts)
  return getFallbackPlan(stats);
}

function sanitizeTasks(rawTasks: any[]): DailyTask[] {
  return rawTasks.map((t, index) => ({
    id: t.id || `task_${index + 1}_${Date.now()}`,
    title: t.title || 'Ежедневная цель',
    target: Math.max(1, typeof t.target === 'number' ? Math.round(t.target) : 10),
    current: 0,
    type: (['due_review', 'weak_words', 'new_words', 'blitz', 'extra'].includes(t.type)
      ? t.type
      : 'due_review') as any,
    is_completed: false,
  }));
}

/**
 * Intelligent adaptive rule-based plan when LLM key is absent or offline.
 */
function getFallbackPlan(stats: UserDebtStats): DailyTask[] {
  const tasks: DailyTask[] = [];

  // Task 1: Overdue reviews
  if (stats.dueReviewsCount > 0) {
    const target = Math.min(Math.max(5, stats.dueReviewsCount), 15);
    tasks.push({
      id: 'task_due_reviews',
      title: 'Повторить забытые карточки',
      target,
      current: 0,
      type: 'due_review',
      is_completed: false,
    });
  } else {
    tasks.push({
      id: 'task_refresh',
      title: 'Освежить активный словарный запас',
      target: 10,
      current: 0,
      type: 'due_review',
      is_completed: false,
    });
  }

  // Task 2: Difficult or unmastered words
  if (stats.weakWordsCount > 0) {
    const target = Math.min(Math.max(5, stats.weakWordsCount), 10);
    tasks.push({
      id: 'task_weak_words',
      title: 'Закрепить сложные слова',
      target,
      current: 0,
      type: 'weak_words',
      is_completed: false,
    });
  }

  // Task 3: New words intake
  const newTarget = stats.newWordsCount > 0 ? Math.min(Math.max(5, stats.newWordsCount), 10) : 10;
  tasks.push({
    id: 'task_new_words',
    title: 'Изучить новые выражения',
    target: newTarget,
    current: 0,
    type: 'new_words',
    is_completed: false,
  });

  // Task 4: Blitz round for fluency
  tasks.push({
    id: 'task_blitz_drill',
    title: 'Экспресс-раунд Blitzkarten',
    target: 12,
    current: 0,
    type: 'blitz',
    is_completed: false,
  });

  return tasks;
}
