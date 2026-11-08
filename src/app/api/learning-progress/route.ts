import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';
const serverSupabase = createClient(supabaseUrl, supabaseKey);

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
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(data || null);
    }

    if (multiLangs) {
      const langArray = multiLangs.split(',').map(s => s.trim()).filter(Boolean);
      const { data, error } = await serverSupabase
        .from('user_stats')
        .select('language, daily_activity')
        .in('language', langArray);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(data || []);
    }

    const { data, error } = await serverSupabase
      .from('user_stats')
      .select('language, daily_activity');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

// POST: Сохранить/обновить дневной прогресс
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
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
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
    } else if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // 3. Синхронизация user_daily_stats на стороне сервера при наличии
    if (body.user_daily_stats && body.user_id) {
      try {
        await serverSupabase
          .from('user_daily_stats')
          .upsert(body.user_daily_stats, { onConflict: 'user_id,language,date' });
      } catch {}
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
