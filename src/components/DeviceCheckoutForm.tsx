'use client';
/* Shared device Check-in / Check-out form (students & employees).
   Faithful port of modulo-student.html / modulo-employee.html. */
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import SignaturePad, { type SignaturePadHandle } from '@/components/SignaturePad';
import QrScanner from '@/components/QrScanner';
import { useToast } from '@/components/useToast';
import { compressImage } from '@/lib/image';
import { submitForm } from '@/lib/auth';
import { compactSignature, logStudentDevice } from '@/lib/deviceLog';

export interface DeviceDef {
  name: string;
  icon: React.ReactNode;
}

export interface CheckoutConfig {
  kind: 'student' | 'employee';
  roles: string[];
  backHref: string;
  backLabel: string;
  headerIcon: React.ReactNode;
  headerTitle: string;
  detailsIcon: React.ReactNode;
  detailsTitle: string;
  companyLabel: string; // "School" | "Company"
  formTypeByOp: Record<string, string>;
  devices: DeviceDef[];
  needsId: string[];
  needsPhotos: string[];
  signers: { label: string; icon: React.ReactNode }[];
  signerCols: 2 | 3;
  hasQR: boolean;
  hasParents: boolean;
}

interface DeviceState {
  assetId: string;
  images: string[];
  hasDamage: boolean;
  damagePhotos: string[];
}

const OPTIONS: { value: 'Check-in' | 'Check-out'; icon: React.ReactNode; sub: (kind: string) => string }[] = [
  {
    value: 'Check-in',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
    sub: (k) => `Device delivered to ${k}`,
  },
  {
    value: 'Check-out',
    icon: (
      <svg viewBox="0 0 24 24">
        <polyline points="1 4 1 10 7 10" />
        <path d="M3.51 15a9 9 0 1 0 .49-3.51" />
      </svg>
    ),
    sub: (k) => `Device returned by ${k}`,
  },
];

function PhotoGrid({ photos, onAdd, onDelete }: { photos: string[]; onAdd: (files: FileList) => void; onDelete: (i: number) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="photo-grid" style={{ marginTop: 0 }}>
      {photos.map((src, i) => (
        <div className="photo-thumb" key={i}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`photo ${i + 1}`} />
          <button type="button" className="del-btn" onClick={() => onDelete(i)} aria-label="Remove photo">
            <svg viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}
      {photos.length < 10 && (
        <div className="add-photo" onClick={() => inputRef.current?.click()}>
          <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }}>
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
          Add
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files) onAdd(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      )}
    </div>
  );
}

const onActivate = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fn();
  }
};

export default function DeviceCheckoutForm({ config }: { config: CheckoutConfig }) {
  const { showToast, toastNode } = useToast();
  const sigRef = useRef<SignaturePadHandle>(null);

  const [op, setOp] = useState<'Check-in' | 'Check-out' | null>(null);
  const [fixedOp, setFixedOp] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [org, setOrg] = useState(''); // school or company
  const [email1, setEmail1] = useState('');
  const [email2, setEmail2] = useState('');

  const [selected, setSelected] = useState<string[]>([]);
  const [details, setDetails] = useState<Record<string, DeviceState>>({});
  const [signer, setSigner] = useState<string | null>(null);
  const [banner, setBanner] = useState('');
  const [busy, setBusy] = useState(false);

  const applyOpFromUrl = () => {
    const p = new URLSearchParams(window.location.search).get('op');
    if (p === 'checkin' || p === 'checkout') {
      setOp(p === 'checkin' ? 'Check-in' : 'Check-out');
      setFixedOp(true);
    } else {
      setOp(null);
      setFixedOp(false);
    }
  };

  useEffect(() => {
    applyOpFromUrl();
  }, []);

  function getState(dev: string): DeviceState {
    return details[dev] || { assetId: '', images: [], hasDamage: false, damagePhotos: [] };
  }
  function setState(dev: string, patch: Partial<DeviceState>) {
    setDetails((d) => ({ ...d, [dev]: { ...getState(dev), ...patch } }));
  }

  function toggleDevice(dev: string) {
    setSelected((s) => (s.includes(dev) ? s.filter((x) => x !== dev) : [...s, dev]));
  }

  async function addPhotos(dev: string, key: 'images' | 'damagePhotos', files: FileList) {
    const st = getState(dev);
    const next = [...st[key]];
    for (const f of Array.from(files)) {
      const c = await compressImage(f);
      if (c) next.push(c);
    }
    setState(dev, { [key]: next } as Partial<DeviceState>);
  }

  function buildDevicePayload() {
    const out: Record<string, unknown> = {};
    config.needsId.forEach((dev) => {
      if (!selected.includes(dev)) return;
      const st = getState(dev);
      const entry: Record<string, unknown> = { asset_id: st.assetId.trim() };
      if (config.needsPhotos.includes(dev)) {
        entry.images = st.images;
        entry.has_damage = st.hasDamage;
        entry.damage_photos = st.hasDamage ? st.damagePhotos : [];
      }
      out[dev] = entry;
    });
    return out;
  }

  function buildAllPhotos() {
    const out: { name: string; category: string; device: string; data: string }[] = [];
    config.needsId.forEach((dev) => {
      if (!selected.includes(dev) || !config.needsPhotos.includes(dev)) return;
      const key = dev.replace(/\s/g, '_');
      const st = getState(dev);
      st.images.forEach((data, i) => out.push({ name: `${key}_photo_${i + 1}.jpg`, category: 'device', device: dev, data }));
      if (st.hasDamage) st.damagePhotos.forEach((data, i) => out.push({ name: `${key}_damage_${i + 1}.jpg`, category: 'damage', device: dev, data }));
    });
    return out;
  }

  function resetForm() {
    setFirstName('');
    setLastName('');
    setEmail('');
    setOrg('');
    setEmail1('');
    setEmail2('');
    setSelected([]);
    setDetails({});
    setSigner(null);
    setBanner('');
    sigRef.current?.clear();
    applyOpFromUrl();
    window.scrollTo(0, 0);
  }

  function handleQr(raw: string): boolean {
    try {
      const d = JSON.parse(raw) as Record<string, string>;
      if (d.nome === undefined) return false;
      if (d.nome) setFirstName(d.nome);
      if (d.cognome) setLastName(d.cognome);
      if (d.email) setEmail(d.email);
      if (d.email1) setEmail1(d.email1);
      if (d.email2) setEmail2(d.email2);
      if (d.scuola) {
        const match = ['H-INTERNATIONAL SCHOOL SRL', 'H-INTERNATIONAL SCHOOL VICENZA SRL', 'H-INTERNATIONAL SCHOOL ROSÀ SRL'].find((o) =>
          o.toLowerCase().includes(d.scuola.toLowerCase()),
        );
        if (match) setOrg(match);
      }
      setBanner(`Data loaded: ${d.nome || ''} ${d.cognome || ''}`.trim());
      window.setTimeout(() => setBanner(''), 6000);
      showToast('QR scanned successfully ✓');
      return true;
    } catch {
      return false;
    }
  }

  async function handleSubmit() {
    if (!op) return showToast('Please select operation type.', true);
    if (!firstName.trim() || !lastName.trim()) return showToast(`Please enter ${config.kind} name.`, true);
    if (!email.trim()) return showToast(config.kind === 'student' ? 'Please enter student email.' : 'Please enter work email.', true);
    if (!org) return showToast(config.kind === 'student' ? 'Please select a school.' : 'Please select a company.', true);
    if (selected.length === 0) return showToast('Please select at least one device.', true);
    if (!signer) return showToast('Please select who is signing.', true);
    if (!sigRef.current?.hasSig()) return showToast('Please add a signature.', true);

    setBusy(true);
    try {
      const base = {
        timestamp: new Date().toISOString(),
        operation: op,
        type: config.kind,
        devices: selected,
        device_details: buildDevicePayload(),
        signed_by: signer,
        signature: sigRef.current.toDataURL(),
      };
      const payload =
        config.kind === 'student'
          ? {
              ...base,
              student: { first_name: firstName.trim(), last_name: lastName.trim(), email: email.trim(), school: org },
              parents: { email_1: email1.trim(), email_2: email2.trim() },
              all_photos: buildAllPhotos(),
            }
          : {
              ...base,
              employee: { first_name: firstName.trim(), last_name: lastName.trim(), email: email.trim(), company: org },
            };
      await submitForm(config.formTypeByOp[op], payload);

      // Student forms: also keep a row in `student_device_log`. The form is
      // already sent at this point, so a logging failure only warns.
      let logFailed = false;
      if (config.kind === 'student') {
        const assetId = (dev: string) => (selected.includes(dev) ? getState(dev).assetId.trim() || null : null);
        try {
          await logStudentDevice({
            operation: op,
            student_email: email.trim(),
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            school: org,
            macbook_id: assetId('MacBook'),
            ipad_id: assetId('iPad'),
            signed_by: signer,
            signature: await compactSignature(base.signature),
          });
        } catch (e) {
          logFailed = true;
          console.error('student_device_log insert failed', e);
        }
      }
      if (logFailed) showToast('Form submitted ✓ — but saving to the device log failed', true);
      else showToast('Form submitted ✓');
      resetForm();
    } catch (e) {
      showToast('Submission failed: ' + (e as Error).message, true);
    }
    setBusy(false);
  }

  const orgOptions = ['H-INTERNATIONAL SCHOOL SRL', 'H-INTERNATIONAL SCHOOL VICENZA SRL', 'H-INTERNATIONAL SCHOOL ROSÀ SRL'];

  return (
    <AuthGuard roles={config.roles}>
      <div className="form-page">
        <Link className="back-link" href={config.backHref}>
          <svg viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {config.backLabel}
        </Link>

        <div className="page-header">
          <div className="logo">{config.headerIcon}</div>
          <div>
            <h1>{config.headerTitle}</h1>
            <p>{op ?? 'Select operation type'}</p>
          </div>
        </div>

        <div className="form-wrap">
          {!fixedOp && (
            <div className="section">
              <div className="section-title">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                Operation type
              </div>
              <div className="big-selector">
                {OPTIONS.map((o) => (
                  <div
                    key={o.value}
                    className={'big-option' + (op === o.value ? ' selected' : '')}
                    role="button"
                    tabIndex={0}
                    aria-pressed={op === o.value}
                    onClick={() => setOp(o.value)}
                    onKeyDown={onActivate(() => setOp(o.value))}
                  >
                    {o.icon}
                    <span className="opt-label">{o.value}</span>
                    <span className="opt-sub">{o.sub(config.kind)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {op && (
            <>
              {config.hasQR && <QrScanner onScan={handleQr} onError={(m) => showToast(m, true)} hint="Point camera at student's QR code" title="Scan student QR (optional)" banner={banner} />}

              {/* Details */}
              <div className="section">
                <div className="section-title">
                  {config.detailsIcon}
                  {config.detailsTitle}
                </div>
                <div className="row2">
                  <div className="field">
                    <label>First name</label>
                    <input type="text" placeholder={config.kind === 'student' ? 'e.g. Marco' : 'e.g. Laura'} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Last name</label>
                    <input type="text" placeholder={config.kind === 'student' ? 'e.g. Rossi' : 'e.g. Bianchi'} value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </div>
                </div>
                <div className="field">
                  <label>{config.kind === 'student' ? 'Student email' : 'Work email'}</label>
                  <input type="email" placeholder={config.kind === 'student' ? 'student@email.com' : 'employee@school.com'} value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="field">
                  <label>{config.companyLabel}</label>
                  <select value={org} onChange={(e) => setOrg(e.target.value)}>
                    <option value="" disabled>
                      {config.kind === 'student' ? 'Select school…' : 'Select company…'}
                    </option>
                    {orgOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Parent emails (student only) */}
              {config.hasParents && (
                <div className="section">
                  <div className="section-title">
                    <svg viewBox="0 0 24 24">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                    Parent emails
                  </div>
                  <div className="field">
                    <label>Parent email 1</label>
                    <input type="email" placeholder="parent1@email.com" value={email1} onChange={(e) => setEmail1(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>
                      Parent email 2 <span style={{ fontWeight: 400 }}>(optional)</span>
                    </label>
                    <input type="email" placeholder="parent2@email.com" value={email2} onChange={(e) => setEmail2(e.target.value)} />
                  </div>
                </div>
              )}

              {/* Devices */}
              <div className="section">
                <div className="section-title">
                  <svg viewBox="0 0 24 24">
                    <rect x="5" y="2" width="14" height="20" rx="2" />
                    <line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                  Devices
                </div>
                <div className="device-grid">
                  {config.devices.map((d) => (
                    <div
                      key={d.name}
                      className={'device-item' + (selected.includes(d.name) ? ' selected' : '')}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selected.includes(d.name)}
                      onClick={() => toggleDevice(d.name)}
                      onKeyDown={onActivate(() => toggleDevice(d.name))}
                    >
                      {d.icon}
                      <span className="dev-name">{d.name}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: selected.some((s) => config.needsId.includes(s)) ? '.625rem' : 0 }}>
                  {config.needsId
                    .filter((dev) => selected.includes(dev))
                    .map((dev) => {
                      const st = getState(dev);
                      const photos = config.needsPhotos.includes(dev);
                      return (
                        <div className="device-detail" key={dev}>
                          <div className="device-detail-name">{dev}</div>
                          <div className="device-field">
                            <label>Asset ID</label>
                            <input type="text" placeholder="Serial number or asset ID" value={st.assetId} onChange={(e) => setState(dev, { assetId: e.target.value })} />
                          </div>
                          {photos && (
                            <>
                              <span className="subsection-label">Front &amp; Back Images — {dev}</span>
                              <PhotoGrid photos={st.images} onAdd={(f) => addPhotos(dev, 'images', f)} onDelete={(i) => setState(dev, { images: st.images.filter((_, x) => x !== i) })} />
                              <label className={'damage-toggle' + (st.hasDamage ? ' active' : '')}>
                                <input type="checkbox" checked={st.hasDamage} onChange={(e) => setState(dev, { hasDamage: e.target.checked })} />
                                <span>Any damage?</span>
                              </label>
                              {st.hasDamage && (
                                <div className="damage-section">
                                  <span className="damage-label">Damage photos — {dev}</span>
                                  <PhotoGrid photos={st.damagePhotos} onAdd={(f) => addPhotos(dev, 'damagePhotos', f)} onDelete={(i) => setState(dev, { damagePhotos: st.damagePhotos.filter((_, x) => x !== i) })} />
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Signature */}
              <div className="section">
                <div className="section-title">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                  Signature
                </div>
                <div className="field" style={{ marginBottom: '.875rem' }}>
                  <label style={{ marginBottom: 8 }}>Signed by</label>
                  <div className={'signer-grid cols-' + config.signerCols}>
                    {config.signers.map((s) => (
                      <div
                        key={s.label}
                        className={'signer-item' + (signer === s.label ? ' selected' : '')}
                        role="button"
                        tabIndex={0}
                        aria-pressed={signer === s.label}
                        onClick={() => setSigner(s.label)}
                        onKeyDown={onActivate(() => setSigner(s.label))}
                      >
                        {s.icon}
                        {s.label}
                      </div>
                    ))}
                  </div>
                </div>
                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--f-gray-600)', display: 'block', marginBottom: 6 }}>Sign below</label>
                <SignaturePad ref={sigRef} width={640} height={150} />
                <div className="sig-actions">
                  <button className="btn-ghost" type="button" onClick={() => sigRef.current?.clear()}>
                    <svg viewBox="0 0 24 24">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    Clear signature
                  </button>
                </div>
              </div>

              <button className="submit-btn" onClick={handleSubmit} disabled={busy}>
                <svg viewBox="0 0 24 24">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                {busy ? 'Sending…' : 'Submit form'}
              </button>
            </>
          )}
        </div>

        {toastNode}
      </div>
    </AuthGuard>
  );
}
