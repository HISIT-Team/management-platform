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
   WebP (JPEG where the browser can't encode WebP, e.g. older Safari).
   Typically 3–10 KB instead of the 20–40 KB of the original PNG. */
export function compactSignature(pngDataUrl: string, width = 480, quality = 0.7): Promise<string | null> {
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
      let out = c.toDataURL('image/webp', quality);
      if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/jpeg', quality);
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
