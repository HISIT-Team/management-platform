/* ═══════════════════════════════════════════════════════════════════
   The three companies of the platform. After login a user who can open
   more than one picks the company; the menu and the dashboard then show
   only that company's sections.
     - Owner, Super Admin, Admin: all three.
     - it, hr, boarding, office, parent: H-IS Venezia (as before).
     - office.hvi, teachers.hvi: H-IS Vicenza.
     - office.hro, teachers.hro: H-IS Rosà.
   A permission of another company (Permessi ruoli: vi.* / ro.*) also
   opens that company. Data is protected by the permissions in the
   database; the company is only how the platform is organised.
   ═══════════════════════════════════════════════════════════════════ */
import type { Access } from './nav';

export type CompanyId = 'venezia' | 'vicenza' | 'rosa';

export interface Company {
  id: CompanyId;
  name: string; // short, for the menu
  full: string;
  location: string;
  /** Legal entity, as used by the forms. */
  legal: string;
  color: string;
  soft: string;
}

export const COMPANIES: Company[] = [
  { id: 'venezia', name: 'H-IS Venezia', full: 'H-International School Venezia', location: 'Roncade (TV)', legal: 'H-INTERNATIONAL SCHOOL SRL', color: '#8B1A2B', soft: '#F9EFF0' },
  { id: 'vicenza', name: 'H-IS Vicenza', full: 'H-International School Vicenza', location: 'Vicenza (VI)', legal: 'H-INTERNATIONAL SCHOOL VICENZA SRL', color: '#3C5A8A', soft: '#E8EEF7' },
  { id: 'rosa', name: 'H-IS Rosà', full: 'H-International School Rosà', location: 'Rosà (VI)', legal: 'H-INTERNATIONAL SCHOOL ROSÀ SRL', color: '#2F6E5B', soft: '#E6F2EC' },
];

export const companyById = (id: string | null | undefined) => COMPANIES.find((c) => c.id === id);

const ALL_COMPANIES_ROLES = ['owner', 'superadmin', 'admin'];
const ROLE_COMPANY: Record<string, CompanyId> = {
  'office.hvi': 'vicenza',
  'teachers.hvi': 'vicenza',
  'office.hro': 'rosa',
  'teachers.hro': 'rosa',
};

/** Company a permission belongs to. */
export function companyOfPerm(perm: string): CompanyId {
  if (perm.startsWith('vi.')) return 'vicenza';
  if (perm.startsWith('ro.')) return 'rosa';
  return 'venezia';
}

/** Companies this user can open, in the standard order. */
export function companiesFor(a: Access): Company[] {
  if (a.roles.some((r) => ALL_COMPANIES_ROLES.includes(r))) return COMPANIES;
  const ids = new Set<CompanyId>();
  for (const r of a.roles) {
    if (r === 'guest') continue;
    ids.add(ROLE_COMPANY[r] ?? 'venezia');
  }
  for (const p of a.perms ?? []) ids.add(companyOfPerm(p));
  return COMPANIES.filter((c) => ids.has(c.id));
}

/** Company a page belongs to (null = shared pages: dashboard, profile, backend…). */
export function companyOfPath(pathname: string): CompanyId | null {
  const p = pathname.replace(/\/+$/, '');
  if (p.startsWith('/budget-management/vicenza')) return 'vicenza';
  if (p.startsWith('/budget-management/rosa')) return 'rosa';
  if (
    /^\/(it|hr|boarding|student-office|budget-management\/venezia|device-history|task-manager|modulo-student|modulo-employee|qr|onboarding|employee-management|room-assignment|student-checkinout-hub|employee-checkinout-hub|it-registries-hub|hr-registry-hub|employee-management-hub|room-assignment-hub)(\/|$)/.test(p)
  )
    return 'venezia';
  return null;
}

/* ── Current company (this browser) ───────────────────────────────── */
const KEY = 'his:company';
const PENDING_KEY = 'his:companyPick'; // set at login: show the picker once
export const COMPANY_EVENT = 'his:company-change';

export function readCompany(): CompanyId | null {
  try {
    const v = localStorage.getItem(KEY);
    return companyById(v)?.id ?? null;
  } catch {
    return null;
  }
}

/** The selected company if this user can open it, else their first one. */
export function currentCompany(a: Access): Company | null {
  const list = companiesFor(a);
  return list.find((c) => c.id === readCompany()) ?? list[0] ?? null;
}

export function setCompany(id: CompanyId): void {
  try {
    localStorage.setItem(KEY, id);
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage unavailable: applies to this page only */
  }
  window.dispatchEvent(new CustomEvent(COMPANY_EVENT, { detail: id }));
}

/** Should the company picker be shown (first page after login)? */
export function companyPickPending(): boolean {
  try {
    return localStorage.getItem(PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

/** Called at login: the next home page asks which company to open. */
export function requestCompanyPick(): void {
  try {
    localStorage.setItem(PENDING_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function dismissCompanyPick(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}
