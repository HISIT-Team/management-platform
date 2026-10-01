'use client';
/* Student QR card.
   Renders, fully client-side, the QR code read by the scanner in
   /modulo-student (Check-in / Check-out). The student data travels in the
   URL fragment (after '#') so it never reaches the server or the CDN logs.
   Keys (same ones handleQr() expects):
   { nome, cognome, email, email1, email2, scuola, classe? }
   `classe` is display-only; the scanner ignores it.
   Restricted to IT/admin (same roles as /modulo-student). */
import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import AuthGuard from '@/components/AuthGuard';

interface StudentQrData {
  nome: string;
  cognome?: string;
  email?: string;
  email1?: string;
  email2?: string;
  scuola?: string;
  classe?: string;
}

const SCHOOLS = ['H-INTERNATIONAL SCHOOL SRL', 'H-INTERNATIONAL SCHOOL VICENZA SRL', 'H-INTERNATIONAL SCHOOL ROSÀ SRL'];

/* Maps whatever is in the spreadsheet (e.g. "Vicenza", "Rosà", "Venezia")
   to the legal-entity name the check-in/out form expects. */
function normaliseSchool(v = ''): string {
  const s = v.trim();
  const l = s.toLowerCase();
  if (!s) return '';
  const exact = SCHOOLS.find((o) => o.toLowerCase() === l);
  if (exact) return exact;
  if (l.includes('vicenza')) return SCHOOLS[1];
  if (l.includes('ros')) return SCHOOLS[2];
  if (/venezia|venice|treviso|roncade|tron|mogliano/.test(l)) return SCHOOLS[0];
  return s;
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/* Two accepted fragment formats:
   1. readable — #nome=Marco&cognome=Rossi&email=…&email1=…&email2=…&scuola=Vicenza&classe=G7A
      or with short keys: #n=…&c=…&e=…&p1=…&p2=…&s=…&k=…
      (easy to build with an Excel formula; '+' is kept literally so emails like a+b@x work)
   2. compact  — #<base64url(JSON)> */
function decodeFragment(hash: string): StudentQrData | null {
  const raw = hash.replace(/^#/, '').trim();
  if (!raw) return null;
  if (/(^|&)(nome|n)=/.test(raw)) {
    const d: Record<string, string> = {};
    for (const part of raw.split('&')) {
      const i = part.indexOf('=');
      if (i > 0) d[safeDecode(part.slice(0, i)).trim().toLowerCase()] = safeDecode(part.slice(i + 1)).trim();
    }
    // Short aliases keep Excel HYPERLINK() under its 255-character limit.
    const alias: Record<string, string> = { n: 'nome', c: 'cognome', e: 'email', p1: 'email1', p2: 'email2', s: 'scuola', k: 'classe' };
    for (const [short, long] of Object.entries(alias)) if (d[short] !== undefined && d[long] === undefined) d[long] = d[short];
    return d.nome ? (d as unknown as StudentQrData) : null;
  }
  try {
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(raw.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes)) as StudentQrData;
    return typeof data?.nome === 'string' ? data : null;
  } catch {
    return null;
  }
}

export default function StudentQrClient() {
  const [data, setData] = useState<StudentQrData | null>(null);
  const [svg, setSvg] = useState('');
  const [state, setState] = useState<'loading' | 'ok' | 'invalid'>('loading');

  useEffect(() => {
    const load = async () => {
      const d = decodeFragment(window.location.hash);
      if (!d) {
        setState('invalid');
        return;
      }
      d.scuola = normaliseSchool(d.scuola);
      // Encode exactly the keys the scanner reads (classe is shown, not encoded).
      const payload = JSON.stringify({
        nome: d.nome,
        cognome: d.cognome ?? '',
        email: d.email ?? '',
        email1: d.email1 ?? '',
        email2: d.email2 ?? '',
        scuola: d.scuola ?? '',
      });
      const out = await QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 });
      setData(d);
      setSvg(out);
      setState('ok');
    };
    load();
    window.addEventListener('hashchange', load);
    return () => window.removeEventListener('hashchange', load);
  }, []);

  return (
    <AuthGuard roles={['it', 'admin']}>
    <div className="form-page narrow">
      <div className="page-header">
        <div className="logo">
          <svg viewBox="0 0 24 24">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="3" height="3" />
            <rect x="18" y="18" width="3" height="3" />
          </svg>
        </div>
        <div>
          <h1>Student QR code</h1>
          <p>Scan it in IT → Student Check-in / Check-out</p>
        </div>
      </div>

      <div className="form-wrap">
        {state === 'invalid' && (
          <div className="section" style={{ textAlign: 'center' }}>
            <p style={{ fontWeight: 600 }}>Invalid or incomplete QR link.</p>
            <p style={{ fontSize: 13, color: 'var(--f-gray-600)' }}>Open the link again from the student list.</p>
          </div>
        )}

        {state === 'ok' && data && (
          <div className="section" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>
              {data.nome} {data.cognome}
            </div>
            <div style={{ fontSize: 13, color: 'var(--f-gray-600)', marginBottom: '1rem' }}>
              {[data.classe, data.scuola].filter(Boolean).join(' · ')}
            </div>
            <div
              aria-label={`QR code for ${data.nome} ${data.cognome ?? ''}`}
              role="img"
              style={{ width: '100%', maxWidth: 320, margin: '0 auto', lineHeight: 0 }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            {data.email && <div style={{ fontSize: 13, color: 'var(--f-gray-600)', marginTop: '.75rem' }}>{data.email}</div>}
            <div className="qr-print-hide" style={{ display: 'flex', justifyContent: 'center', marginTop: '1.25rem' }}>
              <button className="btn-ghost" type="button" onClick={() => window.print()}>
                <svg viewBox="0 0 24 24">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                Print
              </button>
            </div>
          </div>
        )}
      </div>
      <style>{`@media print { .qr-print-hide { display: none !important; } .form-page .section { box-shadow: none; border: none; } }`}</style>
    </div>
    </AuthGuard>
  );
}
