'use client';
/* IT → Accessori smarriti → new report.
   Student or employee first (like the device forms), details (QR scan
   for students), the lost accessories (one or more), notes. Sent to the
   flow WITH names; the history keeps only email + accessories (see
   src/lib/lostAccessories.ts and migration 0023). */
import React, { useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import QrScanner from '@/components/QrScanner';
import { useToast } from '@/components/useToast';
import { ACCESSORIES, type AccessoryCode, type PersonType, submitLostAccessories } from '@/lib/lostAccessories';
import { DEV_ICONS, DETAIL_ICONS } from '@/lib/deviceIcons';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ORGS = ['H-INTERNATIONAL SCHOOL SRL', 'H-INTERNATIONAL SCHOOL VICENZA SRL', 'H-INTERNATIONAL SCHOOL ROSÀ SRL'];

const PEOPLE: { value: PersonType; label: string; sub: string; icon: React.ReactNode }[] = [
  { value: 'student', label: 'Studente', sub: 'Student', icon: DETAIL_ICONS.student },
  { value: 'employee', label: 'Dipendente', sub: 'Employee', icon: DETAIL_ICONS.briefcase },
];
const ACC_ICON: Record<AccessoryCode, React.ReactNode> = {
  mac_charger: DEV_ICONS.charger,
  ipad_charger: DEV_ICONS.charger,
  mac_magsafe_cable: DEV_ICONS.cable,
  ipad_usbc_cable: DEV_ICONS.cable,
};

const Req = () => (
  <span className="f-req" aria-hidden="true">
    *
  </span>
);
const Err = ({ msg }: { msg?: string }) =>
  msg ? (
    <small className="f-err" role="alert">
      {msg}
    </small>
  ) : null;

const onActivate = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fn();
  }
};

export default function LostAccessoryFormClient() {
  const { showToast, toastNode } = useToast();
  const [type, setType] = useState<PersonType | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [email1, setEmail1] = useState('');
  const [email2, setEmail2] = useState('');
  const [org, setOrg] = useState('');
  const [items, setItems] = useState<AccessoryCode[]>([]);
  const [notes, setNotes] = useState('');
  const [banner, setBanner] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ logged: boolean } | null>(null);

  const student = type === 'student';

  function validate(): [string, string][] {
    const e: [string, string][] = [];
    if (!type) e.push(['type', 'Scegli studente o dipendente.']);
    if (!firstName.trim()) e.push(['firstName', 'Inserisci il nome.']);
    if (!lastName.trim()) e.push(['lastName', 'Inserisci il cognome.']);
    if (!email.trim()) e.push(['email', 'Inserisci l’email.']);
    else if (!EMAIL_RE.test(email.trim())) e.push(['email', 'Email non valida.']);
    if (student) {
      if (!email1.trim()) e.push(['parent1', 'Inserisci l’email del genitore 1.']);
      else if (!EMAIL_RE.test(email1.trim())) e.push(['parent1', 'Email non valida.']);
      if (email2.trim() && !EMAIL_RE.test(email2.trim())) e.push(['parent2', 'Email non valida.']);
    }
    if (items.length === 0) e.push(['items', 'Seleziona almeno un accessorio smarrito.']);
    return e;
  }
  const errors: Record<string, string> = tried ? Object.fromEntries(validate()) : {};
  const bad = (k: string) => (errors[k] ? ' f-bad' : '');

  function handleQr(raw: string): boolean {
    try {
      const d = JSON.parse(raw) as Record<string, string>;
      if (d.nome === undefined) return false;
      setType('student');
      if (d.nome) setFirstName(d.nome);
      if (d.cognome) setLastName(d.cognome);
      if (d.email) setEmail(d.email);
      if (d.email1) setEmail1(d.email1);
      if (d.email2) setEmail2(d.email2);
      if (d.scuola) {
        const match = ORGS.find((o) => o.toLowerCase().includes(d.scuola.toLowerCase()));
        if (match) setOrg(match);
      }
      setBanner(`Dati caricati: ${d.nome || ''} ${d.cognome || ''}`.trim());
      window.setTimeout(() => setBanner(''), 6000);
      showToast('QR letto ✓');
      return true;
    } catch {
      return false;
    }
  }

  const toggle = (c: AccessoryCode) => setItems((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));

  function reset() {
    setType(null);
    setFirstName('');
    setLastName('');
    setEmail('');
    setEmail1('');
    setEmail2('');
    setOrg('');
    setItems([]);
    setNotes('');
    setTried(false);
    setDone(null);
    window.scrollTo(0, 0);
  }

  async function handleSubmit() {
    const missing = validate();
    if (missing.length) {
      setTried(true);
      showToast(missing.length === 1 ? missing[0][1] : `Compila tutti i campi obbligatori (${missing.length} mancanti).`, true);
      document.querySelector(`[data-req="${missing[0][0]}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!type) return;
    setBusy(true);
    try {
      const res = await submitLostAccessories({
        personType: type,
        firstName,
        lastName,
        email,
        parentEmail1: email1,
        parentEmail2: email2,
        school: org,
        accessories: items,
        notes,
      });
      setDone({ logged: res.logged });
      if (!res.logged) console.error('lost_accessories_log insert failed', res.error);
      window.scrollTo(0, 0);
    } catch (e) {
      showToast('Invio non riuscito: ' + (e as Error).message, true);
    }
    setBusy(false);
  }

  return (
    <AuthGuard roles={['it', 'admin']} perm="it.lost_accessories">
      <div className="form-page">
        <Link className="back-link" href="/lost-accessories">
          <svg viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Torna ad Accessori smarriti
        </Link>

        <div className="page-header la-header">
          <div className="logo">{DEV_ICONS.charger}</div>
          <div>
            <span className="op-eyebrow">IT · Accessori smarriti</span>
            <h1>Segnala accessori smarriti</h1>
            <p>Alimentatori e cavi persi da uno studente o da un dipendente</p>
          </div>
        </div>

        {done ? (
          <div className="form-wrap">
            <div className="section la-done">
              <div className="la-done-ic">✓</div>
              <h2>Segnalazione inviata</h2>
              <p>
                {done.logged
                  ? 'La segnalazione è stata inviata ed è stata registrata nello storico.'
                  : 'La segnalazione è stata inviata, ma non è stato possibile registrarla nello storico. Avvisa l’amministratore della piattaforma.'}
              </p>
              <div className="la-done-actions">
                <button type="button" className="btn-ghost" onClick={reset}>
                  Nuova segnalazione
                </button>
                <Link className="submit-btn la-link" href="/lost-accessories">
                  Vai allo storico
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="form-wrap">
            {/* Student or employee */}
            <div className={'section' + bad('type')} data-req="type">
              <div className="section-title">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
                </svg>
                Chi ha smarrito gli accessori? <Req />
              </div>
              <div className="big-selector">
                {PEOPLE.map((p) => (
                  <div
                    key={p.value}
                    className={'big-option' + (type === p.value ? ' selected' : '')}
                    role="button"
                    tabIndex={0}
                    aria-pressed={type === p.value}
                    onClick={() => setType(p.value)}
                    onKeyDown={onActivate(() => setType(p.value))}
                  >
                    {p.icon}
                    <span className="opt-label">{p.label}</span>
                    <span className="opt-sub">{p.sub}</span>
                  </div>
                ))}
              </div>
              <Err msg={errors.type} />
            </div>

            {type ? (
              <>
                {student ? (
                  <QrScanner
                    onScan={handleQr}
                    onError={(m) => showToast(m, true)}
                    hint="Inquadra il QR della card dello studente"
                    title="Scansiona il QR dello studente (facoltativo)"
                    banner={banner}
                  />
                ) : null}

                {/* Details */}
                <div className="section">
                  <div className="section-title">
                    {student ? DETAIL_ICONS.student : DETAIL_ICONS.briefcase}
                    {student ? 'Dati dello studente' : 'Dati del dipendente'}
                  </div>
                  <div className="row2">
                    <div className={'field' + bad('firstName')} data-req="firstName">
                      <label>
                        Nome <Req />
                      </label>
                      <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="es. Marco" />
                      <Err msg={errors.firstName} />
                    </div>
                    <div className={'field' + bad('lastName')} data-req="lastName">
                      <label>
                        Cognome <Req />
                      </label>
                      <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="es. Rossi" />
                      <Err msg={errors.lastName} />
                    </div>
                  </div>
                  <div className={'field' + bad('email')} data-req="email">
                    <label>
                      {student ? 'Email dello studente' : 'Email aziendale'} <Req />
                    </label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={student ? 'studente@h-farmschool.com' : 'nome.cognome@h-farmschool.com'} />
                    <Err msg={errors.email} />
                  </div>
                  <div className="field">
                    <label>
                      {student ? 'Scuola' : 'Società'} <span style={{ fontWeight: 400 }}>(facoltativo)</span>
                    </label>
                    <select value={org} onChange={(e) => setOrg(e.target.value)}>
                      <option value="">—</option>
                      {ORGS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {student ? (
                  <div className="section">
                    <div className="section-title">
                      <svg viewBox="0 0 24 24">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                        <polyline points="22,6 12,13 2,6" />
                      </svg>
                      Email dei genitori
                    </div>
                    <div className={'field' + bad('parent1')} data-req="parent1">
                      <label>
                        Email genitore 1 <Req />
                      </label>
                      <input type="email" value={email1} onChange={(e) => setEmail1(e.target.value)} placeholder="genitore1@email.com" />
                      <Err msg={errors.parent1} />
                    </div>
                    <div className={'field' + bad('parent2')} data-req="parent2">
                      <label>
                        Email genitore 2 <span style={{ fontWeight: 400 }}>(facoltativo)</span>
                      </label>
                      <input type="email" value={email2} onChange={(e) => setEmail2(e.target.value)} placeholder="genitore2@email.com" />
                      <Err msg={errors.parent2} />
                    </div>
                  </div>
                ) : null}

                {/* Accessories */}
                <div className={'section' + bad('items')} data-req="items">
                  <div className="section-title">
                    {DEV_ICONS.charger}
                    Accessori smarriti <Req />
                  </div>
                  <p className="la-hint">Puoi selezionarne più di uno.</p>
                  <div className="device-grid">
                    {ACCESSORIES.map((a) => (
                      <div
                        key={a.code}
                        className={'device-item' + (items.includes(a.code) ? ' selected' : '')}
                        role="checkbox"
                        aria-checked={items.includes(a.code)}
                        tabIndex={0}
                        onClick={() => toggle(a.code)}
                        onKeyDown={onActivate(() => toggle(a.code))}
                      >
                        {ACC_ICON[a.code]}
                        <span className="dev-name">{a.label}</span>
                      </div>
                    ))}
                  </div>
                  <Err msg={errors.items} />
                  <div className="field" style={{ marginTop: '.9rem', marginBottom: 0 }}>
                    <label>
                      Note <span style={{ fontWeight: 400 }}>(facoltativo)</span>
                    </label>
                    <textarea rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Es. dove o quando è stato perso" />
                  </div>
                </div>

                {tried && Object.keys(errors).length ? (
                  <div className="f-missing" role="alert">
                    {Object.keys(errors).length === 1 ? 'Manca 1 campo obbligatorio.' : `Mancano ${Object.keys(errors).length} campi obbligatori.`} Il modulo non può
                    essere inviato finché non è tutto compilato.
                  </div>
                ) : null}
                <button className="submit-btn" onClick={handleSubmit} disabled={busy}>
                  <svg viewBox="0 0 24 24">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  {busy ? 'Invio…' : 'Invia segnalazione'}
                </button>
              </>
            ) : null}
          </div>
        )}
        {toastNode}
      </div>
    </AuthGuard>
  );
}
