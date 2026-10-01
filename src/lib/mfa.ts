/* ═══════════════════════════════════════════════════════════════════
   Two-factor authentication (TOTP authenticator app) — Supabase Auth MFA.
   Which roles must use it is decided by a Super Admin in Gestione
   Backend → Sicurezza (table mfa_role_policy, migration 0015). The same
   rule is enforced in the database (is_it_staff / is_superadmin require
   aal2) and in the Edge Functions, not only here.
   ═══════════════════════════════════════════════════════════════════ */
import { getSupabase } from './supabase';

export interface MfaFactor {
  id: string;
  friendly_name?: string | null;
  created_at: string;
}

export interface MfaStatus {
  /** Session already passed the second factor. */
  aal2: boolean;
  /** The user's role must use MFA. */
  required: boolean;
  /** Verified authenticator apps. */
  factors: MfaFactor[];
}

/** Does this session still have to pass the second factor? Cheap when already aal2. */
export async function mfaStepNeeded(): Promise<boolean> {
  const sb = getSupabase();
  const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.currentLevel === 'aal2') return false;
  const { data: req, error } = await sb.rpc('mfa_required_for_me');
  if (error) return false; // migration 0015 not run yet: nothing is required
  return req === true;
}

export async function getMfaStatus(): Promise<MfaStatus> {
  const sb = getSupabase();
  const [{ data: aal }, { data: list }, req] = await Promise.all([
    sb.auth.mfa.getAuthenticatorAssuranceLevel(),
    sb.auth.mfa.listFactors(),
    sb.rpc('mfa_required_for_me'),
  ]);
  return {
    aal2: aal?.currentLevel === 'aal2',
    required: !req.error && req.data === true,
    factors: ((list?.totp ?? []) as MfaFactor[]).filter(Boolean),
  };
}

/** Starts enrolling a new authenticator app. Leftover unverified attempts are removed first. */
export async function startTotpEnrollment(): Promise<{ factorId: string; qr: string; secret: string }> {
  const sb = getSupabase();
  const { data: list } = await sb.auth.mfa.listFactors();
  for (const f of list?.all ?? []) {
    if (f.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: f.id });
  }
  const n = (list?.totp?.length ?? 0) + 1;
  const { data, error } = await sb.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Authenticator ${n} · ${new Date().toLocaleDateString('it-IT')}`,
  });
  if (error || !data) throw new Error(error?.message || 'Could not start the setup.');
  return { factorId: data.id, qr: normaliseQr(data.totp.qr_code), secret: data.totp.secret };
}

/* Supabase returns the QR as "data:image/svg+xml;utf-8,<svg…>" (raw markup,
   non-standard parameter): rebuild a standard, URL-encoded SVG data URL so
   every browser renders it. */
function normaliseQr(raw: string): string {
  let svg = raw;
  if (raw.startsWith('data:')) {
    const comma = raw.indexOf(',');
    const meta = raw.slice(5, comma);
    const body = raw.slice(comma + 1);
    if (/;base64/i.test(meta)) return raw;
    try {
      svg = decodeURIComponent(body);
    } catch {
      svg = body;
    }
  }
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/** Verifies a 6-digit code; on success the session is upgraded to aal2. */
export async function verifyTotp(factorId: string, code: string): Promise<void> {
  const { error } = await getSupabase().auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') });
  if (error) {
    throw new Error(/invalid|expired|code/i.test(error.message) ? 'Invalid or expired code. / Codice non valido o scaduto.' : error.message);
  }
}

export async function removeFactor(factorId: string): Promise<void> {
  const { error } = await getSupabase().auth.mfa.unenroll({ factorId });
  if (error) throw new Error(error.message);
}
