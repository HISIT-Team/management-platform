'use client';
/* Mounted once in the root layout. While a page is open it records user
   activity (throttled) and, if the inactivity limit is exceeded — also
   after the computer wakes from sleep or a tab comes back to the front —
   signs the user out and sends them to /login. The limit depends on the
   role (Gestione Backend → Sicurezza). See src/lib/idle.ts. */
import { useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';
import { clearActivity, isIdleExpired, refreshIdleLimit, touchActivity } from '@/lib/idle';

const CHECK_EVERY_MS = 30_000;
const LIMIT_REFRESH_MS = 10 * 60_000; // role timeout changed in Sicurezza → picked up within 10 min
const TOUCH_THROTTLE_MS = 15_000;
const EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll', 'wheel'] as const;

export default function IdleWatcher() {
  useEffect(() => {
    const sb = getSupabase();
    let lastTouch = 0;
    let signingOut = false;

    const hasSession = async () => (await sb.auth.getSession()).data.session !== null;

    const check = async () => {
      if (signingOut || !(await hasSession()) || !isIdleExpired()) return;
      signingOut = true;
      try {
        await sb.auth.signOut();
      } catch {
        /* even if the network call fails, the local session is cleared */
      }
      clearActivity();
      if (!window.location.pathname.startsWith('/login')) window.location.replace('/login');
    };

    const onActivity = () => {
      const now = Date.now();
      if (now - lastTouch < TOUCH_THROTTLE_MS) return;
      lastTouch = now;
      // Activity after the limit must not revive an expired session: check first.
      if (isIdleExpired()) void check();
      else touchActivity();
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };

    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    // Supabase also emits SIGNED_IN when it merely restores a stored session,
    // so only a sign-in coming from an email link (confirmation / password
    // reset: tokens in the URL) restarts the timer. Password logins restart it
    // in signInUser().
    const fromEmailLink = /access_token=|[?&]code=|type=(signup|recovery|magiclink|invite)/.test(
      window.location.hash + window.location.search,
    );
    const { data: sub } = sb.auth.onAuthStateChange((event) => {
      if (fromEmailLink && (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY')) touchActivity();
      if (event === 'SIGNED_IN') void refreshIdleLimit();
      if (event === 'SIGNED_OUT') clearActivity();
    });
    void check();
    const refresh = async () => {
      if (await hasSession()) await refreshIdleLimit();
    };
    void refresh();
    const limitTimer = window.setInterval(refresh, LIMIT_REFRESH_MS);

    return () => {
      window.clearInterval(limitTimer);
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  return null;
}
