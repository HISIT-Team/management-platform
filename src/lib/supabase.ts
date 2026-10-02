/* ═══════════════════════════════════════════════════════════════════
   Supabase browser client (singleton)
   Reads config from NEXT_PUBLIC_* env vars (see .env.example).
   ═══════════════════════════════════════════════════════════════════ */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { trustedDeviceHeaders } from './trustedDevice';

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

// Every request carries the "remembered device" token (x-mfa-device), read
// at request time, so the database and the Edge Functions can accept a
// trusted browser without the authenticator code. See trustedDevice.ts.
// Only database calls (/rest/v1/) get it: Auth and Storage don't need it.
const fetchWithDevice: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const extra = trustedDeviceHeaders();
  if (!extra['x-mfa-device'] || !url.includes('/rest/v1/')) return fetch(input, init);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set('x-mfa-device', extra['x-mfa-device']);
  return fetch(input, { ...init, headers });
};

// detectSessionInUrl:true lets Supabase pick up the tokens from the email
// confirmation / password-recovery links automatically when the page opens.
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: { fetch: fetchWithDevice },
  });
  return client;
}
