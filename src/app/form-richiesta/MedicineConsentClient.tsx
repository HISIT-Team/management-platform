'use client';
/* Medicine Consent Form (parents). Port of form-richiesta.html (form_type 'medicine'). */
import React, { useRef, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import SignaturePad, { type SignaturePadHandle } from '@/components/SignaturePad';
import { useToast } from '@/components/useToast';
import { submitForm } from '@/lib/auth';

const AUTHORIZE = 'We give our authorisation (you will be ADVISED every time this medication should be administered)';
const DENY = 'We DO NOT give our authorisation (you will be CONTACTED every time to administer this medication, and it will be given only after your approval)';

const MEDS = [
  { key: 'paracetamol', label: 'Paracetamol', q: 'Paracetamol — given with fever over 38.5 °C and according to the weight (500 mg until 55 kg, 1000 mg over 55 kg)' },
  { key: 'ibuprofen', label: 'Ibuprofen', q: 'Ibuprofen — headache, strong inflammation, strong flu symptoms, period cramps' },
  { key: 'buscopan', label: 'Buscopan', q: 'Buscopan — diarrhoea, period cramps' },
  { key: 'biochetasi', label: 'Biochetasi', q: 'Biochetasi — antacid medication used to relieve heartburn, stomach acidity, acid reflux, and indigestion' },
  { key: 'maalox', label: 'Maalox', q: 'Maalox — antacid medication used to relieve heartburn, stomach acidity, and acid reflux' },
  { key: 'plasil', label: 'Plasil', q: 'Plasil (active ingredient: metoclopramide) — prescription only. It is used to treat nausea and vomiting, including cases that are particularly severe or persistent (intractable vomiting)' },
  { key: 'dissenten', label: 'Dissenten / Imodium', q: 'Dissenten / Imodium (active ingredient: loperamide) — antidiarrheal' },
] as const;

interface Parent {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}
const emptyParent = (): Parent => ({ firstName: '', lastName: '', email: '', phone: '' });

const Dot = () => <span className="custom-dot" />;
const Check = () => (
  <span className="custom-check">
    <svg viewBox="0 0 12 12">
      <polyline points="2 6 5 9 10 3" />
    </svg>
  </span>
);

export default function MedicineConsentClient() {
  const { showToast, toastNode } = useToast();
  const [student, setStudent] = useState({ firstName: '', lastName: '', dob: '', room: '' });
  const [parents, setParents] = useState<Parent[]>([emptyParent()]);
  const [consent, setConsent] = useState<Record<string, string>>({});
  const [authorityOther, setAuthorityOther] = useState('');
  const [busy, setBusy] = useState(false);

  const sig1 = useRef<SignaturePadHandle>(null);
  const sig2 = useRef<SignaturePadHandle>(null);
  const sigRefs = [sig1, sig2];
  const count = parents.length;

  function updateParent(i: number, patch: Partial<Parent>) {
    setParents((p) => p.map((pt, x) => (x === i ? { ...pt, ...patch } : pt)));
  }
  function parentLabel(i: number) {
    const p = parents[i];
    const name = `${p.firstName.trim()} ${p.lastName.trim()}`.trim();
    return name ? `Parent / Guardian ${i + 1} — ${name}` : `Parent / Guardian ${i + 1}`;
  }
  const setC = (field: string, val: string) => setConsent((c) => ({ ...c, [field]: val }));

  async function handleSubmit() {
    if (!student.firstName.trim() || !student.lastName.trim()) return showToast("Please enter the student's name.", true);
    if (!parents[0].email.trim()) return showToast('Please enter the email for Parent / Guardian 1.', true);
    for (const m of MEDS) {
      if (!consent[m.key]) return showToast(`Please select an option for ${m.label}.`, true);
    }
    if (!consent.authority) return showToast('Please answer the parental authority question.', true);
    if (consent.authority === 'other' && !authorityOther.trim()) return showToast('Please specify the "Other" option for parental authority.', true);

    const signatures = [];
    for (let i = 0; i < count; i++) {
      if (!sigRefs[i].current?.hasSig()) return showToast(`Please add the signature for ${parentLabel(i)}.`, true);
      signatures.push({ parent: i + 1, data: sigRefs[i].current!.toDataURL() });
    }

    setBusy(true);
    const payload = {
      form_type: 'medicine_consent',
      timestamp: new Date().toISOString(),
      student: { first_name: student.firstName.trim(), last_name: student.lastName.trim(), dob: student.dob, room: student.room.trim() },
      parents: parents.slice(0, count).map((p) => ({ first_name: p.firstName.trim(), last_name: p.lastName.trim(), email: p.email.trim(), phone: p.phone.trim() })),
      medicine_consent: {
        paracetamol: consent.paracetamol,
        ibuprofen: consent.ibuprofen,
        buscopan: consent.buscopan,
        biochetasi: consent.biochetasi,
        maalox: consent.maalox,
        plasil: consent.plasil,
        dissenten: consent.dissenten,
      },
      parcel_agreement: consent.parcels || '',
      parental_authority: consent.authority === 'other' ? `other: ${authorityOther.trim()}` : consent.authority || '',
      signatures,
    };

    try {
      await submitForm('medicine', payload);
      showToast('Form submitted successfully ✓');
      resetForm();
    } catch (e) {
      showToast('Error: ' + (e as Error).message, true);
    }
    setBusy(false);
  }

  function resetForm() {
    setStudent({ firstName: '', lastName: '', dob: '', room: '' });
    setParents([emptyParent()]);
    setConsent({});
    setAuthorityOther('');
    sig1.current?.clear();
    sig2.current?.clear();
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
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </div>
            <div>
              <h1>Medicine Consent Form</h1>
              <p>Authorisation for student medication management</p>
            </div>
          </div>

          {/* STUDENT */}
          <div className="section">
            <div className="section-title">
              <svg viewBox="0 0 24 24">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
              </svg>
              Student Information
            </div>
            <div className="row2">
              <div className="field">
                <label>First Name</label>
                <input type="text" placeholder="First name" value={student.firstName} onChange={(e) => setStudent({ ...student, firstName: e.target.value })} />
              </div>
              <div className="field">
                <label>Last Name</label>
                <input type="text" placeholder="Last name" value={student.lastName} onChange={(e) => setStudent({ ...student, lastName: e.target.value })} />
              </div>
            </div>
            <div className="row2">
              <div className="field">
                <label>Date of Birth</label>
                <input type="date" value={student.dob} onChange={(e) => setStudent({ ...student, dob: e.target.value })} />
              </div>
              <div className="field">
                <label>Room Number</label>
                <input type="text" placeholder="e.g. 204" value={student.room} onChange={(e) => setStudent({ ...student, room: e.target.value })} />
              </div>
            </div>
          </div>

          {/* PARENTS */}
          <div className="section">
            <div className="section-title">
              <svg viewBox="0 0 24 24">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              Parents / Guardians
            </div>
            {parents.map((p, i) => (
              <div className="dynamic-block" key={i}>
                <div className="block-header">
                  <span className="block-label">Parent / Guardian {i + 1}</span>
                  {i === 1 && (
                    <button className="remove-btn" type="button" onClick={() => setParents((ps) => ps.slice(0, 1))}>
                      <svg viewBox="0 0 24 24">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                      Remove
                    </button>
                  )}
                </div>
                <div className="row2">
                  <div className="field">
                    <label>First Name</label>
                    <input type="text" placeholder="First name" value={p.firstName} onChange={(e) => updateParent(i, { firstName: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Last Name</label>
                    <input type="text" placeholder="Last name" value={p.lastName} onChange={(e) => updateParent(i, { lastName: e.target.value })} />
                  </div>
                </div>
                <div className="row2">
                  <div className="field">
                    <label>Email</label>
                    <input type="email" placeholder="parent@email.com" value={p.email} onChange={(e) => updateParent(i, { email: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Phone</label>
                    <input type="tel" placeholder="+39 000 0000000" value={p.phone} onChange={(e) => updateParent(i, { phone: e.target.value })} />
                  </div>
                </div>
              </div>
            ))}
            {count === 1 && (
              <button className="add-btn" type="button" onClick={() => setParents((ps) => [...ps, emptyParent()])}>
                <svg viewBox="0 0 24 24">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add 2nd Parent / Guardian
              </button>
            )}
          </div>

          {/* MEDICINE CONSENT */}
          <div className="section">
            <div className="section-title">
              <svg viewBox="0 0 24 24">
                <path d="M10.5 20H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2v3" />
                <circle cx="18" cy="18" r="3" />
                <path d="m22 22-1.5-1.5" />
              </svg>
              Medicine Authorisation
            </div>
            {MEDS.map((m) => (
              <div className="consent-block" key={m.key}>
                <div className="consent-question">
                  <span>{m.q}</span>
                  <span className="required">*</span>
                </div>
                <div className="consent-options">
                  <label className={'consent-option' + (consent[m.key] === 'authorize' ? ' selected' : '')} onClick={() => setC(m.key, 'authorize')}>
                    <Dot />
                    <span className="option-text">{AUTHORIZE}</span>
                  </label>
                  <label className={'consent-option' + (consent[m.key] === 'deny' ? ' selected' : '')} onClick={() => setC(m.key, 'deny')}>
                    <Dot />
                    <span className="option-text">{DENY}</span>
                  </label>
                </div>
              </div>
            ))}
          </div>

          {/* PARCELS */}
          <div className="section">
            <div className="section-title">
              <svg viewBox="0 0 24 24">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
              Parcel Agreement
            </div>
            <div className="consent-block bare">
              <div className="consent-question">
                <span>I agree that the parcels purchased for my daughter / my son are opened in front of the boarding staff</span>
              </div>
              <p style={{ margin: '0 0 .875rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.3px', lineHeight: 1.4, color: 'var(--brand)' }}>
                Failure to provide consent for parcel inspection will result in the inability to receive parcels on campus.
              </p>
              <div className="consent-options">
                {['Yes', 'No'].map((v) => (
                  <label key={v} className={'consent-option' + (consent.parcels === v.toLowerCase() ? ' selected' : '')} onClick={() => setC('parcels', v.toLowerCase())}>
                    <Dot />
                    <span className="option-text">{v}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* PARENTAL AUTHORITY */}
          <div className="section">
            <div className="section-title">
              <svg viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              Parental Authority
            </div>
            <div className="consent-block bare">
              <div className="consent-question">
                <span>The answers of this form are subscribed by both the parents or who has parental authority on the student</span>
                <span className="required">*</span>
              </div>
              <div className="consent-options">
                {['yes', 'no'].map((v) => (
                  <label key={v} className={'consent-option' + (consent.authority === v ? ' selected' : '')} onClick={() => setC('authority', v)}>
                    <Check />
                    <span className="option-text">{v === 'yes' ? 'Yes' : 'No'}</span>
                  </label>
                ))}
                <label className={'consent-option' + (consent.authority === 'other' ? ' selected' : '')} onClick={() => setC('authority', 'other')}>
                  <Check />
                  <span className="option-text" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    Other:
                    <input
                      type="text"
                      placeholder="Please specify…"
                      value={authorityOther}
                      style={{ flex: 1, minWidth: 140, padding: '4px 8px', fontSize: 13, border: '1px solid var(--f-gray-200)', borderRadius: 6, background: 'var(--surface)', fontFamily: 'inherit', color: 'var(--f-gray-900)' }}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        setAuthorityOther(e.target.value);
                      }}
                    />
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* SIGNATURES */}
          <div className="section">
            <div className="section-title">
              <svg viewBox="0 0 24 24">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              Signatures
            </div>
            {parents.map((_, i) => (
              <div className="sig-pad-wrap" key={i}>
                <span className="sig-parent-label">{parentLabel(i)}</span>
                <span className="sig-sublabel">Sign below</span>
                <SignaturePad ref={sigRefs[i]} width={560} height={130} short />
                <div className="sig-actions">
                  <button className="btn-ghost" type="button" onClick={() => sigRefs[i].current?.clear()}>
                    <svg viewBox="0 0 24 24">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    Clear
                  </button>
                </div>
              </div>
            ))}
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
