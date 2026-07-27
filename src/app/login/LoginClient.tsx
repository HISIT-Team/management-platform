'use client';
/* Sign in page + forgot-password modal. Port of login.html. */
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Turnstile, { type TurnstileHandle } from '@/components/Turnstile';
import { signInUser, requestPasswordReset } from '@/lib/auth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginClient() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const loginTs = useRef<TurnstileHandle>(null);

  // Forgot-password modal
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [fpEmail, setFpEmail] = useState('');
  const [fpError, setFpError] = useState('');
  const forgotTs = useRef<TurnstileHandle>(null);

  async function doLogin() {
    setError('');
    if (!email || !password) {
      setError('Enter email and password.');
      return;
    }
    const token = loginTs.current?.getResponse() ?? '';
    if (!token) {
      setError('Please complete the captcha.');
      return;
    }
    setBusy(true);
    try {
      await signInUser({ email: email.trim(), password, captchaToken: token });
      router.push('/');
    } catch (e) {
      setError((e as Error).message || 'Incorrect email or password.');
      setBusy(false);
      loginTs.current?.reset();
    }
  }

  function openForgot() {
    setForgotOpen(true);
    setForgotSent(false);
    setFpError('');
    forgotTs.current?.reset();
  }
  function closeForgot() {
    setForgotOpen(false);
  }

  async function sendReset() {
    setFpError('');
    const value = fpEmail.trim();
    if (!EMAIL_RE.test(value)) {
      setFpError('Please enter a valid email address.');
      return;
    }
    const token = forgotTs.current?.getResponse() ?? '';
    if (!token) {
      setFpError('Please complete the captcha.');
      return;
    }
    try {
      await requestPasswordReset(value, token);
      setForgotSent(true);
    } catch (e) {
      setFpError((e as Error).message || 'Could not send reset email.');
      forgotTs.current?.reset();
    }
  }

  // Submit with Enter (respect the forgot-password modal when open)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      if (forgotOpen) {
        if (!forgotSent) sendReset();
      } else {
        doLogin();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forgotOpen, forgotSent, email, password, fpEmail]);

  return (
    <div className="page">
      <Header titlePre="Management " titleSpan="Platform" />

      <div id="login-screen">
        <div className="login-card">
          <h2>Sign in</h2>
          <p className="login-sub">Enter your credentials to continue.</p>
          <div className={'login-error' + (error ? ' visible' : '')}>{error || 'Incorrect username or password.'}</div>
          <div className="login-field">
            <label htmlFor="input-email">Email</label>
            <input
              type="email"
              id="input-email"
              placeholder="name@h-farmschool.com"
              autoComplete="email"
              autoCapitalize="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="login-field">
            <label htmlFor="input-password">Password</label>
            <input
              type="password"
              id="input-password"
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <p className="forgot-row">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                openForgot();
              }}
            >
              Forgot password?
            </a>
          </p>
          <Turnstile ref={loginTs} style={{ marginBottom: '.9rem' }} />
          <button className="btn-login" onClick={doLogin} disabled={busy}>
            Sign in
          </button>

          <p className="login-alt">
            Don&apos;t have an account? <Link href="/signup">Sign Up</Link>
          </p>
        </div>
      </div>

      <Footer text="H-FARM International School · Management Platform" />

      {/* ── FORGOT PASSWORD MODAL ── */}
      <div className={'modal-overlay' + (forgotOpen ? ' show' : '')}>
        <div className="modal-card">
          {!forgotSent ? (
            <div id="forgot-request">
              <div className="modal-icon">
                <svg viewBox="0 0 24 24">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h2>Reset your password</h2>
              <p>Enter your email and we&apos;ll send you the instructions to reset your password.</p>
              <div className="login-field" style={{ textAlign: 'left', marginBottom: '.6rem' }}>
                <label htmlFor="fp-email">Email</label>
                <input
                  type="email"
                  id="fp-email"
                  placeholder="name@h-farmschool.com"
                  autoComplete="email"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={fpEmail}
                  onChange={(e) => setFpEmail(e.target.value)}
                />
              </div>
              <div className={'login-error' + (fpError ? ' visible' : '')} style={{ textAlign: 'left' }}>
                {fpError || 'Please enter a valid email address.'}
              </div>
              <Turnstile ref={forgotTs} style={{ marginBottom: '.7rem' }} />
              <button className="btn-login" onClick={sendReset}>
                Send reset link
              </button>
              <p className="login-alt" style={{ border: 'none', paddingTop: '.7rem', marginTop: '.4rem' }}>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    closeForgot();
                  }}
                >
                  Cancel
                </a>
              </p>
            </div>
          ) : (
            <div id="forgot-sent">
              <div className="modal-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
                  <polyline points="22 7 13.5 13 2 7" />
                  <polyline points="16 19 18.5 21.5 23 16.5" />
                </svg>
              </div>
              <h2>Check your inbox</h2>
              <p>
                We&apos;ve sent reset instructions to <strong>{fpEmail}</strong>. Follow the link in the email to set a
                new password.
              </p>
              <button className="btn-login" onClick={closeForgot}>
                Got it
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
