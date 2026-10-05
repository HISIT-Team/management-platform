/* ═══════════════════════════════════════════════════════════════════
   Navigation of the app shell (sidebar on desktop, drawer + bottom bar
   on phones). Each entry lists the roles that see it; the same rule as
   the pages' AuthGuard applies:
     - superadmin sees everything;
     - admin sees everything except superadmin-only entries;
     - other roles see the entries that list them.
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
  | 'user'
  | 'external';

export interface NavItem {
  label: string;
  href: string;
  icon: NavIcon;
  roles: string[];
  external?: boolean;
  /** Extra paths that count as "inside" this entry (for the active state). */
  match?: string[];
  children?: NavItem[];
}

export interface NavGroup {
  title?: string;
  items: NavItem[];
}

const ALL = ['superadmin', 'admin', 'it', 'hr', 'boarding', 'office', 'parent'];

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
        match: ['/it-registries-hub', '/modulo-student', '/modulo-employee', '/qr'],
        children: [
          { label: 'Consegne studenti', href: '/student-checkinout-hub', icon: 'box', roles: ['it', 'admin'], match: ['/modulo-student'] },
          { label: 'Consegne dipendenti', href: '/employee-checkinout-hub', icon: 'briefcase', roles: ['it', 'admin'], match: ['/modulo-employee'] },
          { label: 'Storico assegnazioni', href: '/device-history', icon: 'history', roles: ['it', 'admin'] },
          { label: 'Budget IT', href: '/budget-management', icon: 'wallet', roles: ['admin'] },
          { label: 'Task Manager', href: '/task-manager', icon: 'tasks', roles: ['admin'] },
        ],
      },
      {
        label: 'HR',
        href: '/hr',
        icon: 'people',
        roles: ['hr', 'admin'],
        match: ['/employee-management-hub'],
        children: [
          { label: 'Onboarding', href: '/onboarding', icon: 'userPlus', roles: ['hr', 'admin'] },
          { label: 'Offboarding', href: '/employee-management', icon: 'userMinus', roles: ['hr', 'admin'] },
          { label: 'Registri', href: '/hr-registry-hub', icon: 'registry', roles: ['hr', 'admin'] },
        ],
      },
      {
        label: 'Boarding',
        href: '/boarding',
        icon: 'house',
        roles: ['boarding', 'admin'],
        match: ['/room-assignment-hub', '/room-assignment'],
      },
      { label: 'Student Office', href: '/student-office', icon: 'file', roles: ['office', 'admin'] },
    ],
  },
  {
    title: 'Amministrazione',
    items: [
      { label: 'Utenti e ruoli', href: '/user-management', icon: 'usersCog', roles: ['superadmin'], match: ['/backend'] },
      { label: 'Registro attività', href: '/audit-log', icon: 'clock', roles: ['superadmin'] },
      { label: 'Sicurezza', href: '/security-settings', icon: 'shield', roles: ['superadmin'] },
    ],
  },
];

/** Can a user with `mine` roles see an entry meant for `allowed`? */
export function canSee(mine: string[], allowed: string[]): boolean {
  if (mine.includes('superadmin')) return true;
  const superOnly = allowed.length > 0 && allowed.every((r) => r === 'superadmin');
  if (mine.includes('admin') && !superOnly) return true;
  return mine.some((r) => allowed.includes(r));
}

/** The navigation trimmed to what these roles can see (empty groups removed). */
export function navFor(mine: string[]): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    items: g.items
      .filter((i) => canSee(mine, i.roles))
      .map((i) => ({ ...i, children: i.children?.filter((c) => canSee(mine, c.roles)) })),
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
