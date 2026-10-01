'use client';
/* Home page for accounts with the `guest` role (every new sign-up, see
   supabase/migrations/0007_guest_default_role.sql) — or with no section
   available. Explains, in Italian and English, that the account still has
   to be enabled by an IT administrator. */
import React, { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { getCurrentUser, loadProfile, profileRoles, signOutUser } from '@/lib/auth';

const IT_CONTACT = 'itsupport@h-farmschool.com';

export default function GuestClient() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const user = await getCurrentUser();
      if (!active) return;
      if (!user) {
        window.location.replace('/login');
        return;
      }
      let roles: string[] = [];
      try {
        roles = profileRoles(await loadProfile(user.id));
      } catch {
        /* no profile yet → still a guest */
      }
      if (!active) return;
      // Already given a real role? Back to the normal home.
      if (roles.some((r) => r !== 'guest')) {
        window.location.replace('/');
        return;
      }
      setEmail(user.email ?? '');
    })();
    return () => {
      active = false;
    };
  }, []);

  async function doLogout() {
    try {
      await signOutUser();
    } catch {
      /* ignore */
    }
    window.location.replace('/login');
  }

  return (
    <div className="page">
      <Header titlePre="Management " titleSpan="Platform" />

      {email === null ? null : (
        <div id="entry-screen">
          <div className="login-card guest-card">
            <div className="guest-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
              </svg>
            </div>
            <span className="role-chip">guest</span>

            <section lang="it" className="guest-lang">
              <h2>Profilo ospite</h2>
              <p>
                Il tuo profilo è stato aggiunto come <strong>ospite</strong> e al momento non ha accesso a nessuna sezione
                della piattaforma.
              </p>
              <p>
                Chiedi a un <strong>amministratore IT</strong> di assegnarti i permessi corretti.
              </p>
            </section>

            <hr className="guest-sep" />

            <section lang="en" className="guest-lang">
              <h2>Guest profile</h2>
              <p>
                Your profile has been added as a <strong>guest</strong> and currently has no access to any section of the
                platform.
              </p>
              <p>
                Please ask an <strong>IT administrator</strong> to assign you the correct permissions.
              </p>
            </section>

            <div className="guest-meta">
              {email ? (
                <div>
                  Account: <strong>{email}</strong>
                </div>
              ) : null}
              <div>
                IT: <a href={`mailto:${IT_CONTACT}`}>{IT_CONTACT}</a>
              </div>
            </div>

            <button className="btn-login" onClick={doLogout}>
              Sign out / Esci
            </button>
          </div>
        </div>
      )}

      <Footer text="H-FARM International School · Management Platform" />

      <style>{`
        .guest-card { text-align: left; }
        .guest-card .guest-icon { width: 46px; height: 46px; border-radius: 14px; background: var(--brand-light, #F9EFF0); display: flex; align-items: center; justify-content: center; margin-bottom: .8rem; }
        .guest-card .guest-icon svg { width: 24px; height: 24px; fill: none; stroke: var(--brand, #8B1A2B); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
        .guest-card .role-chip { display: inline-block; margin-bottom: 1rem; }
        .guest-card .guest-lang h2 { margin-bottom: .55rem; }
        .guest-card .guest-lang p { font-size: 14px; line-height: 1.55; color: var(--muted, #6E6468); margin-bottom: .5rem; }
        .guest-card .guest-lang p strong { color: var(--ink, #1C1418); }
        .guest-card .guest-sep { border: none; border-top: 1px dashed var(--line, #F0E7E8); margin: 1.1rem 0; }
        .guest-card .guest-meta { font-size: 13px; color: var(--muted, #6E6468); background: #FAF8F7; border-radius: 12px; padding: .75rem .9rem; margin: 1.1rem 0 1.2rem; line-height: 1.7; word-break: break-word; }
        .guest-card .guest-meta a { color: var(--brand, #8B1A2B); font-weight: 600; text-decoration: none; }
      `}</style>
    </div>
  );
}
