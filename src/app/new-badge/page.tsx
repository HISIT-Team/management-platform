'use client';
/* New badge request form.
   Submitted through the 'submit-form' Edge Function (form_type 'new_badge').
   Badge photo: NOT stored in Supabase. It is sent only to the webhook as base64
   (badge_photo_base64 / badge_photo_mime) so Power Automate can save it in
   SharePoint → Foto Badge.
   Header uses the same classes as the HR Task Manager (hr-task-header). */
import React, { useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Topbar from '@/components/Topbar';
import { getSupabase } from '@/lib/supabase';
import { submitForm } from '@/lib/auth';

// Compresses the badge photo to max 1200px JPEG and returns plain base64 (no data: prefix).
function imageToBase64Jpeg(file: File, maxSize = 1200, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        return reject(new Error('Canvas not supported'));
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read the badge photo'));
    };
    img.src = url;
  });
}

function Inner() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  // Changing this key remounts the file input, so it is really emptied after a reset.
  const [fileInputKey, setFileInputKey] = useState(0);

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err: boolean; show: boolean }>({ msg: '', err: false, show: false });

  function showToast(msg: string, err = false) {
    setToast({ msg, err, show: true });
    window.setTimeout(() => setToast((t) => ({ ...t, show: false })), 4000);
  }

  function resetForm() {
    setFirstName('');
    setLastName('');
    setPhoto(null);
    setFileInputKey((k) => k + 1);
  }

  async function handleSubmit() {
    if (!firstName.trim() || !lastName.trim()) return showToast('Please enter first and last name.', true);
    if (!photo) return showToast('Please upload the badge photo.', true);

    setBusy(true);
    try {
      // Convert first: if the file is unreadable, stop before writing anything.
      const badge_photo_base64 = await imageToBase64Jpeg(photo);

      // History row (no photo)
      const { error: historyError } = await getSupabase().from('hr_badge_requests').insert({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      if (historyError) throw historyError;

      // Webhook: data + the photo as base64 for Power Automate
      await submitForm('new_badge', {
        form_type: 'new_badge',
        timestamp: new Date().toISOString(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        badge_photo_base64,
        badge_photo_mime: 'image/jpeg',
      });

      showToast('Badge request submitted ✓');
      resetForm();
    } catch (e) {
      showToast('Error: ' + (e as Error).message, true);
    }
    setBusy(false);
  }

  return (
    <>
      <Topbar label="HR" href="/hr" variant="back" />
      <div className="form-page">
        <div className="form-wrap">
          {/* HEADER — same style as Task Manager */}
          <header className="hr-task-header">
            <div>
              <p className="hr-task-eyebrow">HR request</p>
              <h1>New <em>Badge</em></h1>
              <p>Request a new employee badge by uploading the photo.</p>
            </div>
          </header>

          {/* EMPLOYEE */}
          <div className="section">
            <div className="section-title">
              <svg viewBox="0 0 24 24">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Employee
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
          </div>

          {/* PHOTO */}
          <div className="section">
            <div className="section-title">
              <svg viewBox="0 0 24 24">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              Badge photo
            </div>
            <div className="field">
              <label>
                Photo <span className="req">*</span>
              </label>
              <label className="file-picker">
                <input key={fileInputKey} type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
                <span className="file-picker-button">Choose photo</span>
                <span className="file-picker-name">{photo?.name ?? 'No file selected'}</span>
              </label>
            </div>
          </div>

          <button className="submit-btn" onClick={handleSubmit} disabled={busy}>
            <svg viewBox="0 0 24 24">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            {busy ? 'Submitting…' : 'Submit badge request'}
          </button>
        </div>

        <div className={'toast' + (toast.show ? ' show' : '')} style={{ background: toast.err ? '#A32D2D' : '#0F6E56' }}>
          {toast.msg}
        </div>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <AuthGuard roles={['hr', 'admin']} perm="hr">
      <Inner />
    </AuthGuard>
  );
}
