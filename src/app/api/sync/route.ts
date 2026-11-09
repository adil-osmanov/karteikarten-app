import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';
const serverSupabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
  'Access-Control-Max-Age': '86400',
};

// OPTIONS: Preflight requests for WebKit/Safari & cross-origin callers
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

// GET: Получить дневной прогресс или список состояний
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const langKey = searchParams.get('lang');
    const multiLangs = searchParams.get('langs');

    if (langKey) {
      const { data, error } = await serverSupabase
        .from('user_stats')
        .select('language, daily_activity')
        .eq('language', langKey)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
      }

      return NextResponse.json(data || null, { headers: corsHeaders });
    }

    if (multiLangs) {
      const langArray = multiLangs.split(',').map(s => s.trim()).filter(Boolean);
      const { data, error } = await serverSupabase
        .from('user_stats')
        .select('language, daily_activity')
        .in('language', langArray);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
      }

      return NextResponse.json(data || [], { headers: corsHeaders });
    }

    const { data, error } = await serverSupabase
      .from('user_stats')
      .select('language, daily_activity');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }

    return NextResponse.json(data || [], { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500, headers: corsHeaders });
  }
}

// POST: Сохранить/обновить дневной прогресс
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === 'reset_week' || body.resetWeek) {
      const today = new Date().toISOString().split('T')[0];
      const langs = ['DE', 'EN', 'RU'];
      for (const l of langs) {
        const { data: st } = await serverSupabase.from('user_stats').select('*').eq('language', l).maybeSingle();
        if (st && st.daily_activity) {
          const act = { ...st.daily_activity, [today]: 0 };
          await serverSupabase.from('user_stats').update({ daily_activity: act }).eq('language', l);
        }
        await serverSupabase.from('user_stats').upsert({
          language: `DAY_STATS_${l}`,
          daily_activity: {
            date: today,
            cardsDone: 0,
            activeSeconds: 0,
            correctCount: 0,
            mistakesCountToday: 0,
            mistakesPool: []
          }
        });
      }
      return NextResponse.json({ success: true, reset: true }, { headers: corsHeaders });
    }

    const langKey = body.language || 'DAY_STATS_DE';
    const activityPayload = body.daily_activity !== undefined ? body.daily_activity : body;

    // 1. Попытка обновить существующую запись по language
    const { data: updateData, error: updateErr } = await serverSupabase
      .from('user_stats')
      .update({ daily_activity: activityPayload })
      .eq('language', langKey)
      .select('language');

    // 2. Если запись еще не существовала — создаем новую
    if (!updateErr && (!updateData || updateData.length === 0)) {
      const { error: insertErr } = await serverSupabase
        .from('user_stats')
        .insert({
          language: langKey,
          daily_activity: activityPayload,
        });

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500, headers: corsHeaders });
      }
    } else if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500, headers: corsHeaders });
    }

    // 3. Синхронизация user_daily_stats на стороне сервера при наличии
    if (body.user_daily_stats && body.user_id) {
      try {
        await serverSupabase
          .from('user_daily_stats')
          .upsert(body.user_daily_stats, { onConflict: 'user_id,language,date' });
      } catch {}
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500, headers: corsHeaders });
  }
}
