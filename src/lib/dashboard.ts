/* ═══════════════════════════════════════════════════════════════════
   Data for the home dashboard. Every query runs as the signed-in user,
   so RLS decides what comes back: a role that can't read a table just
   gets nothing and the widget is hidden.
   ═══════════════════════════════════════════════════════════════════ */
import { getSupabase } from './supabase';
import { SCHOOLS, totalAllocated } from './budgets';
import type { Task } from './tasks';

export interface DeviceStats {
  outWeek: number; // check-outs, last 7 days
  outPrevWeek: number; // check-outs, the 7 days before
  inWeek: number;
  inPrevWeek: number;
  outYear: number; // check-outs since 1 September
  inYear: number;
  outPerDay: number[]; // last 7 days, oldest first
}

export interface RecentMove {
  id: string;
  created_at: string;
  operation: 'Check-in' | 'Check-out';
  student_email: string;
  macbook_id: string | null;
  ipad_id: string | null;
  signed_by: string | null;
}

export interface BudgetSummary {
  code: string;
  name: string;
  allocated: number;
  spent: number;
}

export interface TaskSummary {
  open: number;
  dueSoon: number; // due within 7 days (or late)
  list: Pick<Task, 'id' | 'title' | 'due_date' | 'priority' | 'status'>[];
  mine: boolean; // list = tasks assigned to me (else: next due for the team)
}

const DAY = 86400000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 1 September of the current school year. */
export function schoolYearStart(now = new Date()): Date {
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(y, 8, 1);
}

export async function loadDeviceStats(): Promise<DeviceStats | null> {
  const sb = getSupabase();
  const today = startOfDay(new Date());
  const from14 = new Date(today.getTime() - 13 * DAY);
  const yearFrom = schoolYearStart().toISOString();
  const [recent, outYear, inYear] = await Promise.all([
    sb.from('student_device_log').select('created_at, operation').gte('created_at', from14.toISOString()).limit(5000),
    sb.from('student_device_log').select('id', { count: 'exact', head: true }).eq('operation', 'Check-out').gte('created_at', yearFrom),
    sb.from('student_device_log').select('id', { count: 'exact', head: true }).eq('operation', 'Check-in').gte('created_at', yearFrom),
  ]);
  if (recent.error) return null;
  const s: DeviceStats = { outWeek: 0, outPrevWeek: 0, inWeek: 0, inPrevWeek: 0, outYear: outYear.count ?? 0, inYear: inYear.count ?? 0, outPerDay: [0, 0, 0, 0, 0, 0, 0] };
  const weekStart = today.getTime() - 6 * DAY;
  for (const r of (recent.data ?? []) as { created_at: string; operation: string }[]) {
    const t = new Date(r.created_at).getTime();
    const thisWeek = t >= weekStart;
    if (r.operation === 'Check-out') {
      if (thisWeek) {
        s.outWeek++;
        const idx = Math.min(6, Math.max(0, Math.floor((startOfDay(new Date(t)).getTime() - weekStart) / DAY)));
        s.outPerDay[idx]++;
      } else s.outPrevWeek++;
    } else if (r.operation === 'Check-in') {
      if (thisWeek) s.inWeek++;
      else s.inPrevWeek++;
    }
  }
  return s;
}

export async function loadRecentMoves(limit = 6): Promise<RecentMove[] | null> {
  const { data, error } = await getSupabase()
    .from('student_device_log')
    .select('id, created_at, operation, student_email, macbook_id, ipad_id, signed_by')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return null;
  return (data ?? []) as RecentMove[];
}

export async function loadBudgetSummary(): Promise<BudgetSummary[] | null> {
  const { data, error } = await getSupabase().from('it_budget_expenses').select('school, amount').limit(10000);
  if (error) return null;
  const spent: Record<string, number> = {};
  for (const r of (data ?? []) as { school: string; amount: number }[]) spent[r.school] = (spent[r.school] ?? 0) + Number(r.amount || 0);
  return SCHOOLS.map((s) => ({ code: s.code, name: s.name, allocated: totalAllocated(s), spent: Math.round((spent[s.code] ?? 0) * 100) / 100 }));
}

export async function loadTaskSummary(userId: string): Promise<TaskSummary | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('it_tasks')
    .select('id, title, due_date, priority, status, assignee_ids')
    .neq('status', 'completed')
    .limit(2000);
  if (error) return null;
  const rows = (data ?? []) as (Pick<Task, 'id' | 'title' | 'due_date' | 'priority' | 'status'> & { assignee_ids: string[] | null })[];
  const soon = startOfDay(new Date()).getTime() + 7 * DAY;
  const dueSoon = rows.filter((t) => t.due_date && new Date(t.due_date + 'T00:00:00').getTime() <= soon).length;

  // Tasks assigned to me, when my account is linked to a team member.
  let mineIds: string[] = [];
  const me = await sb.from('it_task_members').select('id').eq('profile_id', userId);
  if (!me.error) mineIds = ((me.data ?? []) as { id: string }[]).map((m) => m.id);
  const mineRows = mineIds.length ? rows.filter((t) => (t.assignee_ids ?? []).some((a) => mineIds.includes(a))) : [];
  const source = mineRows.length ? mineRows : rows;
  const byDue = source
    .slice()
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
    .slice(0, 5)
    .map(({ id, title, due_date, priority, status }) => ({ id, title, due_date, priority, status }));
  return { open: rows.length, dueSoon, list: byDue, mine: mineRows.length > 0 };
}
