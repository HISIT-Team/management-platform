'use client';
/* Gestione Backend → Sicurezza (superadmin only).
   Choose for which roles the second factor (authenticator app) is
   mandatory, how long "Ricorda questo dispositivo" lasts, and the
   inactivity timeout of each role. MFA is enforced at login (/mfa), in the
   database and in the Edge Functions — see migrations 0015/0016. Every
   change is written to audit_log. */
import React, { useEffect, useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { getSupabase } from '@/lib/supabase';
import Topbar from '@/components/Topbar';
import { useToast } from '@/components/useToast';
import { getMfaStatus } from '@/lib/mfa';
import {
  type MfaPolicy,
  type PlatformUser,
  listMfaPolicy,
  listUsers,
  roleMeta,
  setIdleTimeout,
  setMfaPolicy,
  setRememberHours,
} from '@/lib/users';

const IDLE_OPTIONS = [5, 10, 15, 30, 45, 60, 90, 120, 240, 480, 720, 1440];
const REMEMBER_OPTIONS = [0, 1, 4, 8, 12, 24, 48, 72, 168];

const fmtMinutes = (m: number) =>
  m < 60 ? `${m} min` : m % 60 === 0 ? (m === 60 ? '1 ora' : `${m / 60} ore`) : `${Math.floor(m / 60)} h ${m % 60} min`;
const fmtHours = (h: number) => (h === 0 ? 'Disattivato' : h === 1 ? '1 ora' : h % 24 === 0 ? (h === 24 ? '24 ore (1 giorno)' : `${h / 24} giorni`) : `${h} ore`);

const IconShield = (
  <svg viewBox="0 0 24 24">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
);

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function SecuritySettingsClient() {
  const { showToast, toastNode } = useToast();
  const [policy, setPolicy] = useState<MfaPolicy[]>([]);
  const [users, setUsers] = useState<PlatformUser[]>([]);
  // Rows of the Owner role: only an Owner can change them (also enforced in the DB).
  const [meId, setMeId] = useState<string | null>(null);
  useEffect(() => {
    getSupabase()
      .auth.getUser()
      .then(({ data }) => setMeId(data.user?.id ?? null));
  }, []);
  const iAmOwner = users.some((u) => u.id === meId && u.role === 'owner');
  const [myAal2, setMyAal2] = useState(false);
  const [rememberHours, setRememberHoursState] = useState(24);
  const [busyRemember, setBusyRemember] = useState(false);
  const [myFactors, setMyFactors] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyRole, setBusyRole] = useState('');

  useEffect(() => {
    let active = true;
    // The user's own MFA status is loaded on its own, so an error in the
    // settings (e.g. a migration not run yet) never shows a false "activate MFA".
    getMfaStatus()
      .then((m) => {
        if (!active) return;
        setMyAal2(m.aal2 || m.trusted);
        setMyFactors(m.factors.length);
        setRememberHoursState(m.rememberHours);
      })
      .catch(() => {
        /* status unknown */
      });
    Promise.all([listMfaPolicy(), listUsers()])
      .then(([p, u]) => {
        if (!active) return;
        setPolicy(p);
        setUsers(u);
      })
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const out: Record<string, { total: number; withMfa: number }> = {};
    for (const u of users) {
      const s = (out[u.role] ||= { total: 0, withMfa: 0 });
      s.total++;
      if (u.mfa_enabled) s.withMfa++;
    }
    return out;
  }, [users]);

  async function toggle(p: MfaPolicy) {
    const next = !p.required;
    setBusyRole(p.role);
    try {
      await setMfaPolicy(p.role, next);
      setPolicy((prev) => prev.map((x) => (x.role === p.role ? { ...x, required: next, updated_at: new Date().toISOString() } : x)));
      const missing = (stats[p.role]?.total ?? 0) - (stats[p.role]?.withMfa ?? 0);
      showToast(
        next
          ? `MFA obbligatoria per ${roleMeta(p.role).label}${missing ? ` — ${missing} utenti la configureranno al prossimo accesso` : ''} ✓`
          : `MFA non più obbligatoria per ${roleMeta(p.role).label}`,
      );
    } catch (e) {
      showToast((e as Error).message, true);
    }
    setBusyRole('');
  }

  async function changeIdle(p: MfaPolicy, minutes: number) {
    setBusyRole(p.role);
    try {
      await setIdleTimeout(p.role, minutes);
      setPolicy((prev) => prev.map((x) => (x.role === p.role ? { ...x, idle_minutes: minutes, updated_at: new Date().toISOString() } : x)));
      showToast(`Timeout ${roleMeta(p.role).label}: ${fmtMinutes(minutes)} ✓`);
    } catch (e) {
      showToast((e as Error).message, true);
    }
    setBusyRole('');
  }

  async function changeRemember(hours: number) {
    setBusyRemember(true);
    try {
      await setRememberHours(hours);
      setRememberHoursState(hours);
      showToast(hours ? `Ricorda dispositivo: ${fmtHours(hours)} ✓` : 'Ricorda dispositivo disattivato: il codice sarà chiesto a ogni accesso');
    } catch (e) {
      showToast((e as Error).message, true);
    }
    setBusyRemember(false);
  }

  return (
    <AuthGuard roles={['superadmin']}>
      <Topbar label="Gestione Backend" href="/backend" variant="back" />
      <div className="budget-page sec-page">
        <div className="shell shell--narrow">
          <div className="b-head">
            <div className="b-head-left">
              <div className="logo">{IconShield}</div>
              <div>
                <p className="b-eyebrow">Gestione Backend · Super Admin</p>
                <h1>
                  <em>Sicurezza</em>
                </h1>
                <p>Autenticazione a due fattori e timeout di inattività per ruolo</p>
              </div>
            </div>
          </div>

          {error ? (
            <div className="setup-note">
              <b>Impostazioni non raggiungibili.</b> {error}
              <br />
              Verifica di aver eseguito <code>0015_mfa_by_role.sql</code> e <code>0016_sessions_trusted_devices_admin_sections.sql</code> nel SQL Editor.
            </div>
          ) : null}

          {!loading && !error && !myAal2 ? (
            <div className="sec-lock">
              <b>Prima attiva la tua MFA.</b>{' '}
              {myFactors
                ? 'Esci e rientra inserendo il codice dell’app: poi potrai modificare queste regole.'
                : 'Configurala da My Profile: così, rendendola obbligatoria, non rischi di restare chiuso fuori dal Backend.'}
              {!myFactors ? (
                <>
                  {' '}
                  <a href="/mfa?setup=1">Attiva ora</a>
                </>
              ) : null}
            </div>
          ) : null}

          {loading ? (
            <div className="skeleton" />
          ) : (
            <div className="ledger">
              <div className="ledger-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Ruolo</th>
                    <th>Utenti con MFA</th>
                    <th>MFA obbligatoria</th>
                    <th>Timeout inattività</th>
                  </tr>
                </thead>
                <tbody>
                  {policy.map((p) => {
                    const m = roleMeta(p.role);
                    const st = stats[p.role] ?? { total: 0, withMfa: 0 };
                    return (
                      <tr key={p.role}>
                        <td>
                          <span className="tag" style={{ ['--accent' as string]: m.color, ['--accent-soft' as string]: m.soft }}>
                            {m.label}
                          </span>
                          {p.updated_by ? (
                            <div className="sec-meta">
                              modificata da {p.updated_by} il {fmt(p.updated_at)}
                            </div>
                          ) : null}
                        </td>
                        <td className="sec-count">
                          {st.total ? `${st.withMfa} di ${st.total}` : '—'}
                        </td>
                        <td>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={p.required}
                            aria-label={`MFA obbligatoria per ${m.label}`}
                            className={'sec-switch' + (p.required ? ' on' : '')}
                            onClick={() => toggle(p)}
                            disabled={!myAal2 || busyRole === p.role || (p.role === 'owner' && !iAmOwner)}
                          >
                            <i />
                          </button>
                        </td>
                        <td>
                          <select
                            className="sec-select"
                            aria-label={`Timeout inattività per ${m.label}`}
                            value={p.idle_minutes}
                            disabled={busyRole === p.role || (p.role === 'owner' && !iAmOwner)}
                            onChange={(e) => changeIdle(p, Number(e.target.value))}
                          >
                            {(IDLE_OPTIONS.includes(p.idle_minutes) ? IDLE_OPTIONS : [...IDLE_OPTIONS, p.idle_minutes].sort((a, b) => a - b)).map(
                              (o) => (
                                <option key={o} value={o}>
                                  {fmtMinutes(o)}
                                </option>
                              ),
                            )}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {!loading && !error ? (
            <div className="sec-card">
              <div>
                <b>Ricorda questo dispositivo</b>
                <p>
                  Dopo il codice dell&apos;app, l&apos;utente può spuntare &laquo;Ricorda questo dispositivo&raquo;: su quel browser il
                  codice non viene richiesto per questo periodo (la password sì, a ogni accesso). Riducendo il periodo si accorciano
                  subito anche i dispositivi già ricordati; &laquo;Disattivato&raquo; li annulla tutti.
                </p>
              </div>
              <select
                className="sec-select"
                aria-label="Durata ricorda dispositivo"
                value={rememberHours}
                disabled={!myAal2 || busyRemember}
                onChange={(e) => changeRemember(Number(e.target.value))}
              >
                {(REMEMBER_OPTIONS.includes(rememberHours) ? REMEMBER_OPTIONS : [...REMEMBER_OPTIONS, rememberHours].sort((a, b) => a - b)).map(
                  (o) => (
                    <option key={o} value={o}>
                      {fmtHours(o)}
                    </option>
                  ),
                )}
              </select>
            </div>
          ) : null}

          <p className="sec-note">
            Timeout di inattività: dopo quel tempo senza attività (anche a browser chiuso) l&apos;utente viene disconnesso; vale
            dal prossimo controllo, entro 10 minuti.
            <br />
            Consigliato: obbligatoria per Super Admin, Admin, IT e HR. Chi ha un ruolo con MFA obbligatoria e non l&apos;ha
            ancora attivata la configura al primo accesso successivo. Se qualcuno perde il telefono, azzera la sua MFA da
            Gestione Utenti. Ogni modifica finisce nel Registro attività.
          </p>

          <footer className="b-footer">
            H-FARM International School · Gestione Backend — Sicurezza
            <span>Via Adriano Olivetti 1 - 31056 Roncade (TV)</span>
          </footer>
        </div>
        {toastNode}
      </div>
      <style>{`
        .sec-page .sec-lock { font-size: 13.5px; background: #FFF3E4; color: var(--b-warn); border-radius: 13px; padding: .8rem 1rem; margin-bottom: 1rem; line-height: 1.5; }
        .sec-page .sec-lock a { color: var(--brand); font-weight: 700; }
        .sec-page table { min-width: 0; }
        .sec-page .sec-meta { font-size: 11.5px; color: var(--b-faint); margin-top: 4px; }
        .sec-page .sec-count { color: var(--b-muted); font-variant-numeric: tabular-nums; }
        .sec-page .sec-switch { width: 44px; height: 26px; border-radius: 999px; border: none; background: #E4DCDD; position: relative; cursor: pointer; transition: background .2s; }
        .sec-page .sec-switch i { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.2); transition: transform .2s; }
        .sec-page .sec-switch.on { background: var(--brand); }
        .sec-page .sec-switch.on i { transform: translateX(18px); }
        .sec-page .sec-switch:disabled { opacity: .45; cursor: not-allowed; }
        .sec-page .sec-switch:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
        .sec-page .sec-select { padding: 7px 10px; border-radius: 10px; border: 1.5px solid var(--b-line); font-family: inherit; font-size: 13.5px; background: #fff; color: var(--ink); }
        .sec-page .sec-select:disabled { opacity: .5; }
        .sec-page .sec-card { display: flex; gap: 1rem; align-items: center; justify-content: space-between; background: #fff; border: 1px solid var(--b-line); border-radius: 16px; padding: 1rem 1.2rem; margin-top: 1rem; }
        .sec-page .sec-card p { font-size: 13px; color: var(--b-muted); line-height: 1.5; margin-top: 4px; }
        @media (max-width: 640px) { .sec-page .sec-card { flex-direction: column; align-items: stretch; } }
        .sec-page .sec-note { font-size: 13px; color: var(--b-muted); line-height: 1.55; margin-top: 1rem; }
      `}</style>
    </AuthGuard>
  );
}
