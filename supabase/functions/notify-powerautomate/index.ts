// ═══════════════════════════════════════════════════════════════════
// Edge Function: notify-powerautomate
// Forwards a submitted device Check-in / Check-out form to a Power
// Automate flow ("When an HTTP request is received" trigger).
//
// - The flow URL lives ONLY in the Supabase secret
//   POWER_AUTOMATE_WEBHOOK_URL — it is never shipped to the browser.
// - Only signed-in users whose profile role is `it`, `admin` or `superadmin` may call it,
//   with the second factor passed when their role requires MFA (migration 0015).
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

const ALLOWED_ROLES = ['it', 'admin', 'superadmin'];
const MAX_BODY_BYTES = 30 * 1024 * 1024; // photos included; Power Automate accepts up to 100 MB

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allow = allowed.length === 0 ? '*' : origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mfa-device',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

// ── Whitelist of the fields the flow receives (anything else is dropped) ──
const FORM_TYPES = ['student_checkout', 'student_checkin', 'employee_checkout', 'employee_checkin'];
const STR_FIELDS: Record<string, number> = {
  timestamp: 40, first_name: 120, last_name: 120, email: 254, school_or_company: 120,
  parent_email_1: 254, parent_email_2: 254, macbook_id: 120, ipad_id: 120, accessories_id: 120,
  signed_by: 40, signature_mime: 40,
};
const MAX_SIGNATURE = 400_000; // base64 chars (~300 KB)
const MAX_PHOTOS = 40;
const MAX_PHOTO = 2_000_000; // base64 chars (~1.5 MB each)

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

function sanitize(b: Record<string, unknown>): Record<string, unknown> | null {
  if (typeof b !== 'object' || b === null) return null;
  const formType = String(b.form_type ?? '');
  const operation = String(b.operation ?? '');
  if (!FORM_TYPES.includes(formType) || !['Check-in', 'Check-out'].includes(operation)) return null;

  const out: Record<string, unknown> = {
    form_type: formType,
    operation,
    operation_label: operation === 'Check-out' ? 'Consegna' : 'Restituzione',
    type: formType.startsWith('student') ? 'student' : 'employee',
  };
  for (const [k, max] of Object.entries(STR_FIELDS)) out[k] = str(b[k], max);

  out.devices = Array.isArray(b.devices) ? b.devices.filter((d) => typeof d === 'string').slice(0, 20).map((d) => d.slice(0, 40)) : [];
  const dd = typeof b.device_details === 'object' && b.device_details !== null && !Array.isArray(b.device_details)
    ? (b.device_details as Record<string, unknown>) : {};
  out.device_details = Object.fromEntries(
    Object.entries(dd).slice(0, 10).map(([k, v]) => {
      const d = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
      return [k.slice(0, 40), { asset_id: str(d.asset_id, 120), has_damage: d.has_damage === true }];
    }),
  );

  const sigB64 = str(b.signature_base64, MAX_SIGNATURE);
  out.signature_base64 = /^[A-Za-z0-9+/=]*$/.test(sigB64) ? sigB64 : '';
  out.signature_mime = /^image\/(jpeg|png|webp)$/.test(String(out.signature_mime)) ? out.signature_mime : 'image/jpeg';
  out.signature_data_url = out.signature_base64 ? `data:${out.signature_mime};base64,${out.signature_base64}` : '';

  out.photos = (Array.isArray(b.photos) ? b.photos : [])
    .slice(0, MAX_PHOTOS)
    .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
    .map((p) => ({
      name: str(p.name, 80).replace(/[^A-Za-z0-9_.-]/g, '_') || 'photo.jpg',
      category: str(p.category, 20),
      device: str(p.device, 40),
      mime: /^image\/(jpeg|png|webp)$/.test(String(p.mime)) ? p.mime : 'image/jpeg',
      base64: /^[A-Za-z0-9+/=]*$/.test(String(p.base64 ?? '')) ? str(p.base64, MAX_PHOTO) : '',
    }))
    .filter((p) => p.base64);
  return out;
}

// Authentication level of the session: 'aal2' once the second factor was passed.
// (The token itself was already validated by auth.getUser.)
function sessionAal(jwt: string): string {
  try {
    const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return String(JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '='))).aal || 'aal1');
  } catch {
    return 'aal1'
  }
}

// mfa_ok() in the database (0016) decides: aal2, remembered device or not
// required. Before 0016 is run, fall back to the 0015 rule (aal2 only).
// deno-lint-ignore no-explicit-any
async function mfaOk(sb: any, role: string, jwt: string): Promise<boolean> {
  const { data, error } = await sb.rpc('mfa_ok');
  if (!error) return data === true;
  const { data: rule } = await sb.from('mfa_role_policy').select('required').eq('role', role).maybeSingle();
  return !rule?.required || sessionAal(jwt) === 'aal2';
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
  const mfaDevice = (req.headers.get('x-mfa-device') ?? '').slice(0, 200);
  const apiKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, apiKey, {
    // x-mfa-device: "remembered device" token, checked by mfa_ok() (migration 0016).
    global: { headers: { Authorization: authHeader, ...(mfaDevice ? { 'x-mfa-device': mfaDevice } : {}) } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await sb.auth.getUser(authHeader.slice(7));
  if (userErr || !userData?.user) return json({ error: 'Not signed in' }, 401, cors);
  const { data: profile } = await sb.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
  const role = String(profile?.role ?? '').trim().toLowerCase();
  if (!ALLOWED_ROLES.includes(role)) return json({ error: 'Forbidden' }, 403, cors);
  // Second factor: aal2 session, remembered device, or not required for the role.
  if (!(await mfaOk(sb, role, authHeader.slice(7)))) {
    return json({ error: 'Two-factor authentication required' }, 403, cors);
  }

  // ── Body ───────────────────────────────────────────────────────
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'Payload too large' }, 413, cors);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Invalid JSON' }, 400, cors);
  }
  const outgoing = sanitize(body);
  if (!outgoing) return json({ error: 'Invalid form data' }, 400, cors);
  Object.assign(outgoing, {
    // Server-side facts the browser cannot fake.
    submitted_by: { id: userData.user.id, email: userData.user.email ?? null, role },
    received_at: new Date().toISOString(),
  });

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
