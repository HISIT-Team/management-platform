/* ═══════════════════════════════════════════════════════════════════
   Two-factor authentication (TOTP authenticator app) — Supabase Auth MFA.
   Which roles must use it is decided by a Super Admin in Gestione
   Backend → Sicurezza (table mfa_role_policy, migration 0015). The same
   rule is enforced in the database (is_it_staff / is_superadmin require
   aal2) and in the Edge Functions, not only here.
   ═══════════════════════════════════════════════════════════════════ */
import { getSupabase } from './supabase';
import { clearTrustedDevice, deviceLabel, newDeviceToken, saveTrustedDevice } from './trustedDevice';

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
  /** Not aal2, but this browser is remembered (code skipped). */
  trusted: boolean;
  /** "Ricorda questo dispositivo" duration in hours (0 = feature off). */
  rememberHours: number;
}

/** Does this session still have to pass the second factor? Cheap when already aal2.
    mfa_ok() (migration 0016) also accepts a remembered browser. */
export async function mfaStepNeeded(): Promise<boolean> {
  const sb = getSupabase();
  const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.currentLevel === 'aal2') return false;
  const ok = await sb.rpc('mfa_ok');
  if (!ok.error) return ok.data !== true;
  // 0016 not run yet: fall back to the 0015 rule (or nothing required).
  const { data: req, error } = await sb.rpc('mfa_required_for_me');
  if (error) return false;
  return req === true;
}

export async function getMfaStatus(): Promise<MfaStatus> {
  const sb = getSupabase();
  const [{ data: aal }, { data: list }, req, ok, hours] = await Promise.all([
    sb.auth.mfa.getAuthenticatorAssuranceLevel(),
    sb.auth.mfa.listFactors(),
    sb.rpc('mfa_required_for_me'),
    sb.rpc('mfa_device_trusted'),
    sb.rpc('mfa_remember_hours'),
  ]);
  const aal2 = aal?.currentLevel === 'aal2';
  return {
    aal2,
    required: !req.error && req.data === true,
    factors: ((list?.totp ?? []) as MfaFactor[]).filter(Boolean),
    trusted: !aal2 && !ok.error && ok.data === true,
    rememberHours: hours.error ? 0 : Number(hours.data) || 0,
  };
}

/** Remember this browser (call right after a successful code). Returns the expiry. */
export async function trustThisDevice(): Promise<Date> {
  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const token = newDeviceToken();
  const { data, error } = await sb.rpc('mfa_trust_device', { p_token: token, p_label: deviceLabel() });
  if (error) throw new Error(error.message);
  const exp = new Date(String(data));
  saveTrustedDevice(user.id, token, exp);
  return exp;
}

/** Forget every remembered browser of the current user (this one included). */
export async function forgetMyDevices(): Promise<number> {
  const { data, error } = await getSupabase().rpc('mfa_forget_my_devices');
  clearTrustedDevice();
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

export async function myTrustedDevicesCount(): Promise<number> {
  const { data, error } = await getSupabase().rpc('mfa_my_devices_count');
  return error ? 0 : Number(data) || 0;
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
