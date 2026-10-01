'use client';
/* Create account page + confirmation modal. Port of signup.html. */
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Turnstile, { type TurnstileHandle } from '@/components/Turnstile';
import { signUpUser } from '@/lib/auth';
import { PRIVACY_POLICY_URL, SIGNUP_ENABLED } from '@/lib/features';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Shown instead of the form while self-registration is off (src/lib/features.ts). */
function SignupClosed() {
  return (
    <div className="page">
      <Header titlePre="Management " titleSpan="Platform" />
      <div id="signup-screen">
        <div className="login-card">
          <h2>Registration closed</h2>
          <p className="login-sub">
            New accounts can&apos;t be created from this page at the moment. If you need access to the platform, please
            contact the IT department.
          </p>
          <Link className="btn-login" href="/login">
            Back to sign in
          </Link>
        </div>
      </div>
      <Footer text="H-FARM International School · Management Platform" />
    </div>
  );
}

export default function SignupClient() {
  return SIGNUP_ENABLED ? <SignupForm /> : <SignupClosed />;
}

function SignupForm() {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [privacyOk, setPrivacyOk] = useState(false);
  const ts = useRef<TurnstileHandle>(null);

  async function doSignup() {
    setError('');
    if (!first.trim() || !last.trim() || !email.trim() || !pass || !pass2) {
      setError('Please fill in all fields.');
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError('Please enter a valid email address.');
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
    if (PRIVACY_POLICY_URL && !privacyOk) {
      setError('Please confirm you have read the privacy notice.');
      return;
    }
    const token = ts.current?.getResponse() ?? '';
    if (!token) {
      setError('Please complete the captcha.');
      return;
    }
    setBusy(true);
    try {
      await signUpUser({
        firstName: first.trim(),
        lastName: last.trim(),
        email: email.trim(),
        password: pass,
        captchaToken: token,
      });
      setDone(true);
    } catch (e) {
      const err = e as { message?: string; error_description?: string; msg?: string };
      setError(err.message || err.error_description || err.msg || 'Sign up failed. Please try again later.');
      setBusy(false);
      ts.current?.reset();
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !done) doSignup();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first, last, email, pass, pass2, done]);

  return (
    <div className="page">
      <Header titlePre="Management " titleSpan="Platform" />

      <div id="signup-screen">
        <div className="login-card">
          <h2>Create account</h2>
          <p className="login-sub">Sign up to request access to the platform.</p>
          <div className={'login-error' + (error ? ' visible' : '')}>{error || 'Please fill in all fields.'}</div>

          <div className="login-field">
            <label htmlFor="su-firstname">First name</label>
            <input type="text" id="su-firstname" placeholder="e.g. Laura" autoComplete="given-name" value={first} onChange={(e) => setFirst(e.target.value)} />
          </div>
          <div className="login-field">
            <label htmlFor="su-lastname">Last name</label>
            <input type="text" id="su-lastname" placeholder="e.g. Bianchi" autoComplete="family-name" value={last} onChange={(e) => setLast(e.target.value)} />
          </div>
          <div className="login-field">
            <label htmlFor="su-email">Email</label>
            <input type="email" id="su-email" placeholder="name@h-farmschool.com" autoComplete="email" autoCapitalize="off" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="login-field">
            <label htmlFor="su-password">Password</label>
            <input type="password" id="su-password" placeholder="••••••••" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
          </div>
          <div className="login-field">
            <label htmlFor="su-password2">Confirm password</label>
            <input type="password" id="su-password2" placeholder="••••••••" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} />
          </div>

          {PRIVACY_POLICY_URL ? (
            <label className="privacy-check">
              <input type="checkbox" checked={privacyOk} onChange={(e) => setPrivacyOk(e.target.checked)} />
              <span>
                I have read the{' '}
                <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer">
                  privacy notice
                </a>{' '}
                / Ho letto l&apos;informativa privacy
              </span>
            </label>
          ) : null}
          <Turnstile ref={ts} style={{ marginBottom: '.9rem' }} />
          <button className="btn-login" onClick={doSignup} disabled={busy}>
            Sign up
          </button>

          <p className="login-alt">
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        </div>
      </div>

      <Footer text="H-FARM International School · Management Platform" />

      {/* ── CONFIRMATION MODAL ── */}
      <div className={'modal-overlay' + (done ? ' show' : '')}>
        <div className="modal-card">
          <div className="modal-icon">
            <svg viewBox="0 0 24 24">
              <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
              <polyline points="22 7 13.5 13 2 7" />
              <polyline points="16 19 18.5 21.5 23 16.5" />
            </svg>
          </div>
          <h2>Check your inbox</h2>
          <p>
            We&apos;ve sent a confirmation link to <strong>{email}</strong>. Open it to confirm your sign-up and activate
            your account.
          </p>
          <Link className="btn-login" href="/login">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
