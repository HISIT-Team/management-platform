/* ═══════════════════════════════════════════════════════════════════
   IT → Accessori smarriti (migration 0023).
   A report goes to the Power Automate flow through the submit-form
   Edge Function (form_type "lost_accessories", secret
   WEBHOOK_LOST_ACCESSORIES) WITH names and parent emails, and is kept in
   lost_accessories_log WITHOUT them: only email, student/employee,
   accessories and notes.
   ═══════════════════════════════════════════════════════════════════ */
import { getSupabase } from './supabase';
import { submitForm } from './auth';

export type PersonType = 'student' | 'employee';
export type AccessoryCode = 'mac_charger' | 'ipad_charger' | 'mac_magsafe_cable' | 'ipad_usbc_cable';

export const ACCESSORIES: { code: AccessoryCode; label: string; en: string }[] = [
  { code: 'mac_charger', label: 'Alimentatore Mac', en: 'Mac power adapter' },
  { code: 'ipad_charger', label: 'Alimentatore iPad', en: 'iPad power adapter' },
  { code: 'mac_magsafe_cable', label: 'Cavo MagSafe per Mac', en: 'MagSafe cable for Mac' },
  { code: 'ipad_usbc_cable', label: 'Cavo Type-C per iPad', en: 'USB Type-C cable for iPad' },
];
export const accessoryLabel = (c: string) => ACCESSORIES.find((a) => a.code === c)?.label ?? c;

export interface LostAccessoryRow {
  id: string;
  created_at: string;
  person_type: PersonType;
  email: string;
  accessories: AccessoryCode[];
  notes: string | null;
  created_by_name: string | null;
}

export interface LostAccessoryReport {
  personType: PersonType;
  firstName: string;
  lastName: string;
  email: string;
  parentEmail1: string;
  parentEmail2: string;
  school: string;
  accessories: AccessoryCode[];
  notes: string;
}

/** History, newest first (pages through Supabase's 1000-row cap). */
export async function listLostAccessories(): Promise<LostAccessoryRow[]> {
  const sb = getSupabase();
  const out: LostAccessoryRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('lost_accessories_log')
      .select('id, created_at, person_type, email, accessories, notes, created_by_name')
      .order('created_at', { ascending: false })
      .range(from, from + 999);
    if (error) {
      if (/lost_accessories_log/.test(error.message)) throw new Error('Storico non disponibile: esegui la migrazione 0023 in Supabase.');
      throw new Error(error.message);
    }
    out.push(...((data ?? []) as LostAccessoryRow[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Sends the report to the flow, then records it in the history.
    Returns `logged: false` when the flow got it but the history didn't. */
export async function submitLostAccessories(r: LostAccessoryReport): Promise<{ logged: boolean; error?: string }> {
  const items = ACCESSORIES.filter((a) => r.accessories.includes(a.code));
  await submitForm('lost_accessories', {
    timestamp: new Date().toISOString(),
    type: r.personType,
    type_label: r.personType === 'student' ? 'Studente' : 'Dipendente',
    first_name: r.firstName.trim(),
    last_name: r.lastName.trim(),
    email: r.email.trim(),
    school_or_company: r.school,
    parent_email_1: r.personType === 'student' ? r.parentEmail1.trim() : '',
    parent_email_2: r.personType === 'student' ? r.parentEmail2.trim() : '',
    accessories: items.map((a) => a.code),
    accessories_labels: items.map((a) => a.label),
    accessories_text: items.map((a) => a.label).join(', '),
    accessories_count: items.length,
    notes: r.notes.trim(),
  });
  const { error } = await getSupabase()
    .from('lost_accessories_log')
    .insert({ person_type: r.personType, email: r.email.trim(), accessories: items.map((a) => a.code), notes: r.notes.trim() || null });
  return error ? { logged: false, error: error.message } : { logged: true };
}

/** Deletes one report (checked: without permission Supabase silently deletes nothing). */
export async function deleteLostAccessory(id: string): Promise<void> {
  const { data, error } = await getSupabase().from('lost_accessories_log').delete().eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Segnalazione non eliminata: permesso mancante.');
}
