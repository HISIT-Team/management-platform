'use client';
/* Purchases → New purchase request (H-IS Vicenza).
   Single item, or multiple items like a cart. The requester's name and
   email come from the signed-in account. On send the request is saved
   (purchase_requests) and forwarded to Power Automate — see
   src/lib/purchases.ts and migration 0018. */
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import { useToast } from '@/components/useToast';
import { getCurrentUser, loadProfile } from '@/lib/auth';
import { type PurchaseItem, itemTotal, requestTotal, submitPurchase } from '@/lib/purchases';

const eur = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });

interface ItemDraft {
  key: number;
  name: string;
  link: string;
  quantity: string;
  price: string;
}

let nextKey = 1;
const emptyItem = (): ItemDraft => ({ key: nextKey++, name: '', link: '', quantity: '1', price: '' });

/** Accepts "1234.56", "1.234,56" and "1,234.56". */
function parsePrice(raw: string): number {
  const s = raw.trim().replace(/[€\s]/g, '');
  if (!s) return NaN;
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, '')); // 1.250 = one thousand two hundred fifty
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  const normal = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  return Number(normal);
}

function toItem(d: ItemDraft): PurchaseItem {
  return { name: d.name.trim(), link: d.link.trim(), quantity: Math.max(0, Math.floor(Number(d.quantity) || 0)), price: Math.round((parsePrice(d.price) || 0) * 100) / 100 };
}

const IconCart = (
  <svg viewBox="0 0 24 24">
    <circle cx="9" cy="21" r="1" />
    <circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
  </svg>
);
const IconOne = (
  <svg viewBox="0 0 24 24">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
  </svg>
);
const IconMany = (
  <svg viewBox="0 0 24 24">
    <rect x="2" y="7" width="9" height="9" rx="1.5" />
    <rect x="13" y="7" width="9" height="9" rx="1.5" />
    <path d="M6 3h12" />
  </svg>
);
const IconUser = (
  <svg viewBox="0 0 24 24">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const IconPlus = (
  <svg viewBox="0 0 24 24">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const IconTrash = (
  <svg viewBox="0 0 24 24">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
  </svg>
);
const IconCheck = (
  <svg viewBox="0 0 24 24">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

export default function PurchaseFormClient() {
  const { showToast, toastNode } = useToast();
  const [kind, setKind] = useState<'single' | 'multiple'>('single');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [email, setEmail] = useState('');
  const [items, setItems] = useState<ItemDraft[]>(() => [emptyItem()]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ total: number; count: number; sent: boolean } | null>(null);

  // Requester from the signed-in account.
  useEffect(() => {
    let active = true;
    getCurrentUser().then(async (u) => {
      if (!u || !active) return;
      setEmail(u.email ?? '');
      try {
        const p = await loadProfile(u.id);
        if (!active) return;
        setFirst((v) => v || String(p.first_name ?? ''));
        setLast((v) => v || String(p.last_name ?? ''));
      } catch {
        /* names can be typed */
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const shown = kind === 'single' ? items.slice(0, 1) : items;
  const parsed = useMemo(() => shown.map(toItem), [shown]);
  const total = requestTotal(parsed);

  const update = (key: number, patch: Partial<ItemDraft>) => setItems((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  function validate(): string | null {
    if (!first.trim() || !last.trim()) return 'Enter first and last name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.';
    for (const [n, d] of shown.entries()) {
      const label = shown.length > 1 ? `Item ${n + 1}: ` : '';
      if (!d.name.trim()) return label + 'enter the item name.';
      if (d.link.trim() && !/^https?:\/\/\S+$/i.test(d.link.trim())) return label + 'the link must start with http:// or https://.';
      const q = Number(d.quantity);
      if (!Number.isInteger(q) || q < 1 || q > 100000) return label + 'quantity must be a whole number from 1.';
      const p = parsePrice(d.price);
      if (!Number.isFinite(p) || p < 0) return label + 'enter a valid price.';
    }
    return null;
  }

  async function send() {
    const err = validate();
    if (err) return showToast(err, true);
    setBusy(true);
    try {
      const res = await submitPurchase({ kind, first: first.trim(), last: last.trim(), email: email.trim(), items: parsed, notes: notes.trim() });
      setDone({ total: res.request.total, count: parsed.length, sent: res.sent });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      showToast('Request not saved: ' + (e as Error).message, true);
    }
    setBusy(false);
  }

  function reset() {
    setKind('single');
    setItems([emptyItem()]);
    setNotes('');
    setDone(null);
  }

  return (
    <AuthGuard roles={['office.hvi', 'teachers.hvi', 'admin']} perm="vi.purchases">
      <div className="form-page pf-purchase">
        <Link className="back-link" href="/purchases">
          <svg viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Purchases
        </Link>

        <div className="page-header">
          <div className="logo">{IconCart}</div>
          <div>
            <h1>New purchase request</h1>
            <p>H-IS Vicenza · single item or several items</p>
          </div>
        </div>

        <div className="form-wrap">
          {done ? (
            <div className="section pr-done">
              <div className="pr-done-ic">{IconCheck}</div>
              <h2>{done.sent ? 'Request sent' : 'Request saved'}</h2>
              <p>
                {done.count} {done.count === 1 ? 'item' : 'items'} · total {eur.format(done.total)}
              </p>
              {done.sent ? (
                <p className="pr-done-sub">You will find it in Purchases → My requests.</p>
              ) : (
                <p className="pr-done-warn">
                  The request is saved, but it could not be forwarded automatically. Please tell the Office (or IT) so they can
                  process it.
                </p>
              )}
              <div className="pr-done-actions">
                <button type="button" className="ui-btn" onClick={reset}>
                  New request
                </button>
                <Link className="ui-btn primary" href="/purchases">
                  My requests
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* TYPE */}
              <div className="section">
                <div className="section-title">
                  {IconCart}
                  Request type
                </div>
                <div className="big-selector" role="radiogroup" aria-label="Request type">
                  <button type="button" role="radio" aria-checked={kind === 'single'} className={'big-option' + (kind === 'single' ? ' selected' : '')} onClick={() => setKind('single')}>
                    {IconOne}
                    <span className="opt-label">Single purchase</span>
                    <span className="opt-sub">One item</span>
                  </button>
                  <button type="button" role="radio" aria-checked={kind === 'multiple'} className={'big-option' + (kind === 'multiple' ? ' selected' : '')} onClick={() => setKind('multiple')}>
                    {IconMany}
                    <span className="opt-label">Multiple purchase</span>
                    <span className="opt-sub">Several items, like a cart</span>
                  </button>
                </div>
              </div>

              {/* REQUESTER */}
              <div className="section">
                <div className="section-title">
                  {IconUser}
                  Requester
                </div>
                <div className="row2">
                  <div className="field">
                    <label htmlFor="pr-first">
                      First name <span className="req">*</span>
                    </label>
                    <input id="pr-first" type="text" autoComplete="given-name" value={first} onChange={(e) => setFirst(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="pr-last">
                      Last name <span className="req">*</span>
                    </label>
                    <input id="pr-last" type="text" autoComplete="family-name" value={last} onChange={(e) => setLast(e.target.value)} />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="pr-email">
                    Email <span className="req">*</span>
                  </label>
                  <input id="pr-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <p className="pr-hint">Filled in from your account — change it only if the reply should go elsewhere.</p>
                </div>
              </div>

              {/* ITEMS */}
              <div className="section">
                <div className="section-title">
                  {IconMany}
                  {kind === 'single' ? 'Item' : `Items · ${shown.length}`}
                </div>
                {shown.map((d, n) => {
                  const it = toItem(d);
                  return (
                    <div className="dynamic-block" key={d.key}>
                      {kind === 'multiple' ? (
                        <div className="block-header">
                          <span className="block-label">Item {n + 1}</span>
                          {shown.length > 1 ? (
                            <button type="button" className="remove-btn" onClick={() => setItems((prev) => prev.filter((x) => x.key !== d.key))}>
                              {IconTrash}
                              Remove
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="field">
                        <label htmlFor={`pr-name-${d.key}`}>
                          Item name <span className="req">*</span>
                        </label>
                        <input id={`pr-name-${d.key}`} type="text" maxLength={200} placeholder="e.g. Whiteboard markers, 12 pack" value={d.name} onChange={(e) => update(d.key, { name: e.target.value })} />
                      </div>
                      <div className="field">
                        <label htmlFor={`pr-link-${d.key}`}>Link</label>
                        <input id={`pr-link-${d.key}`} type="text" inputMode="url" autoCapitalize="off" spellCheck={false} placeholder="https://…" value={d.link} onChange={(e) => update(d.key, { link: e.target.value })} />
                      </div>
                      <div className="row2">
                        <div className="field">
                          <label htmlFor={`pr-qty-${d.key}`}>
                            Quantity <span className="req">*</span>
                          </label>
                          <input id={`pr-qty-${d.key}`} type="number" min={1} step={1} inputMode="numeric" value={d.quantity} onChange={(e) => update(d.key, { quantity: e.target.value })} />
                        </div>
                        <div className="field">
                          <label htmlFor={`pr-price-${d.key}`}>
                            Unit price (€) <span className="req">*</span>
                          </label>
                          <input id={`pr-price-${d.key}`} type="text" inputMode="decimal" placeholder="0.00" value={d.price} onChange={(e) => update(d.key, { price: e.target.value })} />
                        </div>
                      </div>
                      <div className="pr-line-total">
                        <span>Line total</span>
                        <b>{eur.format(itemTotal(it))}</b>
                      </div>
                    </div>
                  );
                })}
                {kind === 'multiple' ? (
                  <button type="button" className="add-btn" onClick={() => setItems((prev) => [...prev, emptyItem()])} disabled={items.length >= 50}>
                    {IconPlus}
                    Add another item
                  </button>
                ) : null}
              </div>

              {/* NOTES */}
              <div className="section">
                <div className="field">
                  <label htmlFor="pr-notes">Notes</label>
                  <textarea id="pr-notes" maxLength={2000} placeholder="Why it is needed, deadline, preferred supplier…" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>

              {/* SUMMARY */}
              <div className="section pr-summary">
                <div>
                  <span>{shown.length === 1 ? '1 item' : `${shown.length} items`}</span>
                  <b>{eur.format(total)}</b>
                </div>
                {kind === 'multiple' && shown.length > 1 ? (
                  <ul>
                    {parsed.map((it, n) => (
                      <li key={shown[n].key}>
                        <span>
                          {it.quantity} × {it.name || `Item ${n + 1}`}
                        </span>
                        <span>{eur.format(itemTotal(it))}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <button type="button" className="submit-btn" onClick={send} disabled={busy}>
                {busy ? 'Sending…' : 'Send request'}
              </button>
            </>
          )}
        </div>
        {toastNode}
      </div>
      <style>{`
        .pf-purchase .dynamic-block input { background: var(--surface); }
        .pf-purchase .pr-hint { font-size: 12px; color: var(--f-gray-600); margin-top: 6px; }
        .pf-purchase .pr-line-total { display: flex; justify-content: space-between; align-items: center; margin-top: .25rem; padding-top: .6rem; border-top: 1px dashed var(--f-gray-200); font-size: 13px; color: var(--f-gray-600); }
        .pf-purchase .pr-line-total b { font-size: 15px; color: var(--f-gray-900); font-variant-numeric: tabular-nums; }
        .pf-purchase .pr-summary > div { display: flex; justify-content: space-between; align-items: baseline; }
        .pf-purchase .pr-summary > div span { font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--f-gray-600); }
        .pf-purchase .pr-summary > div b { font-size: 24px; font-weight: 800; color: var(--brand); font-variant-numeric: tabular-nums; }
        .pf-purchase .pr-summary ul { list-style: none; margin: .75rem 0 0; padding: .6rem 0 0; border-top: 1px solid var(--f-gray-100); }
        .pf-purchase .pr-summary li { display: flex; justify-content: space-between; gap: 10px; font-size: 13.5px; padding: 4px 0; }
        .pf-purchase .pr-summary li span:last-child { font-variant-numeric: tabular-nums; font-weight: 600; }
        .pf-purchase .big-option { font-family: inherit; }
        .pf-purchase .pr-done { text-align: center; padding: 2rem 1.4rem; }
        .pf-purchase .pr-done-ic { width: 56px; height: 56px; margin: 0 auto .8rem; border-radius: 50%; background: var(--green-bg); display: flex; align-items: center; justify-content: center; }
        .pf-purchase .pr-done-ic svg { width: 28px; height: 28px; stroke: var(--green-text); fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
        .pf-purchase .pr-done h2 { font-size: 21px; font-weight: 800; }
        .pf-purchase .pr-done p { margin-top: 4px; color: var(--f-gray-600); }
        .pf-purchase .pr-done-warn { background: #FFF3E4; color: #8A4B00 !important; border-radius: 10px; padding: .7rem .9rem; margin-top: .8rem !important; font-size: 13.5px; }
        .pf-purchase .pr-done-actions { display: flex; gap: 10px; justify-content: center; margin-top: 1.2rem; flex-wrap: wrap; }
      `}</style>
    </AuthGuard>
  );
}
