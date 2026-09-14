const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://nztodtkcpvnwzipmawng.supabase.co';
const supabaseKey = 'sb_publishable_iwXfBM4B-PhdfIVOcDG-SQ_vlC6IByJ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.from('decks').select('*, cards(*)');
  console.log("Error:", error);
  console.log("Data:", JSON.stringify(data, null, 2));
}
test();
