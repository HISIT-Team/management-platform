'use client';
/* IT → Bozze consegne (drafts of the device forms, migration 0024).
   Each draft opens in its form, ready to be signed and sent; once sent it
   is deleted. Expired drafts (14 days) are purged when this page opens. */
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import Topbar from '@/components/Topbar';
import { useToast } from '@/components/useToast';
import { type DraftSummary, deleteDraft, draftHref, listDrafts } from '@/lib/deviceDrafts';

const IconDraft = (
  <svg viewBox="0 0 24 24">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);
const IconSearch = (
  <svg viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
const IconTrash = (
  <svg viewBox="0 0 24 24">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);
const IconPen = (
  <svg viewBox="0 0 24 24">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

type OpFilter = 'all' | 'Check-out' | 'Check-in';
const OP_LABEL = { 'Check-out': 'Consegna', 'Check-in': 'Restituzione' } as const;
const OP_TAG: Record<string, React.CSSProperties> = {
  'Check-out': { ['--accent' as string]: '#2F6E5B', ['--accent-soft' as string]: '#E6F2EC' },
  'Check-in': { ['--accent' as string]: '#8B1A2B', ['--accent-soft' as string]: '#F9EFF0' },
};
const fmt = (iso: string) => new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function DeviceDraftsClient() {
  const [rows, setRows] = useState<DraftSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [op, setOp] = useState<OpFilter>('all');
  const [toDelete, setToDelete] = useState<DraftSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const { showToast, toastNode } = useToast();

  useEffect(() => {
    let active = true;
    listDrafts()
      .then((r) => active && setRows(r))
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () => rows.filter((r) => (op === 'all' || r.operation === op) && (!q || r.label.toLowerCase().includes(q) || (r.email ?? '').toLowerCase().includes(q))),
    [rows, op, q],
  );

  const handleDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      const gone = await deleteDraft(toDelete.id);
      if (!gone) throw new Error('Bozza non eliminata: permesso mancante.');
      setRows((p) => p.filter((r) => r.id !== toDelete.id));
      showToast('Bozza eliminata ✓');
      setToDelete(null);
    } catch (e) {
      showToast((e as Error).message, true);
    }
    setBusy(false);
  };

  return (
    <AuthGuard roles={['it', 'admin']} perm="it.checkin_student">
      <Topbar label="IT" href="/it" variant="back" />
      <div className="budget-page dd-page">
        <div className="shell">
          <div className="b-head">
            <div className="b-head-left">
              <div className="logo">{IconDraft}</div>
              <div>
                <p className="b-eyebrow">IT · Dispositivi</p>
                <h1>
                  Bozze <em>consegne</em>
                </h1>
                <p>Moduli preparati in anticipo: apri la bozza, fai firmare e invia</p>
              </div>
            </div>
            <div className="dd-actions">
              <Link className="btn-quiet" href="/modulo-student?op=checkout">
                Nuova consegna studente
              </Link>
              <Link className="btn-quiet" href="/modulo-student?op=checkin">
                Nuova restituzione studente
              </Link>
            </div>
          </div>

          {error ? (
            <div className="setup-note">
              <b>Bozze non disponibili.</b> {error}
            </div>
          ) : null}

          <div className="dd-info">
            Una bozza contiene tutto tranne la firma. Viene <b>eliminata automaticamente quando il modulo firmato viene inviato</b>, e comunque dopo 14 giorni.
          </div>

          <div className="dd-search">
            {IconSearch}
            <input type="text" placeholder="Cerca per nome o email…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Cerca" autoComplete="off" spellCheck={false} />
          </div>
          <div className="filters dd-filters">
            {(['all', 'Check-out', 'Check-in'] as OpFilter[]).map((o) => (
              <button key={o} className={'fchip' + (op === o ? ' active' : '')} onClick={() => setOp(o)}>
                {o === 'all' ? 'Tutte' : o === 'Check-out' ? 'Consegne' : 'Restituzioni'}
              </button>
            ))}
            <span className="dd-count">
              {visible.length} {visible.length === 1 ? 'bozza' : 'bozze'}
            </span>
          </div>

          {loading ? (
            <div className="skeleton" />
          ) : visible.length === 0 ? (
            <div className="ledger">
              <div className="empty">
                <div className="empty-icon">{IconDraft}</div>
                <h3>{rows.length === 0 ? 'Nessuna bozza' : 'Nessun risultato'}</h3>
                <p>{rows.length === 0 ? 'Nel modulo di consegna o restituzione usa «Save as draft» per prepararne una.' : 'Prova con un altro nome o togli i filtri.'}</p>
              </div>
            </div>
          ) : (
            <div className="dd-list">
              {visible.map((d) => (
                <div className="dd-card" key={d.id}>
                  <div className="dd-main">
                    <div className="dd-top">
                      <span className="tag" style={OP_TAG[d.operation]}>
                        {OP_LABEL[d.operation]}
                      </span>
                      <span className="dd-kind">{d.kind === 'student' ? 'Studente' : 'Dipendente'}</span>
                    </div>
                    <b className="dd-name">{d.label}</b>
                    {d.email ? <span className="dd-email">{d.email}</span> : null}
                    <span className="dd-meta">
                      {d.devices.length ? d.devices.join(' · ') : 'Nessun dispositivo selezionato'}
                      {d.photos_count ? ` · ${d.photos_count} foto` : ''}
                    </span>
                    <span className="dd-meta">
                      Preparata {d.created_by_name ? `da ${d.created_by_name} ` : ''}il {fmt(d.created_at)}
                      {d.updated_at !== d.created_at ? ` · modificata ${fmt(d.updated_at)}` : ''} · scade il{' '}
                      {new Date(d.expires_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}
                    </span>
                  </div>
                  <div className="dd-btns">
                    <Link className="btn-primary" href={draftHref(d)}>
                      {IconPen}
                      Apri e fai firmare
                    </Link>
                    <button className="icon-btn" title="Elimina bozza" aria-label={`Elimina la bozza di ${d.label}`} onClick={() => setToDelete(d)}>
                      {IconTrash}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <footer className="b-footer">
            H-FARM International School · IT — Bozze consegne
            <span>Via Adriano Olivetti 1 - 31056 Roncade (TV)</span>
          </footer>
        </div>

        {toDelete ? (
          <div
            className="b-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Conferma eliminazione"
            onMouseDown={(ev) => {
              if (ev.target === ev.currentTarget && !busy) setToDelete(null);
            }}
          >
            <div className="b-modal" style={{ maxWidth: 420 }}>
              <div className="b-modal-head">
                <div className="mi">{IconTrash}</div>
                <div>
                  <h2>Eliminare la bozza?</h2>
                  <p>Il modulo non è stato inviato</p>
                </div>
              </div>
              <div className="b-modal-body">
                <p className="confirm-text">
                  {OP_LABEL[toDelete.operation]} — {toDelete.label}. I dati e le foto della bozza vengono cancellati.
                </p>
              </div>
              <div className="b-modal-foot">
                <button className="btn-quiet" onClick={() => setToDelete(null)} disabled={busy}>
                  Annulla
                </button>
                <button className="btn-primary" onClick={handleDelete} disabled={busy}>
                  {busy ? 'Eliminazione…' : 'Elimina'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {toastNode}
      </div>

      <style>{`
        .dd-page .dd-actions { display: flex; gap: 10px; flex-wrap: wrap; }
        .dd-page .dd-actions a { text-decoration: none; }
        .dd-page .dd-info { font-size: 13.5px; color: #2B4470; background: #EEF2FA; border: 1px solid #CDD8EC; border-radius: 13px; padding: .75rem 1rem; margin-bottom: 1rem; }
        .dd-page .dd-search { display: flex; align-items: center; gap: 10px; margin-bottom: .8rem; background: var(--b-surface); border: 1.5px solid #E4DCDD; border-radius: 999px; padding: 4px 8px 4px 16px; box-shadow: var(--b-shadow); }
        .dd-page .dd-search:focus-within { border-color: var(--brand); }
        .dd-page .dd-search > svg { width: 18px; height: 18px; stroke: var(--b-faint); fill: none; stroke-width: 2; stroke-linecap: round; flex-shrink: 0; }
        .dd-page .dd-search input[type=text] { flex: 1; border: none; background: transparent; padding: 10px 0; box-shadow: none; font-size: 15px; }
        .dd-page .dd-filters { align-items: center; }
        .dd-page .dd-count { margin-left: auto; font-size: 12.5px; color: var(--b-muted); font-weight: 600; }
        .dd-page .dd-list { display: grid; gap: 10px; }
        .dd-page .dd-card { display: flex; align-items: center; gap: 14px; background: var(--b-surface); border: 1px solid #EBE3E4; border-radius: 16px; padding: 14px 16px; box-shadow: var(--b-shadow); }
        .dd-page .dd-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .dd-page .dd-top { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
        .dd-page .dd-kind { font-size: 11.5px; font-weight: 700; color: var(--b-muted); text-transform: uppercase; letter-spacing: .06em; }
        .dd-page .dd-name { font-size: 16px; }
        .dd-page .dd-email { font-size: 13px; color: var(--b-muted); }
        .dd-page .dd-meta { font-size: 12.5px; color: var(--b-muted); }
        .dd-page .dd-btns { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .dd-page .dd-btns a.btn-primary { text-decoration: none; display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
        .dd-page .dd-btns a.btn-primary svg { width: 16px; height: 16px; }
        @media (max-width: 640px) { .dd-page .dd-card { flex-direction: column; align-items: stretch; } .dd-page .dd-btns { justify-content: space-between; } }
      `}</style>
    </AuthGuard>
  );
}
