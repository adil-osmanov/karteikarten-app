import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

const serverSupabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req: NextRequest) {
  try {
    const singleLang = req.nextUrl.searchParams.get('language');
    const multiLangs = req.nextUrl.searchParams.get('languages');

    if (singleLang) {
      const { data, error } = await serverSupabase
        .from('user_stats')
        .select('daily_activity')
        .eq('language', singleLang)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ data: data?.daily_activity || null });
    }

    if (multiLangs) {
      const langArray = multiLangs.split(',').map(s => s.trim()).filter(Boolean);
      const { data, error } = await serverSupabase
        .from('user_stats')
        .select('language, daily_activity')
        .in('language', langArray);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ data: data || [] });
    }

    const { data, error } = await serverSupabase
      .from('user_stats')
      .select('language, daily_activity');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { language, daily_activity } = body;

    if (!language) {
      return NextResponse.json({ error: 'Language key is required' }, { status: 400 });
    }

    // 1. Попытка обновления существующей строки по language
    const { data: updateData, error: updateErr } = await serverSupabase
      .from('user_stats')
      .update({ daily_activity })
      .eq('language', language)
      .select('language');

    // 2. Если запись еще не существовала — вставляем новую
    if (!updateErr && (!updateData || updateData.length === 0)) {
      const { error: insertErr } = await serverSupabase
        .from('user_stats')
        .insert({ language, daily_activity });

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 400 });
      }
    } else if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
