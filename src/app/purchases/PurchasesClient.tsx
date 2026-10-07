'use client';
/* Purchases — H-IS Vicenza. My requests (everyone with vi.purchases) and
   all requests (vi.purchases_admin), with item details and Excel export.
   New requests: /purchases/new. See src/lib/purchases.ts. */
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AuthGuard, { useAccess } from '@/components/AuthGuard';
import { useToast } from '@/components/useToast';
import { allows } from '@/lib/nav';
import { getSupabase } from '@/lib/supabase';
import { asLocalDate, exportExcel } from '@/lib/excel';
import { type PurchaseRequest, itemTotal, listPurchases } from '@/lib/purchases';

const eur = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const IconCart = (
  <svg viewBox="0 0 24 24">
    <circle cx="9" cy="21" r="1" />
    <circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
  </svg>
);

function Inner() {
  const { showToast, toastNode } = useToast();
  const access = useAccess();
  const canAll = allows(access, 'vi.purchases_admin', ['office.hvi', 'admin']);
  const [rows, setRows] = useState<PurchaseRequest[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'mine' | 'all'>(canAll ? 'all' : 'mine');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getSupabase()
      .auth.getUser()
      .then(({ data }) => active && setMeId(data.user?.id ?? null));
    listPurchases(2000)
      .then((r) => active && setRows(r))
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows
      .filter((r) => tab === 'all' || r.created_by === meId)
      .filter(
        (r) =>
          !t ||
          `${r.requester_first} ${r.requester_last} ${r.requester_email}`.toLowerCase().includes(t) ||
          r.items.some((i) => (i.name || '').toLowerCase().includes(t)),
      );
  }, [rows, tab, meId, q]);

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const month = visible.filter((r) => new Date(r.created_at).getTime() >= monthStart);

  async function handleExport() {
    if (!visible.length) return showToast('No requests to export.', true);
    // One row per item, so the file can be filtered and summed.
    const flat = visible.flatMap((r) => r.items.map((it, n) => ({ r, it, n })));
    try {
      const n = await exportExcel(
        `purchases-vicenza${tab === 'mine' ? '_mine' : ''}`,
        'Purchases',
        [
          { header: 'Date', type: 'datetime', width: 17, value: (x) => asLocalDate(x.r.created_at) },
          { header: 'Request', width: 10, value: (x) => x.r.id.slice(0, 8) },
          { header: 'Type', width: 10, value: (x) => (x.r.kind === 'single' ? 'Single' : 'Multiple') },
          { header: 'First name', width: 14, value: (x) => x.r.requester_first },
          { header: 'Last name', width: 16, value: (x) => x.r.requester_last },
          { header: 'Email', width: 30, value: (x) => x.r.requester_email },
          { header: 'Item', width: 36, value: (x) => x.it.name },
          { header: 'Link', width: 40, value: (x) => x.it.link },
          { header: 'Quantity', type: 'number', width: 10, value: (x) => x.it.quantity },
          { header: 'Unit price', type: 'euro', width: 12, value: (x) => x.it.price },
          { header: 'Line total', type: 'euro', width: 12, value: (x) => itemTotal(x.it) },
          { header: 'Request total', type: 'euro', width: 13, value: (x) => (x.n === 0 ? x.r.total : null) },
          { header: 'Notes', width: 36, value: (x) => (x.n === 0 ? x.r.notes ?? '' : '') },
          { header: 'Status', width: 10, value: (x) => (x.r.status === 'sent' ? 'Sent' : x.r.status === 'not_sent' ? 'Not sent' : 'Pending') },
        ],
        flat,
      );
      showToast(`Excel created ✓ — ${n} rows`);
    } catch (e) {
      showToast('Export failed: ' + (e as Error).message, true);
    }
  }

  return (
    <div className="budget-page pu-page">
      <div className="shell">
        <div className="b-head">
          <div className="b-head-left">
            <div className="logo">{IconCart}</div>
            <div>
              <p className="b-eyebrow">H-IS Vicenza</p>
              <h1>
                <em>Purchases</em>
              </h1>
              <p>Purchase requests — single items or several items at once</p>
            </div>
          </div>
          <div className="b-head-actions">
            <button className="ui-btn excel" onClick={handleExport} disabled={loading || !visible.length}>
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <path d="M12 15V3" />
              </svg>
              Export Excel
            </button>
            <Link className="ui-btn primary" href="/purchases/new">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New purchase request
            </Link>
          </div>
        </div>

        {error ? (
          <div className="setup-note">
            <b>Requests not available.</b> {error}
            <br />
            Run <code>0018_companies_budget_lines_purchases.sql</code> in the Supabase SQL Editor.
          </div>
        ) : null}

        <div className="stat-row pu-stats">
          <div className="stat">
            <div className="stat-lbl">Requests</div>
            <div className="stat-val">{visible.length}</div>
            <div className="stat-sub">{tab === 'all' ? 'all requesters' : 'sent by you'}</div>
          </div>
          <div className="stat">
            <div className="stat-lbl">This month</div>
            <div className="stat-val">{month.length}</div>
            <div className="stat-sub">{eur.format(month.reduce((t, r) => t + r.total, 0))}</div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Total requested</div>
            <div className="stat-val">{eur.format(visible.reduce((t, r) => t + r.total, 0))}</div>
            <div className="stat-sub">{visible.reduce((t, r) => t + r.items.length, 0)} items</div>
          </div>
        </div>

        <div className="pu-bar">
          {canAll ? (
            <div className="filters" role="tablist" style={{ margin: 0 }}>
              <button role="tab" aria-selected={tab === 'all'} className={'fchip' + (tab === 'all' ? ' active' : '')} onClick={() => setTab('all')}>
                All requests
              </button>
              <button role="tab" aria-selected={tab === 'mine'} className={'fchip' + (tab === 'mine' ? ' active' : '')} onClick={() => setTab('mine')}>
                My requests
              </button>
            </div>
          ) : (
            <h2 className="section-label" style={{ margin: 0 }}>
              My requests
            </h2>
          )}
          <label className="pu-search">
            <span className="sr-only">Search</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input type="text" placeholder="Search requester or item…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>

        <div className="ledger">
          {loading ? (
            <div className="empty">
              <p>Loading…</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">{IconCart}</div>
              <h3>No purchase requests</h3>
              <p>
                Use <Link href="/purchases/new">New purchase request</Link> to send the first one.
              </p>
            </div>
          ) : (
            <div className="ledger-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Requested by</th>
                    <th>Type</th>
                    <th>Items</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <React.Fragment key={r.id}>
                      <tr className="pu-row" onClick={() => setOpen(open === r.id ? null : r.id)}>
                        <td className="col-date">{fmt(r.created_at)}</td>
                        <td>
                          <div className="desc">
                            {r.requester_first} {r.requester_last}
                          </div>
                          <div className="sub">{r.requester_email}</div>
                        </td>
                        <td>{r.kind === 'single' ? 'Single' : 'Multiple'}</td>
                        <td>
                          <button type="button" className="pu-toggle" aria-expanded={open === r.id} onClick={(e) => { e.stopPropagation(); setOpen(open === r.id ? null : r.id); }}>
                            {r.items[0]?.name}
                            {r.items.length > 1 ? ` +${r.items.length - 1}` : ''}
                          </button>
                        </td>
                        <td className="col-amount">{eur.format(r.total)}</td>
                        <td>
                          <span className={'ui-chip ' + (r.status === 'sent' ? 'ok' : r.status === 'not_sent' ? 'warn' : 'muted')}>
                            {r.status === 'sent' ? 'Sent' : r.status === 'not_sent' ? 'Not sent' : 'Pending'}
                          </span>
                        </td>
                      </tr>
                      {open === r.id ? (
                        <tr className="pu-detail">
                          <td colSpan={6}>
                            <ul>
                              {r.items.map((it, n) => (
                                <li key={n}>
                                  <span className="pu-q">{it.quantity} ×</span>
                                  <span className="pu-n">
                                    {it.name}
                                    {it.link ? (
                                      <a href={it.link} target="_blank" rel="noopener noreferrer">
                                        open link
                                      </a>
                                    ) : null}
                                  </span>
                                  <span className="pu-p">{eur.format(it.price)} each</span>
                                  <b>{eur.format(itemTotal(it))}</b>
                                </li>
                              ))}
                            </ul>
                            {r.notes ? <p className="pu-notes">{r.notes}</p> : null}
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {toastNode}
      <style>{`
        .pu-page .pu-stats { margin-bottom: 1.2rem; }
        .pu-page .pu-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: .8rem; }
        .pu-page .pu-search { display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px; border-radius: 11px; background: #fff; border: 1px solid var(--b-line); flex: 0 1 320px; }
        .pu-page .pu-search svg { width: 16px; height: 16px; stroke: var(--b-faint); fill: none; stroke-width: 2; stroke-linecap: round; }
        .pu-page .pu-search input { border: none; outline: none; background: transparent; font: inherit; font-size: 13.5px; flex: 1; min-width: 0; padding: 0; box-shadow: none; }
        .pu-page .pu-row { cursor: pointer; }
        .pu-page .pu-toggle { border: none; background: none; padding: 0; font: inherit; font-weight: 600; color: var(--brand); cursor: pointer; text-align: left; }
        .pu-page .pu-detail td { background: #FBF9F8; }
        .pu-page .pu-detail ul { list-style: none; margin: 0; padding: 0; }
        .pu-page .pu-detail li { display: grid; grid-template-columns: 56px minmax(0, 1fr) 140px 110px; gap: 10px; align-items: baseline; padding: 6px 0; border-bottom: 1px dashed var(--b-line); font-size: 13.5px; }
        .pu-page .pu-detail li:last-child { border-bottom: none; }
        .pu-page .pu-q { color: var(--b-muted); font-variant-numeric: tabular-nums; }
        .pu-page .pu-n a { margin-left: 8px; font-size: 12.5px; color: var(--brand); }
        .pu-page .pu-p { color: var(--b-muted); text-align: right; font-variant-numeric: tabular-nums; }
        .pu-page .pu-detail b { text-align: right; font-variant-numeric: tabular-nums; }
        .pu-page .pu-notes { margin-top: 8px; font-size: 13px; color: var(--b-muted); white-space: pre-line; }
        @media (max-width: 640px) { .pu-page .pu-detail li { grid-template-columns: 44px minmax(0, 1fr) 90px; } .pu-page .pu-p { display: none; } }
      `}</style>
    </div>
  );
}

export default function PurchasesClient() {
  return (
    <AuthGuard roles={['office.hvi', 'teachers.hvi', 'admin']} perm="vi.purchases">
      <Inner />
    </AuthGuard>
  );
}
