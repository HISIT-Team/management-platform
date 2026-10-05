'use client';
/* Budget Management entry point: pick which school's budget to open.
   Schools marked `wip` are shown but not selectable. */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import Topbar from '@/components/Topbar';
import { useToast } from '@/components/useToast';
import { SCHOOLS, type Expense, type School, formatEURShort, lineByCode, listExpenses, totalAllocated } from '@/lib/budgets';
import { asLocalDate, exportExcel } from '@/lib/excel';

const IconWallet = (
  <svg viewBox="0 0 24 24">
    <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" />
    <path d="M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H5" />
    <circle cx="17" cy="13.5" r="1.3" />
  </svg>
);
const IconArrow = (
  <svg viewBox="0 0 24 24">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);
const IconLock = (
  <svg viewBox="0 0 24 24">
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

/** "Venezia" → "VE" — two-letter monogram for the card chip. */
function monogram(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function SchoolInner({ school, spent }: { school: School; spent?: number }) {
  const wip = school.status === 'wip';
  const alloc = totalAllocated(school);
  const pct = spent !== undefined && alloc ? Math.round((spent / alloc) * 100) : null;
  return (
    <>
      <div className="school-chip">{monogram(school.name)}</div>
      <div className="school-txt">
        <div className="school-name">{school.name}</div>
        <div className="school-sub">
          {school.fullName} · {school.location}
        </div>
        <div className="school-meta">
          {wip ? (
            <span className="pill warn">Work in progress</span>
          ) : (
            <>
              {school.lines.length} commesse · <b>{formatEURShort(alloc)}</b> stanziati
              {pct !== null ? (
                <>
                  {' '}
                  · speso <b>{formatEURShort(spent ?? 0)}</b> ({pct}%)
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
      <div className="school-go">{wip ? IconLock : IconArrow}</div>
      {pct !== null && !wip ? (
        <div className="school-track" aria-hidden="true">
          <i style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      ) : null}
    </>
  );
}

export default function SchoolPickerClient() {
  const { showToast, toastNode } = useToast();
  const [all, setAll] = useState<Expense[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all(SCHOOLS.filter((s) => s.status !== 'wip').map((s) => listExpenses(s.code)))
      .then((lists) => active && setAll(lists.flat()))
      .catch(() => active && setAll(null));
    return () => {
      active = false;
    };
  }, []);

  const spentBy = (code: string) => (all ? all.filter((e) => e.school === code).reduce((t, e) => t + e.amount, 0) : undefined);

  async function exportAll() {
    if (!all?.length) return showToast('Nessuna spesa da esportare.', true);
    setBusy(true);
    try {
      const rows = all.slice().sort((a, b) => a.school.localeCompare(b.school) || a.spent_on.localeCompare(b.spent_on));
      const n = await exportExcel(
        'budget-it_tutte-le-scuole',
        'Budget IT 26-27',
        [
          { header: 'Scuola', width: 12, value: (e) => SCHOOLS.find((s) => s.code === e.school)?.name ?? e.school },
          { header: 'Data', type: 'date', width: 12, value: (e) => asLocalDate(e.spent_on) },
          { header: 'Commessa', width: 34, value: (e) => { const sc = SCHOOLS.find((s) => s.code === e.school); return (sc && lineByCode(sc, e.budget_code)?.name) || e.budget_code; } },
          { header: 'Descrizione', width: 44, value: (e) => e.description },
          { header: 'Fornitore', width: 24, value: (e) => e.supplier ?? '' },
          { header: 'Importo', type: 'euro', width: 14, value: (e) => e.amount },
          { header: 'Note', width: 36, value: (e) => e.notes ?? '' },
          { header: 'Inserita da', width: 24, value: (e) => e.created_by_name ?? '' },
        ],
        rows,
      );
      showToast(`Excel creato ✓ — ${n} spese`);
    } catch (e) {
      showToast('Export non riuscito: ' + (e as Error).message, true);
    }
    setBusy(false);
  }

  return (
    <AuthGuard roles={['admin']}>
      <Topbar label="IT" href="/it" variant="back" />
      <div className="budget-page">
        <div className="shell shell--narrow">
          <div className="b-head">
            <div className="b-head-left">
              <div className="logo">{IconWallet}</div>
              <div>
                <p className="b-eyebrow">H-FARM International School · IT</p>
                <h1>
                  Budget <em>Management</em>
                </h1>
                <p>Seleziona la scuola di cui vuoi vedere le commesse</p>
              </div>
            </div>
            <div className="b-head-actions">
              <button className="ui-btn excel" onClick={exportAll} disabled={busy || !all}>
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <path d="M12 15V3" />
                </svg>
                Esporta tutte le scuole
              </button>
            </div>
          </div>

          <div className="schools">
            {SCHOOLS.map((s, i) =>
              s.status === 'wip' ? (
                <div
                  key={s.code}
                  className="school-card is-disabled"
                  style={{ animationDelay: 0.08 + i * 0.07 + 's' }}
                  aria-disabled="true"
                  title="Non ancora disponibile"
                >
                  <SchoolInner school={s} />
                </div>
              ) : (
                <Link
                  key={s.code}
                  className="school-card"
                  href={`/budget-management/${s.code}`}
                  style={{ animationDelay: 0.08 + i * 0.07 + 's' }}
                >
                  <SchoolInner school={s} spent={spentBy(s.code)} />
                </Link>
              ),
            )}
          </div>

          <footer className="b-footer">
            H-FARM International School · IT — Budget Management
            <span>Via Adriano Olivetti 1 - 31056 Roncade (TV)</span>
          </footer>
        </div>
        {toastNode}
      </div>
    </AuthGuard>
  );
}
