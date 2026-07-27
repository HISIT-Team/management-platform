'use client';
/* Special Diet Request (parents). Port of special-diet-request.html (form_type 'diet'). */
import React, { useRef, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import SignaturePad, { type SignaturePadHandle } from '@/components/SignaturePad';
import { useToast } from '@/components/useToast';
import { submitForm } from '@/lib/auth';

const CLASSES = ['Honey Bees', 'Busy Bess', 'Reception Rockets', 'PYP 1', 'PYP 2', 'PYP 3', 'PYP 4', 'PYP 5', 'MYP 1', 'MYP 2', 'MYP 3', 'MYP 4', 'MYP 5', 'DP 1', 'DP 2'];

const MENU: { key: string; label: string; node: React.ReactNode }[] = [
  { key: 'medical', label: 'Special menu for medical reasons', node: (<>Special menu for medical reasons - <strong>MEDICAL CERTIFICATE REQUIRED</strong></>) },
  { key: 'no_pork', label: 'NO pork', node: 'NO pork' },
  { key: 'no_beef', label: 'NO beef', node: 'NO beef' },
  { key: 'no_horse', label: 'NO horse', node: 'NO horse' },
  { key: 'no_meat', label: 'NO meat', node: 'NO meat' },
  { key: 'vegetarian', label: 'Vegetarian (NO meat, fish)', node: 'Vegetarian (NO meat, fish)' },
  { key: 'vegan', label: 'Vegan (NO meat, fish, dairy products, eggs)', node: 'Vegan (NO meat, fish, dairy products, eggs)' },
  { key: 'lacto_vegetarian', label: 'Lacto-vegetarian (NO meat, fish, eggs)', node: 'Lacto-vegetarian (NO meat, fish, eggs)' },
  { key: 'egg_vegetarian', label: 'Egg-vegetarian (NO meat, fish, dairy products)', node: 'Egg-vegetarian (NO meat, fish, dairy products)' },
];
const MENU_LABELS: Record<string, string> = Object.fromEntries(MENU.map((m) => [m.key, m.label]));

interface CertFile {
  name: string;
  type: string;
  data: string;
}

const Check = () => (
  <span className="custom-check">
    <svg viewBox="0 0 12 12">
      <polyline points="2 6 5 9 10 3" />
    </svg>
  </span>
);
const Dot = () => <span className="custom-dot" />;

export default function SpecialDietClient() {
  const { showToast, toastNode } = useToast();
  const [parent, setParent] = useState({ surname: '', name: '', email: '', phone: '' });
  const [stud, setStud] = useState({ surname: '', name: '', dob: '', klass: '' });
  const [history, setHistory] = useState<string | null>(null);
  const [menuKeys, setMenuKeys] = useState<string[]>([]);
  const [certFile, setCertFile] = useState<CertFile | null>(null);
  const [privacy1, setPrivacy1] = useState<string | null>(null);
  const [privacy2, setPrivacy2] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sig = useRef<SignaturePadHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const medical = menuKeys.includes('medical');

  function toggleMenu(key: string) {
    setMenuKeys((keys) => {
      const next = keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
      if (!next.includes('medical')) clearFileState();
      return next;
    });
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      showToast('File too large (max 10 MB).', true);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCertFile({ name: f.name, type: f.type, data: reader.result as string });
    reader.readAsDataURL(f);
  }
  function clearFileState() {
    setCertFile(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function handleSubmit() {
    if (!parent.surname.trim() || !parent.name.trim()) return showToast('Please enter the parent / guardian name.', true);
    if (!parent.email.trim()) return showToast('Please enter the parent / guardian email.', true);
    if (!parent.phone.trim()) return showToast('Please enter the parent / guardian phone number.', true);
    if (!stud.surname.trim() || !stud.name.trim()) return showToast('Please enter the student name.', true);
    if (!stud.dob) return showToast("Please enter the student's date of birth.", true);
    if (!stud.klass) return showToast('Please select the class.', true);
    if (!history) return showToast('Please answer the diet history question.', true);
    if (!menuKeys.length) return showToast('Please choose at least one special menu.', true);
    if (medical && !certFile) return showToast('Please upload the medical certificate.', true);
    if (privacy1 !== 'agree') return showToast('You must agree to the processing of personal data to submit.', true);
    if (!privacy2) return showToast('Please answer the marketing consent question.', true);
    if (!sig.current?.hasSig()) return showToast('Please add the parent / guardian signature.', true);

    setBusy(true);
    const payload = {
      form_type: 'special_diet',
      timestamp: new Date().toISOString(),
      parent: { surname: parent.surname.trim(), name: parent.name.trim(), email: parent.email.trim(), phone: parent.phone.trim() },
      student: { surname: stud.surname.trim(), name: stud.name.trim(), date_of_birth: stud.dob, class: stud.klass },
      diet_history: history === 'already' ? 'Had already requested a special diet last school year (2025/2026)' : 'Has never requested a special diet',
      special_menu: menuKeys.map((k) => MENU_LABELS[k] || k).join(', '),
      special_menu_keys: menuKeys.slice(),
      special_menu_labels: menuKeys.map((k) => MENU_LABELS[k] || k),
      medical_certificate: certFile,
      privacy_service_consent: privacy1 === 'agree',
      privacy_marketing_consent: privacy2,
      parent_signature: sig.current.toDataURL(),
    };

    try {
      await submitForm('diet', payload);
      showToast('Request submitted successfully ✓');
      resetForm();
    } catch (e) {
      showToast('Error: ' + (e as Error).message, true);
    }
    setBusy(false);
  }

  function resetForm() {
    setParent({ surname: '', name: '', email: '', phone: '' });
    setStud({ surname: '', name: '', dob: '', klass: '' });
    setHistory(null);
    setMenuKeys([]);
    setPrivacy1(null);
    setPrivacy2(null);
    clearFileState();
    sig.current?.clear();
  }

  return (
    <AuthGuard roles={['parent', 'admin']}>
      <div className="form-page narrow">
        <div className="form-wrap">
          <nav className="form-topbar">
            <Link className="form-back" href="/parents-hub">
              <svg viewBox="0 0 24 24">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Parents Area
            </Link>
          </nav>

          <div className="school-badge">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo_his_noback.png" alt="H-FARM International School" />
            <span>H-FARM International School</span>
          </div>

          <div className="page-header">
            <div className="logo">
              <svg viewBox="0 0 24 24">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                <line x1="6" y1="1" x2="6" y2="4" />
                <line x1="10" y1="1" x2="10" y2="4" />
                <line x1="14" y1="1" x2="14" y2="4" />
              </svg>
            </div>
            <div>
              <h1>Special Diet Request</h1>
              <p>Request a special menu for a student</p>
            </div>
          </div>

          {/* PARENT */}
          <div className="section">
            <div className="section-title">
              <svg viewBox="0 0 24 24">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Parent / Guardian Information
            </div>
            <div className="row2">
              <div className="field">
                <label>Surname *</label>
                <input type="text" placeholder="Surname" value={parent.surname} onChange={(e) => setParent({ ...parent, surname: e.target.value })} />
              </div>
              <div className="field">
                <label>Name *</label>
                <input type="text" placeholder="Name" value={parent.name} onChange={(e) => setParent({ ...parent, name: e.target.value })} />
              </div>
            </div>
            <div className="row2">
              <div className="field">
                <label>Email *</label>
                <input type="email" placeholder="parent@email.com" value={parent.email} onChange={(e) => setParent({ ...parent, email: e.target.value })} />
              </div>
              <div className="field">
                <label>Phone number *</label>
                <input type="tel" placeholder="+39 000 0000000" value={parent.phone} onChange={(e) => setParent({ ...parent, phone: e.target.value })} />
              </div>
            </div>
          </div>

          {/* STUDENT */}
          <div className="section">
            <div className="section-title">
              <svg viewBox="0 0 24 24">
                <path d="M22 10v6M2 10l10-5 10 5-10 5-10-5z" />
                <path d="M6 12v5c3 3 9 3 12 0v-5" />
              </svg>
              Student Information
            </div>
            <div className="row2">
              <div className="field">
                <label>Surname *</label>
                <input type="text" placeholder="Surname" value={stud.surname} onChange={(e) => setStud({ ...stud, surname: e.target.value })} />
              </div>
              <div className="field">
                <label>Name *</label>
                <input type="text" placeholder="Name" value={stud.name} onChange={(e) => setStud({ ...stud, name: e.target.value })} />
              </div>
            </div>
            <div className="row2">
              <div className="field">
                <label>Date of Birth *</label>
                <input type="date" value={stud.dob} onChange={(e) => setStud({ ...stud, dob: e.target.value })} />
              </div>
              <div className="field">
                <label>Class *</label>
                <select value={stud.klass} onChange={(e) => setStud({ ...stud, klass: e.target.value })}>
                  <option value="" disabled>
                    Select class…
                  </option>
                  {CLASSES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* DIET HISTORY */}
          <div className="section">
            <div className="section-title">
              <svg viewBox="0 0 24 24">
                <path d="M12 8v4l3 3" />
                <circle cx="12" cy="12" r="9" />
              </svg>
              Diet History
            </div>
            <div className="consent-block bare">
              <div className="consent-question">
                <span>The student</span>
                <span className="required">*</span>
              </div>
              <div className="consent-options">
                <label className={'consent-option' + (history === 'already' ? ' selected' : '')} onClick={() => setHistory('already')}>
                  <Dot />
                  <span className="option-text">had already requested a special diet last school year (2025/2026).</span>
                </label>
                <label className={'consent-option' + (history === 'never' ? ' selected' : '')} onClick={() => setHistory('never')}>
                  <Dot />
                  <span className="option-text">has never requested a special diet.</span>
                </label>
              </div>
            </div>
          </div>

          {/* PREFERRED MENU */}
          <div className="section">
            <div className="section-title">
              <svg viewBox="0 0 24 24">
                <path d="M3 2v7c0 1.1.9 2 2 2h0a2 2 0 0 0 2-2V2" />
                <path d="M5 2v20M18 2v20M18 8c0-3.3-1.3-6-3-6" />
              </svg>
              Preferred Special Menu
            </div>
            <div className="consent-block bare">
              <div className="consent-question">
                <span>Please choose the preferred special menu. You may select more than one:</span>
                <span className="required">*</span>
              </div>
              <div className="consent-options">
                {MENU.map((m) => (
                  <label key={m.key} className={'consent-option' + (menuKeys.includes(m.key) ? ' selected' : '')} onClick={() => toggleMenu(m.key)}>
                    <Check />
                    <span className="option-text">{m.node}</span>
                  </label>
                ))}
              </div>
            </div>

            {medical && (
              <div style={{ marginTop: '1.1rem' }}>
                <div className="info-note">
                  For special diets based on medical reasons, it is mandatory to provide a certificate updated to 2024 and signed <strong>by a specialist or pediatrician</strong>.{' '}
                  <strong>The certificate must clearly indicate the food not allowed.</strong> Following medical certification, not only the food as is, but also food products in which it may be present as a trace will be excluded from the diet. Any variation to this management should be clearly specified by the physician in the certificate.
                </div>
                <div className="file-block">
                  <div className="consent-question" style={{ marginBottom: '.6rem' }}>
                    <span>Please upload the requested document</span>
                    <span className="required">*</span>
                  </div>
                  <label className="file-drop">
                    <svg viewBox="0 0 24 24">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <div>
                      <div className="file-txt">Add file</div>
                      <div className="file-sub">PDF, JPG or PNG — max 10 MB</div>
                    </div>
                    <input ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf" onChange={onFilePicked} />
                  </label>
                  <span className={'file-chip' + (certFile ? ' show' : '')}>
                    <svg viewBox="0 0 24 24">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>{certFile?.name}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        clearFileState();
                      }}
                    >
                      ×
                    </button>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* PRIVACY */}
          <div className="section">
            <div className="section-title">
              <svg viewBox="0 0 24 24">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              Privacy Policy
            </div>
            <div className="consent-block">
              <div className="consent-question">
                <span>By clicking here, I agree to the processing of my personal data for the purpose of carrying out the service.</span>
                <span className="required">*</span>
              </div>
              <div className="consent-options">
                <label className={'consent-option' + (privacy1 === 'agree' ? ' selected' : '')} onClick={() => setPrivacy1('agree')}>
                  <Check />
                  <span className="option-text">I agree</span>
                </label>
              </div>
            </div>
            <div className="consent-block">
              <div className="consent-question">
                <span>By clicking here, I agree to the processing of my personal data for the purpose of sending advertising and informational materials related to Ristorazione Ottavian via ordinary mail and/or email.</span>
                <span className="required">*</span>
              </div>
              <div className="consent-options">
                <label className={'consent-option' + (privacy2 === 'agree' ? ' selected' : '')} onClick={() => setPrivacy2('agree')}>
                  <Check />
                  <span className="option-text">I agree</span>
                </label>
                <label className={'consent-option' + (privacy2 === 'disagree' ? ' selected' : '')} onClick={() => setPrivacy2('disagree')}>
                  <Check />
                  <span className="option-text">I disagree</span>
                </label>
              </div>
            </div>
          </div>

          {/* SIGNATURE */}
          <div className="section">
            <div className="section-title">
              <svg viewBox="0 0 24 24">
                <path d="M12 19l7-7 3 3-7 7-3-3z" />
                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                <path d="M2 2l7.586 7.586" />
                <circle cx="11" cy="11" r="2" />
              </svg>
              Parent / Guardian Signature
            </div>
            <div className="sig-pad-wrap">
              <span className="sig-label">
                Sign below <span className="required">*</span>
              </span>
              <SignaturePad ref={sig} width={560} height={130} short />
              <div className="sig-actions">
                <button className="btn-ghost" type="button" onClick={() => sig.current?.clear()}>
                  <svg viewBox="0 0 24 24">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  Clear
                </button>
              </div>
            </div>
          </div>

          <button className="submit-btn" onClick={handleSubmit} disabled={busy}>
            <svg viewBox="0 0 24 24">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            Submit
          </button>

          <footer className="form-footer">
            H-FARM International School · Parents Area<span className="form-footer-address">Via Adriano Olivetti 1 - 31056 Roncade (TV)</span>
          </footer>
        </div>

        {toastNode}
      </div>
    </AuthGuard>
  );
}
