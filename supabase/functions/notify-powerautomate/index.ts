// ═══════════════════════════════════════════════════════════════════
// Edge Function: notify-powerautomate
// Forwards a submitted device Check-in / Check-out form to a Power
// Automate flow ("When an HTTP request is received" trigger).
//
// - The flow URL lives ONLY in the Supabase secret
//   POWER_AUTOMATE_WEBHOOK_URL — it is never shipped to the browser.
// - Only signed-in users whose profile role is `it` or `admin` may call it.
// - Optional secret ALLOWED_ORIGINS (comma-separated, e.g.
//   "https://your-site.pages.dev,http://localhost:3000") restricts CORS;
//   if unset any origin is accepted (the JWT + role check still apply).
//
// Deploy: Supabase dashboard → Edge Functions → Deploy a new function →
// Via Editor: delete the template, paste this whole file, name the function
// `notify-powerautomate`, Deploy. The function checks the user's token
// itself, so it also works with "Verify JWT" turned off.
// ═══════════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ROLES = ['it', 'admin'];
const MAX_BODY_BYTES = 30 * 1024 * 1024; // photos included; Power Automate accepts up to 100 MB

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allow = allowed.length === 0 ? '*' : origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);

  const webhook = Deno.env.get('POWER_AUTOMATE_WEBHOOK_URL');
  if (!webhook) return json({ error: 'POWER_AUTOMATE_WEBHOOK_URL secret is not set' }, 500, cors);

  // ── Who is calling? ────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Not signed in' }, 401, cors);
  // Injected automatically by Supabase. Falls back to the service-role key on
  // projects that no longer expose the legacy anon key to functions.
  const apiKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, apiKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await sb.auth.getUser(authHeader.slice(7));
  if (userErr || !userData?.user) return json({ error: 'Not signed in' }, 401, cors);
  const { data: profile } = await sb.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
  const role = String(profile?.role ?? '').trim().toLowerCase();
  if (!ALLOWED_ROLES.includes(role)) return json({ error: 'Forbidden' }, 403, cors);

  // ── Body ───────────────────────────────────────────────────────
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'Payload too large' }, 413, cors);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Invalid JSON' }, 400, cors);
  }
  if (typeof body !== 'object' || body === null || typeof body.form_type !== 'string' || typeof body.operation !== 'string') {
    return json({ error: 'Missing form_type / operation' }, 400, cors);
  }

  // Server-side facts the browser cannot fake.
  const outgoing = {
    ...body,
    submitted_by: { id: userData.user.id, email: userData.user.email ?? null, role },
    received_at: new Date().toISOString(),
  };

  // ── Forward to Power Automate ──────────────────────────────────
  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(outgoing),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      console.error('Power Automate responded', res.status, detail);
      return json({ error: `Power Automate responded ${res.status}` }, 502, cors);
    }
  } catch (e) {
    console.error('Power Automate unreachable', e);
    return json({ error: 'Power Automate unreachable' }, 502, cors);
  }

  return json({ ok: true }, 200, cors);
});
