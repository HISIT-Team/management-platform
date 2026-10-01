/* ═══════════════════════════════════════════════════════════════════
   "My profile" — the signed-in user's own name, picture, password and
   email. Name and picture live in `profiles` (RLS: own row only);
   password and email go through Supabase Auth, whose emails are sent
   via the custom SMTP (Resend). See supabase/migrations/0012_my_profile.sql.
   ═══════════════════════════════════════════════════════════════════ */
import type { User } from '@supabase/supabase-js';
import { getSupabase } from './supabase';

export interface MyProfile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  avatar: string | null;
  /** Address waiting for confirmation after an email-change request. */
  pending_email: string | null;
}

export async function loadMyProfile(): Promise<MyProfile | null> {
  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  const p = (data ?? {}) as Record<string, unknown>;
  return {
    id: user.id,
    email: user.email ?? '',
    first_name: (p.first_name as string) ?? null,
    last_name: (p.last_name as string) ?? null,
    role: (p.role as string) ?? null,
    avatar: (p.avatar as string) ?? null,
    pending_email: (user as User & { new_email?: string }).new_email ?? null,
  };
}

export async function updateMyName(firstName: string, lastName: string): Promise<void> {
  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('Sessione scaduta: accedi di nuovo.');
  const first = firstName.trim() || null;
  const last = lastName.trim() || null;
  const { data, error } = await sb.from('profiles').update({ first_name: first, last_name: last }).eq('id', user.id).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Profilo non trovato.');
  // Keep the auth metadata aligned (used when a profile row is (re)created).
  await sb.auth.updateUser({ data: { first_name: first, last_name: last, full_name: [first, last].filter(Boolean).join(' ') } });
}

export async function updateMyAvatar(avatar: string | null): Promise<void> {
  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('Sessione scaduta: accedi di nuovo.');
  const { data, error } = await sb.from('profiles').update({ avatar }).eq('id', user.id).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Profilo non trovato.');
}

export async function changeMyPassword(newPassword: string): Promise<void> {
  const { error } = await getSupabase().auth.updateUser({ password: newPassword });
  if (!error) return;
  const msg = error.message || '';
  if (/reauthentic|recent/i.test(msg)) {
    throw new Error('Per sicurezza devi aver effettuato l’accesso di recente: esci, rientra e riprova.');
  }
  if (/same|different from the old/i.test(msg)) throw new Error('La nuova password deve essere diversa da quella attuale.');
  if (/weak|short|at least/i.test(msg)) throw new Error('Password troppo debole: ' + msg);
  throw new Error(msg);
}

/** Supabase sends the confirmation link (through Resend); the change happens once confirmed. */
export async function requestEmailChange(newEmail: string): Promise<void> {
  const redirect = typeof window !== 'undefined' ? window.location.origin + '/profile?email_changed=1' : undefined;
  const { error } = await getSupabase().auth.updateUser({ email: newEmail.trim() }, { emailRedirectTo: redirect });
  if (!error) return;
  const msg = error.message || '';
  if (/already|registered|exists/i.test(msg)) throw new Error('Questo indirizzo è già usato da un altro account.');
  if (/rate|too many|seconds/i.test(msg)) throw new Error('Troppe richieste ravvicinate: attendi qualche minuto e riprova.');
  throw new Error(msg);
}

/* Square-crop + resize a picked image to a small WebP (JPEG fallback). */
export function makeAvatar(file: File, size = 256, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Scegli un file immagine (JPG, PNG, HEIC…).'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d');
      URL.revokeObjectURL(url);
      if (!ctx) return reject(new Error('Impossibile elaborare l’immagine.'));
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      let out = c.toDataURL('image/webp', quality);
      if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/jpeg', quality);
      if (out.length > 150000) out = c.toDataURL('image/jpeg', 0.6);
      resolve(out);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Formato immagine non supportato da questo browser.'));
    };
    img.src = url;
  });
}
