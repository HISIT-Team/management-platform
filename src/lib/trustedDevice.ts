/* ═══════════════════════════════════════════════════════════════════
   "Ricorda questo dispositivo" — skip the authenticator code on this
   browser for a few hours (Gestione Backend → Sicurezza, default 24 h).
   After the code is entered the browser creates a random token; the
   database keeps only its SHA-256 (migration 0016). The token travels
   as the x-mfa-device header on every Supabase request and is checked
   server-side by mfa_ok() and by the Edge Functions — the password is
   still needed at every login.
   No imports from ./supabase here (it imports this file).
   ═══════════════════════════════════════════════════════════════════ */

const KEY = 'his:mfaDevice';

interface Stored {
  uid: string;
  token: string;
  exp: number; // ms epoch
}

function read(): Stored | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null') as Stored | null;
    if (!v || typeof v.token !== 'string' || typeof v.exp !== 'number') return null;
    if (v.exp <= Date.now()) {
      localStorage.removeItem(KEY);
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

/** Header to add to Supabase requests (empty when this browser isn't trusted). */
export function trustedDeviceHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const v = read();
  return v ? { 'x-mfa-device': v.token } : {};
}

/** Expiry of this browser's trust for the given user, or null. */
export function trustedDeviceExpiry(uid: string): Date | null {
  const v = read();
  return v && v.uid === uid ? new Date(v.exp) : null;
}

export function newDeviceToken(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function saveTrustedDevice(uid: string, token: string, expires: Date): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ uid, token, exp: expires.getTime() } satisfies Stored));
  } catch {
    /* storage unavailable: the code will simply be asked again */
  }
}

export function clearTrustedDevice(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Short label stored with the device (shown in the audit log). */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Altro';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${br} · ${os}`;
}
