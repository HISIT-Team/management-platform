'use client';
/* Landing page: shows the Sign in / Sign up entry card when signed out, or the
   role-filtered dashboard of section cards when a Supabase session exists.
   Faithful port of the original index.html. */
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import {
  getCurrentUser,
  ensureProfile,
  loadProfile,
  profileName,
  profileRoles,
  signOutUser,
  type Profile,
} from '@/lib/auth';
import { SIGNUP_ENABLED } from '@/lib/features';

interface DashCard {
  id: string;
  roles: string[];
  href: string;
  icon: React.ReactNode;
  name: string;
  desc: string;
}

const ALL_CARDS: DashCard[] = [
  {
    id: 'boarding',
    roles: ['boarding', 'admin'],
    href: '/boarding',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
    name: 'Boarding',
    desc: 'Student boarding management',
  },
  {
    id: 'it',
    roles: ['it', 'admin'],
    href: '/it',
    icon: (
      <svg viewBox="0 0 24 24">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
    name: 'IT',
    desc: 'Device & inventory management',
  },
  {
    id: 'hr',
    roles: ['hr', 'admin'],
    href: '/hr',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    name: 'HR',
    desc: 'Personnel management',
  },
  {
    id: 'office',
    roles: ['office', 'admin'],
    href: '/student-office',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
    name: 'Student Office',
    desc: 'Student forms & requests',
  },
  {
    id: 'parents',
    roles: ['parent', 'admin'],
    href: '/parents-hub',
    icon: (
      <svg viewBox="0 0 24 24">
        <circle cx="8" cy="7.5" r="3.2" />
        <path d="M2.5 20v-1.4A4.6 4.6 0 0 1 7.1 14h1.8a4.6 4.6 0 0 1 4.1 2.5" />
        <path d="M18 11.4c1.1-1.3 3.4-.6 3.4 1.1 0 1.6-2 2.9-3.4 4.3-1.4-1.4-3.4-2.7-3.4-4.3 0-1.7 2.3-2.4 3.4-1.1z" />
      </svg>
    ),
    name: 'Parents',
    desc: 'Medicine consent & parent forms',
  },
];

const arrow = (
  <svg viewBox="0 0 24 24">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

interface DashUser {
  name: string;
  roles: string[];
}

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<DashUser | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const authUser = await getCurrentUser();
      if (!active) return;
      if (!authUser) {
        setLoading(false);
        return;
      }
      let profile: Profile | null = await ensureProfile(authUser);
      if (!profile) {
        try {
          profile = await loadProfile(authUser.id);
        } catch {
          /* ignore */
        }
      }
      if (!active) return;
      setUser({
        name: profileName(profile, authUser.email ?? ''),
        roles: profileRoles(profile),
      });
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(
    () => (user ? ALL_CARDS.filter((c) => c.roles.some((r) => user.roles.includes(r))) : []),
    [user],
  );

  async function doLogout() {
    try {
      await signOutUser();
    } catch {
      /* ignore */
    }
    window.location.reload();
  }

  return (
    <div className="page">
      <Header titlePre="Management " titleSpan="Platform" />

      {loading ? null : !user ? (
        /* ── ENTRY (Sign in / Sign up) ── */
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
      ) : (
        /* ── DASHBOARD ── */
        <div id="dashboard-screen" style={{ display: 'block' }}>
          <div className="welcome-bar">
            <div className="welcome-text">
              <div>
                Signed in as <strong>{user.name}</strong>
              </div>
              <div className="role-chips">
                {user.roles.map((r) => (
                  <span className="role-chip" key={r}>
                    {r}
                  </span>
                ))}
              </div>
            </div>
            <button className="btn-logout" onClick={doLogout}>
              Sign out
            </button>
          </div>
          <div className="cards">
            {visible.length === 0 ? (
              <p style={{ color: '#6E6468', fontSize: 14, textAlign: 'center', padding: '2rem' }}>
                No sections available for your role.
              </p>
            ) : (
              visible.map((c) => (
                <Link className="card" href={c.href} key={c.id}>
                  <div className="card-icon">{c.icon}</div>
                  <div className="card-content">
                    <div className="card-name">{c.name}</div>
                    <div className="card-desc">{c.desc}</div>
                  </div>
                  <div className="card-arrow">{arrow}</div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}

      <Footer text="H-FARM International School · Management Platform" />
    </div>
  );
}
