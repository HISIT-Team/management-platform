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
  /** At least one verified authenticator app (migration 0015). */
  mfa_enabled?: boolean;
}

/* Keep in sync with public.platform_roles() in the 0008 migration. */
export const ROLES: { value: string; label: string; color: string; soft: string }[] = [
  { value: 'owner', label: 'Owner', color: '#7A5A00', soft: '#FBF4DF' },
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

/* ── Registro attività (audit_log, migrazione 0014) ─────────────────── */
export interface AuditEntry {
  id: number;
  created_at: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  target_label: string | null;
  details: Record<string, unknown>;
}

export const AUDIT_ACTIONS: Record<string, string> = {
  role_changed: 'Ruolo cambiato',
  user_edited: 'Utente modificato',
  user_deleted: 'Utente eliminato',
  device_record_deleted: 'Record storico eliminato',
  signatures_purged: 'Firme rimosse (conservazione)',
  mfa_policy_changed: 'Regola MFA cambiata',
  mfa_reset: 'MFA azzerata',
  mfa_device_trusted: 'Dispositivo ricordato (MFA)',
  mfa_devices_forgotten: 'Dispositivi dimenticati (MFA)',
  mfa_remember_changed: 'Durata "ricorda dispositivo" cambiata',
  idle_timeout_changed: 'Timeout inattività cambiato',
  permission_changed: 'Permesso di un ruolo cambiato',
};

export async function listAudit(limit = 1000): Promise<AuditEntry[]> {
  const { data, error } = await getSupabase().rpc('admin_list_audit', { p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []) as AuditEntry[];
}

/* ── MFA: policy per ruolo e reset (migrazione 0015) ─────────────────── */
export interface MfaPolicy {
  role: string;
  required: boolean;
  /** Inactivity timeout for the role, minutes (migration 0016). */
  idle_minutes: number;
  updated_at: string;
  updated_by: string | null;
}

export async function listMfaPolicy(): Promise<MfaPolicy[]> {
  const { data, error } = await getSupabase().from('mfa_role_policy').select('role,required,idle_minutes,updated_at,updated_by');
  if (error) throw new Error(error.message);
  const order = ROLES.map((r) => r.value);
  return ((data ?? []) as MfaPolicy[]).sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
}

export async function setMfaPolicy(role: string, required: boolean): Promise<void> {
  const { error } = await getSupabase().rpc('admin_set_mfa_policy', { p_role: role, p_required: required });
  if (error) throw new Error(error.message);
}

export async function setIdleTimeout(role: string, minutes: number): Promise<void> {
  const { error } = await getSupabase().rpc('admin_set_idle_timeout', { p_role: role, p_minutes: minutes });
  if (error) throw new Error(error.message);
}

export async function setRememberHours(hours: number): Promise<void> {
  const { error } = await getSupabase().rpc('admin_set_mfa_remember_hours', { p_hours: hours });
  if (error) throw new Error(error.message);
}

export async function resetUserMfa(id: string): Promise<number> {
  const { data, error } = await getSupabase().rpc('admin_reset_mfa', { p_id: id });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}
