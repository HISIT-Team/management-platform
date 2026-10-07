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

/** Sum of expenses per budget code, for the given lines. */
export function totalsByCode(lines: BudgetLine[], expenses: Expense[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of lines) out[b.code] = 0;
  for (const e of expenses) out[e.budget_code] = (out[e.budget_code] || 0) + e.amount;
  return out;
}


// ─── Budget lines in the database (migration 0018) ───────────
// Lines and allocations live in `budget_lines`; SCHOOLS above is only
// the fallback used before the migration is run.

/** Permission that opens the budget of each school. */
export const BUDGET_PERM: Record<string, string> = { venezia: 'it.budget', vicenza: 'vi.budget', rosa: 'ro.budget' };

/** Colours offered for a new budget line. */
export const LINE_ACCENTS: { accent: string; soft: string }[] = [
  { accent: '#8B1A2B', soft: '#F9EFF0' },
  { accent: '#C9A227', soft: '#FBF4DF' },
  { accent: '#2F6E5B', soft: '#E7F2EE' },
  { accent: '#3C5A8A', soft: '#E8EEF7' },
  { accent: '#6A3E8A', soft: '#F1EAF7' },
  { accent: '#9A5B00', soft: '#FFF3E4' },
  { accent: '#46636B', soft: '#E7EFF1' },
  { accent: '#B23A6B', soft: '#FBEAF1' },
];

interface LineRow {
  code: string;
  name: string;
  caption: string | null;
  accent: string;
  accent_soft: string;
  allocated: number | string;
}

/** Active lines of a school, or null when the table isn't there yet. */
export async function listBudgetLines(school: string): Promise<BudgetLine[] | null> {
  const { data, error } = await getSupabase()
    .from('budget_lines')
    .select('code,name,caption,accent,accent_soft,allocated')
    .eq('school', school)
    .eq('active', true)
    .order('sort_order')
    .order('created_at');
  if (error) return null;
  return ((data ?? []) as LineRow[]).map((r) => ({
    code: r.code,
    name: r.name,
    caption: r.caption ?? '',
    accent: r.accent,
    accentSoft: r.accent_soft,
    allocated: Number(r.allocated) || 0,
  }));
}

export async function createBudgetLine(
  school: string,
  input: { name: string; caption: string; allocated: number; accent: string; accentSoft: string },
): Promise<string> {
  const { data, error } = await getSupabase().rpc('budget_create_line', {
    p_school: school,
    p_name: input.name,
    p_caption: input.caption,
    p_allocated: input.allocated,
    p_accent: input.accent,
    p_accent_soft: input.accentSoft,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

/** amount > 0 raises the allocation, < 0 lowers it. Returns the new allocation. */
export async function adjustBudgetLine(school: string, code: string, amount: number, reason: string): Promise<number> {
  const { data, error } = await getSupabase().rpc('budget_adjust_line', { p_school: school, p_code: code, p_amount: amount, p_reason: reason });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

export async function archiveBudgetLine(school: string, code: string): Promise<void> {
  const { error } = await getSupabase().rpc('budget_archive_line', { p_school: school, p_code: code });
  if (error) throw new Error(error.message);
}

export interface BudgetAdjustment {
  id: string;
  budget_code: string;
  amount: number;
  allocated_after: number;
  reason: string | null;
  kind: 'create' | 'adjust' | 'archive';
  created_by_name: string | null;
  created_at: string;
}

export async function listAdjustments(school: string): Promise<BudgetAdjustment[]> {
  const { data, error } = await getSupabase()
    .from('budget_adjustments')
    .select('id,budget_code,amount,allocated_after,reason,kind,created_by_name,created_at')
    .eq('school', school)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return [];
  return ((data ?? []) as BudgetAdjustment[]).map((r) => ({ ...r, amount: Number(r.amount) || 0, allocated_after: Number(r.allocated_after) || 0 }));
}
