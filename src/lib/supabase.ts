import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder";

export const rawSupabase = createClient(supabaseUrl, supabaseKey);

// =======================================================
// NETWORK GUARD & EGRESS THROTTLE LOGGER
// =======================================================
let requestCount = 0;
const isDev = process.env.NODE_ENV === 'development';

if (typeof window !== 'undefined') {
  setInterval(() => {
    if (requestCount > 15) {
      console.error(`🚨 SUPABASE EGRESS LEAK: ${requestCount} запросов за последние 10 секунд! Проверь активный компонент.`);
    }
    requestCount = 0;
  }, 10000);
}

// Proxied supabase client to intercept and monitor all outgoing requests
export const supabase = new Proxy(rawSupabase, {
  get(target, prop, receiver) {
    if (prop === 'from') {
      return (table: string) => {
        requestCount++;
        if (isDev && requestCount > 10) {
          console.warn(`[Supabase Query #${requestCount}] from('${table}')`);
        }
        return Reflect.get(target, prop, receiver).call(target, table);
      };
    }
    if (prop === 'rpc') {
      return (fn: string, params?: any) => {
        requestCount++;
        if (isDev && requestCount > 10) {
          console.warn(`[Supabase RPC #${requestCount}] rpc('${fn}')`);
        }
        return Reflect.get(target, prop, receiver).call(target, fn, params);
      };
    }
    return Reflect.get(target, prop, receiver);
  }
});
