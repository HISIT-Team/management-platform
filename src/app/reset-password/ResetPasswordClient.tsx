'use client';
/* Set a new password (opened from the recovery email link). Port of reset-password.html.
   The recovery link establishes a temporary session automatically
   (detectSessionInUrl), so we can just call updateUser. */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { updateUserPassword } from '@/lib/auth';

export default function ResetPasswordClient() {
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function doReset() {
    setError('');
    if (!pass || !pass2) {
      setError('Please fill in both fields.');
      return;
    }
    if (pass.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (pass !== pass2) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await updateUserPassword(pass);
      setDone(true);
    } catch (e) {
      setError((e as Error).message || 'Could not update password. Open this page from the reset link in your email.');
      setBusy(false);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !done) doReset();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pass, pass2, done]);

  return (
    <div className="page">
      <Header titlePre="Management " titleSpan="Platform" />

      <div id="reset-screen">
        <div className="login-card">
          <h2>Set a new password</h2>
          <p className="login-sub">Choose a new password for your account.</p>
          <div className={'login-error' + (error ? ' visible' : '')}>{error || 'Passwords do not match.'}</div>

          <div className="login-field">
            <label htmlFor="rp-password">New password</label>
            <input type="password" id="rp-password" placeholder="••••••••" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
          </div>
          <div className="login-field">
            <label htmlFor="rp-password2">Confirm password</label>
            <input type="password" id="rp-password2" placeholder="••••••••" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} />
          </div>

          <button className="btn-login" onClick={doReset} disabled={busy}>
            Reset password
          </button>

          <p className="login-alt">
            <Link href="/login">Back to sign in</Link>
          </p>
        </div>
      </div>

      <Footer text="H-FARM International School · Management Platform" />

      {/* ── SUCCESS MODAL ── */}
      <div className={'modal-overlay' + (done ? ' show' : '')}>
        <div className="modal-card">
          <div className="modal-icon">
            <svg viewBox="0 0 24 24">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h2>Password updated</h2>
          <p>Your password has been changed successfully. You can now sign in with your new password.</p>
          <Link className="btn-login" href="/login">
            Go to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
