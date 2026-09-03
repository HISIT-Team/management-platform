/* ═══════════════════════════════════════════════════════════════════
   IT Budget Management — budget lines ("commesse") + expense ledger.

   The four budget lines and their allocations for the 26/27 financial
   year are declared here: to change an allocation (or add a line) edit
   BUDGET_LINES below — nothing else needs to change. `code` is what is
   stored in the database, so never rename an existing code.

   Expenses live in the Supabase table `it_budget_expenses`
   (see supabase/migrations/0001_it_budget_expenses.sql).
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

export const BUDGET_LINES: BudgetLine[] = [
  {
    code: 'indirect',
    name: 'IT Indirect & Infrastructure 26/27',
    allocated: 55400,
    caption: 'Infrastruttura, servizi e costi indiretti',
    accent: '#8B1A2B',
    accentSoft: '#F9EFF0',
  },
  {
    code: 'hardware',
    name: 'IT Hardware & Consumables 26/27',
    allocated: 28500,
    caption: 'Hardware, ricambi e materiali di consumo',
    accent: '#C9A227',
    accentSoft: '#FBF4DF',
  },
  {
    code: 'capex',
    name: 'CAPEX IT 26/27',
    allocated: 182600,
    caption: 'Investimenti e progetti capitalizzati',
    accent: '#2F6E5B',
    accentSoft: '#E7F2EE',
  },
  {
    code: 'opex',
    name: 'IT Opex 26/27',
    allocated: 180326,
    caption: 'Costi operativi ricorrenti',
    accent: '#3C5A8A',
    accentSoft: '#EAF0F8',
  },
];

export const TOTAL_ALLOCATED = BUDGET_LINES.reduce((s, b) => s + b.allocated, 0);

export function lineByCode(code: string): BudgetLine | undefined {
  return BUDGET_LINES.find((b) => b.code === code);
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
  budget_code: string;
  description: string;
  supplier?: string;
  amount: number;
  spent_on: string;
  notes?: string;
  created_by_name?: string;
}

const TABLE = 'it_budget_expenses';
const COLS = 'id,budget_code,description,supplier,amount,spent_on,notes,created_by_name,created_at';

// PostgREST can hand numeric back as a string depending on the driver — coerce.
function normalise(row: Record<string, unknown>): Expense {
  return { ...(row as unknown as Expense), amount: Number(row.amount) || 0 };
}

export async function listExpenses(): Promise<Expense[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .select(COLS)
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

/** Sum of expenses per budget code. */
export function totalsByCode(expenses: Expense[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of BUDGET_LINES) out[b.code] = 0;
  for (const e of expenses) out[e.budget_code] = (out[e.budget_code] || 0) + e.amount;
  return out;
}
