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
 * Загрузка прогресса через нейтральный серверный шлюз /api/learning-progress
 * (100% защита от блокировщиков AdGuard / uBlock / EasyPrivacy, не содержит подстроку 'stats' в URL).
 */
export async function loadDayProgress(lang: string = 'DAY_STATS_DE'): Promise<any> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch(`/api/learning-progress?lang=${encodeURIComponent(lang)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.daily_activity !== undefined ? json.daily_activity : json;
  } catch (e) {
    // Тихий фоллбэк на localStorage / IndexedDB при отсутствии сети
    return null;
  }
}

/**
 * Сохранение прогресса через нейтральный серверный шлюз /api/learning-progress
 */
export async function saveDayProgress(payload: any): Promise<boolean> {
  if (typeof window === 'undefined' || !payload) return false;
  try {
    const res = await fetch('/api/learning-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (e) {
    // Мягкий перехват: работа приложения не прерывается
    return false;
  }
}

/**
 * Безопасное сохранение состояния/прогресса
 */
export async function safeSaveUserStats(language: string, daily_activity: any): Promise<boolean> {
  return saveDayProgress({ language, daily_activity });
}

export async function saveUserDayStats(statsData: any, language: string = 'DE'): Promise<void> {
  const normLang = (language || 'DE').toUpperCase();
  const langKey = `DAY_STATS_${normLang}`;
  await saveDayProgress({ language: langKey, daily_activity: statsData });
}

export const safeUpsertUserStats = async (payload: { language: string; daily_activity: any }): Promise<boolean> => {
  return saveDayProgress(payload);
};

/**
 * Безопасная загрузка состояния/прогресса
 */
export async function safeFetchUserStats(param: string | string[]): Promise<any> {
  if (typeof window === 'undefined') return Array.isArray(param) ? [] : null;
  try {
    const url = Array.isArray(param)
      ? `/api/learning-progress?langs=${encodeURIComponent(param.join(','))}`
      : `/api/learning-progress?lang=${encodeURIComponent(param)}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return Array.isArray(param) ? [] : null;
    const json = await res.json();

    if (Array.isArray(param)) {
      return Array.isArray(json) ? json : [];
    } else {
      return json?.daily_activity !== undefined ? json.daily_activity : json;
    }
  } catch (err) {
    return Array.isArray(param) ? [] : null;
  }
}
