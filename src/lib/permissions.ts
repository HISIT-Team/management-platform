/* ═══════════════════════════════════════════════════════════════════
   Permissions per role (Gestione Backend → Permessi ruoli, migration
   0017, 0018). Owner and Super Admin always have everything; Guest nothing;
   the roles below can be configured. Enforced in the database too
   (has_permission() in RLS and in the Edge Functions).
   ═══════════════════════════════════════════════════════════════════ */
import { getSupabase } from './supabase';

export interface PermissionDef {
  key: string;
  label: string;
  desc: string;
  group: string;
  /** Sub-permission of a section (indented in the matrix). */
  sub?: boolean;
}

export const PERMISSIONS: PermissionDef[] = [
  { key: 'it', label: 'Sezione IT', desc: 'Pagina IT e voce nel menu', group: 'IT' },
  { key: 'it.checkin_student', label: 'Consegne e restituzioni studenti', desc: 'Form check-out / check-in studenti', group: 'IT', sub: true },
  { key: 'it.checkin_employee', label: 'Consegne e restituzioni dipendenti', desc: 'Form check-out / check-in dipendenti', group: 'IT', sub: true },
  { key: 'it.history', label: 'Storico assegnazioni', desc: 'Lettura, ricerca, export ed eliminazione dei record', group: 'IT', sub: true },
  { key: 'it.registries', label: 'Registri risposte', desc: 'Registri check-in / check-out', group: 'IT', sub: true },
  { key: 'it.budget', label: 'Budget IT', desc: 'Commesse e spese delle scuole', group: 'IT', sub: true },
  { key: 'it.tasks', label: 'Task Manager', desc: 'Task del team IT', group: 'IT', sub: true },
  { key: 'hr', label: 'Sezione HR', desc: 'Pagina HR e voce nel menu', group: 'HR' },
  { key: 'hr.onboarding', label: 'Onboarding', desc: 'Richiesta setup nuovo dipendente', group: 'HR', sub: true },
  { key: 'hr.offboarding', label: 'Offboarding', desc: 'Uscita di un dipendente', group: 'HR', sub: true },
  { key: 'hr.registries', label: 'Registri HR', desc: 'Registri onboarding / offboarding', group: 'HR', sub: true },
  { key: 'boarding', label: 'Sezione Boarding', desc: 'Pagina Boarding e voce nel menu', group: 'Boarding' },
  { key: 'boarding.rooms', label: 'Assegnazione camere', desc: 'Form e registri camere', group: 'Boarding', sub: true },
  { key: 'office', label: 'Sezione Student Office', desc: 'Pagina Student Office', group: 'Student Office' },
  { key: 'vi.budget', label: 'Budget e commesse', desc: 'Spese, nuove commesse e stanziamenti di H-IS Vicenza', group: 'H-IS Vicenza' },
  { key: 'ro.budget', label: 'Budget e commesse', desc: 'Spese, nuove commesse e stanziamenti di H-IS Rosà', group: 'H-IS Rosà' },
];

/** Roles whose permissions can be edited (keep in sync with configurable_roles() in 0017). */
export const CONFIGURABLE_ROLES = ['admin', 'it', 'hr', 'boarding', 'office', 'parent', 'office.hvi', 'teachers.hvi', 'office.hro', 'teachers.hro'];

/** Permissions of the signed-in user's role; null when unavailable (0017 not run). */
export async function loadMyPermissions(): Promise<string[] | null> {
  const { data, error } = await getSupabase().rpc('my_permissions');
  if (error || !Array.isArray(data)) return null;
  return data as string[];
}

/** role → set of permissions. */
export async function listRolePermissions(): Promise<Record<string, Set<string>>> {
  const { data, error } = await getSupabase().from('role_permissions').select('role, perm');
  if (error) throw new Error(error.message);
  const out: Record<string, Set<string>> = {};
  for (const r of (data ?? []) as { role: string; perm: string }[]) (out[r.role] ||= new Set()).add(r.perm);
  return out;
}

export async function setRolePermission(role: string, perm: string, allowed: boolean): Promise<void> {
  const { error } = await getSupabase().rpc('admin_set_role_permission', { p_role: role, p_perm: perm, p_allowed: allowed });
  if (error) throw new Error(error.message);
}
