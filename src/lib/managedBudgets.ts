import { getSupabase } from './supabase';

export type BudgetLifecycle = 'active' | 'archived' | 'trash';
export type ManagedBudget = { id: string; slug: string; name: string; description: string | null; legacy_it: boolean; active: boolean; lifecycle: BudgetLifecycle };
export type ManagedLine = { id: string; name: string; caption: string | null; allocated: number; accent: string };
export type ManagedExpense = { id: string; line_id: string; description: string; supplier: string | null; amount: number; spent_on: string; notes: string | null; created_at: string };
const n = <T extends Record<string, unknown>>(x: T) => ({ ...x, allocated: Number(x.allocated ?? 0), amount: Number(x.amount ?? 0) });

export async function listManagedBudgets(lifecycle: BudgetLifecycle = 'active'): Promise<ManagedBudget[]> {
  const { data, error } = await getSupabase().from('budget_catalog').select('id,slug,name,description,legacy_it,active,lifecycle').eq('lifecycle', lifecycle).order('name');
  if (error) throw error; return (data ?? []) as ManagedBudget[];
}
export async function createManagedBudget(name: string, description: string): Promise<ManagedBudget> {
  const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 39);
  const { data, error } = await getSupabase().from('budget_catalog').insert({ name: name.trim(), description: description.trim() || null, slug }).select('id,slug,name,description,legacy_it,active,lifecycle').single();
  if (error) throw error;
  const schools = [
    { school: 'venezia', name: 'Venezia', full_name: 'H-International School Venezia', location: 'Roncade (TV)' },
    { school: 'vicenza', name: 'Vicenza', full_name: 'H-International School Vicenza', location: 'Vicenza (VI)' },
    { school: 'rosa', name: 'Rosà', full_name: 'H-International School Rosà', location: 'Rosà (VI)' },
  ].map((s) => ({ ...s, budget_id: data.id, code: `${slug}_${s.school}` }));
  const { error: schoolsError } = await getSupabase().from('budget_schools').insert(schools);
  if (schoolsError) throw schoolsError;
  return data as ManagedBudget;
}
export async function setManagedBudgetLifecycle(id: string, lifecycle: BudgetLifecycle): Promise<void> {
  const { error } = await getSupabase().rpc('budget_set_lifecycle', { p_budget: id, p_lifecycle: lifecycle });
  if (error) throw error;
}
export async function loadManagedBudget(slug: string) {
  const sb = getSupabase();
  const { data: budget, error } = await sb.from('budget_catalog').select('id,slug,name,description,legacy_it,active').eq('slug', slug).single();
  if (error) throw error;
  const [lines, expenses] = await Promise.all([
    sb.from('managed_budget_lines').select('id,name,caption,allocated,accent').eq('budget_id', budget.id).eq('active', true).order('sort_order'),
    sb.from('managed_budget_expenses').select('id,line_id,description,supplier,amount,spent_on,notes,created_at').eq('budget_id', budget.id).order('spent_on', { ascending: false }),
  ]);
  if (lines.error) throw lines.error; if (expenses.error) throw expenses.error;
  return { budget: budget as ManagedBudget, lines: (lines.data ?? []).map(n) as ManagedLine[], expenses: (expenses.data ?? []).map(n) as ManagedExpense[] };
}
export async function addManagedLine(budgetId: string, name: string, allocated: number, caption: string) {
  const { error } = await getSupabase().from('managed_budget_lines').insert({ budget_id: budgetId, name: name.trim(), allocated, caption: caption.trim() || null }); if (error) throw error;
}
export async function adjustManagedLine(id: string, allocated: number) { const { error } = await getSupabase().from('managed_budget_lines').update({ allocated }).eq('id', id); if (error) throw error; }
export async function addManagedExpense(budgetId: string, lineId: string, input: { description: string; supplier: string; amount: number; spent_on: string; notes: string }) {
  const { error } = await getSupabase().from('managed_budget_expenses').insert({ budget_id: budgetId, line_id: lineId, ...input, supplier: input.supplier || null, notes: input.notes || null }); if (error) throw error;
}
export async function deleteManagedExpense(id: string) { const { error } = await getSupabase().from('managed_budget_expenses').delete().eq('id', id); if (error) throw error; }
