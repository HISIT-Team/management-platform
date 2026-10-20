/* ═══════════════════════════════════════════════════════════════════
   Drafts of the device forms (migration 0024).
   Prepared in advance (QR, devices, asset IDs, photos), opened when the
   student/employee is there, signed and sent. Never holds the signature.
   Deleted when the form is sent (by submit-form server side, and here as
   a safety net) and after 14 days anyway.
   ═══════════════════════════════════════════════════════════════════ */
import { getSupabase } from './supabase';

export type DraftKind = 'student' | 'employee';
export type DraftOp = 'Check-in' | 'Check-out';

export interface DraftDeviceState {
  assetId: string;
  images: string[];
  hasDamage: boolean;
  damagePhotos: string[];
}

/** Form state kept in a draft (no signature). */
export interface DraftData {
  firstName: string;
  lastName: string;
  email: string;
  org: string;
  email1: string;
  email2: string;
  selected: string[];
  details: Record<string, DraftDeviceState>;
  signer: string | null;
}

export interface DraftSummary {
  id: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  kind: DraftKind;
  operation: DraftOp;
  label: string;
  email: string | null;
  devices: string[];
  photos_count: number;
  created_by_name: string | null;
  updated_by_name: string | null;
}

const SUMMARY = 'id, created_at, updated_at, expires_at, kind, operation, label, email, devices, photos_count, created_by_name, updated_by_name';
const notReady = (m: string) => (/device_form_drafts/.test(m) ? 'Bozze non disponibili: esegui la migrazione 0024 in Supabase.' : m);

/** Saves a new draft or updates an existing one; returns its id. */
export async function saveDraft(id: string | null, kind: DraftKind, operation: DraftOp, data: DraftData): Promise<string> {
  const label = `${data.firstName.trim()} ${data.lastName.trim()}`.trim() || data.email.trim() || 'Senza nome';
  const photos = Object.values(data.details).reduce((t, d) => t + d.images.length + (d.hasDamage ? d.damagePhotos.length : 0), 0);
  const row = {
    kind,
    operation,
    label: label.slice(0, 200),
    email: data.email.trim() || null,
    devices: data.selected,
    photos_count: photos,
    data,
  };
  const sb = getSupabase();
  if (id) {
    const { data: upd, error } = await sb.from('device_form_drafts').update(row).eq('id', id).select('id');
    if (error) throw new Error(notReady(error.message));
    if (upd && upd.length) return id;
    // The draft no longer exists (sent or expired meanwhile): save it as a new one.
  }
  const { data: ins, error } = await sb.from('device_form_drafts').insert(row).select('id').single();
  if (error) throw new Error(notReady(error.message));
  return (ins as { id: string }).id;
}

export async function loadDraft(id: string): Promise<(DraftSummary & { data: DraftData }) | null> {
  const { data, error } = await getSupabase().from('device_form_drafts').select(`${SUMMARY}, data`).eq('id', id).maybeSingle();
  if (error) throw new Error(notReady(error.message));
  return (data as (DraftSummary & { data: DraftData }) | null) ?? null;
}

/** Drafts list (without the heavy form data); purges the expired ones first. */
export async function listDrafts(): Promise<DraftSummary[]> {
  const sb = getSupabase();
  await sb.rpc('device_drafts_purge_expired'); // best effort
  const { data, error } = await sb.from('device_form_drafts').select(SUMMARY).order('updated_at', { ascending: false }).limit(500);
  if (error) throw new Error(notReady(error.message));
  return (data ?? []) as DraftSummary[];
}

/** Deletes a draft and checks it is really gone (true = no longer exists). */
export async function deleteDraft(id: string): Promise<boolean> {
  const sb = getSupabase();
  await sb.from('device_form_drafts').delete().eq('id', id);
  const { data } = await sb.from('device_form_drafts').select('id').eq('id', id);
  return !data || data.length === 0;
}

/** Href of the form that opens a draft. */
export const draftHref = (d: Pick<DraftSummary, 'id' | 'kind' | 'operation'>) =>
  `/${d.kind === 'student' ? 'modulo-student' : 'modulo-employee'}?op=${d.operation === 'Check-in' ? 'checkin' : 'checkout'}&draft=${d.id}`;
