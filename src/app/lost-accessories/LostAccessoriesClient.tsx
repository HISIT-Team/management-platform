'use client';
/* IT → Accessori smarriti: history of the reports (lost_accessories_log,
   migration 0023) + button to a new report. The history holds only the
   email, student/employee and the accessories: no names (by design). */
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import Topbar from '@/components/Topbar';
import { useToast } from '@/components/useToast';
import { ACCESSORIES, type LostAccessoryRow, accessoryLabel, deleteLostAccessory, listLostAccessories } from '@/lib/lostAccessories';
import { asLocalDate, exportExcel } from '@/lib/excel';

const IconPlug = (
  <svg viewBox="0 0 24 24">
    <path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0V8zM12 17v5" />
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
const IconDownload = (
  <svg viewBox="0 0 24 24">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);
const IconPlus = (
  <svg viewBox="0 0 24 24">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

type TypeFilter = 'all' | 'student' | 'employee';
const TYPE_LABEL = { student: 'Studente', employee: 'Dipendente' } as const;
const TYPE_TAG: Record<string, React.CSSProperties> = {
  student: { ['--accent' as string]: '#3C5A8A', ['--accent-soft' as string]: '#E8EEF7' },
  employee: { ['--accent' as string]: '#6A3E8A', ['--accent-soft' as string]: '#F1EAF7' },
};
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function LostAccessoriesClient() {
  const [rows, setRows] = useState<LostAccessoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [item, setItem] = useState('all');
  const [toDelete, setToDelete] = useState<LostAccessoryRow | null>(null);
  const [busy, setBusy] = useState(false);
  const { showToast, toastNode } = useToast();

  useEffect(() => {
    let active = true;
    listLostAccessories()
      .then((r) => active && setRows(r))
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && !busy) setToDelete(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          (type === 'all' || r.person_type === type) &&
          (item === 'all' || r.accessories.includes(item as LostAccessoryRow['accessories'][number])) &&
          (!q || r.email.toLowerCase().includes(q) || (r.notes ?? '').toLowerCase().includes(q)),
      ),
    [rows, type, item, q],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) for (const a of r.accessories) c[a] = (c[a] ?? 0) + 1;
    return c;
  }, [rows]);
  // Reports of the last 30 days (computed when the rows load).
  const last30 = useMemo(() => {
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    return rows.filter((r) => new Date(r.created_at) >= monthAgo).length;
  }, [rows]);

  /* Exact email typed → how many reports for that person. */
  const summary = useMemo(() => {
    if (!q || !rows.some((r) => r.email.toLowerCase() === q)) return null;
    const mine = rows.filter((r) => r.email.toLowerCase() === q);
    const n: Record<string, number> = {};
    for (const r of mine) for (const a of r.accessories) n[a] = (n[a] ?? 0) + 1;
    return `${query.trim()}: ${mine.length} ${mine.length === 1 ? 'segnalazione' : 'segnalazioni'} — ${Object.entries(n)
      .map(([a, k]) => `${accessoryLabel(a)} ×${k}`)
      .join(', ')}`;
  }, [q, query, rows]);

  const handleDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await deleteLostAccessory(toDelete.id);
      setRows((p) => p.filter((r) => r.id !== toDelete.id));
      showToast('Segnalazione eliminata ✓');
      setToDelete(null);
    } catch (e) {
      showToast((e as Error).message, true);
    }
    setBusy(false);
  };

  const handleExport = async () => {
    try {
      const n = await exportExcel<LostAccessoryRow>(
        'accessori-smarriti',
        'Accessori smarriti',
        [
          { header: 'Data', type: 'datetime', width: 18, value: (r) => asLocalDate(r.created_at) },
          { header: 'Tipo', width: 12, value: (r) => TYPE_LABEL[r.person_type] },
          { header: 'Email', width: 36, value: (r) => r.email },
          ...ACCESSORIES.map((a) => ({ header: a.label, width: 14, value: (r: LostAccessoryRow) => (r.accessories.includes(a.code) ? 'Sì' : '') })),
          { header: 'Note', width: 40, value: (r) => r.notes ?? '' },
          { header: 'Registrato da', width: 22, value: (r) => r.created_by_name ?? '' },
        ],
        visible,
      );
      showToast(`Export creato ✓ — ${n} ${n === 1 ? 'riga' : 'righe'}`);
    } catch (e) {
      showToast('Export non riuscito: ' + (e as Error).message, true);
    }
  };

  return (
    <AuthGuard roles={['it', 'admin']} perm="it.lost_accessories">
      <Topbar label="IT" href="/it" variant="back" />
      <div className="budget-page la-page">
        <div className="shell">
          <div className="b-head">
            <div className="b-head-left">
              <div className="logo">{IconPlug}</div>
              <div>
                <p className="b-eyebrow">IT · Accessori</p>
                <h1>
                  Accessori <em>smarriti</em>
                </h1>
                <p>Alimentatori e cavi smarriti da studenti e dipendenti</p>
              </div>
            </div>
            <div className="la-actions">
              <button className="btn-quiet" onClick={handleExport} disabled={loading || visible.length === 0}>
                {IconDownload}
                Esporta Excel
              </button>
              <Link className="btn-primary" href="/lost-accessories/new">
                {IconPlus}
                Nuova segnalazione
              </Link>
            </div>
          </div>

          {error ? (
            <div className="setup-note">
              <b>Storico non raggiungibile.</b> {error}
            </div>
          ) : null}

          {loading ? (
            <div className="skeleton" />
          ) : (
            <section className="hero">
              <div className="stat-row la-stats">
                <div className="stat">
                  <div className="stat-lbl">Segnalazioni</div>
                  <div className="stat-val">{rows.length}</div>
                  <div className="stat-sub">{last30} negli ultimi 30 giorni</div>
                </div>
                {ACCESSORIES.map((a) => (
                  <div className="stat is-spent" key={a.code}>
                    <div className="stat-lbl">{a.label}</div>
                    <div className="stat-val">{counts[a.code] ?? 0}</div>
                    <div className="stat-sub">smarriti in totale</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <h2 className="section-label">Ricerca</h2>
          <div className="la-search">
            {IconSearch}
            <input type="text" placeholder="Cerca per email o nelle note…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Cerca per email" autoComplete="off" spellCheck={false} />
          </div>
          {summary ? <div className="la-summary">{summary}</div> : null}

          <div className="filters la-filters">
            {(['all', 'student', 'employee'] as TypeFilter[]).map((t) => (
              <button key={t} className={'fchip' + (type === t ? ' active' : '')} onClick={() => setType(t)}>
                {t === 'all' ? 'Tutti' : t === 'student' ? 'Studenti' : 'Dipendenti'}
              </button>
            ))}
            <select value={item} onChange={(e) => setItem(e.target.value)} aria-label="Filtra per accessorio">
              <option value="all">Tutti gli accessori</option>
              {ACCESSORIES.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.label}
                </option>
              ))}
            </select>
            <span className="la-count">
              {visible.length} {visible.length === 1 ? 'risultato' : 'risultati'}
            </span>
          </div>

          <div className="ledger">
            {loading ? (
              <div className="empty">
                <p>Caricamento…</p>
              </div>
            ) : visible.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">{IconPlug}</div>
                <h3>{rows.length === 0 ? 'Nessuna segnalazione' : 'Nessun risultato'}</h3>
                <p>{rows.length === 0 ? 'Le segnalazioni compaiono qui dopo il primo invio del modulo.' : 'Prova con un’altra email o togli i filtri.'}</p>
              </div>
            ) : (
              <div className="ledger-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Tipo</th>
                      <th>Email</th>
                      <th>Accessori smarriti</th>
                      <th>Note</th>
                      <th>Registrato da</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => (
                      <tr key={r.id}>
                        <td className="col-date">{fmtDateTime(r.created_at)}</td>
                        <td>
                          <span className="tag" style={TYPE_TAG[r.person_type]}>
                            {TYPE_LABEL[r.person_type]}
                          </span>
                        </td>
                        <td>
                          <button className="la-link" onClick={() => setQuery(r.email)} title="Mostra le segnalazioni di questa persona">
                            {r.email}
                          </button>
                        </td>
                        <td className="la-items">
                          {r.accessories.map((a) => (
                            <span key={a} className="la-chip">
                              {accessoryLabel(a)}
                            </span>
                          ))}
                        </td>
                        <td className="la-notes">{r.notes || <span className="la-muted">—</span>}</td>
                        <td className="la-muted">{r.created_by_name || '—'}</td>
                        <td className="col-actions">
                          <button className="icon-btn" title="Elimina segnalazione" aria-label={`Elimina la segnalazione del ${fmtDateTime(r.created_at)}`} onClick={() => setToDelete(r)}>
                            {IconTrash}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="la-privacy">Per tutela della privacy lo storico non conserva nome e cognome né le email dei genitori: restano solo nel flusso Power Automate.</p>

          <footer className="b-footer">
            H-FARM International School · IT — Accessori smarriti
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
                  <h2>Eliminare la segnalazione?</h2>
                  <p>L&apos;operazione non si può annullare</p>
                </div>
              </div>
              <div className="b-modal-body">
                <p className="confirm-text">
                  {fmtDateTime(toDelete.created_at)} — {toDelete.email}: {toDelete.accessories.map(accessoryLabel).join(', ')}.
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
        .la-page .la-stats { grid-template-columns: repeat(5, minmax(0, 1fr)); }
        .la-page .la-actions { display: flex; gap: 10px; flex-wrap: wrap; }
        .la-page .la-actions a.btn-primary { text-decoration: none; display: inline-flex; align-items: center; gap: 8px; }
        .la-page .la-search { display: flex; align-items: center; gap: 10px; margin-bottom: .8rem; background: var(--b-surface); border: 1.5px solid #E4DCDD; border-radius: 999px; padding: 4px 8px 4px 16px; box-shadow: var(--b-shadow); }
        .la-page .la-search:focus-within { border-color: var(--brand); box-shadow: 0 0 0 4px rgba(139, 26, 43, .08); }
        .la-page .la-search > svg { width: 18px; height: 18px; flex-shrink: 0; stroke: var(--b-faint); fill: none; stroke-width: 2; stroke-linecap: round; }
        .la-page .la-search input[type=text] { flex: 1; border: none; background: transparent; padding: 10px 0; box-shadow: none; font-size: 15px; }
        .la-page .la-summary { font-size: 13.5px; font-weight: 600; border-radius: 13px; padding: .7rem 1rem; margin-bottom: .8rem; background: #FFF3E4; color: var(--b-warn); }
        .la-page .la-filters { align-items: center; }
        .la-page .la-filters select { width: auto; padding: 7px 34px 7px 13px; font-size: 13px; font-weight: 600; border-radius: 999px; }
        .la-page .la-count { margin-left: auto; font-size: 12.5px; color: var(--b-muted); font-weight: 600; }
        .la-page .la-link { all: unset; cursor: pointer; font-weight: 600; color: var(--b-ink); }
        .la-page .la-link:hover { color: var(--brand); text-decoration: underline; }
        .la-page tbody td { white-space: nowrap; }
        .la-page .la-items { white-space: normal; }
        .la-page .la-chip { display: inline-block; margin: 2px 4px 2px 0; padding: 3px 9px; border-radius: 999px; background: #FFF3E4; color: #7A4A00; font-size: 12px; font-weight: 700; white-space: nowrap; }
        .la-page .la-notes { white-space: normal; max-width: 260px; font-size: 13px; }
        .la-page .la-muted { color: var(--b-muted); }
        .la-page td.col-actions { width: 44px; text-align: right; }
        .la-page .la-privacy { font-size: 12.5px; color: var(--b-muted); margin-top: .9rem; }
        @media (max-width: 1100px) { .la-page .la-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        @media (max-width: 640px) { .la-page .la-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      `}</style>
    </AuthGuard>
  );
}
