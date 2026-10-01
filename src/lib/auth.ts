/* ═══════════════════════════════════════════════════════════════════
   HIS Management Platform — Supabase auth helpers (TypeScript port)
   Port of the original window.HISAuth from supabase-auth.js.
   ═══════════════════════════════════════════════════════════════════ */
import type { User } from '@supabase/supabase-js';
import { getSupabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';
import { clearActivity, isIdleExpired, touchActivity } from './idle';

// Where the confirmation / reset links send the user back to.
// IMPORTANT: add these exact URLs in Supabase →
//   Authentication → URL Configuration → Redirect URLs
const siteUrl = () => (typeof window !== 'undefined' ? window.location.origin : '');
const confirmRedirect = () => siteUrl() + '/login';           // after email confirmation
const resetRedirect = () => siteUrl() + '/reset-password';    // after clicking "Reset your password"

export interface Profile {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  role?: string | null;
  roles?: string[] | string | null;
  [key: string]: unknown;
}

export interface SignUpArgs {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  captchaToken?: string;
}

export interface SignInArgs {
  email: string;
  password: string;
  captchaToken?: string;
}

// ─── REGISTRATION ─────────────────────────────────────────────
export async function signUpUser({ firstName, lastName, email, password, captchaToken }: SignUpArgs) {
  const sb = getSupabase();
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: confirmRedirect(),
      captchaToken,
      data: {
        first_name: firstName,
        last_name: lastName,
        full_name: (firstName + ' ' + lastName).trim(),
      },
    },
  });
  if (error) throw error;
  return data;
}

// ─── LOGIN ────────────────────────────────────────────────────
export async function signInUser({ email, password, captchaToken }: SignInArgs) {
  const sb = getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken },
  });
  if (error) throw error;
  touchActivity(); // fresh login → inactivity timer starts now
  return data;
}

// ─── LOGOUT ───────────────────────────────────────────────────
export async function signOutUser() {
  const sb = getSupabase();
  const { error } = await sb.auth.signOut();
  clearActivity();
  if (error) throw error;
}

// ─── FORGOT PASSWORD (send reset email) ──────────────────────
export async function requestPasswordReset(email: string, captchaToken?: string) {
  const sb = getSupabase();
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: resetRedirect(),
    captchaToken,
  });
  if (error) throw error;
}

// ─── RESET PASSWORD (set the new password) ───────────────────
export async function updateUserPassword(newPassword: string) {
  const sb = getSupabase();
  const { data, error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw error;
  return data;
}

// ─── SESSION / PROFILE ────────────────────────────────────────
export async function getCurrentUser(): Promise<User | null> {
  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  // Inactivity timeout (src/lib/idle.ts): an expired session counts as signed out.
  if (user && isIdleExpired()) {
    try {
      await sb.auth.signOut();
    } catch {
      /* local session is cleared anyway */
    }
    clearActivity();
    return null;
  }
  return user;
}

export async function loadProfile(userId: string): Promise<Profile> {
  const sb = getSupabase();
  const { data, error } = await sb.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return data as Profile;
}

export async function upsertProfile(profile: Profile): Promise<Profile> {
  const sb = getSupabase();
  const { data, error } = await sb.from('profiles').upsert(profile).select().single();
  if (error) throw error;
  return data as Profile;
}

// Creates/refreshes the profile row from the auth user metadata.
// Does NOT touch `role` (that stays managed by an admin).
export async function ensureProfile(user: User): Promise<Profile | null> {
  const sb = getSupabase();
  const md = (user.user_metadata || {}) as Record<string, unknown>;
  try {
    const { data, error } = await sb.from('profiles').upsert({
      id: user.id,
      first_name: (md.first_name as string) || null,
      last_name: (md.last_name as string) || null,
      email: user.email,
    }, { onConflict: 'id' }).select().single();
    if (error) throw error;
    return data as Profile;
  } catch {
    return null;
  }
}

// Normalises roles from the profile. Schema uses a single `role` text column.
export function profileRoles(profile: Profile | null): string[] {
  const norm = (arr: unknown[]) => arr.map((r) => String(r).trim().toLowerCase()).filter(Boolean);
  if (!profile) return [];
  if (profile.role) return norm([profile.role]);
  if (Array.isArray(profile.roles)) return norm(profile.roles);
  if (typeof profile.roles === 'string') return norm(profile.roles.split(','));
  return [];
}

// Display name from a profile row.
export function profileName(profile: Profile | null, fallback?: string): string {
  if (profile) {
    const n = ((profile.first_name || '') + ' ' + (profile.last_name || '')).trim();
    if (n) return n;
  }
  return fallback || '';
}

export type AccessResult =
  | { status: 'unauthenticated' }
  | { status: 'forbidden' }
  | { status: 'ok'; user: User; profile: Profile | null };

// Guard for protected pages. Used by <AuthGuard>.
export async function checkAccess(allowedRoles?: string[]): Promise<AccessResult> {
  const user = await getCurrentUser();
  if (!user) return { status: 'unauthenticated' };
  let profile: Profile | null = null;
  try {
    profile = await loadProfile(user.id);
  } catch {
    /* no profile row yet */
  }
  if (allowedRoles && allowedRoles.length) {
    const roles = profileRoles(profile);
    const ok = roles.some((r) => allowedRoles.includes(r)) || roles.includes('admin');
    if (!ok) return { status: 'forbidden' };
  }
  return { status: 'ok', user, profile };
}

// ─── SECURE FORM SUBMIT ───────────────────────────────────────
// Sends a form through the 'submit-form' Edge Function instead of hitting the
// webhook directly. The function verifies the user's session + role server-side
// and forwards to the (hidden) webhook.
export async function submitForm(formType: string, payload: unknown, captchaToken?: string) {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error('You must be signed in to submit this form.');
  const res = await fetch(SUPABASE_URL + '/functions/v1/submit-form', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + session.access_token,
    },
    body: JSON.stringify({ form_type: formType, payload, captchaToken }),
  });
  let data: { error?: string } = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(data.error || 'Submit failed (HTTP ' + res.status + ')');
  return data;
}
