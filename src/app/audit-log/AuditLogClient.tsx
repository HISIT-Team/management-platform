'use client';
/* Gestione Backend → Registro attività (superadmin only).
   Read-only view of public.audit_log: role changes, user edits and
   deletions, deleted device records, signature purges. Rows are written
   by database triggers (migration 0014) and cannot be edited here. */
import React, { useEffect, useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Topbar from '@/components/Topbar';
import { type AuditEntry, AUDIT_ACTIONS, listAudit, roleMeta } from '@/lib/users';
import { asLocalDate, exportExcel } from '@/lib/excel';

const IconLog = (
  <svg viewBox="0 0 24 24">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="8" y1="13" x2="16" y2="13" />
    <line x1="8" y1="17" x2="13" y2="17" />
  </svg>
);
const IconSearch = (
  <svg viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const ACTION_TONE: Record<string, [string, string]> = {
  role_changed: ['#3C5A8A', '#E8EEF7'],
  user_edited: ['#6E6468', '#F1EDEC'],
  user_deleted: ['#A32D2D', '#FBEAEA'],
  device_record_deleted: ['#9A5B00', '#FFF3E4'],
  signatures_purged: ['#2F6E5B', '#E6F2EC'],
  mfa_policy_changed: ['#5B1220', '#F3E3E6'],
  mfa_reset: ['#9A5B00', '#FFF3E4'],
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const str = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const role = (v: unknown) => (typeof v === 'string' ? roleMeta(v).label : '—');

function describe(e: AuditEntry): string {
  const d = e.details || {};
  switch (e.action) {
    case 'role_changed':
      return `${role(d.from)} → ${role(d.to)}`;
    case 'user_edited': {
      const f = (d.from || {}) as Record<string, unknown>;
      const t = (d.to || {}) as Record<string, unknown>;
      return `${str(f.first_name)} ${str(f.last_name)} → ${str(t.first_name)} ${str(t.last_name)}`;
    }
    case 'user_deleted':
      return `Ruolo ${role(d.role)} · ${str(d.first_name)} ${str(d.last_name)}`;
    case 'device_record_deleted':
      return `${d.operation === 'Check-out' ? 'Consegna' : 'Restituzione'} del ${d.recorded_at ? fmt(String(d.recorded_at)) : '—'}${
        d.macbook_id ? ' · MacBook ' + d.macbook_id : ''
      }${d.ipad_id ? ' · iPad ' + d.ipad_id : ''}`;
    case 'mfa_policy_changed':
      return `MFA ${d.to ? 'obbligatoria' : 'non obbligatoria'} per il ruolo ${role(e.target_label)}`;
    case 'mfa_reset':
      return `${str(d.factors_removed)} app di autenticazione rimosse`;
    case 'signatures_purged':
      return `${str(d.records)} firme più vecchie di ${str(d.older_than_months)} mesi`;
    default:
      return JSON.stringify(d);
  }
}

export default function AuditLogClient() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [action, setAction] = useState('all');

  useEffect(() => {
    let active = true;
    listAudit()
      .then((r) => active && setRows(r))
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.action] = (c[r.action] || 0) + 1;
    return c;
  }, [rows]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          (action === 'all' || r.action === action) &&
          (!q || [r.actor_email, r.target_label, describe(r)].some((v) => (v || '').toLowerCase().includes(q))),
      ),
    [rows, action, q],
  );

  const [exporting, setExporting] = useState(false);
  async function handleExport() {
    if (!visible.length) return;
    setExporting(true);
    try {
      await exportExcel(
        'registro-attivita',
        'Registro attività',
        [
          { header: 'Data', type: 'datetime', width: 17, value: (e) => asLocalDate(e.created_at) },
          { header: 'Azione', width: 26, value: (e) => AUDIT_ACTIONS[e.action] ?? e.action },
          { header: 'Eseguita da', width: 32, value: (e) => e.actor_email ?? '' },
          { header: 'Oggetto', width: 32, value: (e) => e.target_label ?? e.target_id ?? '' },
          { header: 'Dettaglio', width: 60, value: (e) => describe(e) },
        ],
        visible,
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <AuthGuard roles={['superadmin']}>
      <Topbar label="Gestione Backend" href="/backend" variant="back" />
      <div className="budget-page al-page">
        <div className="shell">
          <div className="b-head">
            <div className="b-head-left">
              <div className="logo">{IconLog}</div>
              <div>
                <p className="b-eyebrow">Gestione Backend · Super Admin</p>
                <h1>
                  Registro <em>attività</em>
                </h1>
                <p>Chi ha cambiato ruoli, modificato o eliminato utenti e record — in sola lettura</p>
              </div>
            </div>
            <button className="ui-btn excel" onClick={handleExport} disabled={exporting || !visible.length}>
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <path d="M12 15V3" />
                </svg>
              Esporta Excel
            </button>
          </div>

          {error ? (
            <div className="setup-note">
              <b>Registro non raggiungibile.</b> {error}
              <br />
              Verifica di aver eseguito <code>supabase/migrations/0014_security_hardening.sql</code> nel SQL Editor.
            </div>
          ) : null}

          <div className="al-search">
            {IconSearch}
            <input
              type="text"
              placeholder="Cerca per utente, email o dettaglio…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Cerca nel registro attività"
            />
          </div>
          <div className="filters">
            <button className={'fchip' + (action === 'all' ? ' active' : '')} onClick={() => setAction('all')}>
              Tutte · {rows.length}
            </button>
            {Object.keys(AUDIT_ACTIONS)
              .filter((a) => counts[a])
              .map((a) => (
                <button key={a} className={'fchip' + (action === a ? ' active' : '')} onClick={() => setAction(a)}>
                  <i className="legend-dot" style={{ background: ACTION_TONE[a]?.[0] }} />
                  {AUDIT_ACTIONS[a]} · {counts[a]}
                </button>
              ))}
          </div>

          <div className="ledger">
            {loading ? (
              <div className="empty">
                <p>Caricamento registro…</p>
              </div>
            ) : visible.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">{IconLog}</div>
                <h3>{rows.length === 0 ? 'Nessuna attività registrata' : 'Nessun risultato'}</h3>
                <p>Le azioni amministrative compaiono qui appena vengono eseguite.</p>
              </div>
            ) : (
              <div className="ledger-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Azione</th>
                      <th>Su</th>
                      <th>Dettaglio</th>
                      <th>Eseguita da</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => {
                      const tone = ACTION_TONE[r.action] ?? ['#6E6468', '#F1EDEC'];
                      return (
                        <tr key={r.id}>
                          <td className="col-date">{fmt(r.created_at)}</td>
                          <td>
                            <span className="tag" style={{ ['--accent' as string]: tone[0], ['--accent-soft' as string]: tone[1] }}>
                              {AUDIT_ACTIONS[r.action] ?? r.action}
                            </span>
                          </td>
                          <td>{r.target_label || '—'}</td>
                          <td className="al-detail">{describe(r)}</td>
                          <td className="al-actor">{r.actor_email || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <footer className="b-footer">
            H-FARM International School · Gestione Backend — Registro attività
            <span>Via Adriano Olivetti 1 - 31056 Roncade (TV)</span>
          </footer>
        </div>
      </div>
      <style>{`
        .al-page .al-search { display: flex; align-items: center; gap: 10px; margin-bottom: .8rem; background: var(--b-surface); border: 1.5px solid #E4DCDD; border-radius: 999px; padding: 4px 16px; box-shadow: var(--b-shadow); }
        .al-page .al-search:focus-within { border-color: var(--brand); box-shadow: 0 0 0 4px rgba(139, 26, 43, .08); }
        .al-page .al-search > svg { width: 18px; height: 18px; flex-shrink: 0; stroke: var(--b-faint); fill: none; stroke-width: 2; stroke-linecap: round; }
        .al-page .al-search input[type=text] { flex: 1; border: none; background: transparent; padding: 10px 0; box-shadow: none; }
        .al-page tbody td { white-space: nowrap; }
        .al-page td.al-detail { white-space: normal; min-width: 260px; color: var(--b-muted); font-size: 13px; }
        .al-page td.al-actor { color: var(--b-muted); font-size: 13px; }
      `}</style>
    </AuthGuard>
  );
}
