'use client';
/* My profile — every role except guest. The signed-in user can change
   name, surname, profile picture and password, and request an email
   change (confirmed by a link sent by Supabase through Resend).
   See src/lib/profile.ts and supabase/migrations/0012_my_profile.sql. */
import React, { useEffect, useRef, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Topbar from '@/components/Topbar';
import { useToast } from '@/components/useToast';
import { type MfaStatus, forgetMyDevices, getMfaStatus, myTrustedDevicesCount, removeFactor } from '@/lib/mfa';
import { trustedDeviceExpiry } from '@/lib/trustedDevice';
import { type UiPrefs, SIZE_OPTIONS, autoZoom, readUiPrefs, saveUiPrefs } from '@/lib/uiPrefs';
import {
  type MyProfile,
  changeMyPassword,
  loadMyProfile,
  makeAvatar,
  requestEmailChange,
  updateMyAvatar,
  updateMyName,
} from '@/lib/profile';

const ALL_BUT_GUEST = ['owner', 'superadmin', 'admin', 'it', 'hr', 'boarding', 'office', 'parent'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  superadmin: 'Super Admin',
  admin: 'Admin',
  it: 'IT',
  hr: 'HR',
  boarding: 'Boarding',
  office: 'Student Office',
  parent: 'Parent',
};

/* ── Icons ─────────────────────────────────────────────────────── */
const IconUser = (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
  </svg>
);
const IconCamera = (
  <svg viewBox="0 0 24 24">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);
const IconLock = (
  <svg viewBox="0 0 24 24">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const IconMail = (
  <svg viewBox="0 0 24 24">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);
const IconEye = (
  <svg viewBox="0 0 24 24">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

function initials(p: MyProfile): string {
  const n = [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || p.email;
  const parts = n.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export default function ProfileClient() {
  const { showToast, toastNode } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [me, setMe] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);

  const [mfa, setMfa] = useState<MfaStatus | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [devCount, setDevCount] = useState(0);
  const [ui, setUi] = useState<UiPrefs>(() => (typeof window === 'undefined' ? { size: 'auto', width: 'full' } : readUiPrefs()));
  const changeUi = (patch: Partial<UiPrefs>) => {
    const next = { ...ui, ...patch };
    setUi(next);
    saveUiPrefs(next);
  };
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  const [emailOpen, setEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newEmail2, setNewEmail2] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  // Back from the confirmation link of an email change (read once, on mount;
  // the content renders only after AuthGuard, so there is no hydration mismatch).
  const [emailNotice] = useState(() => {
    if (typeof window === 'undefined') return '';
    const msg = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('message');
    if (msg) return msg;
    return new URLSearchParams(window.location.search).get('email_changed') ? 'Indirizzo email confermato.' : '';
  });

  useEffect(() => {
    let active = true;
    getMfaStatus()
      .then((m) => active && setMfa(m))
      .catch(() => active && setMfa(null));
    myTrustedDevicesCount().then((n) => active && setDevCount(n));
    loadMyProfile().then((p) => {
      if (!active) return;
      setMe(p);
      setFirst(p?.first_name ?? '');
      setLast(p?.last_name ?? '');
      setLoading(false);
    });
    // Clean the confirmation parameters from the address bar.
    if (window.location.search.includes('email_changed') || window.location.hash.includes('message=')) {
      window.history.replaceState(null, '', '/profile');
    }
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && !savingEmail) setEmailOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [savingEmail]);

  const nameChanged = !!me && (first.trim() !== (me.first_name ?? '') || last.trim() !== (me.last_name ?? ''));

  async function saveName() {
    if (!me) return;
    setSavingName(true);
    try {
      await updateMyName(first, last);
      setMe({ ...me, first_name: first.trim() || null, last_name: last.trim() || null });
      showToast('Dati salvati ✓');
    } catch (e) {
      showToast((e as Error).message, true);
    }
    setSavingName(false);
  }

  async function pickAvatar(file: File | undefined) {
    if (!file || !me) return;
    setSavingAvatar(true);
    try {
      const avatar = await makeAvatar(file);
      await updateMyAvatar(avatar);
      setMe({ ...me, avatar });
      showToast('Foto profilo aggiornata ✓');
    } catch (e) {
      showToast((e as Error).message, true);
    }
    setSavingAvatar(false);
  }

  async function removeAvatar() {
    if (!me) return;
    setSavingAvatar(true);
    try {
      await updateMyAvatar(null);
      setMe({ ...me, avatar: null });
      showToast('Foto profilo rimossa');
    } catch (e) {
      showToast((e as Error).message, true);
    }
    setSavingAvatar(false);
  }

  async function dropFactor(id: string) {
    if (!mfa) return;
    if (mfa.required && mfa.factors.length <= 1) {
      showToast('Il tuo ruolo richiede la MFA: aggiungi prima un’altra app, poi rimuovi questa.', true);
      return;
    }
    if (!mfa.aal2) {
      showToast('Per rimuoverla devi aver inserito il codice in questa sessione: esci, rientra senza “Ricorda dispositivo” e riprova.', true);
      return;
    }
    setMfaBusy(true);
    try {
      await removeFactor(id);
      setMfa({ ...mfa, factors: mfa.factors.filter((f) => f.id !== id) });
      showToast('App di autenticazione rimossa');
    } catch (e) {
      showToast((e as Error).message, true);
    }
    setMfaBusy(false);
  }

  async function forgetDevices() {
    setMfaBusy(true);
    try {
      const n = await forgetMyDevices();
      setDevCount(0);
      showToast(n ? `Dispositivi dimenticati: ${n}. Al prossimo accesso ti verrà chiesto il codice.` : 'Nessun dispositivo da dimenticare');
    } catch (e) {
      showToast((e as Error).message, true);
    }
    setMfaBusy(false);
  }

  async function savePassword() {
    if (pwd.length < 8) return showToast('La password deve avere almeno 8 caratteri.', true);
    if (pwd !== pwd2) return showToast('Le due password non coincidono.', true);
    setSavingPwd(true);
    try {
      await changeMyPassword(pwd);
      setPwd('');
      setPwd2('');
      showToast('Password aggiornata ✓');
    } catch (e) {
      showToast((e as Error).message, true);
    }
    setSavingPwd(false);
  }

  async function submitEmailChange() {
    if (!me) return;
    const a = newEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(a)) return showToast('Inserisci un indirizzo email valido.', true);
    if (a !== newEmail2.trim().toLowerCase()) return showToast('I due indirizzi non coincidono.', true);
    if (a === me.email.toLowerCase()) return showToast('È già il tuo indirizzo attuale.', true);
    setSavingEmail(true);
    try {
      await requestEmailChange(a);
      setMe({ ...me, pending_email: a });
      setEmailOpen(false);
      setNewEmail('');
      setNewEmail2('');
      showToast('Email di conferma inviata ✓');
    } catch (e) {
      showToast((e as Error).message, true);
    }
    setSavingEmail(false);
  }

  return (
    <AuthGuard roles={ALL_BUT_GUEST}>
      <Topbar label="Home" href="/" variant="back" />
      <div className="budget-page pf-page">
        <div className="shell shell--narrow">
          <div className="b-head">
            <div className="b-head-left">
              <div className="logo">{IconUser}</div>
              <div>
                <p className="b-eyebrow">Account</p>
                <h1>
                  My <em>profile</em>
                </h1>
                <p>Dati personali, foto profilo, email e password</p>
              </div>
            </div>
          </div>

          {emailNotice ? <div className="pf-banner ok">{emailNotice}</div> : null}

          {loading || !me ? (
            <div className="skeleton" />
          ) : (
            <>
              {/* ── Identity + picture ── */}
              <section className="hero pf-card pf-identity">
                <div className="pf-avatar-wrap">
                  {me.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="pf-avatar" src={me.avatar} alt="Foto profilo" />
                  ) : (
                    <div className="pf-avatar pf-initials" aria-hidden="true">
                      {initials(me)}
                    </div>
                  )}
                  <button
                    type="button"
                    className="pf-avatar-btn"
                    onClick={() => fileRef.current?.click()}
                    disabled={savingAvatar}
                    aria-label="Carica una foto profilo"
                    title="Carica una foto profilo"
                  >
                    {IconCamera}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      void pickAvatar(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </div>
                <div className="pf-id-text">
                  <div className="pf-name">{[me.first_name, me.last_name].filter(Boolean).join(' ') || 'Senza nome'}</div>
                  <div className="pf-email">{me.email}</div>
                  {me.role ? <span className="pf-role">{ROLE_LABEL[me.role] ?? me.role}</span> : null}
                  <div className="pf-avatar-actions">
                    <button className="btn-quiet" onClick={() => fileRef.current?.click()} disabled={savingAvatar}>
                      {IconCamera}
                      {savingAvatar ? 'Caricamento…' : me.avatar ? 'Cambia foto' : 'Carica foto'}
                    </button>
                    {me.avatar ? (
                      <button className="btn-quiet" onClick={removeAvatar} disabled={savingAvatar}>
                        Rimuovi
                      </button>
                    ) : null}
                  </div>
                </div>
              </section>

              {/* ── Personal data ── */}
              <h2 className="section-label">Dati personali</h2>
              <section className="hero pf-card">
                <div className="pf-row2">
                  <div className="field">
                    <label htmlFor="pf-first">Nome</label>
                    <input id="pf-first" type="text" value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" />
                  </div>
                  <div className="field">
                    <label htmlFor="pf-last">Cognome</label>
                    <input id="pf-last" type="text" value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="pf-email">Email</label>
                  <div className="pf-email-row">
                    <input id="pf-email" type="text" value={me.email} readOnly disabled />
                    <button className="btn-quiet" onClick={() => setEmailOpen(true)}>
                      {IconMail}
                      Cambia email
                    </button>
                  </div>
                  {me.pending_email ? (
                    <p className="pf-pending">
                      In attesa di conferma: <strong>{me.pending_email}</strong>. Apri il link che ti abbiamo inviato per completare il
                      cambio.
                    </p>
                  ) : null}
                </div>
                <div className="pf-actions">
                  <button className="btn-primary" onClick={saveName} disabled={!nameChanged || savingName}>
                    {savingName ? 'Salvataggio…' : 'Salva modifiche'}
                  </button>
                </div>
              </section>

              {/* ── Two-factor authentication ── */}
              <h2 className="section-label">Autenticazione a due fattori</h2>
              <section className="hero pf-card">
                {mfa === null ? (
                  <p className="pf-mfa-text">Stato non disponibile.</p>
                ) : (
                  <>
                    <div className="pf-mfa-head">
                      <span className={'pf-mfa-badge' + (mfa.factors.length ? ' on' : '')}>
                        {mfa.factors.length ? 'Attiva' : 'Non attiva'}
                      </span>
                      <p className="pf-mfa-text">
                        {mfa.required
                          ? 'Obbligatoria per il tuo ruolo: all’accesso ti viene chiesto il codice dell’app (salvo sui dispositivi ricordati).'
                          : 'Facoltativa per il tuo ruolo, ma consigliata: protegge l’account anche se qualcuno scopre la password.'}
                      </p>
                    </div>
                    {mfa.factors.length ? (
                      <ul className="pf-mfa-list">
                        {mfa.factors.map((f) => (
                          <li key={f.id}>
                            <span>
                              {f.friendly_name || 'Authenticator'}
                              <small> · dal {new Date(f.created_at).toLocaleDateString('it-IT')}</small>
                            </span>
                            <button className="btn-quiet" onClick={() => dropFactor(f.id)} disabled={mfaBusy}>
                              Rimuovi
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="pf-actions">
                      {mfa.factors.length < 2 ? (
                        <a className="btn-primary pf-link-btn" href="/mfa?setup=1">
                          {IconLock}
                          {mfa.factors.length ? 'Aggiungi un secondo telefono' : 'Attiva la MFA'}
                        </a>
                      ) : null}
                    </div>
                    {mfa.factors.length === 1 ? (
                      <p className="pf-mfa-hint">Consiglio: registra anche un secondo telefono, così non resti bloccato se perdi il primo.</p>
                    ) : null}
                    {devCount > 0 || (me && trustedDeviceExpiry(me.id)) ? (
                      <div className="pf-mfa-devices">
                        <p className="pf-mfa-text">
                          {devCount === 1 ? '1 dispositivo ricordato' : `${devCount} dispositivi ricordati`}
                          {me && trustedDeviceExpiry(me.id)
                            ? ` · questo browser fino al ${trustedDeviceExpiry(me.id)!.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                            : ''}
                        </p>
                        <button className="btn-quiet" onClick={forgetDevices} disabled={mfaBusy}>
                          Dimentica i dispositivi
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </section>

              {/* ── Password ── */}
              {/* ── Display ── */}
              <h2 className="section-label">Aspetto</h2>
              <section className="hero pf-card">
                <p className="pf-mfa-text">
                  Valgono solo su questo browser. Con &laquo;Automatica&raquo; la piattaforma si ingrandisce da sola sugli schermi
                  grandi (ora: {Math.round(autoZoom(typeof window === 'undefined' ? 1440 : window.innerWidth) * 100)} %).
                </p>
                <div className="pf-ui-label">Dimensione dell&apos;interfaccia</div>
                <div className="pf-seg" role="radiogroup" aria-label="Dimensione dell'interfaccia">
                  {SIZE_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={ui.size === o.value}
                      className={ui.size === o.value ? 'on' : ''}
                      onClick={() => changeUi({ size: o.value })}
                    >
                      <b>{o.label}</b>
                      <small>{o.hint}</small>
                    </button>
                  ))}
                </div>
                <div className="pf-ui-label">Larghezza del contenuto</div>
                <div className="pf-seg" role="radiogroup" aria-label="Larghezza del contenuto">
                  <button type="button" role="radio" aria-checked={ui.width === 'full'} className={ui.width === 'full' ? 'on' : ''} onClick={() => changeUi({ width: 'full' })}>
                    <b>Piena</b>
                    <small>usa tutto lo schermo</small>
                  </button>
                  <button type="button" role="radio" aria-checked={ui.width === 'centered'} className={ui.width === 'centered' ? 'on' : ''} onClick={() => changeUi({ width: 'centered' })}>
                    <b>Centrata</b>
                    <small>colonna centrale sugli schermi larghi</small>
                  </button>
                </div>
              </section>

              <h2 className="section-label">Password</h2>
              <section className="hero pf-card">
                <div className="pf-row2">
                  <div className="field">
                    <label htmlFor="pf-pwd">Nuova password</label>
                    <input
                      id="pf-pwd"
                      type={showPwd ? 'text' : 'password'}
                      value={pwd}
                      onChange={(e) => setPwd(e.target.value)}
                      autoComplete="new-password"
                      placeholder="Almeno 8 caratteri"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="pf-pwd2">Conferma password</label>
                    <input
                      id="pf-pwd2"
                      type={showPwd ? 'text' : 'password'}
                      value={pwd2}
                      onChange={(e) => setPwd2(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <div className="pf-actions">
                  <button type="button" className="btn-quiet" onClick={() => setShowPwd((v) => !v)}>
                    {IconEye}
                    {showPwd ? 'Nascondi' : 'Mostra'}
                  </button>
                  <button className="btn-primary" onClick={savePassword} disabled={!pwd || !pwd2 || savingPwd}>
                    {IconLock}
                    {savingPwd ? 'Aggiornamento…' : 'Aggiorna password'}
                  </button>
                </div>
              </section>
            </>
          )}

          <footer className="b-footer">
            H-FARM International School · Management Platform — My profile
            <span>Via Adriano Olivetti 1 - 31056 Roncade (TV)</span>
          </footer>
        </div>

        {/* ── Email change dialog ── */}
        {emailOpen && me ? (
          <div
            className="b-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Cambia indirizzo email"
            onMouseDown={(ev) => {
              if (ev.target === ev.currentTarget && !savingEmail) setEmailOpen(false);
            }}
          >
            <div className="b-modal" style={{ maxWidth: 460 }}>
              <div className="b-modal-head">
                <div className="mi">{IconMail}</div>
                <div>
                  <h2>Cambia email</h2>
                  <p>Ti invieremo un link per confermare</p>
                </div>
              </div>
              <div className="b-modal-body">
                <p className="pf-modal-text">
                  Indirizzo attuale: <strong>{me.email}</strong>. Il cambio avviene solo dopo che avrai aperto il link di conferma
                  ricevuto via email; fino ad allora accedi con l&apos;indirizzo attuale.
                </p>
                <div className="field">
                  <label htmlFor="pf-new-email">Nuovo indirizzo email</label>
                  <input
                    id="pf-new-email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    autoComplete="email"
                    autoCapitalize="off"
                    spellCheck={false}
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label htmlFor="pf-new-email2">Ripeti il nuovo indirizzo</label>
                  <input
                    id="pf-new-email2"
                    type="email"
                    value={newEmail2}
                    onChange={(e) => setNewEmail2(e.target.value)}
                    autoComplete="email"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                </div>
              </div>
              <div className="b-modal-foot">
                <button className="btn-quiet" onClick={() => setEmailOpen(false)} disabled={savingEmail}>
                  Annulla
                </button>
                <button className="btn-primary" onClick={submitEmailChange} disabled={savingEmail || !newEmail || !newEmail2}>
                  {savingEmail ? 'Invio…' : 'Invia conferma'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {toastNode}
      </div>

      <style>{`
        .pf-page .pf-card { padding: 1.4rem 1.5rem; }
        .pf-page .pf-ui-label { font-size: 12px; font-weight: 700; color: var(--b-muted); margin: 1.1rem 0 .5rem; }
        .pf-page .pf-seg { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
        .pf-page .pf-seg button { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 10px 12px; border-radius: 11px; border: 1.5px solid var(--b-line); background: #fff; font: inherit; cursor: pointer; text-align: left; }
        .pf-page .pf-seg button b { font-size: 13.5px; color: var(--b-ink); }
        .pf-page .pf-seg button small { font-size: 11.5px; color: var(--b-muted); }
        .pf-page .pf-seg button.on { border-color: var(--brand); background: var(--brand-light); }
        .pf-page .pf-seg button.on b { color: var(--brand); }
        .pf-page .pf-identity { display: flex; align-items: center; gap: 1.4rem; flex-wrap: wrap; }
        .pf-page .pf-avatar-wrap { position: relative; width: 104px; height: 104px; flex-shrink: 0; }
        .pf-page .pf-avatar { width: 104px; height: 104px; border-radius: 50%; object-fit: cover; display: block; box-shadow: 0 0 0 4px #fff, 0 6px 18px rgba(139, 26, 43, .18); }
        .pf-page .pf-initials { display: flex; align-items: center; justify-content: center; font-size: 34px; font-weight: 800; color: #fff; background: linear-gradient(140deg, var(--brand-mid) -10%, var(--brand) 50%, var(--brand-deep) 120%); letter-spacing: -.02em; }
        .pf-page .pf-avatar-btn { position: absolute; right: -2px; bottom: -2px; width: 36px; height: 36px; border-radius: 50%; border: 3px solid #fff; background: var(--brand); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 12px rgba(139, 26, 43, .35); }
        .pf-page .pf-avatar-btn svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
        .pf-page .pf-avatar-btn:disabled { opacity: .6; cursor: wait; }
        .pf-page .pf-id-text { min-width: 0; flex: 1; }
        .pf-page .pf-name { font-size: 20px; font-weight: 800; letter-spacing: -.02em; }
        .pf-page .pf-email { font-size: 13.5px; color: var(--b-muted); word-break: break-all; }
        .pf-page .pf-role { display: inline-block; margin-top: 6px; font-size: 10.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--brand); background: var(--brand-light); border-radius: 999px; padding: 3px 10px; }
        .pf-page .pf-avatar-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: .9rem; }
        .pf-page .pf-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .pf-page .pf-email-row { display: flex; gap: 10px; align-items: center; }
        .pf-page .pf-email-row input { flex: 1; min-width: 0; }
        .pf-page .pf-email-row .btn-quiet { flex-shrink: 0; }
        .pf-page input:disabled { opacity: .75; cursor: not-allowed; }
        .pf-page .pf-pending { font-size: 12.5px; color: var(--b-warn); background: #FFF3E4; border-radius: 10px; padding: .55rem .8rem; margin-top: .6rem; line-height: 1.45; }
        .pf-page .pf-actions { display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; margin-top: .4rem; }
        .pf-page .pf-banner { font-size: 13.5px; font-weight: 600; border-radius: 13px; padding: .75rem 1rem; margin-bottom: 1rem; }
        .pf-page .pf-banner.ok { background: #EAF3DE; color: #3B6D11; }
        .pf-page .pf-mfa-head { display: flex; gap: 12px; align-items: flex-start; }
        .pf-page .pf-mfa-badge { flex-shrink: 0; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; border-radius: 999px; padding: 4px 10px; background: #FFF3E4; color: var(--b-warn); }
        .pf-page .pf-mfa-badge.on { background: #EAF3DE; color: #3B6D11; }
        .pf-page .pf-mfa-text { font-size: 13.5px; color: var(--b-muted); line-height: 1.5; }
        .pf-page .pf-mfa-list { list-style: none; margin: 1rem 0 .4rem; padding: 0; }
        .pf-page .pf-mfa-list li { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: .6rem 0; border-top: 1px solid var(--b-line); font-size: 14px; font-weight: 600; }
        .pf-page .pf-mfa-list small { font-weight: 500; color: var(--b-muted); }
        .pf-page .pf-mfa-devices { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: .9rem; padding-top: .8rem; border-top: 1px solid var(--b-line); }
        .pf-page .pf-mfa-hint { font-size: 12.5px; color: var(--b-muted); margin-top: .6rem; }
        .pf-page .pf-link-btn { text-decoration: none; }
        .pf-page .pf-modal-text { font-size: 13.5px; color: var(--b-muted); line-height: 1.5; margin-bottom: 1rem; }
        @media (max-width: 560px) {
          .pf-page .pf-row2 { grid-template-columns: 1fr; }
          .pf-page .pf-email-row { flex-direction: column; align-items: stretch; }
        }
      `}</style>
    </AuthGuard>
  );
}
