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

interface RawStrategyTask {
  id?: string;
  title: string;
  type: 'due_review' | 'weak_words' | 'new_words' | 'blitz';
}

/**
 * Server Action: Generates the AI Daily Plan.
 * ARCHITECTURE RULE:
 * 1. LLM acts SOLELY as a strategist (returning titles and types).
 * 2. Server deterministic pipeline assigns 100% exact mathematical targets based on DB stats.
 * 3. Server filters out any tasks where target === 0.
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

    // 1. Call server-side LLM for strategy (titles and types only)
    const strategyTasks = await callLLMForStrategy(stats);

    // 2. Server deterministic pipeline: Assign exact numbers & filter out target === 0
    return buildDeterministicTasks(strategyTasks, stats);
  } catch (error) {
    console.error('Failed to generate AI Daily Plan on server:', error);
    return buildDeterministicTasks(getFallbackStrategy(clientStats || {
      dueReviewsCount: 5,
      weakWordsCount: 5,
      newWordsCount: 10,
      totalLearnedToday: 0,
      totalCards: 100,
    }), clientStats || {
      dueReviewsCount: 5,
      weakWordsCount: 5,
      newWordsCount: 10,
      totalLearnedToday: 0,
      totalCards: 100,
    });
  }
}

/**
 * Server Pipeline: Assigns 100% exact mathematical targets based on real user debt stats.
 * - due_review -> target is STRICTLY equal to stats.dueReviewsCount (e.g. 150 overdue = 150 target).
 * - weak_words -> target is Math.min(stats.weakWordsCount, 15).
 * - new_words -> target is Math.min(stats.newWordsCount, 15).
 * - blitz -> target is 10 (fluency drill).
 * - Filters out ANY tasks where target === 0.
 */
function buildDeterministicTasks(strategyTasks: RawStrategyTask[], stats: UserDebtStats): DailyTask[] {
  const seenTypes = new Set<string>();
  const finalTasks: DailyTask[] = [];

  for (const item of strategyTasks) {
    const type = item.type;
    if (seenTypes.has(type)) continue;
    seenTypes.add(type);

    let target = 0;
    let title = item.title?.trim() || 'Ежедневная цель';

    switch (type) {
      case 'due_review':
        // СТРОГО общее количество карточек с истекшим интервалом
        target = stats.dueReviewsCount;
        break;

      case 'weak_words':
        // Сложные слова, не более 15
        target = Math.min(stats.weakWordsCount, 15);
        break;

      case 'new_words':
        // Новые слова, не более 15, чтобы не перегружать пользователя
        target = Math.min(stats.newWordsCount, 15);
        break;

      case 'blitz':
        // Экспресс-раунд
        target = 10;
        break;

      default:
        target = 10;
    }

    // Фильтрация пустоты: исключаем любые задачи с target <= 0
    if (target > 0) {
      finalTasks.push({
        id: item.id || `task_${type}_${Date.now()}`,
        title,
        target,
        current: 0,
        type: type as any,
        is_completed: false,
      });
    }
  }

  // Если у пользователя вообще нет долгов (все target === 0), даем поддерживающий Blitz-раунд
  if (finalTasks.length === 0) {
    finalTasks.push({
      id: 'task_maintenance_blitz',
      title: 'Поддерживающий раунд Blitzkarten',
      target: 10,
      current: 0,
      type: 'blitz',
      is_completed: false,
    });
  }

  return finalTasks;
}

/**
 * Server-side LLM strategist.
 * Requests ONLY strategic titles and types. Zero numbers/targets from the LLM.
 */
async function callLLMForStrategy(stats: UserDebtStats): Promise<RawStrategyTask[]> {
  const prompt = `You are an expert language learning strategist for an Apple HIG minimalist German vocabulary app.
The user's real debt profile:
- Overdue cards needing review: ${stats.dueReviewsCount}
- Weak unmastered cards: ${stats.weakWordsCount}
- New fresh cards: ${stats.newWordsCount}
- Total cards in library: ${stats.totalCards}
- Language: ${stats.appLanguage || 'DE'}

Suggest an optimal strategy by selecting relevant task types from:
["due_review", "weak_words", "new_words", "blitz"].

IMPORTANT RULES:
1. DO NOT generate numbers or targets! The backend server will calculate all mathematical targets.
2. Return only inspiring, concise Russian titles (e.g. "Повторить забытые карточки", "Закрепить сложные слова", "Изучить новые выражения", "Экспресс-раунд Blitzkarten").
3. If overdue count is 0, DO NOT include "due_review".
4. If weak count is 0, DO NOT include "weak_words".
5. If new count is 0, DO NOT include "new_words".

Output strictly valid JSON with this schema:
{
  "tasks": [
    {
      "id": "task_1",
      "title": "Short title in Russian",
      "type": "due_review" | "weak_words" | "new_words" | "blitz"
    }
  ]
}`;

  // 1. Try Groq with openai/gpt-oss-120b
  if (process.env.GROQ_API_KEY) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          messages: [
            { role: 'system', content: 'You are an AI language learning strategist. Output strictly JSON.' },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        let rawContent = data.choices?.[0]?.message?.content || '';
        rawContent = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(rawContent);
        if (Array.isArray(parsed?.tasks) && parsed.tasks.length > 0) {
          return sanitizeStrategyTasks(parsed.tasks);
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
            generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed?.tasks) && parsed.tasks.length > 0) {
          return sanitizeStrategyTasks(parsed.tasks);
        }
      }
    } catch (e) {
      console.warn('Gemini call failed:', e);
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
            { role: 'system', content: 'You are an AI language learning strategist. Output strictly JSON.' },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        let content = data.choices?.[0]?.message?.content || '';
        content = content.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed?.tasks) && parsed.tasks.length > 0) {
          return sanitizeStrategyTasks(parsed.tasks);
        }
      }
    } catch (e) {
      console.warn('OpenAI call failed:', e);
    }
  }

  // 4. Default strategy generator
  return getFallbackStrategy(stats);
}

function sanitizeStrategyTasks(rawTasks: any[]): RawStrategyTask[] {
  const allowed = ['due_review', 'weak_words', 'new_words', 'blitz'];
  return rawTasks
    .filter((t) => t && allowed.includes(t.type))
    .map((t, index) => ({
      id: t.id || `strat_${t.type}_${index}`,
      title: t.title || 'Ежедневная задача',
      type: t.type,
    }));
}

function getFallbackStrategy(stats: UserDebtStats): RawStrategyTask[] {
  const strategy: RawStrategyTask[] = [];

  if (stats.dueReviewsCount > 0) {
    strategy.push({
      id: 'strat_due',
      title: 'Повторить забытые карточки',
      type: 'due_review',
    });
  }

  if (stats.weakWordsCount > 0) {
    strategy.push({
      id: 'strat_weak',
      title: 'Закрепить сложные слова',
      type: 'weak_words',
    });
  }

  if (stats.newWordsCount > 0) {
    strategy.push({
      id: 'strat_new',
      title: 'Изучить новые выражения',
      type: 'new_words',
    });
  }

  strategy.push({
    id: 'strat_blitz',
    title: 'Экспресс-раунд Blitzkarten',
    type: 'blitz',
  });

  return strategy;
}
