// ═══════════════════════════════════════════════════════════════════
// send-auth-email — Supabase "Send Email" Auth Hook
// Sends the authentication emails (sign-up confirmation, password
// reset, email change, invite, magic link, codes) from the school's
// Microsoft 365 mailbox through Microsoft Graph, instead of Resend/SMTP.
//
// Setup: supabase/functions/send-auth-email/README.md
//
// Deploy:   supabase functions deploy send-auth-email --no-verify-jwt
//           (the hook is called by Supabase Auth, not by a signed-in
//           user; the request is authenticated by the hook signature)
// Secrets:  SEND_EMAIL_HOOK_SECRET  from Authentication → Hooks (v1,whsec_…)
//           MS_TENANT_ID            Entra tenant ID
//           MS_CLIENT_ID            Application (client) ID of the Entra app
//           MS_CLIENT_SECRET        client secret of the Entra app
//           MAIL_FROM               sending mailbox, e.g. itsupport@h-farmschool.com
// Optional: MAIL_FROM_NAME          display name (default "H-IS Management Platform")
// (SUPABASE_URL is provided by Supabase.)
// ═══════════════════════════════════════════════════════════════════
import { Webhook } from 'npm:standardwebhooks@1.0.0';

const env = (k: string) => Deno.env.get(k) ?? '';

interface HookUser {
  email: string;
  new_email?: string;
  user_metadata?: Record<string, unknown>;
}
interface EmailData {
  token: string;
  token_hash: string;
  redirect_to: string;
  email_action_type: string;
  site_url: string;
  token_new?: string;
  token_hash_new?: string;
}

/* ── Microsoft Graph ──────────────────────────────────────────────── */
let cachedToken: { value: string; exp: number } | null = null;

async function graphToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.value;
  const res = await fetch(`https://login.microsoftonline.com/${env('MS_TENANT_ID')}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('MS_CLIENT_ID'),
      client_secret: env('MS_CLIENT_SECRET'),
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`Microsoft login failed (${res.status}): ${j.error_description ?? j.error ?? 'no token'}`);
  cachedToken = { value: j.access_token, exp: Date.now() + Number(j.expires_in ?? 3000) * 1000 };
  return cachedToken.value;
}

async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const from = env('MAIL_FROM');
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await graphToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        from: { emailAddress: { address: from, name: env('MAIL_FROM_NAME') || 'H-IS Management Platform' } },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: false,
    }),
  });
  if (res.status !== 202) {
    const t = await res.text().catch(() => '');
    throw new Error(`Microsoft Graph sendMail failed (${res.status}): ${t.slice(0, 300)}`);
  }
}

/* ── Emails ───────────────────────────────────────────────────────── */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function verifyLink(tokenHash: string, type: string, redirectTo: string): string {
  const u = new URL(`${env('SUPABASE_URL')}/auth/v1/verify`);
  u.searchParams.set('token', tokenHash);
  u.searchParams.set('type', type);
  if (redirectTo) u.searchParams.set('redirect_to', redirectTo);
  return u.toString();
}

function layout(o: { title: string; intro: string; button?: { label: string; url: string }; code?: string; outro: string }): string {
  const btn = o.button
    ? `<tr><td style="padding:8px 0 22px;"><a href="${esc(o.button.url)}" style="display:inline-block;background:#8B1A2B;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:12px;">${esc(o.button.label)}</a></td></tr>
       <tr><td style="font-size:12.5px;color:#6E6468;padding-bottom:18px;line-height:1.5;">Se il pulsante non funziona, copia questo link nel browser:<br><span style="word-break:break-all;color:#8B1A2B;">${esc(o.button.url)}</span></td></tr>`
    : '';
  const code = o.code
    ? `<tr><td style="padding:6px 0 22px;"><div style="display:inline-block;font-family:Consolas,Menlo,monospace;font-size:28px;letter-spacing:6px;font-weight:700;color:#2A1F22;background:#F9EFF0;border-radius:12px;padding:12px 22px;">${esc(o.code)}</div></td></tr>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#F6F1F1;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F1F1;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden;">
<tr><td style="height:4px;background:linear-gradient(90deg,#8B1A2B,#C9A227);font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:28px 30px 8px;">
  <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8B1A2B;">H-FARM International School · Management Platform</div>
  <h1 style="margin:10px 0 14px;font-size:22px;color:#2A1F22;">${esc(o.title)}</h1>
</td></tr>
<tr><td style="padding:0 30px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="font-size:15px;color:#3D3236;line-height:1.55;padding-bottom:18px;">${o.intro}</td></tr>
  ${btn}${code}
  <tr><td style="font-size:13px;color:#6E6468;line-height:1.5;padding-bottom:26px;">${o.outro}</td></tr>
</table></td></tr>
<tr><td style="background:#FAF6F6;padding:16px 30px;font-size:11.5px;color:#8A7F83;line-height:1.5;">Email automatica dalla Management Platform di H-FARM International School. Per assistenza puoi rispondere a questa email: arriva a IT Support.</td></tr>
</table></td></tr></table></body></html>`;
}

const IGNORE = 'Se non hai richiesto tu questa operazione, ignora questa email: il tuo account resta invariato.';

/** One email (recipient, subject, html) per action. */
function buildEmails(user: HookUser, d: EmailData): { to: string; subject: string; html: string }[] {
  const type = d.email_action_type;
  const link = (hash: string, t = type) => verifyLink(hash, t, d.redirect_to || d.site_url);

  switch (type) {
    case 'signup':
      return [{
        to: user.email,
        subject: 'Conferma il tuo account',
        html: layout({
          title: 'Conferma il tuo account',
          intro: 'Grazie per esserti registrato alla Management Platform. Conferma il tuo indirizzo email per attivare l’account.',
          button: { label: 'Conferma email', url: link(d.token_hash) },
          outro: `Dopo la conferma, un amministratore ti assegnerà il ruolo. ${IGNORE}`,
        }),
      }];
    case 'recovery':
      return [{
        to: user.email,
        subject: 'Reimposta la password',
        html: layout({
          title: 'Reimposta la password',
          intro: 'Abbiamo ricevuto una richiesta di reimpostazione della password per il tuo account.',
          button: { label: 'Scegli una nuova password', url: link(d.token_hash) },
          outro: `Il link scade dopo poco tempo e funziona una sola volta. ${IGNORE}`,
        }),
      }];
    case 'invite':
      return [{
        to: user.email,
        subject: 'Sei stato invitato alla Management Platform',
        html: layout({
          title: 'Hai un invito',
          intro: 'Sei stato invitato ad accedere alla Management Platform di H-FARM International School.',
          button: { label: 'Accetta l’invito', url: link(d.token_hash) },
          outro: IGNORE,
        }),
      }];
    case 'magiclink':
      return [{
        to: user.email,
        subject: 'Il tuo link di accesso',
        html: layout({
          title: 'Accedi alla piattaforma',
          intro: 'Usa questo link per accedere. Funziona una sola volta.',
          button: { label: 'Accedi', url: link(d.token_hash) },
          code: d.token || undefined,
          outro: IGNORE,
        }),
      }];
    case 'email_change': {
      const out: { to: string; subject: string; html: string }[] = [];
      const newEmail = user.new_email ?? '';
      // Field names are swapped for backward compatibility (Supabase docs):
      // current address → token_hash_new, new address → token_hash.
      if (d.token_hash_new && user.email) {
        out.push({
          to: user.email,
          subject: 'Conferma il cambio di email',
          html: layout({
            title: 'Conferma il cambio di email',
            intro: `È stato chiesto di cambiare l’email del tuo account in <b>${esc(newEmail)}</b>. Confermalo da qui.`,
            button: { label: 'Conferma il cambio', url: link(d.token_hash_new) },
            outro: `Se non sei stato tu, non cliccare e rispondi a questa email per avvisare IT Support. ${IGNORE}`,
          }),
        });
      }
      if (d.token_hash && newEmail) {
        out.push({
          to: newEmail,
          subject: 'Conferma il nuovo indirizzo email',
          html: layout({
            title: 'Conferma il nuovo indirizzo',
            intro: `Conferma che <b>${esc(newEmail)}</b> è il nuovo indirizzo email del tuo account.`,
            button: { label: 'Conferma il nuovo indirizzo', url: link(d.token_hash) },
            outro: IGNORE,
          }),
        });
      }
      return out;
    }
    case 'reauthentication':
      return [{
        to: user.email,
        subject: 'Codice di verifica',
        html: layout({
          title: 'Codice di verifica',
          intro: 'Inserisci questo codice nella piattaforma per confermare l’operazione.',
          code: d.token,
          outro: IGNORE,
        }),
      }];
    default:
      // Any other OTP email ("email", future types): send the code and, when present, the link.
      return [{
        to: user.email,
        subject: 'Codice di accesso',
        html: layout({
          title: 'Codice di accesso',
          intro: 'Ecco il tuo codice per la Management Platform.',
          button: d.token_hash ? { label: 'Continua', url: link(d.token_hash) } : undefined,
          code: d.token || undefined,
          outro: IGNORE,
        }),
      }];
  }
}

/* ── Handler ──────────────────────────────────────────────────────── */
const reply = (status: number, message?: string) =>
  new Response(JSON.stringify(message ? { error: { http_code: status, message } } : {}), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, 'Method not allowed');
  for (const k of ['SEND_EMAIL_HOOK_SECRET', 'MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MAIL_FROM']) {
    if (!env(k)) return reply(500, `Missing secret ${k}`);
  }

  // Only Supabase Auth can call this: the request must carry its signature.
  const raw = await req.text();
  let payload: { user: HookUser; email_data: EmailData };
  try {
    const wh = new Webhook(env('SEND_EMAIL_HOOK_SECRET').replace('v1,whsec_', ''));
    payload = wh.verify(raw, Object.fromEntries(req.headers)) as { user: HookUser; email_data: EmailData };
  } catch {
    return reply(401, 'Invalid hook signature');
  }

  try {
    const mails = buildEmails(payload.user, payload.email_data);
    for (const m of mails) await sendMail(m.to, m.subject, m.html);
    return reply(200);
  } catch (e) {
    console.error('send-auth-email', (e as Error).message);
    // Supabase shows this message as the error of the sign-up / reset request.
    return reply(500, 'Invio email non riuscito. Riprova tra poco o contatta IT Support.');
  }
});
