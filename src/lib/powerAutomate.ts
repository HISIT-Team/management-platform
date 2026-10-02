/* ═══════════════════════════════════════════════════════════════════
   Sends a submitted device Check-in / Check-out form to Power Automate
   through the Supabase Edge Function `notify-powerautomate`
   (supabase/functions/notify-powerautomate). The flow URL stays in the
   Supabase secret POWER_AUTOMATE_WEBHOOK_URL, never in the browser.
   ═══════════════════════════════════════════════════════════════════ */
import { getSupabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';
import { trustedDeviceHeaders } from './trustedDevice';

export interface PowerAutomatePayload {
  form_type: string; // student_checkout | student_checkin | employee_checkout | employee_checkin
  operation: 'Check-in' | 'Check-out';
  operation_label: 'Consegna' | 'Restituzione'; // HIS: Check-out = consegna, Check-in = restituzione
  type: 'student' | 'employee';
  timestamp: string;
  first_name: string;
  last_name: string;
  email: string;
  school_or_company: string;
  parent_email_1: string;
  parent_email_2: string;
  devices: string[];
  macbook_id: string;
  ipad_id: string;
  accessories_id: string;
  device_details: Record<string, unknown>;
  signed_by: string;
  /** Signature as JPEG/WebP data URL, plus the bare base64 part (use base64ToBinary() in Power Automate). */
  signature_data_url: string;
  signature_base64: string;
  signature_mime: string;
  photos: { name: string; category: string; device: string; mime: string; base64: string }[];
}

const splitDataUrl = (d: string) => {
  const m = /^data:([^;]+);base64,(.*)$/.exec(d || '');
  return m ? { mime: m[1], base64: m[2] } : { mime: '', base64: '' };
};
export { splitDataUrl };

export async function notifyPowerAutomate(payload: PowerAutomatePayload): Promise<void> {
  const { data: { session } } = await getSupabase().auth.getSession();
  if (!session) throw new Error('You must be signed in.');
  const res = await fetch(SUPABASE_URL + '/functions/v1/notify-powerautomate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + session.access_token,
      ...trustedDeviceHeaders(), // remembered device (MFA), checked by the function
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let msg = 'HTTP ' + res.status;
    try {
      msg = ((await res.json()) as { error?: string }).error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}
