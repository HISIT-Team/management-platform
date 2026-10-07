'use client';
/* Landing page: the Sign in / Sign up card when signed out, the dashboard
   (inside the app shell) when signed in. Guests go to /guest. */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AuthGuard, { hasShellUser } from '@/components/AuthGuard';
import Dashboard from '@/components/Dashboard';
import { getCurrentUser, ensureProfile, loadProfile, profileRoles, type Profile } from '@/lib/auth';
import { SIGNUP_ENABLED } from '@/lib/features';
import { navFor } from '@/lib/nav';
import { loadMyPermissions } from '@/lib/permissions';

export default function HomePage() {
  // Coming back from another page of the app: show the dashboard straight away.
  const [state, setState] = useState<'loading' | 'out' | 'in'>(() => (hasShellUser() ? 'in' : 'loading'));

  useEffect(() => {
    if (state === 'in') return;
    let active = true;
    (async () => {
      const authUser = await getCurrentUser();
      if (!active) return;
      if (!authUser) {
        setState('out');
        return;
      }
      // Keep the profile row in sync with the sign-up metadata (names, email).
      let profile: Profile | null = await ensureProfile(authUser);
      if (!profile) {
        try {
          profile = await loadProfile(authUser.id);
        } catch {
          /* ignore */
        }
      }
      if (!active) return;
      const roles = profileRoles(profile);
      const perms = await loadMyPermissions();
      if (!active) return;
      const hasSection = navFor({ roles, perms }).some((g) => g.items.some((i) => i.href !== '/'));
      // Roles of one company (e.g. teachers.hro) get the platform even with no section yet.
      const companyRole = roles.some((r) => /\.(hvi|hro)$/.test(r));
      // Guests (new sign-ups) and accounts without any section get their own home.
      if (roles.includes('guest') || (!hasSection && !companyRole)) {
        window.location.replace('/guest');
        return;
      }
      setState('in');
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === 'loading') return null;

  if (state === 'in') {
    // AuthGuard handles the second factor and renders the app shell.
    return (
      <AuthGuard>
        <Dashboard />
      </AuthGuard>
    );
  }

  return (
    <div className="page">
      <Header titlePre="Management " titleSpan="Platform" />
      <div id="entry-screen">
        <div className="login-card">
          <h2>Welcome</h2>
          <p className="login-sub">Sign in to access the platform.</p>
          <Link className="btn-login" href="/login">
            Sign in
          </Link>
          {SIGNUP_ENABLED ? (
            <p className="login-alt">
              Don&apos;t have an account? <Link href="/signup">Sign Up</Link>
            </p>
          ) : null}
        </div>
      </div>
      <Footer text="H-FARM International School · Management Platform" />
    </div>
  );
}
