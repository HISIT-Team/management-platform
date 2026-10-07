'use client';
/* IT — Storico assegnazioni dispositivi studenti.
   Dashboard over `student_device_log` (written by the student
   Check-in / Check-out form): full history, search by email or device ID,
   filters by operation and school, and who currently holds which device.
   Each record can be edited (pencil, migration 0020) or deleted (bin).
   The signature column is never fetched. */
import React, { useEffect, useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Topbar from '@/components/Topbar';
import { useToast } from '@/components/useToast';
import {
  type DeviceLogChanges,
  type StudentDeviceLogRow,
  SCHOOLS,
  SIGNERS,
  ACCESSORIES,
  type AccessoryKey,
  deleteStudentDeviceLog,
  listStudentDeviceLog,
  schoolShort,
  updateStudentDeviceLog,
} from '@/lib/deviceLog';
import { type ExportOptions, exportDeviceHistory, filterForExport } from '@/lib/deviceExport';

/* ── Icons ─────────────────────────────────────────────────────── */
const IconHistory = (
  <svg viewBox="0 0 24 24">
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <polyline points="3 4 3 9 8 9" />
    <polyline points="12 7 12 12 15.5 14" />
  </svg>
);
const IconSearch = (
  <svg viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
const IconClose = (
  <svg viewBox="0 0 24 24">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
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
const IconEdit = (
  <svg viewBox="0 0 24 24">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);
const IconDownload = (
  <svg viewBox="0 0 24 24">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);
const IconRefresh = (
  <svg viewBox="0 0 24 24">
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

/* ── Helpers ───────────────────────────────────────────────────── */
type OpFilter = 'all' | 'Check-in' | 'Check-out';
const PAGE = 200;

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
const pad = (n: number) => String(n).padStart(2, '0');
/** ISO → value of an <input type="datetime-local"> (local time). */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const SIGNER_LABEL: Record<string, string> = { Student: 'Studente', Parent: 'Genitore', 'IT Support': 'IT Support' };

/** Charger / cable included? Icon + ✓ yes / ✗ no; nothing when not
    recorded (records saved before migration 0021). */
const ACC_ICON = {
  charger: <path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0V8zM12 17v5" />,
  cable: <path d="M7 3v5a3 3 0 0 0 3 3h4a3 3 0 0 1 3 3v7M5 3h4M15 21h4" />,
};
function Acc({ v, kind, device }: { v: boolean | null | undefined; kind: 'charger' | 'cable'; device: string }) {
  if (v === null || v === undefined) return null;
  const label = `${kind === 'charger' ? 'Caricatore' : 'Cavo'} ${device} ${v ? 'incluso' : 'non incluso'}`;
  return (
    <span className={'dh-chg ' + (v ? 'yes' : 'no')} title={label} aria-label={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {ACC_ICON[kind]}
      </svg>
      {v ? '✓' : '✗'}
    </span>
  );
}

interface EditForm {
  when: string;
  operation: 'Check-in' | 'Check-out';
  email: string;
  school: string;
  macbook: string;
  ipad: string;
  signedBy: string;
  acc: Record<AccessoryKey, boolean | null>;
}

const OP_TAG: Record<string, React.CSSProperties> = {
  'Check-out': { ['--accent' as string]: '#2F6E5B', ['--accent-soft' as string]: '#E6F2EC' },
  'Check-in': { ['--accent' as string]: '#8B1A2B', ['--accent-soft' as string]: '#F9EFF0' },
};
/* HIS convention: Check-out = delivery to the student, Check-in = return to IT. */
const DELIVERY = 'Check-out';
const OP_LABEL: Record<string, string> = { 'Check-out': 'Consegna', 'Check-in': 'Restituzione' };

interface Holding {
  email: string;
  since: string;
}
interface LastMove {
  op: 'Check-in' | 'Check-out';
  email: string;
  at: string;
}

/* Replays the history oldest → newest: a delivery (Check-out) assigns the
   device to the student, a return (Check-in) releases it. */
function computeState(rows: StudentDeviceLogRow[]) {
  const holders = { mac: new Map<string, Holding>(), ipad: new Map<string, Holding>() };
  const last = new Map<string, LastMove>(); // device id (lowercase) → last movement
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    for (const [kind, id] of [
      ['mac', r.macbook_id],
      ['ipad', r.ipad_id],
    ] as const) {
      const key = norm(id);
      if (!key) continue;
      last.set(key, { op: r.operation, email: r.student_email, at: r.created_at });
      if (r.operation === DELIVERY) holders[kind].set(key, { email: r.student_email, since: r.created_at });
      else holders[kind].delete(key);
    }
  }
  return { holders, last };
}

export default function DeviceHistoryClient() {
  const [rows, setRows] = useState<StudentDeviceLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // ?q=… comes from the search box in the app shell's top bar. (This
  // component renders only after AuthGuard, i.e. in the browser.)
  const [query, setQuery] = useState(() => (typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('q') ?? ''));
  const [op, setOp] = useState<OpFilter>('all');
  const [school, setSchool] = useState('all');
  const [limit, setLimit] = useState(PAGE);
  const [toDelete, setToDelete] = useState<StudentDeviceLogRow | null>(null);
  const [toEdit, setToEdit] = useState<StudentDeviceLogRow | null>(null);
  const [edit, setEdit] = useState<EditForm | null>(null);
  const [editTried, setEditTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const { showToast, toastNode } = useToast();
  const [exportOpen, setExportOpen] = useState(false);
  const [exp, setExp] = useState<ExportOptions>({ device: 'all', operation: 'all', school: 'all', from: '', to: '' });
  const expCount = useMemo(() => filterForExport(rows, exp).length, [rows, exp]);

  const handleExport = async () => {
    setBusy(true);
    try {
      const n = await exportDeviceHistory(rows, exp);
      showToast(`Export creato ✓ — ${n} ${n === 1 ? 'riga' : 'righe'}`);
      setExportOpen(false);
    } catch (e) {
      showToast('Export non riuscito: ' + (e as Error).message, true);
    }
    setBusy(false);
  };

  // A new search from the top bar while already on this page.
  useEffect(() => {
    const onSearch = (e: Event) => setQuery(String((e as CustomEvent<string>).detail ?? ''));
    window.addEventListener('his:search', onSearch);
    return () => window.removeEventListener('his:search', onSearch);
  }, []);

  // Escape closes the confirmation dialog.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && !busy) {
        setToDelete(null);
        setToEdit(null);
        setExportOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy]);

  const openEdit = (r: StudentDeviceLogRow) => {
    setToEdit(r);
    setEditTried(false);
    setEdit({
      when: toLocalInput(r.created_at),
      operation: r.operation,
      email: r.student_email,
      school: r.school ?? '',
      macbook: r.macbook_id ?? '',
      ipad: r.ipad_id ?? '',
      signedBy: r.signed_by ?? '',
      acc: Object.fromEntries(ACCESSORIES.map((a) => [a.key, r[a.key] ?? null])) as Record<AccessoryKey, boolean | null>,
    });
  };

  const editErrors = useMemo(() => {
    const e: Partial<Record<keyof EditForm, string>> = {};
    if (!edit) return e;
    const d = new Date(edit.when);
    if (!edit.when || isNaN(d.getTime())) e.when = 'Inserisci data e ora';
    if (!EMAIL_RE.test(edit.email.trim())) e.email = 'Email non valida';
    if (!edit.school) e.school = 'Scegli la scuola';
    if (!edit.signedBy) e.signedBy = 'Scegli chi ha firmato';
    return e;
  }, [edit]);

  const editChanged =
    !!toEdit &&
    !!edit &&
    (edit.when !== toLocalInput(toEdit.created_at) ||
      edit.operation !== toEdit.operation ||
      edit.email.trim() !== toEdit.student_email ||
      edit.school !== (toEdit.school ?? '') ||
      edit.macbook.trim() !== (toEdit.macbook_id ?? '') ||
      edit.ipad.trim() !== (toEdit.ipad_id ?? '') ||
      edit.signedBy !== (toEdit.signed_by ?? '') ||
      ACCESSORIES.some((a) => edit.acc[a.key] !== (toEdit[a.key] ?? null)));

  const handleEdit = async () => {
    if (!toEdit || !edit) return;
    setEditTried(true);
    if (Object.keys(editErrors).length) return;
    if (new Date(edit.when).getTime() > Date.now() + 60000) return showToast('La data non può essere nel futuro', true);
    setBusy(true);
    try {
      const changes: DeviceLogChanges = {
        // Same minute as before → keep the original timestamp (seconds included).
        created_at: edit.when === toLocalInput(toEdit.created_at) ? toEdit.created_at : new Date(edit.when).toISOString(),
        operation: edit.operation,
        student_email: edit.email.trim(),
        school: edit.school || null,
        macbook_id: edit.macbook.trim() || null,
        ipad_id: edit.ipad.trim() || null,
        signed_by: edit.signedBy || null,
        ...edit.acc,
      };
      const updated = await updateStudentDeviceLog(toEdit.id, changes);
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)).sort((a, b) => b.created_at.localeCompare(a.created_at)));
      showToast('Record modificato ✓');
      setToEdit(null);
    } catch (e) {
      showToast((e as Error).message, true);
    }
    setBusy(false);
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await deleteStudentDeviceLog(toDelete.id);
      setRows((prev) => prev.filter((r) => r.id !== toDelete.id));
      showToast('Record eliminato ✓');
      setToDelete(null);
    } catch (e) {
      showToast((e as Error).message, true);
    }
    setBusy(false);
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await listStudentDeviceLog());
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    listStudentDeviceLog()
      .then((r) => active && setRows(r))
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const state = useMemo(() => computeState(rows), [rows]);
  const schools = useMemo(() => Array.from(new Set(rows.map((r) => r.school).filter(Boolean) as string[])).sort(), [rows]);

  const q = norm(query);
  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          (op === 'all' || r.operation === op) &&
          (school === 'all' || r.school === school) &&
          (!q || norm(r.student_email).includes(q) || norm(r.macbook_id).includes(q) || norm(r.ipad_id).includes(q)),
      ),
    [rows, op, school, q],
  );

  const counts = useMemo(() => {
    let deliveries = 0;
    for (const r of rows) if (r.operation === DELIVERY) deliveries++;
    return { deliveries, returns: rows.length - deliveries };
  }, [rows]);

  /* Exact match on a device ID or an email → current-status summary. */
  const summary = useMemo(() => {
    if (!q) return null;
    const dev = state.last.get(q);
    if (dev) {
      const holder = state.holders.mac.get(q) ?? state.holders.ipad.get(q);
      const macRow = rows.find((r) => norm(r.macbook_id) === q);
      const kind = macRow ? 'MacBook' : 'iPad';
      const shownId = macRow?.macbook_id ?? rows.find((r) => norm(r.ipad_id) === q)?.ipad_id ?? query.trim();
      return holder
        ? { tone: 'warn', text: `${kind} ${shownId} attualmente assegnato a ${holder.email} (dal ${fmtDate(holder.since)})` }
        : { tone: 'ok', text: `${kind} ${shownId} non assegnato — ultima restituzione da ${dev.email} il ${fmtDate(dev.at)}` };
    }
    if (rows.some((r) => norm(r.student_email) === q)) {
      const held: string[] = [];
      state.holders.mac.forEach((h, id) => norm(h.email) === q && held.push(`MacBook ${id.toUpperCase()}`));
      state.holders.ipad.forEach((h, id) => norm(h.email) === q && held.push(`iPad ${id.toUpperCase()}`));
      return held.length
        ? { tone: 'warn', text: `${query.trim()} ha in carico: ${held.join(', ')}` }
        : { tone: 'ok', text: `${query.trim()} non ha dispositivi in carico` };
    }
    return null;
  }, [q, query, rows, state]);

  const pick = (v: string | null) => {
    if (!v) return;
    setQuery(v);
    setLimit(PAGE);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <AuthGuard roles={['it', 'admin']} perm="it.history">
      <Topbar label="IT" href="/it" variant="back" />
      <div className="budget-page dh-page">
        <div className="shell">
          {/* ── Head ── */}
          <div className="b-head">
            <div className="b-head-left">
              <div className="logo">{IconHistory}</div>
              <div>
                <p className="b-eyebrow">Device Management · Studenti</p>
                <h1>
                  Storico <em>assegnazioni</em>
                </h1>
                <p>Consegne (check-out) e restituzioni (check-in) registrate dal form studenti</p>
              </div>
            </div>
            <div className="dh-head-actions">
              <button className="btn-quiet" onClick={load} disabled={loading}>
                {IconRefresh}
                Aggiorna
              </button>
              <button className="btn-primary" onClick={() => setExportOpen(true)} disabled={loading || rows.length === 0}>
                {IconDownload}
                Esporta Excel
              </button>
            </div>
          </div>

          {error ? (
            <div className="setup-note">
              <b>Storico non raggiungibile.</b> {error}
              <br />
              Verifica di aver eseguito <code>supabase/migrations/0005_student_device_log.sql</code> nel SQL Editor di Supabase.
            </div>
          ) : null}

          {/* ── Overview ── */}
          {loading ? (
            <div className="skeleton" />
          ) : (
            <section className="hero">
              <div className="stat-row dh-stats">
                <div className="stat">
                  <div className="stat-lbl">Movimenti</div>
                  <div className="stat-val">{rows.length}</div>
                  <div className="stat-sub">
                    {counts.deliveries} consegne · {counts.returns} restituzioni
                  </div>
                </div>
                <div className="stat is-spent">
                  <div className="stat-lbl">MacBook in carico</div>
                  <div className="stat-val">{state.holders.mac.size}</div>
                  <div className="stat-sub">consegnati e non ancora restituiti</div>
                </div>
                <div className="stat is-spent">
                  <div className="stat-lbl">iPad in carico</div>
                  <div className="stat-val">{state.holders.ipad.size}</div>
                  <div className="stat-sub">consegnati e non ancora restituiti</div>
                </div>
                <div className="stat">
                  <div className="stat-lbl">Ultimo movimento</div>
                  <div className="stat-val dh-small">{rows[0] ? fmtDate(rows[0].created_at) : '—'}</div>
                  <div className="stat-sub">{rows[0] ? `${OP_LABEL[rows[0].operation]} · ${rows[0].student_email}` : 'Nessun movimento'}</div>
                </div>
              </div>
            </section>
          )}

          {/* ── Search & filters ── */}
          <h2 className="section-label">Ricerca</h2>
          <div className="dh-search">
            {IconSearch}
            <input
              type="text"
              placeholder="Cerca per email studente, MacBook ID o iPad ID…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE);
              }}
              aria-label="Cerca per email o ID dispositivo"
              autoComplete="off"
              spellCheck={false}
            />
            {query ? (
              <button className="icon-btn" onClick={() => setQuery('')} aria-label="Cancella ricerca" title="Cancella">
                {IconClose}
              </button>
            ) : null}
          </div>

          {summary ? <div className={'dh-summary ' + summary.tone}>{summary.text}</div> : null}

          <div className="filters dh-filters">
            {(['all', 'Check-out', 'Check-in'] as OpFilter[]).map((o) => (
              <button key={o} className={'fchip' + (op === o ? ' active' : '')} onClick={() => setOp(o)}>
                {o === 'all' ? 'Tutti i movimenti' : OP_LABEL[o]}
              </button>
            ))}
            {schools.length > 1 ? (
              <select value={school} onChange={(e) => setSchool(e.target.value)} aria-label="Filtra per scuola">
                <option value="all">Tutte le scuole</option>
                {schools.map((s) => (
                  <option key={s} value={s}>
                    {schoolShort(s)}
                  </option>
                ))}
              </select>
            ) : null}
            <span className="dh-count">
              {visible.length} {visible.length === 1 ? 'risultato' : 'risultati'}
            </span>
          </div>

          <div className="dh-legend">
            <span>
              <Acc v={true} kind="charger" device="" />
              caricatore
            </span>
            <span>
              <Acc v={true} kind="cable" device="" />
              cavo
            </span>
            <span>✓ incluso · ✗ non incluso</span>
          </div>

          {/* ── History table ── */}
          <div className="ledger">
            {loading ? (
              <div className="empty">
                <p>Caricamento storico…</p>
              </div>
            ) : visible.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">{IconHistory}</div>
                <h3>{rows.length === 0 ? 'Nessun movimento registrato' : 'Nessun risultato'}</h3>
                <p>
                  {rows.length === 0
                    ? 'I movimenti compaiono qui dopo il primo Check-in o Check-out dal form studenti.'
                    : 'Prova con un’altra email o un altro ID, oppure togli i filtri.'}
                </p>
              </div>
            ) : (
              <div className="ledger-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Operazione</th>
                      <th>Email studente</th>
                      <th>MacBook ID</th>
                      <th>iPad ID</th>
                      <th>Scuola</th>
                      <th>Firmato da</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.slice(0, limit).map((r) => (
                      <tr key={r.id}>
                        <td className="col-date">{fmtDateTime(r.created_at)}</td>
                        <td>
                          <span className="tag" style={OP_TAG[r.operation]}>
                            {OP_LABEL[r.operation]}
                          </span>
                        </td>
                        <td>
                          <button className="dh-link" onClick={() => pick(r.student_email)} title="Mostra lo storico di questo studente">
                            {r.student_email}
                          </button>
                        </td>
                        <td className="dh-mono">
                          {r.macbook_id ? (
                            <button className="dh-link" onClick={() => pick(r.macbook_id)} title="Mostra lo storico di questo MacBook">
                              {r.macbook_id}
                            </button>
                          ) : r.macbook_charger || r.macbook_cable ? null : (
                            <span className="dh-none">—</span>
                          )}
                          {r.macbook_id || r.macbook_charger || r.macbook_cable ? (
                            <>
                              <Acc v={r.macbook_charger} kind="charger" device="MacBook" />
                              <Acc v={r.macbook_cable} kind="cable" device="MacBook" />
                            </>
                          ) : null}
                        </td>
                        <td className="dh-mono">
                          {r.ipad_id ? (
                            <button className="dh-link" onClick={() => pick(r.ipad_id)} title="Mostra lo storico di questo iPad">
                              {r.ipad_id}
                            </button>
                          ) : r.ipad_charger || r.ipad_cable ? null : (
                            <span className="dh-none">—</span>
                          )}
                          {r.ipad_id || r.ipad_charger || r.ipad_cable ? (
                            <>
                              <Acc v={r.ipad_charger} kind="charger" device="iPad" />
                              <Acc v={r.ipad_cable} kind="cable" device="iPad" />
                            </>
                          ) : null}
                        </td>
                        <td>{schoolShort(r.school)}</td>
                        <td className="dh-muted">{r.signed_by ?? '—'}</td>
                        <td className="col-actions">
                          <button
                            className="icon-btn"
                            title="Modifica record"
                            aria-label={`Modifica il record del ${fmtDateTime(r.created_at)} di ${r.student_email}`}
                            onClick={() => openEdit(r)}
                          >
                            {IconEdit}
                          </button>
                          <button
                            className="icon-btn"
                            title="Elimina record"
                            aria-label={`Elimina il record del ${fmtDateTime(r.created_at)} di ${r.student_email}`}
                            onClick={() => setToDelete(r)}
                          >
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

          {visible.length > limit ? (
            <p style={{ marginTop: '1rem', textAlign: 'center' }}>
              <button className="btn-quiet" onClick={() => setLimit((l) => l + PAGE)}>
                Mostra altri {Math.min(PAGE, visible.length - limit)} di {visible.length - limit}
              </button>
            </p>
          ) : null}

          <footer className="b-footer">
            H-FARM International School · IT — Storico assegnazioni dispositivi
            <span>Via Adriano Olivetti 1 - 31056 Roncade (TV)</span>
          </footer>
        </div>

        {/* ── Edit record ── */}
        {toEdit && edit ? (
          <div
            className="b-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Modifica record"
            onMouseDown={(ev) => {
              if (ev.target === ev.currentTarget && !busy) setToEdit(null);
            }}
          >
            <div className="b-modal" style={{ maxWidth: 520 }}>
              <div className="b-modal-head">
                <div className="mi">{IconEdit}</div>
                <div>
                  <h2>Modifica record</h2>
                  <p>
                    {OP_LABEL[toEdit.operation]} del {fmtDateTime(toEdit.created_at)}
                  </p>
                </div>
              </div>
              <div className="b-modal-body">
                <div className="field">
                  <label>Operazione</label>
                  <div className="filters dh-opts">
                    {(['Check-out', 'Check-in'] as const).map((o) => (
                      <button key={o} type="button" className={'fchip' + (edit.operation === o ? ' active' : '')} onClick={() => setEdit({ ...edit, operation: o })}>
                        {OP_LABEL[o]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={'field' + (editTried && editErrors.when ? ' dh-bad' : '')}>
                  <label htmlFor="ed-when">Data e ora</label>
                  <input id="ed-when" type="datetime-local" value={edit.when} onChange={(e) => setEdit({ ...edit, when: e.target.value })} />
                  {editTried && editErrors.when ? <small className="dh-err">{editErrors.when}</small> : null}
                </div>
                <div className={'field' + (editTried && editErrors.email ? ' dh-bad' : '')}>
                  <label htmlFor="ed-email">Email studente</label>
                  <input id="ed-email" type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} autoComplete="off" spellCheck={false} />
                  {editTried && editErrors.email ? <small className="dh-err">{editErrors.email}</small> : null}
                </div>
                <div className="dh-row2">
                  <div className="field">
                    <label htmlFor="ed-mac">MacBook ID</label>
                    <input id="ed-mac" type="text" value={edit.macbook} placeholder="—" onChange={(e) => setEdit({ ...edit, macbook: e.target.value })} autoComplete="off" />
                  </div>
                  <div className="field">
                    <label htmlFor="ed-ipad">iPad ID</label>
                    <input id="ed-ipad" type="text" value={edit.ipad} placeholder="—" onChange={(e) => setEdit({ ...edit, ipad: e.target.value })} autoComplete="off" />
                  </div>
                </div>
                <div className="dh-row2 dh-chg-row">
                  {ACCESSORIES.map((a) => (
                    <label key={a.key} className="dh-check">
                      <input type="checkbox" checked={edit.acc[a.key] === true} onChange={(e) => setEdit({ ...edit, acc: { ...edit.acc, [a.key]: e.target.checked } })} />
                      {a.label} {a.device}
                    </label>
                  ))}
                </div>
                <div className="dh-row2">
                  <div className={'field' + (editTried && editErrors.school ? ' dh-bad' : '')}>
                    <label htmlFor="ed-school">Scuola</label>
                    <select id="ed-school" value={edit.school} onChange={(e) => setEdit({ ...edit, school: e.target.value })}>
                      <option value="" disabled>
                        Scegli…
                      </option>
                      {SCHOOLS.map((sc) => (
                        <option key={sc} value={sc}>
                          {schoolShort(sc)}
                        </option>
                      ))}
                    </select>
                    {editTried && editErrors.school ? <small className="dh-err">{editErrors.school}</small> : null}
                  </div>
                  <div className={'field' + (editTried && editErrors.signedBy ? ' dh-bad' : '')}>
                    <label htmlFor="ed-signed">Firmato da</label>
                    <select id="ed-signed" value={edit.signedBy} onChange={(e) => setEdit({ ...edit, signedBy: e.target.value })}>
                      <option value="" disabled>
                        Scegli…
                      </option>
                      {SIGNERS.map((sg) => (
                        <option key={sg} value={sg}>
                          {SIGNER_LABEL[sg] ?? sg}
                        </option>
                      ))}
                    </select>
                    {editTried && editErrors.signedBy ? <small className="dh-err">{editErrors.signedBy}</small> : null}
                  </div>
                </div>
                <p className="dh-note">La firma salvata non si può modificare. Ogni modifica resta nel Registro attività.</p>
              </div>
              <div className="b-modal-foot">
                <button className="btn-quiet" onClick={() => setToEdit(null)} disabled={busy}>
                  Annulla
                </button>
                <button className="btn-primary" onClick={handleEdit} disabled={busy || !editChanged}>
                  {busy ? 'Salvataggio…' : 'Salva modifiche'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* ── Delete confirmation ── */}
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
                  <h2>Eliminare il record?</h2>
                  <p>L&apos;operazione non si può annullare</p>
                </div>
              </div>
              <div className="b-modal-body">
                <p className="confirm-text">
                  <strong>{OP_LABEL[toDelete.operation]}</strong> del {fmtDateTime(toDelete.created_at)} —{' '}
                  {toDelete.student_email}
                  {toDelete.macbook_id ? ` · MacBook ${toDelete.macbook_id}` : ''}
                  {toDelete.ipad_id ? ` · iPad ${toDelete.ipad_id}` : ''}. Anche la firma salvata verrà eliminata.
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
        {/* ── Export dialog ── */}
        {exportOpen ? (
          <div
            className="b-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Esporta in Excel"
            onMouseDown={(ev) => {
              if (ev.target === ev.currentTarget && !busy) setExportOpen(false);
            }}
          >
            <div className="b-modal" style={{ maxWidth: 480 }}>
              <div className="b-modal-head">
                <div className="mi">{IconDownload}</div>
                <div>
                  <h2>Esporta in Excel</h2>
                  <p>Scegli cosa includere nel file .xlsx</p>
                </div>
              </div>
              <div className="b-modal-body">
                <div className="field">
                  <label>Dispositivo</label>
                  <div className="filters dh-opts">
                    {(
                      [
                        ['all', 'Tutti'],
                        ['macbook', 'MacBook'],
                        ['ipad', 'iPad'],
                      ] as const
                    ).map(([v, l]) => (
                      <button key={v} type="button" className={'fchip' + (exp.device === v ? ' active' : '')} onClick={() => setExp({ ...exp, device: v })}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label>Operazione</label>
                  <div className="filters dh-opts">
                    {(
                      [
                        ['all', 'Tutte'],
                        ['Check-out', 'Consegne'],
                        ['Check-in', 'Restituzioni'],
                      ] as const
                    ).map(([v, l]) => (
                      <button key={v} type="button" className={'fchip' + (exp.operation === v ? ' active' : '')} onClick={() => setExp({ ...exp, operation: v })}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                {schools.length > 1 ? (
                  <div className="field">
                    <label htmlFor="exp-school">Scuola</label>
                    <select id="exp-school" value={exp.school} onChange={(e) => setExp({ ...exp, school: e.target.value })}>
                      <option value="all">Tutte le scuole</option>
                      {schools.map((sc) => (
                        <option key={sc} value={sc}>
                          {schoolShort(sc)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div className="dh-row2">
                  <div className="field">
                    <label htmlFor="exp-from">Dal (facoltativo)</label>
                    <input id="exp-from" type="date" value={exp.from} onChange={(e) => setExp({ ...exp, from: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="exp-to">Al (facoltativo)</label>
                    <input id="exp-to" type="date" value={exp.to} onChange={(e) => setExp({ ...exp, to: e.target.value })} />
                  </div>
                </div>
                <p className={'dh-exp-count' + (expCount === 0 ? ' none' : '')}>
                  {expCount === 0 ? 'Nessun movimento corrisponde a questi criteri.' : `Verranno esportati ${expCount} ${expCount === 1 ? 'movimento' : 'movimenti'}.`}
                </p>
              </div>
              <div className="b-modal-foot">
                <button className="btn-quiet" onClick={() => setExportOpen(false)} disabled={busy}>
                  Annulla
                </button>
                <button className="btn-primary" onClick={handleExport} disabled={busy || expCount === 0}>
                  {busy ? 'Creazione…' : 'Scarica .xlsx'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {toastNode}
      </div>

      <style>{`
        .dh-page .dh-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .dh-page .stat-val.dh-small { font-size: 18px; }
        .dh-page .dh-search {
          display: flex; align-items: center; gap: 10px; margin-bottom: .8rem;
          background: var(--b-surface); border: 1.5px solid #E4DCDD; border-radius: 999px;
          padding: 4px 8px 4px 16px; box-shadow: var(--b-shadow); transition: border-color .15s, box-shadow .15s;
        }
        .dh-page .dh-search:focus-within { border-color: var(--brand); box-shadow: 0 0 0 4px rgba(139, 26, 43, .08); }
        .dh-page .dh-search > svg { width: 18px; height: 18px; flex-shrink: 0; stroke: var(--b-faint); fill: none; stroke-width: 2; stroke-linecap: round; }
        .dh-page .dh-search input[type=text] { flex: 1; border: none; background: transparent; padding: 10px 0; box-shadow: none; font-size: 15px; }
        .dh-page .dh-search .icon-btn:hover { background: var(--b-soft); color: var(--brand); }
        .dh-page .dh-summary { font-size: 13.5px; font-weight: 600; border-radius: 13px; padding: .7rem 1rem; margin-bottom: .8rem; }
        .dh-page .dh-summary.warn { background: #FFF3E4; color: var(--b-warn); }
        .dh-page .dh-summary.ok { background: #EAF3DE; color: #3B6D11; }
        .dh-page .dh-filters { align-items: center; }
        .dh-page .dh-filters select { width: auto; padding: 7px 34px 7px 13px; font-size: 13px; font-weight: 600; border-radius: 999px; background: var(--b-surface) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236E6468' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") no-repeat right 12px center; }
        .dh-page .dh-count { margin-left: auto; font-size: 12.5px; color: var(--b-muted); font-weight: 600; }
        .dh-page .dh-link { all: unset; cursor: pointer; font-weight: 600; color: var(--b-ink); border-bottom: 1px dashed transparent; }
        .dh-page .dh-link:hover { color: var(--brand); border-bottom-color: currentColor; }
        .dh-page .dh-link:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; border-radius: 3px; }
        .dh-page .dh-mono .dh-link { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
        .dh-page .dh-none, .dh-page .dh-muted { color: var(--b-muted); }
        .dh-page tbody td { white-space: nowrap; }
        .dh-page td.col-actions { width: 84px; text-align: right; white-space: nowrap; }
        .dh-page td.col-actions .icon-btn + .icon-btn { margin-left: 2px; }
        .dh-page .dh-bad input, .dh-page .dh-bad select { border-color: #C0392B !important; box-shadow: 0 0 0 3px rgba(192, 57, 43, .1) !important; }
        .dh-page .dh-err { display: block; margin-top: 5px; font-size: 12px; font-weight: 600; color: #A32D2D; }
        .dh-page .dh-chg { display: inline-flex; align-items: center; gap: 2px; margin-left: 6px; padding: 2px 6px; border-radius: 999px; font-family: inherit; font-size: 11.5px; font-weight: 800; vertical-align: 1px; }
        .dh-page .dh-chg svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
        .dh-page .dh-legend { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; font-size: 12px; color: var(--b-muted); margin: -.3rem 0 .7rem; }
        .dh-page .dh-legend .dh-chg { margin-left: 0; margin-right: 4px; }
        .dh-page .dh-chg.yes { background: #E6F2EC; color: #1F5A48; }
        .dh-page .dh-chg.no { background: #F9EFF0; color: #8B1A2B; }
        .dh-page .dh-chg-row { margin: -.2rem 0 .9rem; row-gap: 10px; }
        .dh-page .dh-chg + .dh-chg { margin-left: 4px; }
        .dh-page .dh-check { display: flex; align-items: center; gap: 9px; font-size: 13.5px; font-weight: 600; color: var(--b-ink); cursor: pointer; padding: 10px 12px; border: 1.5px solid #E4DCDD; border-radius: 12px; background: var(--b-surface); }
        .dh-page .dh-check input { width: 17px; height: 17px; accent-color: var(--brand); margin: 0; }
        .dh-page .dh-note { font-size: 12.5px; color: var(--b-muted); margin: .2rem 0 0; }
        .dh-page .dh-head-actions { display: flex; gap: 10px; flex-wrap: wrap; }
        .dh-page .dh-opts { margin-bottom: 0; }
        .dh-page .dh-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .dh-page .dh-exp-count { font-size: 13px; font-weight: 600; color: #3B6D11; background: #EAF3DE; border-radius: 11px; padding: .6rem .85rem; margin-top: .4rem; }
        .dh-page .dh-exp-count.none { color: var(--b-warn); background: #FFF3E4; }
        @media (max-width: 520px) { .dh-page .dh-row2 { grid-template-columns: 1fr; } }
        @media (max-width: 860px) { .dh-page .dh-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      `}</style>
    </AuthGuard>
  );
}
