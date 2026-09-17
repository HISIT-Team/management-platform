/* ═══════════════════════════════════════════════════════════════════
   IT Budget Management — schools, budget lines ("commesse") and the
   expense ledger.

   Each school has its own allocations for the 26/27 financial year.
   To change an allocation edit SCHOOLS below; to add a line add it to
   LINE_META first. `code` values (both school and line) are stored in
   the database, so never rename an existing one.

   Expenses live in the Supabase table `it_budget_expenses`
   (see supabase/migrations/).
   ═══════════════════════════════════════════════════════════════════ */
import { getSupabase } from './supabase';

export interface BudgetLine {
  code: string;
  name: string;
  /** Allocation for the year, in euro. */
  allocated: number;
  /** Short caption shown under the card title. */
  caption: string;
  /** Accent colour used for the card, bar and chart segment. */
  accent: string;
  accentSoft: string;
}

/* The lines are the same everywhere — only the allocation changes per
   school — so their presentation is declared once here. */
const LINE_META = {
  indirect: {
    name: 'IT Indirect & Infrastructure 26/27',
    caption: 'Infrastruttura, servizi e costi indiretti',
    accent: '#8B1A2B',
    accentSoft: '#F9EFF0',
  },
  hardware: {
    name: 'IT Hardware & Consumables 26/27',
    caption: 'Hardware, ricambi e materiali di consumo',
    accent: '#C9A227',
    accentSoft: '#FBF4DF',
  },
  capex: {
    name: 'CAPEX IT 26/27',
    caption: 'Investimenti e progetti capitalizzati',
    accent: '#2F6E5B',
    accentSoft: '#E7F2EE',
  },
} as const;

export type LineCode = keyof typeof LINE_META;

const line = (code: LineCode, allocated: number): BudgetLine => ({ code, allocated, ...LINE_META[code] });

export type SchoolStatus = 'active' | 'wip';

export interface School {
  code: string;
  /** Short label used in headings and pickers. */
  name: string;
  /** Legal / extended name shown as the caption. */
  fullName: string;
  location: string;
  status: SchoolStatus;
  lines: BudgetLine[];
}

export const SCHOOLS: School[] = [
  {
    code: 'venezia',
    name: 'Venezia',
    fullName: 'H-International School Venezia',
    location: 'Roncade (TV)',
    status: 'active',
    lines: [line('indirect', 55400), line('hardware', 28500), line('capex', 182600)],
  },
  {
    code: 'vicenza',
    name: 'Vicenza',
    fullName: 'H-International School Vicenza',
    location: 'Vicenza (VI)',
    status: 'active',
    lines: [line('indirect', 37250), line('hardware', 21000), line('capex', 69700)],
  },
  {
    code: 'rosa',
    name: 'Rosà',
    fullName: 'H-International School Rosà',
    location: 'Rosà (VI)',
    status: 'active',
    lines: [line('indirect', 28500), line('hardware', 14100), line('capex', 45495)],
  },
];

export function schoolByCode(code: string): School | undefined {
  return SCHOOLS.find((s) => s.code === code);
}

export function totalAllocated(school: School): number {
  return school.lines.reduce((s, b) => s + b.allocated, 0);
}

export function lineByCode(school: School, code: string): BudgetLine | undefined {
  return school.lines.find((b) => b.code === code);
}

// ─── Formatting (it-IT: 1.234,56 €) ──────────────────────────
// useGrouping:'always' — the it-IT default drops the separator on 4-digit
// numbers, which reads badly next to grouped ones in the ledger column
// (8900,00 € vs 24.800,00 €).
const eur = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  useGrouping: 'always',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const eur0 = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  useGrouping: 'always',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatEUR(n: number): string {
  return eur.format(n);
}
/** Compact form for the big headline figures (no cents when round). */
export function formatEURShort(n: number): string {
  return Number.isInteger(n) ? eur0.format(n) : eur.format(n);
}
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
export function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ─── Expense ledger (Supabase) ───────────────────────────────
export interface Expense {
  id: string;
  school: string;
  budget_code: string;
  description: string;
  supplier: string | null;
  amount: number;
  spent_on: string; // YYYY-MM-DD
  notes: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface NewExpense {
  school: string;
  budget_code: string;
  description: string;
  supplier?: string;
  amount: number;
  spent_on: string;
  notes?: string;
  created_by_name?: string;
}

const TABLE = 'it_budget_expenses';
const COLS = 'id,school,budget_code,description,supplier,amount,spent_on,notes,created_by_name,created_at';

// PostgREST can hand numeric back as a string depending on the driver — coerce.
function normalise(row: Record<string, unknown>): Expense {
  return { ...(row as unknown as Expense), amount: Number(row.amount) || 0 };
}

export async function listExpenses(school: string): Promise<Expense[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .select(COLS)
    .eq('school', school)
    .order('spent_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalise);
}

export async function addExpense(input: NewExpense): Promise<Expense> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .insert({
      school: input.school,
      budget_code: input.budget_code,
      description: input.description,
      supplier: input.supplier || null,
      amount: input.amount,
      spent_on: input.spent_on,
      notes: input.notes || null,
      created_by_name: input.created_by_name || null,
    })
    .select(COLS)
    .single();
  if (error) throw error;
  return normalise(data as Record<string, unknown>);
}

export async function deleteExpense(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

/** Sum of expenses per budget code, for the given school's lines. */
export function totalsByCode(school: School, expenses: Expense[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of school.lines) out[b.code] = 0;
  for (const e of expenses) out[e.budget_code] = (out[e.budget_code] || 0) + e.amount;
  return out;
}
