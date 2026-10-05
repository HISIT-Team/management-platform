'use client';
/* IT Budget Management — dashboard over one school's 26/27 budget lines
   ("commesse"). Shows the allocation, what has been spent and what is
   left, and lets IT staff record an expense either from a budget-line
   card (line pre-selected) or from the generic "Nuova spesa" button.
   Expenses are persisted in Supabase, scoped by school
   (see src/lib/budgets.ts). */
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import Topbar from '@/components/Topbar';
import { useToast } from '@/components/useToast';
import { getCurrentUser, loadProfile, profileName } from '@/lib/auth';
import { asLocalDate, exportExcel } from '@/lib/excel';
import {
  type BudgetLine,
  type Expense,
  type School,
  addExpense,
  deleteExpense,
  formatDate,
  formatEUR,
  formatEURShort,
  lineByCode,
  listExpenses,
  todayISO,
  totalAllocated,
  totalsByCode,
} from '@/lib/budgets';

/* ── Icons ─────────────────────────────────────────────────────── */
const IconWallet = (
  <svg viewBox="0 0 24 24">
    <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" />
    <path d="M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H5" />
    <circle cx="17" cy="13.5" r="1.3" />
  </svg>
);
const IconPlus = (
  <svg viewBox="0 0 24 24">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
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
const IconSwitch = (
  <svg viewBox="0 0 24 24">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

/* One icon per budget line, keyed by code. */
const LINE_ICONS: Record<string, React.ReactNode> = {
  indirect: (
    <svg viewBox="0 0 24 24">
      <rect x="2" y="14" width="6" height="7" rx="1" />
      <rect x="9" y="10" width="6" height="11" rx="1" />
      <rect x="16" y="4" width="6" height="17" rx="1" />
    </svg>
  ),
  hardware: (
    <svg viewBox="0 0 24 24">
      <rect x="2" y="4" width="20" height="12" rx="2" />
      <path d="M7 20h10M12 16v4" />
    </svg>
  ),
  capex: (
    <svg viewBox="0 0 24 24">
      <path d="M3 17l6-6 4 4 8-8" />
      <polyline points="15 7 21 7 21 13" />
    </svg>
  ),
};

/* ── Helpers ───────────────────────────────────────────────────── */
const accentVars = (l: BudgetLine) =>
  ({ '--accent': l.accent, '--accent-soft': l.accentSoft }) as React.CSSProperties;

/** Accepts both "1234.56" and the Italian "1.234,56". */
function parseAmount(raw: string): number {
  const s = raw.trim();
  if (!s) return NaN;
  const normalised = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  return Number(normalised.replace(/[^\d.-]/g, ''));
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return (part / whole) * 100;
}

function statusOf(spent: number, allocated: number): { cls: string; text: string } {
  const used = pct(spent, allocated);
  if (spent > allocated) return { cls: 'danger', text: 'Fuori budget' };
  if (used >= 85) return { cls: 'warn', text: 'In esaurimento' };
  return { cls: 'ok', text: 'In linea' };
}

const R = 64;
const CIRC = 2 * Math.PI * R;

/* ── Component ─────────────────────────────────────────────────── */
export default function BudgetClient({ school }: { school: School }) {
  const { showToast, toastNode } = useToast();

  const lines = school.lines;
  const allocated = useMemo(() => totalAllocated(school), [school]);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [filter, setFilter] = useState('all');

  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Expense | null>(null);
  const [busy, setBusy] = useState(false);

  // Expense form
  const [fCode, setFCode] = useState(lines[0]?.code ?? '');
  const [fDesc, setFDesc] = useState('');
  const [fSupplier, setFSupplier] = useState('');
  const [fAmount, setFAmount] = useState('');
  const [fDate, setFDate] = useState(todayISO());
  const [fNotes, setFNotes] = useState('');

  // Initial load: this school's ledger, plus the signed-in user's display
  // name (stamped on every expense they record).
  useEffect(() => {
    let active = true;
    listExpenses(school.code)
      .then((rows) => {
        if (!active) return;
        setExpenses(rows);
        setSetupError(null);
      })
      .catch((e: Error) => {
        if (active) setSetupError(e.message || 'Impossibile caricare le spese.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    getCurrentUser()
      .then(async (u) => {
        if (!u) return '';
        try {
          return profileName(await loadProfile(u.id), u.email || '');
        } catch {
          return u.email || '';
        }
      })
      .then((name) => {
        if (active) setUserName(name);
      })
      .catch(() => {
        /* name is optional metadata */
      });

    return () => {
      active = false;
    };
  }, [school.code]);

  // Escape closes whichever overlay is open.
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key !== 'Escape') return;
      if (toDelete) setToDelete(null);
      else if (formOpen && !busy) setFormOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [formOpen, toDelete, busy]);

  const spentByCode = useMemo(() => totalsByCode(school, expenses), [school, expenses]);
  const countByCode = useMemo(() => {
    const out: Record<string, number> = {};
    for (const b of lines) out[b.code] = 0;
    for (const e of expenses) out[e.budget_code] = (out[e.budget_code] || 0) + 1;
    return out;
  }, [lines, expenses]);

  const totalSpent = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const totalLeft = allocated - totalSpent;
  const usedPct = pct(totalSpent, allocated);

  const visible = useMemo(
    () => (filter === 'all' ? expenses : expenses.filter((e) => e.budget_code === filter)),
    [expenses, filter],
  );
  const visibleTotal = useMemo(() => visible.reduce((s, e) => s + e.amount, 0), [visible]);

  // Excel: the expenses shown (all, or the selected budget line), oldest first.
  async function handleExport() {
    if (!visible.length) return showToast('Nessuna spesa da esportare.', true);
    try {
      const rows = visible.slice().sort((a, b) => a.spent_on.localeCompare(b.spent_on));
      const n = await exportExcel(
        `budget-it_${school.code}${filter === 'all' ? '' : '_' + filter}`,
        `Budget ${school.name}`,
        [
          { header: 'Data', type: 'date', width: 12, value: (e) => asLocalDate(e.spent_on) },
          { header: 'Commessa', width: 34, value: (e) => lineByCode(school, e.budget_code)?.name ?? e.budget_code },
          { header: 'Descrizione', width: 44, value: (e) => e.description },
          { header: 'Fornitore', width: 24, value: (e) => e.supplier ?? '' },
          { header: 'Importo', type: 'euro', width: 14, value: (e) => e.amount },
          { header: 'Note', width: 36, value: (e) => e.notes ?? '' },
          { header: 'Inserita da', width: 24, value: (e) => e.created_by_name ?? '' },
          { header: 'Inserita il', type: 'datetime', width: 17, value: (e) => asLocalDate(e.created_at) },
        ],
        rows,
      );
      showToast(`Excel creato ✓ — ${n} ${n === 1 ? 'spesa' : 'spese'}`);
    } catch (e) {
      showToast('Export non riuscito: ' + (e as Error).message, true);
    }
  }

  function openForm(code?: string) {
    setFCode(code || lines[0]?.code || '');
    setFDesc('');
    setFSupplier('');
    setFAmount('');
    setFDate(todayISO());
    setFNotes('');
    setFormOpen(true);
  }

  async function handleSave() {
    const amount = parseAmount(fAmount);
    if (!fCode) return showToast('Seleziona una commessa.', true);
    if (!fDesc.trim()) return showToast('Inserisci una descrizione della spesa.', true);
    if (!Number.isFinite(amount) || amount <= 0) return showToast('Inserisci un importo valido maggiore di zero.', true);
    if (!fDate) return showToast('Seleziona la data della spesa.', true);

    setBusy(true);
    try {
      const row = await addExpense({
        school: school.code,
        budget_code: fCode,
        description: fDesc.trim(),
        supplier: fSupplier.trim(),
        amount: Math.round(amount * 100) / 100,
        spent_on: fDate,
        notes: fNotes.trim(),
        created_by_name: userName,
      });
      setExpenses((prev) =>
        [row, ...prev].sort((a, b) =>
          a.spent_on === b.spent_on ? b.created_at.localeCompare(a.created_at) : b.spent_on.localeCompare(a.spent_on),
        ),
      );
      setFormOpen(false);
      showToast('Spesa registrata ✓ — ' + formatEUR(row.amount) + ' scalati dal budget');
    } catch (e) {
      showToast('Errore: ' + (e as Error).message, true);
    }
    setBusy(false);
  }

  async function handleDelete() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await deleteExpense(toDelete.id);
      setExpenses((prev) => prev.filter((e) => e.id !== toDelete.id));
      showToast('Spesa eliminata — importo riaccreditato sul budget');
      setToDelete(null);
    } catch (e) {
      showToast('Errore: ' + (e as Error).message, true);
    }
    setBusy(false);
  }

  const selectedLine = lineByCode(school, fCode) || lines[0];
  const previewAmount = parseAmount(fAmount);
  const previewLeft = selectedLine
    ? selectedLine.allocated -
      (spentByCode[selectedLine.code] || 0) -
      (Number.isFinite(previewAmount) && previewAmount > 0 ? previewAmount : 0)
    : 0;

  return (
    <AuthGuard roles={['admin']}>
      <Topbar label="Scuole" href="/budget-management" variant="back" />
      <div className="budget-page">
        <div className="shell">
          {/* ── Head ── */}
          <div className="b-head">
            <div className="b-head-left">
              <div className="logo">{IconWallet}</div>
              <div>
                <p className="b-eyebrow">Budget Management · 26/27</p>
                <h1>
                  {school.name} <em>Budget</em>
                </h1>
                <p>
                  {school.fullName} · {school.location}
                </p>
              </div>
            </div>
            <div className="b-head-actions">
              <button className="ui-btn excel" onClick={handleExport} disabled={loading}>
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <path d="M12 15V3" />
                </svg>
                {filter === 'all' ? 'Esporta Excel' : 'Esporta Excel (filtrate)'}
              </button>
              <button className="btn-primary" onClick={() => openForm()}>
                {IconPlus}
                Nuova spesa
              </button>
            </div>
          </div>

          {setupError ? (
            <div className="setup-note">
              <b>Archivio spese non raggiungibile.</b> {setupError}
              <br />
              Esegui le migrazioni in <code>supabase/migrations/</code> nel SQL Editor di Supabase. I totali qui sotto
              mostrano le commesse a budget pieno.
            </div>
          ) : null}

          {/* ── Overview ── */}
          {loading ? (
            <div className="skeleton" />
          ) : (
            <section className="hero">
              <div className="hero-grid">
                <div className="donut">
                  <svg viewBox="0 0 160 160" aria-hidden="true">
                    <defs>
                      <linearGradient id="budget-arc" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="var(--brand)" />
                        <stop offset="100%" stopColor="var(--gold)" />
                      </linearGradient>
                    </defs>
                    <circle className="track" cx="80" cy="80" r={R} />
                    <circle
                      className="arc"
                      cx="80"
                      cy="80"
                      r={R}
                      stroke={totalSpent > allocated ? '#A32D2D' : 'url(#budget-arc)'}
                      strokeDasharray={CIRC}
                      strokeDashoffset={CIRC * (1 - Math.min(Math.max(usedPct, 0), 100) / 100)}
                    />
                  </svg>
                  <div className="donut-center">
                    <div className="donut-pct">{usedPct.toFixed(1).replace('.', ',')}%</div>
                    <div className="donut-lbl">Utilizzato</div>
                  </div>
                </div>

                <div>
                  <div className="stat-row">
                    <div className="stat">
                      <div className="stat-lbl">Budget totale</div>
                      <div className="stat-val">{formatEURShort(allocated)}</div>
                      <div className="stat-sub">{lines.length} commesse attive</div>
                    </div>
                    <div className="stat is-spent">
                      <div className="stat-lbl">Speso</div>
                      <div className="stat-val">{formatEURShort(totalSpent)}</div>
                      <div className="stat-sub">
                        {expenses.length} {expenses.length === 1 ? 'movimento' : 'movimenti'}
                      </div>
                    </div>
                    <div className={'stat is-left' + (totalLeft < 0 ? ' over' : '')}>
                      <div className="stat-lbl">Disponibile</div>
                      <div className="stat-val">{formatEURShort(totalLeft)}</div>
                      <div className="stat-sub">
                        {totalLeft < 0
                          ? 'Budget superato'
                          : pct(totalLeft, allocated).toFixed(1).replace('.', ',') + '% residuo'}
                      </div>
                    </div>
                  </div>

                  <div className="segbar" role="img" aria-label="Ripartizione della spesa per commessa">
                    {lines.map((l) => (
                      <i
                        key={l.code}
                        style={{
                          width: Math.min(pct(spentByCode[l.code] || 0, allocated), 100) + '%',
                          background: l.accent,
                        }}
                      />
                    ))}
                  </div>
                  <div className="legend">
                    {lines.map((l) => (
                      <span className="legend-item" key={l.code}>
                        <i className="legend-dot" style={{ background: l.accent }} />
                        {l.name.replace(' 26/27', '')} · <b>{formatEURShort(spentByCode[l.code] || 0)}</b>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ── Budget lines ── */}
          <h2 className="section-label">Commesse</h2>
          <div className="lines">
            {lines.map((l) => {
              const spent = spentByCode[l.code] || 0;
              const left = l.allocated - spent;
              const st = statusOf(spent, l.allocated);
              return (
                <article key={l.code} className={'bline' + (left < 0 ? ' over' : '')} style={accentVars(l)}>
                  <div className="bline-top">
                    <div className="bline-chip">{LINE_ICONS[l.code]}</div>
                    <div>
                      <div className="bline-name">{l.name}</div>
                      <div className="bline-caption">{l.caption}</div>
                    </div>
                  </div>

                  <div className="bline-figure">
                    <div>
                      <div className="bline-left-lbl">Disponibile</div>
                      <div className="bline-left-val">{formatEURShort(left)}</div>
                    </div>
                    <span className={'pill ' + st.cls}>{st.text}</span>
                  </div>

                  <div>
                    <div className="bline-bar">
                      <i style={{ width: Math.min(pct(spent, l.allocated), 100) + '%' }} />
                    </div>
                    <div className="bline-meta" style={{ marginTop: 8 }}>
                      <span>
                        Speso <b>{formatEURShort(spent)}</b>
                      </span>
                      <span>
                        Stanziato <b>{formatEURShort(l.allocated)}</b>
                      </span>
                    </div>
                  </div>

                  <div className="bline-foot">
                    <span className="bline-count">
                      {countByCode[l.code] || 0} {countByCode[l.code] === 1 ? 'movimento' : 'movimenti'}
                    </span>
                    <button className="btn-quiet" onClick={() => openForm(l.code)}>
                      {IconPlus}
                      Aggiungi spesa
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {/* ── Ledger ── */}
          <h2 className="section-label">Movimenti</h2>
          <div className="filters">
            <button className={'fchip' + (filter === 'all' ? ' active' : '')} onClick={() => setFilter('all')}>
              Tutte le commesse
            </button>
            {lines.map((l) => (
              <button
                key={l.code}
                className={'fchip' + (filter === l.code ? ' active' : '')}
                onClick={() => setFilter(l.code)}
              >
                <i className="legend-dot" style={{ background: l.accent }} />
                {l.name.replace(' 26/27', '')}
              </button>
            ))}
          </div>

          <div className="ledger">
            {loading ? (
              <div className="empty">
                <p>Caricamento movimenti…</p>
              </div>
            ) : visible.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">{IconWallet}</div>
                <h3>Nessuna spesa registrata</h3>
                <p>Usa &laquo;Nuova spesa&raquo; o il pulsante su una commessa per registrare il primo movimento.</p>
              </div>
            ) : (
              <div className="ledger-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Descrizione</th>
                      <th>Commessa</th>
                      <th style={{ textAlign: 'right' }}>Importo</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((e) => {
                      const l = lineByCode(school, e.budget_code);
                      return (
                        <tr key={e.id}>
                          <td className="col-date">{formatDate(e.spent_on)}</td>
                          <td className="col-desc">
                            <div className="desc">{e.description}</div>
                            {e.supplier || e.notes || e.created_by_name ? (
                              <div className="sub">
                                {[e.supplier, e.notes, e.created_by_name ? 'inserita da ' + e.created_by_name : '']
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            ) : null}
                          </td>
                          <td>
                            {l ? (
                              <span className="tag" style={accentVars(l)}>
                                {l.name.replace(' 26/27', '')}
                              </span>
                            ) : (
                              <span className="tag tag--orphan">{e.budget_code}</span>
                            )}
                          </td>
                          <td className="col-amount">− {formatEUR(e.amount)}</td>
                          <td className="col-actions">
                            <button
                              className="icon-btn"
                              title="Elimina spesa"
                              aria-label={'Elimina la spesa ' + e.description}
                              onClick={() => setToDelete(e)}
                            >
                              {IconTrash}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td colSpan={3} style={{ fontWeight: 700 }}>
                        Totale {filter === 'all' ? 'movimenti' : lineByCode(school, filter)?.name}
                      </td>
                      <td className="col-amount">{formatEUR(visibleTotal)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p style={{ marginTop: '1.25rem' }}>
            <Link className="btn-quiet" href="/budget-management" style={{ textDecoration: 'none' }}>
              {IconSwitch}
              Cambia scuola
            </Link>
          </p>

          <footer className="b-footer">
            H-FARM International School · IT — Budget Management {school.name}
            <span>Via Adriano Olivetti 1 - 31056 Roncade (TV)</span>
          </footer>
        </div>

        {/* ── New expense modal ── */}
        {formOpen && selectedLine ? (
          <div
            className="b-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Registra una nuova spesa"
            onMouseDown={(ev) => {
              if (ev.target === ev.currentTarget && !busy) setFormOpen(false);
            }}
          >
            <div className="b-modal" style={accentVars(selectedLine)}>
              <div className="b-modal-head">
                <div className="mi">{IconPlus}</div>
                <div>
                  <h2>Nuova spesa</h2>
                  <p>{school.name} · l&apos;importo viene scalato dalla commessa scelta</p>
                </div>
                <button className="b-modal-close" onClick={() => setFormOpen(false)} disabled={busy} aria-label="Chiudi">
                  {IconClose}
                </button>
              </div>

              <div className="b-modal-body">
                <div className="field">
                  <label>
                    Commessa <span className="req">*</span>
                  </label>
                  <div className="line-picker">
                    {lines.map((l) => {
                      const left = l.allocated - (spentByCode[l.code] || 0);
                      return (
                        <button
                          type="button"
                          key={l.code}
                          className={'line-opt' + (fCode === l.code ? ' selected' : '')}
                          style={accentVars(l)}
                          onClick={() => setFCode(l.code)}
                        >
                          <i className="dot" />
                          <span className="txt">
                            <span className="t1">{l.name}</span>
                            <span className="t2">Disponibile {formatEURShort(left)}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="field">
                  <label>
                    Descrizione <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="es. 20 licenze Microsoft 365"
                    value={fDesc}
                    onChange={(ev) => setFDesc(ev.target.value)}
                  />
                </div>

                <div className="row2">
                  <div className="field">
                    <label>
                      Importo <span className="req">*</span>
                    </label>
                    <div className="amount-wrap">
                      <span>€</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="1.250,00"
                        value={fAmount}
                        onChange={(ev) => setFAmount(ev.target.value)}
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label>
                      Data <span className="req">*</span>
                    </label>
                    <input type="date" value={fDate} onChange={(ev) => setFDate(ev.target.value)} />
                  </div>
                </div>

                <div className="field">
                  <label>Fornitore</label>
                  <input
                    type="text"
                    placeholder="es. Dell, TIM, Amazon…"
                    value={fSupplier}
                    onChange={(ev) => setFSupplier(ev.target.value)}
                  />
                </div>

                <div className="field">
                  <label>Note</label>
                  <textarea
                    placeholder="Numero ordine, riferimento fattura, dettagli…"
                    value={fNotes}
                    onChange={(ev) => setFNotes(ev.target.value)}
                  />
                </div>

                <div className={'preview' + (previewLeft < 0 ? ' over' : '')}>
                  <span>Residuo dopo la spesa</span>
                  <b>{formatEUR(previewLeft)}</b>
                </div>
              </div>

              <div className="b-modal-foot">
                <button className="btn-quiet" onClick={() => setFormOpen(false)} disabled={busy}>
                  Annulla
                </button>
                <button className="btn-primary" onClick={handleSave} disabled={busy}>
                  {busy ? 'Salvataggio…' : 'Registra spesa'}
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
            <div className="b-modal" style={{ maxWidth: 400 }}>
              <div className="b-modal-head">
                <div className="mi">{IconTrash}</div>
                <div>
                  <h2>Eliminare la spesa?</h2>
                  <p>L&apos;importo torna disponibile sulla commessa</p>
                </div>
              </div>
              <div className="b-modal-body">
                <p className="confirm-text">
                  <strong>{toDelete.description}</strong> — {formatEUR(toDelete.amount)} del{' '}
                  {formatDate(toDelete.spent_on)}
                  {lineByCode(school, toDelete.budget_code)
                    ? ' su ' + lineByCode(school, toDelete.budget_code)!.name
                    : ''}
                  .
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
    </AuthGuard>
  );
}
