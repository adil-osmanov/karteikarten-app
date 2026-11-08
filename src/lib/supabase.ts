import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder";

// Clean expired or corrupted auth tokens on client to avoid 401/CORS errors with anon requests
if (typeof window !== 'undefined') {
  try {
    const projectRef = supabaseUrl.split('//')[1]?.split('.')[0];
    if (projectRef) {
      const storageKey = `sb-${projectRef}-auth-token`;
      const item = localStorage.getItem(storageKey);
      if (item) {
        const parsed = JSON.parse(item);
        if (!parsed || !parsed.access_token || (parsed.expires_at && parsed.expires_at * 1000 < Date.now() && !parsed.refresh_token)) {
          localStorage.removeItem(storageKey);
        }
      }
    }
  } catch {}
}

export const rawSupabase = createClient(supabaseUrl, supabaseKey);
export const supabase = rawSupabase;

/**
 * Безопасное сохранение статистики пользователя:
 * 1. В первую очередь через внутренний Same-Origin роут Next.js /api/stats (100% защита от AdGuard / uBlock и preflight-ошибок CORS).
 * 2. Запасной вариант: прямой двухшаговый UPDATE -> INSERT в Supabase без конфликтного параметра on_conflict.
 * 3. Тихий перехват: падение сети или блокировка AdGuard никогда не ломают работу приложения и не вызывают Unhandled Rejection.
 */
export async function safeSaveUserStats(language: string, daily_activity: any): Promise<boolean> {
  if (!language) return false;

  // 1. Попытка через внутренний Same-Origin роут Next.js /api/stats (AdGuard его не трогает)
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, daily_activity }),
      });
      if (res.ok) {
        return true;
      }
    } catch {
      // Игнорируем сетевые сбои и переходим к запасному варианту
    }
  }

  // 2. Запасной вариант: прямой двухшаговый запрос в Supabase БЕЗ on_conflict
  try {
    const { data: updateData, error: updateErr } = await supabase
      .from('user_stats')
      .update({ daily_activity })
      .eq('language', language)
      .select('language');

    if (!updateErr && (!updateData || updateData.length === 0)) {
      await supabase
        .from('user_stats')
        .insert({ language, daily_activity });
    }
    return true;
  } catch (err) {
    // Мягкий перехват: падение сети или блокировка AdGuard не роняют приложение
    console.warn('[user_stats network bypassed]:', err);
    return false;
  }
}

/**
 * Сохранение дневной статистики пользователя (обертка для useDayStats).
 */
export async function saveUserDayStats(statsData: any, language: string = 'DE'): Promise<void> {
  const normLang = (language || 'DE').toUpperCase();
  const langKey = `DAY_STATS_${normLang}`;
  await safeSaveUserStats(langKey, statsData);
}

// Алиас для обратной совместимости с существующим кодом
export const safeUpsertUserStats = async (payload: { language: string; daily_activity: any }): Promise<boolean> => {
  return safeSaveUserStats(payload.language, payload.daily_activity);
};

/**
 * Безопасная загрузка статистики:
 * 1. Через внутренний Same-Origin роут Next.js /api/stats (обход AdGuard / uBlock).
 * 2. Запасной вариант: прямое чтение из Supabase в блоке try/catch.
 */
export async function safeFetchUserStats(param: string | string[]): Promise<any> {
  // 1. Попытка через внутренний Same-Origin роут Next.js /api/stats
  if (typeof window !== 'undefined') {
    try {
      const url = Array.isArray(param)
        ? `/api/stats?languages=${encodeURIComponent(param.join(','))}`
        : `/api/stats?language=${encodeURIComponent(param)}`;

      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        return json.data;
      }
    } catch {
      // Игнорируем и переходим к прямому запросу
    }
  }

  // 2. Запасной прямой запрос в Supabase с безопасным перехватом ошибок
  try {
    if (Array.isArray(param)) {
      const { data } = await supabase
        .from('user_stats')
        .select('language, daily_activity')
        .in('language', param);
      return data || [];
    } else {
      const { data } = await supabase
        .from('user_stats')
        .select('daily_activity')
        .eq('language', param)
        .maybeSingle();
      return data?.daily_activity || null;
    }
  } catch (err) {
    console.warn('[user_stats fetch bypassed]:', err);
    return Array.isArray(param) ? [] : null;
  }
}
