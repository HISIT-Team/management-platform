/* ═══════════════════════════════════════════════════════════════════
   Navigation of the app shell (sidebar on desktop, drawer + bottom bar
   on phones). Who sees an entry:
     - Owner and Super Admin: everything;
     - the other roles: the entries whose `perm` their role has in
       Gestione Backend → Permessi ruoli (migration 0017);
     - before 0017 is run (no permissions available): the `roles` list,
       admin seeing everything except Owner/Super-Admin-only entries.
   Hiding a link is only cosmetic: pages and data stay protected by
   AuthGuard and by RLS in the database.
   ═══════════════════════════════════════════════════════════════════ */

export type NavIcon =
  | 'dashboard'
  | 'it'
  | 'box'
  | 'briefcase'
  | 'history'
  | 'registry'
  | 'wallet'
  | 'tasks'
  | 'people'
  | 'userPlus'
  | 'userMinus'
  | 'house'
  | 'file'
  | 'usersCog'
  | 'clock'
  | 'shield'
  | 'sliders'
  | 'user'
  | 'external';

export interface NavItem {
  label: string;
  href: string;
  icon: NavIcon;
  roles: string[];
  /** Permission key (src/lib/permissions.ts); none = decided by `roles`. */
  perm?: string;
  external?: boolean;
  /** Extra paths that count as "inside" this entry (for the active state). */
  match?: string[];
  children?: NavItem[];
}

export interface NavGroup {
  title?: string;
  items: NavItem[];
}

const ALL = ['owner', 'superadmin', 'admin', 'it', 'hr', 'boarding', 'office', 'parent'];

export const NAV: NavGroup[] = [
  {
    items: [{ label: 'Dashboard', href: '/', icon: 'dashboard', roles: ALL }],
  },
  {
    title: 'Sezioni',
    items: [
      {
        label: 'IT',
        href: '/it',
        icon: 'it',
        roles: ['it', 'admin'],
        perm: 'it',
        match: ['/qr'],
        children: [
          { label: 'Consegne studenti', href: '/student-checkinout-hub', icon: 'box', roles: ['it', 'admin'], perm: 'it.checkin_student', match: ['/modulo-student'] },
          { label: 'Consegne dipendenti', href: '/employee-checkinout-hub', icon: 'briefcase', roles: ['it', 'admin'], perm: 'it.checkin_employee', match: ['/modulo-employee'] },
          { label: 'Storico assegnazioni', href: '/device-history', icon: 'history', roles: ['it', 'admin'], perm: 'it.history' },
          { label: 'Registri risposte', href: '/it-registries-hub', icon: 'registry', roles: ['it', 'admin'], perm: 'it.registries' },
          { label: 'Budget IT', href: '/budget-management', icon: 'wallet', roles: ['admin'], perm: 'it.budget' },
          { label: 'Task Manager', href: '/task-manager', icon: 'tasks', roles: ['admin'], perm: 'it.tasks' },
        ],
      },
      {
        label: 'HR',
        href: '/hr',
        icon: 'people',
        roles: ['hr', 'admin'],
        perm: 'hr',
        match: ['/employee-management-hub'],
        children: [
          { label: 'Onboarding', href: '/onboarding', icon: 'userPlus', roles: ['hr', 'admin'], perm: 'hr.onboarding' },
          { label: 'Offboarding', href: '/employee-management', icon: 'userMinus', roles: ['hr', 'admin'], perm: 'hr.offboarding' },
          { label: 'Registri', href: '/hr-registry-hub', icon: 'registry', roles: ['hr', 'admin'], perm: 'hr.registries' },
        ],
      },
      {
        label: 'Boarding',
        href: '/boarding',
        icon: 'house',
        roles: ['boarding', 'admin'],
        perm: 'boarding',
        match: ['/room-assignment-hub', '/room-assignment'],
      },
      { label: 'Student Office', href: '/student-office', icon: 'file', roles: ['office', 'admin'], perm: 'office' },
    ],
  },
  {
    title: 'Amministrazione',
    items: [
      { label: 'Utenti e ruoli', href: '/user-management', icon: 'usersCog', roles: ['superadmin'], match: ['/backend'] },
      { label: 'Permessi ruoli', href: '/role-permissions', icon: 'sliders', roles: ['superadmin'] },
      { label: 'Registro attività', href: '/audit-log', icon: 'clock', roles: ['superadmin'] },
      { label: 'Sicurezza', href: '/security-settings', icon: 'shield', roles: ['superadmin'] },
    ],
  },
];

/** What the signed-in user may open: roles + permissions of the role
    (null = permissions not available yet → role lists decide). */
export interface Access {
  roles: string[];
  perms: string[] | null;
}

/** Owner and Super Admin see everything. */
export const isTop = (roles: string[]) => roles.includes('owner') || roles.includes('superadmin');

/** Role-list rule (before migration 0017, and for Owner/Super-Admin-only entries). */
export function canSee(mine: string[], allowed: string[]): boolean {
  if (isTop(mine)) return true;
  const superOnly = allowed.length > 0 && allowed.every((r) => r === 'superadmin' || r === 'owner');
  if (mine.includes('admin') && !superOnly) return true;
  return mine.some((r) => allowed.includes(r));
}

/** Can `a` open something guarded by `perm` (falling back to `roles`)? */
export function allows(a: Access, perm: string | undefined, roles: string[]): boolean {
  if (isTop(a.roles)) return true;
  if (perm && a.perms) return a.perms.includes(perm);
  return canSee(a.roles, roles);
}

/** The navigation trimmed to what this user can open (empty groups removed). */
export function navFor(a: Access): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    items: g.items
      .map((i) => ({ ...i, children: i.children?.filter((c) => allows(a, c.perm, c.roles)) }))
      .filter((i) => allows(a, i.perm, i.roles) || (i.children?.length ?? 0) > 0),
  })).filter((g) => g.items.length);
}

/** Is `pathname` this entry (or one of its sub-pages)? */
export function isActive(item: NavItem, pathname: string): boolean {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const paths = [item.href, ...(item.match ?? [])];
  if (item.href === '/') return clean === '/';
  return paths.some((p) => clean === p || clean.startsWith(p + '/'));
}

/** Entry or any of its children active. */
export function isSectionActive(item: NavItem, pathname: string): boolean {
  return isActive(item, pathname) || !!item.children?.some((c) => isActive(c, pathname));
}
