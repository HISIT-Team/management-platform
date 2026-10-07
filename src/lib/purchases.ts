/* ═══════════════════════════════════════════════════════════════════
   Purchases — H-IS Vicenza (migration 0018). A request is saved in
   purchase_requests and sent to Power Automate through the submit-form
   Edge Function (form_type "purchase_vicenza", secret
   WEBHOOK_PURCHASE_VICENZA). Requesters see their own requests; users
   with vi.purchases_admin see all of them.
   ═══════════════════════════════════════════════════════════════════ */
import { getSupabase } from './supabase';
import { submitForm } from './auth';

export interface PurchaseItem {
  name: string;
  link: string;
  quantity: number;
  price: number; // unit price, EUR
}

export interface PurchaseRequest {
  id: string;
  kind: 'single' | 'multiple';
  requester_first: string;
  requester_last: string;
  requester_email: string;
  items: PurchaseItem[];
  total: number;
  notes: string | null;
  status: 'pending' | 'sent' | 'not_sent';
  created_by: string;
  created_at: string;
}

export const itemTotal = (i: PurchaseItem) => Math.round(i.quantity * i.price * 100) / 100;
export const requestTotal = (items: PurchaseItem[]) => Math.round(items.reduce((t, i) => t + itemTotal(i), 0) * 100) / 100;

const COLS = 'id,kind,requester_first,requester_last,requester_email,items,total,notes,status,created_by,created_at';

/** Requests visible to me (mine, or all with vi.purchases_admin), newest first. */
export async function listPurchases(limit = 500): Promise<PurchaseRequest[]> {
  const { data, error } = await getSupabase().from('purchase_requests').select(COLS).order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as PurchaseRequest[]).map((r) => ({ ...r, total: Number(r.total) || 0, items: Array.isArray(r.items) ? r.items : [] }));
}

export interface NewPurchase {
  kind: 'single' | 'multiple';
  first: string;
  last: string;
  email: string;
  items: PurchaseItem[];
  notes: string;
}

/** Saves the request, then sends it to Power Automate. Returns the saved row
    and whether the webhook accepted it. */
export async function submitPurchase(p: NewPurchase): Promise<{ request: PurchaseRequest; sent: boolean; error?: string }> {
  const sb = getSupabase();
  const total = requestTotal(p.items);
  const { data, error } = await sb
    .from('purchase_requests')
    .insert({
      kind: p.kind,
      requester_first: p.first,
      requester_last: p.last,
      requester_email: p.email,
      items: p.items,
      total,
      notes: p.notes || null,
    })
    .select(COLS)
    .single();
  if (error) throw new Error(error.message);
  const request = { ...(data as PurchaseRequest), total: Number((data as PurchaseRequest).total) || 0 };

  let sent = false;
  let err: string | undefined;
  try {
    await submitForm('purchase_vicenza', {
      request_id: request.id,
      company: 'H-IS Vicenza',
      type: p.kind === 'single' ? 'Single purchase' : 'Multiple purchase',
      first_name: p.first,
      last_name: p.last,
      email: p.email,
      items: p.items.map((i, n) => ({ n: n + 1, name: i.name, link: i.link, quantity: i.quantity, unit_price: i.price, total: itemTotal(i) })),
      items_count: p.items.length,
      total,
      notes: p.notes,
      submitted_at: request.created_at,
    });
    sent = true;
  } catch (e) {
    err = (e as Error).message;
  }
  await sb.rpc('purchase_mark_sent', { p_id: request.id, p_ok: sent });
  return { request: { ...request, status: sent ? 'sent' : 'not_sent' }, sent, error: err };
}
