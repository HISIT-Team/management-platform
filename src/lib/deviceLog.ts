/* ═══════════════════════════════════════════════════════════════════
   Student device log — writes one row to `student_device_log`
   (see supabase/migrations/0005_student_device_log.sql) for every
   Student Check-in / Check-out form submitted.
   The student is identified by email only — no names are stored.
   ═══════════════════════════════════════════════════════════════════ */
import { getSupabase } from './supabase';

export interface StudentDeviceLogEntry {
  operation: 'Check-in' | 'Check-out';
  student_email: string;
  school: string;
  macbook_id: string | null;
  ipad_id: string | null;
  signed_by: string | null;
  signature: string | null;
}

/* Shrinks the signature for storage: white background, 480px wide,
   WebP by default (JPEG where the browser can't encode WebP, e.g. older
   Safari); pass 'image/jpeg' for consumers like Outlook/Power Automate.
   Typically 3–10 KB instead of the 20–40 KB of the original PNG. */
export function compactSignature(pngDataUrl: string, width = 480, quality = 0.7, mime: 'image/webp' | 'image/jpeg' = 'image/webp'): Promise<string | null> {
  return new Promise((resolve) => {
    if (!pngDataUrl) return resolve(null);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, width / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      let out = c.toDataURL(mime, quality);
      if (!out.startsWith('data:' + mime)) out = c.toDataURL('image/jpeg', quality);
      // The table rejects anything over 60 KB; never let a huge image fail the insert.
      resolve(out.length <= 60000 ? out : c.toDataURL('image/jpeg', 0.4));
    };
    img.onerror = () => resolve(null);
    img.src = pngDataUrl;
  });
}

export async function logStudentDevice(entry: StudentDeviceLogEntry): Promise<void> {
  const { error } = await getSupabase().from('student_device_log').insert(entry);
  if (error) throw new Error(error.message);
}

/* ── Read side (dashboard /device-history) ─────────────────────────── */

export interface StudentDeviceLogRow {
  id: string;
  created_at: string;
  operation: 'Check-in' | 'Check-out';
  student_email: string;
  school: string | null;
  macbook_id: string | null;
  ipad_id: string | null;
  signed_by: string | null;
}

/* Loads the whole history, newest first, WITHOUT the signature column.
   Supabase caps a single response at 1000 rows, so it pages. */
export async function listStudentDeviceLog(): Promise<StudentDeviceLogRow[]> {
  const sb = getSupabase();
  const PAGE = 1000;
  const out: StudentDeviceLogRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('student_device_log')
      .select('id, created_at, operation, student_email, school, macbook_id, ipad_id, signed_by')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as StudentDeviceLogRow[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

const SCHOOL_SHORT: Record<string, string> = {
  'H-INTERNATIONAL SCHOOL SRL': 'Venezia',
  'H-INTERNATIONAL SCHOOL VICENZA SRL': 'Vicenza',
  'H-INTERNATIONAL SCHOOL ROSÀ SRL': 'Rosà',
};
export const schoolShort = (s: string | null) => (s ? SCHOOL_SHORT[s] ?? s : '—');

/* Deletes one record. Without the delete policy (migration 0006) Supabase
   silently deletes nothing, so the result is checked. */
export async function deleteStudentDeviceLog(id: string): Promise<void> {
  const { data, error } = await getSupabase().from('student_device_log').delete().eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Record non eliminato: verifica di aver eseguito la migrazione 0006 in Supabase.');
}

export const SCHOOLS = ['H-INTERNATIONAL SCHOOL SRL', 'H-INTERNATIONAL SCHOOL VICENZA SRL', 'H-INTERNATIONAL SCHOOL ROSÀ SRL'];
export const SIGNERS = ['Student', 'Parent', 'IT Support'];

export type DeviceLogChanges = Pick<StudentDeviceLogRow, 'created_at' | 'operation' | 'student_email' | 'school' | 'macbook_id' | 'ipad_id' | 'signed_by'>;

/* Edits one record (migration 0020). The signature can't be changed;
   the change is written to the activity log. */
export async function updateStudentDeviceLog(id: string, c: DeviceLogChanges): Promise<StudentDeviceLogRow> {
  const { data, error } = await getSupabase().rpc('device_log_update', {
    p_id: id,
    p_created_at: c.created_at,
    p_operation: c.operation,
    p_email: c.student_email,
    p_school: c.school,
    p_macbook_id: c.macbook_id ?? '',
    p_ipad_id: c.ipad_id ?? '',
    p_signed_by: c.signed_by,
  });
  if (error) {
    if (/device_log_update/.test(error.message) && /(not find|does not exist|schema cache)/i.test(error.message))
      throw new Error('Modifica non disponibile: esegui la migrazione 0020 in Supabase.');
    throw new Error(error.message);
  }
  const r = data as StudentDeviceLogRow & { signature?: unknown };
  return { id: r.id, created_at: r.created_at, operation: r.operation, student_email: r.student_email, school: r.school, macbook_id: r.macbook_id, ipad_id: r.ipad_id, signed_by: r.signed_by };
}
