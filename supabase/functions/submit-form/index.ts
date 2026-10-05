// ═══════════════════════════════════════════════════════════════════
// submit-form — Supabase Edge Function
// Verifies the signed-in user + role, then forwards the payload to the
// correct webhook. The webhook URLs live in server-side secrets, so they
// are NEVER exposed in the browser. Anonymous or wrong-role requests are
// rejected before the webhook is ever called.
//
// Deploy:   Supabase dashboard → Edge Functions → submit-form → paste this
//           file (or: supabase functions deploy submit-form)
// Secrets:  WEBHOOK_ONBOARDING, WEBHOOK_OFFBOARDING, WEBHOOK_STUDENT_CHECKIN,
//           WEBHOOK_STUDENT_CHECKOUT, WEBHOOK_EMPLOYEE_CHECKIN,
//           WEBHOOK_EMPLOYEE_CHECKOUT, WEBHOOK_ROOM
//
// Optional secrets:
//   ALLOWED_ORIGINS   comma-separated list of site origins allowed to call
//                     this function from a browser. Until you set it, CORS
//                     stays open ('*'). Secrets are project-wide: the same
//                     value also protects notify-powerautomate.
//                     e.g. https://his-platform.pages.dev,https://platform.h-farmschool.com
//   TURNSTILE_SECRET  if set, every request must carry a valid captcha token.
//                     NOTE: the form pages do not send one yet — do not set
//                     this until the widget is wired into the forms, or every
//                     submit will fail with 403.
//
// Changes (security audit 2026-10-02):
//   - 'superadmin' is accepted wherever 'admin' is (it was rejected).
//   - 'guest' is rejected explicitly, before anything else is looked up.
//   - roles with mandatory MFA must have passed the second factor (aal2).
//   - medicine and diet forms removed from the platform (and from here):
//     delete the WEBHOOK_MEDICINE / WEBHOOK_DIET secrets.
// ═══════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Auto-injected by Supabase in every Edge Function:
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Optional: Cloudflare Turnstile secret. If set, a valid captcha token is required.
const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET') || ''

// Origins allowed to call this function from a browser. Empty => '*' (open).
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '')
  .split(',').map(o => o.trim()).filter(Boolean)

// Hard cap on the request body. The device forms embed photos and the
// signature as base64 (each photo is compressed to ~1200px JPEG in the
// browser), so this needs headroom — but not unbounded, or a single
// signed-in user can burn the whole webhook quota with one request.
const MAX_BODY_BYTES = 16 * 1024 * 1024   // 16 MB

// Roles that may submit every form (platform administrators).
const ADMIN_ROLES = ['admin', 'superadmin', 'owner']

// form_type -> allowed roles + the secret holding that form's webhook URL.
// `perm`: the permission (Gestione Backend → Permessi ruoli, migration 0017)
// that allows the form; `roles` is the fallback before 0017 is run.
const FORMS: Record<string, { roles: string[]; perm: string; webhookEnv: string }> = {
  onboarding:  { roles: ['hr'], perm: 'hr.onboarding',  webhookEnv: 'WEBHOOK_ONBOARDING' },
  offboarding: { roles: ['hr'], perm: 'hr.offboarding', webhookEnv: 'WEBHOOK_OFFBOARDING' },
  // Check-in e check-out hanno webhook distinti, ma stesso ruolo: la scelta
  // del form_type da parte del client non attraversa nessun confine di permessi.
  student_checkin:   { roles: ['it'], perm: 'it.checkin_student',  webhookEnv: 'WEBHOOK_STUDENT_CHECKIN' },
  student_checkout:  { roles: ['it'], perm: 'it.checkin_student',  webhookEnv: 'WEBHOOK_STUDENT_CHECKOUT' },
  employee_checkin:  { roles: ['it'], perm: 'it.checkin_employee', webhookEnv: 'WEBHOOK_EMPLOYEE_CHECKIN' },
  employee_checkout: { roles: ['it'], perm: 'it.checkin_employee', webhookEnv: 'WEBHOOK_EMPLOYEE_CHECKOUT' },
  room:        { roles: ['boarding'], perm: 'boarding.rooms', webhookEnv: 'WEBHOOK_ROOM' },
}

// Echoes the caller's origin only when it is on the allowlist. With no
// allowlist configured this returns '*', i.e. the previous behaviour.
function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || ''
  let allow = '*'
  if (ALLOWED_ORIGINS.length) {
    if (!ALLOWED_ORIGINS.includes(origin)) allow = ''      // not allowed: omit the header
    else allow = origin
  }
  const h: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mfa-device',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
  if (allow) h['Access-Control-Allow-Origin'] = allow
  return h
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  if (!TURNSTILE_SECRET) return true            // captcha not enforced
  if (!token) return false
  const form = new FormData()
  form.append('secret', TURNSTILE_SECRET)
  form.append('response', token)
  if (ip) form.append('remoteip', ip)
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
  const data = await r.json()
  return data.success === true
}

// Authentication level of the session: 'aal2' once the second factor was passed.
// (The token itself was already validated by auth.getUser.)
function sessionAal(jwt: string): string {
  try {
    const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return String(JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '='))).aal || 'aal1')
  } catch {
    return 'aal1'
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405)

  try {
    // 1. Auth token from the caller (the user's Supabase session)
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim()
    if (!token) return json(req, { error: 'Missing auth token' }, 401)

    // 2. Read the body with a hard size cap, before parsing it.
    const declared = Number(req.headers.get('content-length') || '0')
    if (declared > MAX_BODY_BYTES) return json(req, { error: 'Payload too large' }, 413)
    const raw = await req.text()
    if (raw.length > MAX_BODY_BYTES) return json(req, { error: 'Payload too large' }, 413)

    let parsed: { form_type?: unknown; payload?: unknown; captchaToken?: unknown }
    try { parsed = JSON.parse(raw) } catch { return json(req, { error: 'Malformed JSON body' }, 400) }

    const form_type = typeof parsed.form_type === 'string' ? parsed.form_type : ''
    const captchaToken = typeof parsed.captchaToken === 'string' ? parsed.captchaToken : ''
    const payload = parsed.payload

    // The payload is spread into the forwarded object, so it must be a plain
    // object — a string or array would produce a garbage body downstream.
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return json(req, { error: 'payload must be an object' }, 400)
    }

    const conf = FORMS[form_type]
    if (!conf) return json(req, { error: 'Unknown form_type' }, 400)

    // 3. Verify the user identity from the JWT
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: userData, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userData?.user) return json(req, { error: 'Invalid session' }, 401)
    const user = userData.user

    // 4. Optional captcha check
    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')
    if (!(await verifyTurnstile(captchaToken, ip))) return json(req, { error: 'Captcha verification failed' }, 403)

    // 5. Role check (read the profile with service role, bypassing RLS)
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = (profile?.role || '').trim().toLowerCase()   // case-insensitive role match
    if (!role || role === 'guest') return json(req, { error: 'Forbidden: your account has not been enabled yet' }, 403)

    // 5b. Second factor, when the role requires it (Gestione Backend → Sicurezza).
    //     mfa_ok() (migration 0016) runs as the user: aal2, remembered device
    //     (x-mfa-device header) or not required. Before 0016: aal2 only.
    const mfaDevice = (req.headers.get('x-mfa-device') || '').slice(0, 200)
    const asUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') || SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: 'Bearer ' + token, ...(mfaDevice ? { 'x-mfa-device': mfaDevice } : {}) } },
      auth: { persistSession: false },
    })
    const mfaRes = await asUser.rpc('mfa_ok')
    let mfaPassed: boolean
    if (!mfaRes.error) {
      mfaPassed = mfaRes.data === true
    } else {
      const { data: mfaRule } = await admin.from('mfa_role_policy').select('required').eq('role', role).maybeSingle()
      mfaPassed = !mfaRule?.required || sessionAal(token) === 'aal2'
    }
    if (!mfaPassed) {
      return json(req, { error: 'Two-factor authentication required: sign in again with your authenticator code' }, 403)
    }

    // 5c. Permission of the role for this form (migration 0017); before 0017: role list.
    const permRes = await asUser.rpc('has_permission', { p_perm: conf.perm })
    const allowed = !permRes.error ? permRes.data === true : conf.roles.includes(role) || ADMIN_ROLES.includes(role)
    if (!allowed) return json(req, { error: 'Forbidden: your role cannot submit this form' }, 403)

    // 6. Forward to the hidden webhook, stamping who submitted it (server-side, trustworthy).
    // The _submitted_by_* keys are written AFTER the spread, so a client that
    // puts them in its own payload cannot forge them.
    const webhookUrl = Deno.env.get(conf.webhookEnv)
    if (!webhookUrl) return json(req, { error: 'Form temporarily unavailable' }, 503)

    const enriched = {
      ...(payload as Record<string, unknown>),
      _submitted_by_email: user.email,
      _submitted_by_id: user.id,
      _submitted_by_role: role,
      _server_timestamp: new Date().toISOString(),
    }

    const forward = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enriched),
    })
    if (!forward.ok) {
      console.error('submit-form: webhook for', form_type, 'returned', forward.status)
      return json(req, { error: 'Submission could not be delivered, please retry' }, 502)
    }

    return json(req, { ok: true })
  } catch (e) {
    // Log the real error server-side, return a generic message: the raw text
    // can carry internal details (webhook host, stack) that the client
    // has no business seeing.
    console.error('submit-form error:', e)
    return json(req, { error: 'Internal error' }, 500)
  }
})
