/* ═══════════════════════════════════════════════════════════════════
   Inactivity timeout.
   A signed-in user is logged out after N minutes without activity
   (click, key, touch, scroll). The last-activity time lives in
   localStorage, so:
     - it is shared by every open tab (activity in one keeps all alive);
     - closing the browser does NOT reset it: reopening within the hour
       keeps the session, reopening later finds it expired.
   Enforced client-side by getCurrentUser() (page loads) and by
   <IdleWatcher> (while a page stays open). Supabase's own time-boxed
   sessions require the Pro plan.
   N depends on the role: Gestione Backend → Sicurezza (migration 0016,
   my_idle_minutes()). It is cached in localStorage by refreshIdleLimit();
   until it is known the default is 60 minutes.
   ═══════════════════════════════════════════════════════════════════ */

import { getSupabase } from './supabase';

const DEFAULT_MINUTES = 60;
const KEY = 'his:lastActivity';
const LIMIT_KEY = 'his:idleMinutes';

/** Current limit in ms (role-based, cached). */
export function idleLimitMs(): number {
  let m = DEFAULT_MINUTES;
  try {
    const v = Number(localStorage.getItem(LIMIT_KEY));
    if (Number.isFinite(v) && v >= 5 && v <= 1440) m = v;
  } catch {
    /* default */
  }
  return m * 60 * 1000;
}

/** Reads the signed-in user's limit from the database and caches it. */
export async function refreshIdleLimit(): Promise<void> {
  try {
    const { data, error } = await getSupabase().rpc('my_idle_minutes');
    const v = Number(data);
    if (!error && Number.isFinite(v) && v >= 5 && v <= 1440) localStorage.setItem(LIMIT_KEY, String(v));
  } catch {
    /* keep the cached / default value */
  }
}

function read(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Records "now" as the last activity. */
export function touchActivity(): void {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* storage unavailable: the timeout simply isn't enforced */
  }
}

export function clearActivity(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** True when the last recorded activity is older than the limit.
    No record yet (e.g. a session opened before this feature) → start counting now. */
export function isIdleExpired(): boolean {
  const last = read();
  if (last === null) {
    touchActivity();
    return false;
  }
  return Date.now() - last > idleLimitMs();
}
