/* ═══════════════════════════════════════════════════════════════════
   Gestione Utenti (Super Admin only). Everything goes through the
   SECURITY DEFINER functions of supabase/migrations/0008_…sql, which
   check the caller is a superadmin.
   ═══════════════════════════════════════════════════════════════════ */
import { getSupabase } from './supabase';

export interface PlatformUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  has_profile: boolean;
}

/* Keep in sync with public.platform_roles() in the 0008 migration. */
export const ROLES: { value: string; label: string; color: string; soft: string }[] = [
  { value: 'superadmin', label: 'Super Admin', color: '#5B1220', soft: '#F3E3E6' },
  { value: 'admin', label: 'Admin', color: '#8B1A2B', soft: '#F9EFF0' },
  { value: 'it', label: 'IT', color: '#3C5A8A', soft: '#E8EEF7' },
  { value: 'hr', label: 'HR', color: '#7A4E9A', soft: '#F1EAF7' },
  { value: 'boarding', label: 'Boarding', color: '#2F6E5B', soft: '#E6F2EC' },
  { value: 'office', label: 'Student Office', color: '#9A5B00', soft: '#FFF3E4' },
  { value: 'parent', label: 'Parent', color: '#46636B', soft: '#E7EFF1' },
  { value: 'guest', label: 'Guest', color: '#6E6468', soft: '#F1EDEC' },
];
export const roleMeta = (r: string) =>
  ROLES.find((x) => x.value === r) ?? { value: r, label: r, color: '#6E6468', soft: '#F1EDEC' };

export async function listUsers(): Promise<PlatformUser[]> {
  const { data, error } = await getSupabase().rpc('admin_list_users');
  if (error) throw new Error(error.message);
  return (data ?? []) as PlatformUser[];
}

export async function updateUser(id: string, firstName: string, lastName: string, role: string): Promise<void> {
  const { error } = await getSupabase().rpc('admin_update_user', {
    p_id: id,
    p_first_name: firstName,
    p_last_name: lastName,
    p_role: role,
  });
  if (error) throw new Error(error.message);
}

export async function deleteUser(id: string): Promise<void> {
  const { error } = await getSupabase().rpc('admin_delete_user', { p_id: id });
  if (error) throw new Error(error.message);
}
