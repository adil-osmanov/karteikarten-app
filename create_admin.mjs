import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nztodtkcpvnwzipmawng.supabase.co';
const supabaseKey = 'sb_publishable_iwXfBM4B-PhdfIVOcDG-SQ_vlC6IByJ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function signUpAdmin() {
  const { data, error } = await supabase.auth.signUp({
    email: 'adilosmanov.de@gmail.com',
    password: 'adil150389',
  });
  
  if (error) {
    console.error('Sign up error:', error);
  } else {
    console.log('Successfully signed up user:', data.user?.id);
  }
}

signUpAdmin();
