import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nztodtkcpvnwzipmawng.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_iwXfBM4B-PhdfIVOcDG-SQ_vlC6IByJ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function signUp() {
  const { data, error } = await supabase.auth.signUp({
    email: 'test@kraftlearn.com',
    password: 'password123',
  });
  console.log(error ? error : 'Created test user');
}
signUp();
