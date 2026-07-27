'use client';
/* Room Assignment form (boarding). Port of room-assignment.html (form_type 'room'). */
import React, { useRef, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import SignaturePad, { type SignaturePadHandle } from '@/components/SignaturePad';
import { useToast } from '@/components/useToast';
import { submitForm } from '@/lib/auth';

interface Student {
  firstName: string;
  lastName: string;
  email: string;
  pe1: string;
  pe2: string;
}
const emptyStudent = (): Student => ({ firstName: '', lastName: '', email: '', pe1: '', pe2: '' });

type YN = 'Yes' | 'No' | null;
interface Condition {
  val: YN;
  note: string;
}
const CONDS = [
  { key: 'maindoor', q: 'Does the main entrance door function properly, and is the lock correctly installed?' },
  { key: 'window', q: 'Does the window function properly?' },
  { key: 'bedroom', q: 'Does the bedroom door function properly?' },
  { key: 'bathroom', q: 'Does the bathroom lock close properly?' },
] as const;

const BADGE_OPTIONS = [
  'Yes',
  'No / Not provided — Room change only',
  'The badge is kept by the student throughout the summer',
];

const PHOTOS_FORM =
  'https://forms.office.com/Pages/ResponsePage.aspx?id=vAXYlmtagUGJtl6xyj7U2lYn7gDyFtJKk6hmTsa9D7NUNUJVUkc1N09IRUVQMzlCT1ZYNUw2VE8xMiQlQCN0PWcu';

const ClearIcon = () => (
  <svg viewBox="0 0 24 24">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

export default function RoomAssignmentClient() {
  const { showToast, toastNode } = useToast();
  const [students, setStudents] = useState<Student[]>([emptyStudent()]);
  const [contract, setContract] = useState<'5/7' | '7/7' | null>(null);
  const [checkoutDate, setCheckoutDate] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [roomType, setRoomType] = useState<'Single' | 'Double' | null>(null);
  const [conditions, setConditions] = useState<Record<string, Condition>>({
    maindoor: { val: null, note: '' },
    window: { val: null, note: '' },
    bedroom: { val: null, note: '' },
    bathroom: { val: null, note: '' },
  });
  const [badge, setBadge] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const sig1 = useRef<SignaturePadHandle>(null);
  const sig2 = useRef<SignaturePadHandle>(null);
  const sigRefs = [sig1, sig2];

  const count = students.length;

  function updateStudent(i: number, patch: Partial<Student>) {
    setStudents((s) => s.map((st, x) => (x === i ? { ...st, ...patch } : st)));
  }
  function addStudent() {
    setStudents((s) => (s.length === 1 ? [...s, emptyStudent()] : s));
  }
  function removeStudent() {
    setStudents((s) => s.slice(0, 1));
  }
  function studentLabel(i: number) {
    const st = students[i];
    const name = `${st.firstName.trim()} ${st.lastName.trim()}`.trim();
    return name ? `Student ${i + 1} — ${name}` : `Student ${i + 1}`;
  }
  function setCond(key: string, val: YN) {
    setConditions((c) => ({ ...c, [key]: { val, note: val === 'Yes' ? '' : c[key].note } }));
  }

  async function handleSubmit() {
    const studentPayload = [];
    for (let i = 0; i < count; i++) {
      const st = students[i];
      if (!st.firstName.trim() || !st.lastName.trim()) return showToast(`Please fill in first and last name for Student ${i + 1}.`, true);
      studentPayload.push({ first_name: st.firstName.trim(), last_name: st.lastName.trim(), email: st.email.trim() });
    }
    const parentEmails = [];
    for (let i = 0; i < count; i++) {
      const st = students[i];
      if (!st.pe1.trim()) return showToast(`Please enter at least one parent email for Student ${i + 1}.`, true);
      parentEmails.push({ student: i + 1, email1: st.pe1.trim(), email2: st.pe2.trim() });
    }
    if (!contract) return showToast('Please select a boarding contract type.', true);
    if (!checkoutDate) return showToast('Please select a checkout date.', true);
    if (!roomNumber.trim()) return showToast('Please enter a room number.', true);
    if (!roomType) return showToast('Please select a room type.', true);
    if (!conditions.maindoor.val) return showToast('Please answer the main entrance door question.', true);
    if (!conditions.window.val) return showToast('Please answer the window question.', true);
    if (!conditions.bedroom.val) return showToast('Please answer the bedroom door question.', true);
    if (!conditions.bathroom.val) return showToast('Please answer the bathroom lock question.', true);
    if (!badge) return showToast('Please select a room badge return option.', true);

    const signatures = [];
    for (let i = 0; i < count; i++) {
      if (!sigRefs[i].current?.hasSig()) return showToast(`Please add the signature for Student ${i + 1}.`, true);
      signatures.push({ student: i + 1, data: sigRefs[i].current!.toDataURL() });
    }

    setBusy(true);
    const payload = {
      form_type: 'room_assignment',
      timestamp: new Date().toISOString(),
      students: studentPayload,
      parent_emails: parentEmails,
      boarding_contract: contract,
      checkout_date: checkoutDate,
      room_number: roomNumber.trim(),
      room_type: roomType,
      conditions: {
        main_entrance_door: conditions.maindoor.val,
        main_entrance_door_note: conditions.maindoor.note.trim(),
        window: conditions.window.val,
        window_note: conditions.window.note.trim(),
        bedroom_door: conditions.bedroom.val,
        bedroom_door_note: conditions.bedroom.note.trim(),
        bathroom_lock: conditions.bathroom.val,
        bathroom_lock_note: conditions.bathroom.note.trim(),
      },
      room_badge_return: badge,
      notes: notes.trim(),
      signatures,
    };

    try {
      await submitForm('room', payload);
      showToast('Form submitted successfully ✓');
      resetForm();
    } catch (e) {
      showToast('Error: ' + (e as Error).message, true);
    }
    setBusy(false);
  }

  function resetForm() {
    setStudents([emptyStudent()]);
    setContract(null);
    setCheckoutDate('');
    setRoomNumber('');
    setRoomType(null);
    setConditions({
      maindoor: { val: null, note: '' },
      window: { val: null, note: '' },
      bedroom: { val: null, note: '' },
      bathroom: { val: null, note: '' },
    });
    setBadge(null);
    setNotes('');
    sig1.current?.clear();
    sig2.current?.clear();
  }

  return (
    <AuthGuard roles={['boarding', 'admin']}>
      <div className="form-page">
        <div className="form-wrap">
          <Link className="back-link" href="/boarding">
            <svg viewBox="0 0 24 24">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to Boarding
          </Link>

          <div className="page-header">
            <div className="logo">
              <svg viewBox="0 0 24 24">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <div>
              <h1>Room Assignment</h1>
              <p>Assign students and document room conditions</p>
            </div>
          </div>

          {/* STUDENTS */}
          <div className="section">
            <div className="section-title">
              <svg viewBox="0 0 24 24">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Students
            </div>
            {students.map((st, i) => (
              <div className="student-block" key={i}>
                <div className="student-block-header">
                  <span className="student-block-label">Student {i + 1}</span>
                  {i === 1 && (
                    <button className="remove-student-btn" type="button" onClick={removeStudent}>
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
                    <input type="text" placeholder="First name" value={st.firstName} onChange={(e) => updateStudent(i, { firstName: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Last Name</label>
                    <input type="text" placeholder="Last name" value={st.lastName} onChange={(e) => updateStudent(i, { lastName: e.target.value })} />
                  </div>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Email</label>
                  <input type="email" placeholder="student@school.com" value={st.email} onChange={(e) => updateStudent(i, { email: e.target.value })} />
                </div>
              </div>
            ))}
            {count === 1 && (
              <button className="add-student-btn" type="button" onClick={addStudent}>
                <svg viewBox="0 0 24 24">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add 2nd Student
              </button>
            )}
          </div>

          {/* PARENT EMAILS */}
          <div className="section">
            <div className="section-title">
              <svg viewBox="0 0 24 24">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              Parent Emails
            </div>
            {students.map((st, i) => (
              <div key={i} style={{ marginBottom: i < count - 1 ? '1.25rem' : 0 }}>
                <p className="section-sub-title">{studentLabel(i)}</p>
                <div className="field">
                  <label>Parent Email 1</label>
                  <input type="email" placeholder="parent1@email.com" value={st.pe1} onChange={(e) => updateStudent(i, { pe1: e.target.value })} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>
                    Parent Email 2 <span style={{ fontWeight: 400, color: 'var(--f-gray-600)' }}>(optional)</span>
                  </label>
                  <input type="email" placeholder="parent2@email.com" value={st.pe2} onChange={(e) => updateStudent(i, { pe2: e.target.value })} />
                </div>
              </div>
            ))}
          </div>

          {/* CONTRACT & ROOM */}
          <div className="section">
            <div className="section-title">
              <svg viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              Contract &amp; Room Details
            </div>
            <div className="field">
              <label>Boarding Contract</label>
              <div className="two-selector">
                <button type="button" className={'two-option' + (contract === '5/7' ? ' selected' : '')} onClick={() => setContract('5/7')}>
                  5/7
                </button>
                <button type="button" className={'two-option' + (contract === '7/7' ? ' selected' : '')} onClick={() => setContract('7/7')}>
                  7/7
                </button>
              </div>
            </div>
            <div className="row2">
              <div className="field">
                <label>Checkout Date</label>
                <input type="date" value={checkoutDate} onChange={(e) => setCheckoutDate(e.target.value)} />
              </div>
              <div className="field">
                <label>Room Number</label>
                <input type="text" placeholder="e.g. 204" value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Room Type</label>
              <div className="two-selector">
                <button type="button" className={'two-option' + (roomType === 'Single' ? ' selected' : '')} onClick={() => setRoomType('Single')}>
                  Single
                </button>
                <button type="button" className={'two-option' + (roomType === 'Double' ? ' selected' : '')} onClick={() => setRoomType('Double')}>
                  Double
                </button>
              </div>
            </div>
          </div>

          {/* ROOM CONDITIONS */}
          <div className="section">
            <div className="section-title">
              <svg viewBox="0 0 24 24">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              Room Conditions
            </div>
            {CONDS.map(({ key, q }) => (
              <div className="condition-question" key={key}>
                <p className="condition-q-label">{q}</p>
                <div className="yn-toggle">
                  <button type="button" className={'yn-btn yes' + (conditions[key].val === 'Yes' ? ' selected' : '')} onClick={() => setCond(key, 'Yes')}>
                    Yes
                  </button>
                  <button type="button" className={'yn-btn no' + (conditions[key].val === 'No' ? ' selected' : '')} onClick={() => setCond(key, 'No')}>
                    No
                  </button>
                </div>
                {conditions[key].val === 'No' && (
                  <div className="yn-notes">
                    <span className="yn-notes-label">Report what&apos;s not working</span>
                    <textarea placeholder="Describe the issue…" value={conditions[key].note} onChange={(e) => setConditions((c) => ({ ...c, [key]: { ...c[key], note: e.target.value } }))} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ROOM PHOTOS */}
          <div className="section">
            <div className="section-title">
              <svg viewBox="0 0 24 24">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              Room Photos
            </div>
            <p style={{ fontSize: 13, color: 'var(--f-gray-600)', marginBottom: '1rem' }}>Upload photos of the room using the form below.</p>
            <a className="photos-btn" href={PHOTOS_FORM} target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              Open Photo Upload Form
              <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, marginLeft: 2 }}>
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>

          {/* BADGE RETURN */}
          <div className="section">
            <div className="section-title">
              <svg viewBox="0 0 24 24">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
              Room Badge Return
            </div>
            <div className="badge-options">
              {BADGE_OPTIONS.map((b) => (
                <button type="button" key={b} className={'badge-option' + (badge === b ? ' selected' : '')} onClick={() => setBadge(b)}>
                  {b}
                </button>
              ))}
            </div>
          </div>

          {/* NOTES */}
          <div className="section">
            <div className="section-title">
              <svg viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Notes
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <textarea placeholder="Any additional notes about the room or assignment…" value={notes} onChange={(e) => setNotes(e.target.value)} />
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
            {students.map((_, i) => (
              <div className="sig-pad-wrap" key={i}>
                <p className="section-sub-title">{studentLabel(i)}</p>
                <span className="sig-label">Sign below</span>
                <SignaturePad ref={sigRefs[i]} width={640} height={130} short />
                <div className="sig-actions">
                  <button className="btn-ghost" type="button" onClick={() => sigRefs[i].current?.clear()}>
                    <ClearIcon />
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
            Submit Form
          </button>
        </div>

        {toastNode}
      </div>
    </AuthGuard>
  );
}
