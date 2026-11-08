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
 * Safe helper to upsert into user_stats with error recovery and fallback.
 * Prevents uncaught CORS / 400 access control errors.
 */
export async function safeUpsertUserStats(payload: { language: string; daily_activity: any }): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('user_stats')
      .upsert(payload, { onConflict: 'language' });
    
    if (error) {
      // Fallback: attempt direct update first, then insert if not found
      const updateRes = await supabase
        .from('user_stats')
        .update({ daily_activity: payload.daily_activity })
        .eq('language', payload.language);
      
      if (updateRes.error) {
        await supabase
          .from('user_stats')
          .insert(payload);
      }
    }
    return true;
  } catch (err) {
    console.warn('[user_stats safeUpsert warning]:', err);
    return false;
  }
}
