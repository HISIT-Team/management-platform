'use client';
/* Second factor (TOTP authenticator app).
   - No authenticator yet  → set-up: QR code to scan + first code.
   - Authenticator present → enter the 6-digit code.
   - /mfa?setup=1 (from My profile) → add another authenticator (backup phone).
   On success the session becomes aal2 and the user goes back to the page
   they were opening. "Ricorda questo dispositivo" skips the code on this
   browser for the hours set in Sicurezza (default 24). See src/lib/mfa.ts
   and migrations 0015/0016. */
import React, { useEffect, useRef, useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { POST_LOGIN_KEY } from '@/components/AuthGuard';
import { getCurrentUser, signOutUser } from '@/lib/auth';
import { type MfaFactor, getMfaStatus, startTotpEnrollment, trustThisDevice, verifyTotp } from '@/lib/mfa';

type Mode = 'loading' | 'challenge' | 'enroll' | 'done';

function nextPage(): string {
  try {
    const n = sessionStorage.getItem(POST_LOGIN_KEY) ?? '';
    sessionStorage.removeItem(POST_LOGIN_KEY);
    if (/^\/(?![/\\])/.test(n) && !n.startsWith('/login') && !n.startsWith('/mfa')) return n;
  } catch {
    /* storage unavailable */
  }
  return '/';
}

export default function MfaClient() {
  const [mode, setMode] = useState<Mode>('loading');
  const [setup, setSetup] = useState(false);
  const [required, setRequired] = useState(false);
  const [factors, setFactors] = useState<MfaFactor[]>([]);
  const [factorId, setFactorId] = useState('');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rememberHours, setRememberHours] = useState(0);
  const [remember, setRemember] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  async function beginEnroll() {
    setError('');
    try {
      const e = await startTotpEnrollment();
      setFactorId(e.factorId);
      setQr(e.qr);
      setSecret(e.secret);
      setCode('');
      setMode('enroll');
    } catch (err) {
      setError((err as Error).message);
      setMode('enroll');
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const user = await getCurrentUser();
      if (!active) return;
      if (!user) {
        window.location.replace('/login');
        return;
      }
      const isSetup = new URLSearchParams(window.location.search).get('setup') === '1';
      const st = await getMfaStatus();
      if (!active) return;
      setSetup(isSetup);
      setRequired(st.required);
      setFactors(st.factors);
      setRememberHours(st.rememberHours);
      try {
        setRemember(localStorage.getItem('his:mfaRememberChoice') !== '0');
      } catch {
        /* ignore */
      }
      if ((st.aal2 || st.trusted) && !isSetup) {
        window.location.replace(nextPage());
        return;
      }
      if (st.factors.length && !st.aal2) {
        // Verify with an existing authenticator first (also needed before adding another one).
        setFactorId(st.factors[0].id);
        setMode('challenge');
      } else {
        await beginEnroll();
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (mode === 'challenge' || mode === 'enroll') inputRef.current?.focus();
  }, [mode]);

  async function submit() {
    if (!/^\d{6}$/.test(code.replace(/\s/g, ''))) {
      setError('Enter the 6-digit code from the app. / Inserisci il codice di 6 cifre.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await verifyTotp(factorId, code);
      if (mode === 'challenge' && setup) {
        // Passed the existing factor: now add the new authenticator.
        setBusy(false);
        await beginEnroll();
        return;
      }
      if (setup) {
        setMode('done');
        setBusy(false);
        return;
      }
      if (rememberHours > 0) {
        try {
          localStorage.setItem('his:mfaRememberChoice', remember ? '1' : '0');
        } catch {
          /* ignore */
        }
        if (remember) {
          try {
            await trustThisDevice();
          } catch {
            /* not fatal: the code will simply be asked again next time */
          }
        }
      }
      window.location.replace(nextPage());
    } catch (err) {
      setError((err as Error).message);
      setCode('');
      setBusy(false);
    }
  }

  async function logout() {
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
      <div id="login-screen" className="mfa-screen">
        <div className="login-card">
          {mode === 'loading' ? (
            <p className="login-sub">Loading…</p>
          ) : mode === 'done' ? (
            <>
              <h2>Authenticator added</h2>
              <p className="login-sub">
                You now have {factors.length + 1} authenticator apps. / Hai aggiunto un&apos;altra app di autenticazione.
              </p>
              <a className="btn-login" href="/profile">
                Back to My profile
              </a>
            </>
          ) : (
            <>
              <h2>{mode === 'enroll' ? 'Set up two-factor authentication' : 'Two-factor authentication'}</h2>
              {mode === 'enroll' ? (
                <>
                  <p className="login-sub">
                    {required && !setup
                      ? 'Your role requires a second factor. / Il tuo ruolo richiede l’autenticazione a due fattori.'
                      : 'Add an authenticator app to your account. / Aggiungi un’app di autenticazione.'}
                  </p>
                  <ol className="mfa-steps">
                    <li>
                      Open an authenticator app (Microsoft Authenticator, Google Authenticator…) and scan this code.
                    </li>
                    <li>Type the 6-digit code the app shows.</li>
                  </ol>
                  {qr ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="mfa-qr" src={qr} alt="QR code for the authenticator app" />
                  ) : null}
                  {secret ? (
                    <details className="mfa-secret">
                      <summary>Can&apos;t scan? Enter this key manually</summary>
                      <code>{secret}</code>
                    </details>
                  ) : null}
                </>
              ) : (
                <p className="login-sub">
                  Enter the 6-digit code from your authenticator app. / Inserisci il codice di 6 cifre dell&apos;app.
                </p>
              )}

              <div className={'login-error' + (error ? ' visible' : '')}>{error}</div>

              {mode === 'challenge' && factors.length > 1 ? (
                <div className="login-field">
                  <label htmlFor="mfa-factor">Authenticator</label>
                  <select id="mfa-factor" className="mfa-select" value={factorId} onChange={(e) => setFactorId(e.target.value)}>
                    {factors.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.friendly_name || 'Authenticator'}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="login-field">
                <label htmlFor="mfa-code">Code</label>
                <input
                  ref={inputRef}
                  id="mfa-code"
                  className="mfa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submit();
                  }}
                />
              </div>
              {!setup && rememberHours > 0 ? (
                <label className="mfa-remember">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                  <span>
                    Remember this device for {rememberHours === 1 ? '1 hour' : `${rememberHours} hours`} / Ricorda questo
                    dispositivo per {rememberHours === 1 ? '1 ora' : `${rememberHours} ore`}
                    <small>Don&apos;t tick it on shared computers. / Non spuntarlo su computer condivisi.</small>
                  </span>
                </label>
              ) : null}

              <button className="btn-login" onClick={submit} disabled={busy || (mode === 'enroll' && !factorId)}>
                {busy ? 'Checking…' : mode === 'enroll' ? 'Activate' : 'Verify'}
              </button>

              <p className="login-alt">
                {setup ? (
                  <a href="/profile">Cancel</a>
                ) : (
                  <>
                    Lost your phone? Ask an IT administrator to reset it. ·{' '}
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        void logout();
                      }}
                    >
                      Sign out
                    </a>
                  </>
                )}
              </p>
            </>
          )}
        </div>
      </div>
      <Footer text="H-FARM International School · Management Platform" />
      <style>{`
        .mfa-screen .mfa-steps { font-size: 13px; color: var(--muted); padding-left: 1.1rem; margin: -.4rem 0 1rem; line-height: 1.5; }
        .mfa-screen .mfa-qr { display: block; width: 190px; height: 190px; margin: 0 auto 1rem; background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 8px; }
        .mfa-screen .mfa-secret { font-size: 12.5px; color: var(--muted); margin-bottom: 1rem; text-align: center; }
        .mfa-screen .mfa-secret summary { cursor: pointer; }
        .mfa-screen .mfa-secret code { display: block; margin-top: .5rem; font-size: 13px; word-break: break-all; background: #FAF8F7; border-radius: 8px; padding: .5rem; color: var(--ink); letter-spacing: .06em; }
        .mfa-screen .mfa-code { text-align: center; font-size: 22px !important; letter-spacing: .4em; font-variant-numeric: tabular-nums; }
        .mfa-screen .mfa-select { width: 100%; padding: 10px 12px; border-radius: 12px; border: 1.5px solid var(--line); font-family: inherit; font-size: 14px; }
        .mfa-screen .mfa-remember { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; color: var(--ink); margin: -.2rem 0 1rem; cursor: pointer; line-height: 1.45; }
        .mfa-screen .mfa-remember input { margin-top: 3px; width: 16px; height: 16px; accent-color: var(--brand, #8B1A2B); flex-shrink: 0; }
        .mfa-screen .mfa-remember small { display: block; color: var(--muted); font-size: 12px; margin-top: 2px; }
        .mfa-screen a.btn-login { display: block; text-align: center; text-decoration: none; }
      `}</style>
    </div>
  );
}
