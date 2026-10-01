/* ═══════════════════════════════════════════════════════════════════
   Inactivity timeout.
   A signed-in user is logged out after IDLE_LIMIT_MS without activity
   (click, key, touch, scroll). The last-activity time lives in
   localStorage, so:
     - it is shared by every open tab (activity in one keeps all alive);
     - closing the browser does NOT reset it: reopening within the hour
       keeps the session, reopening later finds it expired.
   Enforced client-side by getCurrentUser() (page loads) and by
   <IdleWatcher> (while a page stays open). Supabase's own time-boxed
   sessions require the Pro plan.
   ═══════════════════════════════════════════════════════════════════ */

export const IDLE_LIMIT_MS = 60 * 60 * 1000; // 1 hour
const KEY = 'his:lastActivity';

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
  return Date.now() - last > IDLE_LIMIT_MS;
}
