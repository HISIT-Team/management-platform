'use client';
/* New employee onboarding request form. Port of onboarding.html.
   Submitted through the 'submit-form' Edge Function (form_type 'onboarding'). */
import React, { useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import { submitForm } from '@/lib/auth';

export default function OnboardingClient() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [risks, setRisks] = useState('');
  const [startDate, setStartDate] = useState('');
  const [company, setCompany] = useState('');
  const [cdc, setCdc] = useState('');
  const [location, setLocation] = useState('');
  const [computer, setComputer] = useState('No');
  const [computerOther, setComputerOther] = useState('');
  const [ipad, setIpad] = useState('No');
  const [ipadOther, setIpadOther] = useState('');
  const [phone, setPhone] = useState('No');
  const [phonePref, setPhonePref] = useState('');
  const [sim, setSim] = useState('No');
  const [referent, setReferent] = useState('');
  const [mailingList, setMailingList] = useState('');
  const [notes, setNotes] = useState('');

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err: boolean; show: boolean }>({ msg: '', err: false, show: false });

  function showToast(msg: string, err = false) {
    setToast({ msg, err, show: true });
    window.setTimeout(() => setToast((t) => ({ ...t, show: false })), 4000);
  }

  function resolveEquip(val: string, other: string) {
    if (val === 'Other') return other.trim() || 'Other (unspecified)';
    return val;
  }

  function resetForm() {
    setFirstName('');
    setLastName('');
    setEmail('');
    setRole('');
    setRisks('');
    setStartDate('');
    setCompany('');
    setCdc('');
    setLocation('');
    setComputer('No');
    setComputerOther('');
    setIpad('No');
    setIpadOther('');
    setPhone('No');
    setPhonePref('');
    setSim('No');
    setReferent('');
    setMailingList('');
    setNotes('');
  }

  async function handleSubmit() {
    if (!firstName.trim() || !lastName.trim()) return showToast('Please enter first and last name.', true);
    if (!email.trim()) return showToast('Please enter the personal email.', true);
    if (!role.trim()) return showToast('Please enter the job role.', true);
    if (!startDate) return showToast('Please select a start date.', true);
    if (!company) return showToast('Please select a company.', true);
    if (!location) return showToast('Please select a location.', true);

    const payload = {
      form_type: 'onboarding',
      timestamp: new Date().toISOString(),
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      personal_email: email.trim(),
      job_role: role.trim(),
      job_risks: risks.trim(),
      start_date: startDate,
      company,
      cdc: cdc.trim(),
      location,
      computer: resolveEquip(computer, computerOther),
      ipad: resolveEquip(ipad, ipadOther),
      company_phone: phone,
      phone_preference: phone === 'Yes' ? phonePref.trim() : '',
      company_sim: sim,
      referent: referent.trim(),
      mailing_list: mailingList.trim(),
      notes: notes.trim(),
    };

    setBusy(true);
    try {
      await submitForm('onboarding', payload);
      showToast('Onboarding request submitted ✓');
      resetForm();
    } catch (e) {
      showToast('Error: ' + (e as Error).message, true);
    }
    setBusy(false);
  }

  return (
    <AuthGuard roles={['hr', 'admin']}>
      <div className="form-page">
        <div className="form-wrap">
          <Link className="back-link" href="/employee-management-hub">
            <svg viewBox="0 0 24 24">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to Employee Management
          </Link>

          <div className="page-header">
            <div className="logo">
              <svg viewBox="0 0 24 24">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
            </div>
            <div>
              <h1>Onboarding</h1>
              <p>New employee setup request</p>
            </div>
          </div>

          {/* EMPLOYEE DETAILS */}
          <div className="section">
            <div className="section-title">
              <svg viewBox="0 0 24 24">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Employee details
            </div>
            <div className="row2">
              <div className="field">
                <label>
                  First name <span className="req">*</span>
                </label>
                <input type="text" placeholder="e.g. Laura" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="field">
                <label>
                  Last name <span className="req">*</span>
                </label>
                <input type="text" placeholder="e.g. Bianchi" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>
                Personal email <span className="req">*</span>
              </label>
              <input type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label>
                Job role (Mansione) <span className="req">*</span>
              </label>
              <input type="text" placeholder="e.g. Teacher, Administrative..." value={role} onChange={(e) => setRole(e.target.value)} />
            </div>
            <div className="field">
              <label>Job risks (Rischi mansione)</label>
              <input type="text" placeholder="e.g. Low / Medium / specific risks" value={risks} onChange={(e) => setRisks(e.target.value)} />
            </div>
            <div className="field">
              <label>
                Start date <span className="req">*</span>
              </label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          </div>

          {/* COMPANY & LOCATION */}
          <div className="section">
            <div className="section-title">
              <svg viewBox="0 0 24 24">
                <path d="M3 21h18M6 21V7l6-4 6 4v14M10 9h.01M14 9h.01M10 13h.01M14 13h.01M10 17h.01M14 17h.01" />
              </svg>
              Company &amp; location
            </div>
            <div className="field">
              <label>
                Company (Ragione sociale) <span className="req">*</span>
              </label>
              <select value={company} onChange={(e) => setCompany(e.target.value)}>
                <option value="" disabled>
                  Select company…
                </option>
                <option value="H-INTERNATIONAL SCHOOL SRL">H-INTERNATIONAL SCHOOL SRL</option>
                <option value="H-INTERNATIONAL SCHOOL VICENZA SRL">H-INTERNATIONAL SCHOOL VICENZA SRL</option>
                <option value="H-INTERNATIONAL SCHOOL ROSÀ SRL">H-INTERNATIONAL SCHOOL ROSÀ SRL</option>
              </select>
            </div>
            <div className="field">
              <label>CDC (Cost center)</label>
              <input type="text" placeholder="e.g. CDC code" value={cdc} onChange={(e) => setCdc(e.target.value)} />
            </div>
            <div className="field">
              <label>
                Location (Sede) <span className="req">*</span>
              </label>
              <select value={location} onChange={(e) => setLocation(e.target.value)}>
                <option value="" disabled>
                  Select location…
                </option>
                <option value="Treviso">Treviso</option>
                <option value="Vicenza">Vicenza</option>
                <option value="Rosà">Rosà</option>
              </select>
            </div>
          </div>

          {/* EQUIPMENT */}
          <div className="section">
            <div className="section-title">
              <svg viewBox="0 0 24 24">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
              Equipment
            </div>

            <div className="field">
              <label>Is a computer needed?</label>
              <select value={computer} onChange={(e) => setComputer(e.target.value)}>
                <option value="No">No</option>
                <option value={'PC Standard - MacBook Air 13"'}>PC Standard — MacBook Air 13&quot;</option>
                <option value="Other">Other (specify)</option>
              </select>
              <div className={'conditional' + (computer === 'Other' ? '' : ' hidden')}>
                <input type="text" placeholder="Specify computer requirement" value={computerOther} onChange={(e) => setComputerOther(e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label>Is an iPad needed?</label>
              <select value={ipad} onChange={(e) => setIpad(e.target.value)}>
                <option value="No">No</option>
                <option value="iPad standard">iPad standard</option>
                <option value="Other">Other (specify)</option>
              </select>
              <div className={'conditional' + (ipad === 'Other' ? '' : ' hidden')}>
                <input type="text" placeholder="Specify iPad requirement" value={ipadOther} onChange={(e) => setIpadOther(e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label>Is a company phone needed?</label>
              <select value={phone} onChange={(e) => setPhone(e.target.value)}>
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
              <div className={'conditional' + (phone === 'Yes' ? '' : ' hidden')}>
                <input type="text" placeholder="Phone preference (model / notes)" value={phonePref} onChange={(e) => setPhonePref(e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label>Is a company SIM needed?</label>
              <select value={sim} onChange={(e) => setSim(e.target.value)}>
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
          </div>

          {/* ADDITIONAL */}
          <div className="section">
            <div className="section-title">
              <svg viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              Additional information
            </div>
            <div className="field">
              <label>Referent (Referente)</label>
              <input type="text" placeholder="e.g. manager / contact person" value={referent} onChange={(e) => setReferent(e.target.value)} />
            </div>
            <div className="field">
              <label>Mailing list</label>
              <input type="text" placeholder="e.g. distribution lists to add" value={mailingList} onChange={(e) => setMailingList(e.target.value)} />
            </div>
            <div className="field">
              <label>Notes</label>
              <textarea placeholder="Anything else worth noting…" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <button className="submit-btn" onClick={handleSubmit} disabled={busy}>
            <svg viewBox="0 0 24 24">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            Submit onboarding request
          </button>
        </div>

        <div className={'toast' + (toast.show ? ' show' : '')} style={{ background: toast.err ? '#A32D2D' : '#0F6E56' }}>
          {toast.msg}
        </div>
      </div>
    </AuthGuard>
  );
}
