'use client';
/* Budget Management entry point: pick which school's budget to open.
   Schools marked `wip` are shown but not selectable. */
import React from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import Topbar from '@/components/Topbar';
import { SCHOOLS, type School, formatEURShort, totalAllocated } from '@/lib/budgets';

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

function SchoolInner({ school }: { school: School }) {
  const wip = school.status === 'wip';
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
              {school.lines.length} commesse · <b>{formatEURShort(totalAllocated(school))}</b> stanziati
            </>
          )}
        </div>
      </div>
      <div className="school-go">{wip ? IconLock : IconArrow}</div>
    </>
  );
}

export default function SchoolPickerClient() {
  return (
    <AuthGuard roles={['admin']}>
      <Topbar label="IT" href="/it" variant="back" />
      <div className="budget-page">
        <div className="shell shell--narrow">
          <div className="b-head b-head--stacked">
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
                  <SchoolInner school={s} />
                </Link>
              ),
            )}
          </div>

          <footer className="b-footer">
            H-FARM International School · IT — Budget Management
            <span>Via Adriano Olivetti 1 - 31056 Roncade (TV)</span>
          </footer>
        </div>
      </div>
    </AuthGuard>
  );
}
