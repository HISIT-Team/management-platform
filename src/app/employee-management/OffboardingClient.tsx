'use client';
/* Employee offboarding form. Port of employee-management.html (form_type 'offboarding'). */
import React, { useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import { useToast } from '@/components/useToast';
import { submitForm } from '@/lib/auth';

const COMPANIES = ['H-INTERNATIONAL SCHOOL SRL', 'H-INTERNATIONAL SCHOOL VICENZA SRL', 'H-INTERNATIONAL SCHOOL ROSÀ SRL'];

export default function OffboardingClient() {
  const { showToast, toastNode } = useToast();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [endDate, setEndDate] = useState('');
  const [company, setCompany] = useState('');
  const [drive, setDrive] = useState('');
  const [autoReply, setAutoReply] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    if (!firstName.trim() || !lastName.trim()) return showToast('Please enter first and last name.', true);
    if (!email.trim()) return showToast('Please enter an email address.', true);
    if (!endDate) return showToast('Please select an end date.', true);
    if (!company) return showToast('Please select a company.', true);

    setBusy(true);
    try {
      await submitForm('offboarding', {
        form_type: 'offboarding',
        timestamp: new Date().toISOString(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        end_date: endDate,
        company,
        drive_data: drive.trim(),
        auto_reply_email: autoReply.trim(),
      });
      showToast('Form submitted successfully ✓');
      setFirstName('');
      setLastName('');
      setEmail('');
      setEndDate('');
      setCompany('');
      setDrive('');
      setAutoReply('');
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
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
            </div>
            <div>
              <h1>Offboarding</h1>
              <p>Departing employee process</p>
            </div>
          </div>

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
                <label>First name</label>
                <input type="text" placeholder="e.g. Laura" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="field">
                <label>Last name</label>
                <input type="text" placeholder="e.g. Bianchi" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" placeholder="employee@school.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label>End date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Company</label>
              <select value={company} onChange={(e) => setCompany(e.target.value)}>
                <option value="" disabled>
                  Select company…
                </option>
                {COMPANIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Drive Data</label>
              <input type="text" placeholder="e.g. folder link or notes" value={drive} onChange={(e) => setDrive(e.target.value)} />
            </div>
            <div className="field">
              <label>Auto-reply Email</label>
              <input type="text" placeholder="e.g. auto-reply message or status" value={autoReply} onChange={(e) => setAutoReply(e.target.value)} />
            </div>
          </div>

          <button className="submit-btn" onClick={handleSubmit} disabled={busy}>
            <svg viewBox="0 0 24 24">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            Submit form
          </button>
        </div>

        {toastNode}
      </div>
    </AuthGuard>
  );
}
