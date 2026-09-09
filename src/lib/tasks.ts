/* ═══════════════════════════════════════════════════════════════════
   IT Task Manager — gruppi di progetto, membri del team, task e
   sotto-task.

   Come per le commesse (src/lib/budgets.ts) i dati non stanno nel
   bundle: gruppi e assegnatari vivono in Supabase dietro RLS e si
   modificano dal Table Editor senza rideploy
   (vedi supabase/migrations/0005_task_manager.sql).

   Qui restano solo presentazione (etichette e colori di status e
   priorità) e i piccoli helper di formattazione.
   ═══════════════════════════════════════════════════════════════════ */
import { getSupabase } from './supabase';

/* ── Tipi ──────────────────────────────────────────────────────── */
export type TaskStatus = 'open' | 'in_progress' | 'on_hold' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface TaskGroup {
  id: string;
  name: string;
  description: string | null;
  color: string;
  sort_order: number;
  active: boolean;
}

export interface TaskMember {
  id: string;
  full_name: string;
  email: string | null;
  color: string;
  sort_order: number;
  active: boolean;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  /** Annotazioni libere, separate dalla descrizione: la card le segnala. */
  notes: string | null;
  group_id: string | null;
  assignee_id: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  start_date: string | null; // YYYY-MM-DD
  due_date: string | null; // YYYY-MM-DD
  estimated_hours: number | null;
  position: number;
  completed_at: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  status: TaskStatus;
  position: number;
  created_at: string;
  updated_at: string;
}

export type NewTask = Partial<Omit<Task, 'id' | 'created_at' | 'updated_at' | 'completed_at'>> &
  Pick<Task, 'title'>;
export type NewSubtask = Partial<Omit<Subtask, 'id' | 'created_at' | 'updated_at'>> &
  Pick<Subtask, 'task_id' | 'title'>;

/* ── Presentazione: status e priorità ──────────────────────────── */
export interface Meta<T> {
  value: T;
  label: string;
  accent: string;
  soft: string;
}

/** L'ordine di questo array è l'ordine delle colonne kanban. */
export const STATUSES: Meta<TaskStatus>[] = [
  { value: 'open', label: 'Da fare', accent: '#3C5A8A', soft: '#EAF0F8' },
  { value: 'in_progress', label: 'In corso', accent: '#C9A227', soft: '#FBF4DF' },
  { value: 'on_hold', label: 'In attesa', accent: '#B4703A', soft: '#FBEEE3' },
  { value: 'completed', label: 'Completate', accent: '#2F6E5B', soft: '#E7F2EE' },
];

/** Dalla più alta alla più bassa: usato anche per l'ordinamento. */
export const PRIORITIES: Meta<TaskPriority>[] = [
  { value: 'high', label: 'Alta', accent: '#A32D2D', soft: '#FBEAEA' },
  { value: 'medium', label: 'Media', accent: '#C9A227', soft: '#FBF4DF' },
  { value: 'low', label: 'Bassa', accent: '#2F6E5B', soft: '#E7F2EE' },
];

const STATUS_MAP = new Map(STATUSES.map((s) => [s.value, s]));
const PRIORITY_MAP = new Map(PRIORITIES.map((p) => [p.value, p]));
// Ripiego per un valore fuori enum (non dovrebbe capitare: c'è un CHECK
// in tabella, ma la UI non deve rompersi se qualcuno lo aggira).
const UNKNOWN_STATUS: Meta<TaskStatus> = { value: 'open', label: '—', accent: '#6E6468', soft: '#F1EFEF' };
const UNKNOWN_PRIORITY: Meta<TaskPriority> = { value: 'medium', label: '—', accent: '#6E6468', soft: '#F1EFEF' };

export function statusMeta(v: string | null | undefined): Meta<TaskStatus> {
  return STATUS_MAP.get(v as TaskStatus) ?? UNKNOWN_STATUS;
}
export function priorityMeta(v: string | null | undefined): Meta<TaskPriority> {
  return PRIORITY_MAP.get(v as TaskPriority) ?? UNKNOWN_PRIORITY;
}
/** 3 = alta, 1 = bassa. Serve a ordinare "per priorità". */
export function priorityRank(v: TaskPriority): number {
  return v === 'high' ? 3 : v === 'medium' ? 2 : 1;
}

/** Colore di ripiego per un gruppo senza colore o inesistente. */
export const NEUTRAL = { accent: '#6E6468', soft: '#F1EFEF' };

/* ── Formattazione (it-IT) ─────────────────────────────────────── */
export function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 2026-09-09 → 09/09/2026 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

/** 2026-09-09 → 9 set (per le chip compatte delle card) */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(d);
}

/** Giorni fra oggi e la data (negativo = scaduta). */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const due = new Date(iso + 'T00:00:00').getTime();
  if (Number.isNaN(due)) return null;
  const today = new Date(todayISO() + 'T00:00:00').getTime();
  return Math.round((due - today) / 86_400_000);
}

/** 2.5 → "2h 30m", 8 → "8h", 0.25 → "15m" */
export function formatHours(h: number | null | undefined): string {
  if (h === null || h === undefined || !Number.isFinite(h) || h <= 0) return '';
  const total = Math.round(h * 60);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (!hours) return `${mins}m`;
  if (!mins) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/** Accetta "2,5", "2.5", "2h30", "90m", "2h 30m". Torna ore decimali. */
export function parseHours(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(',', '.');
  if (!s) return null;
  const hm = s.match(/^(\d+(?:\.\d+)?)\s*h(?:\s*(\d+)\s*m?)?$/);
  if (hm) return Number(hm[1]) + (hm[2] ? Number(hm[2]) / 60 : 0);
  const m = s.match(/^(\d+(?:\.\d+)?)\s*m(?:in)?$/);
  if (m) return Number(m[1]) / 60;
  const n = Number(s.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * "Alessandro Manzini" → "AM", "Alberto Dalle Carbonare" → "ADC".
 * Prende l'iniziale di ogni parola (max 3): con i cognomi composti
 * saltare quella di mezzo darebbe una sigla sbagliata ("AC").
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts
    .slice(0, 3)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

/* ── Ordinamento kanban ────────────────────────────────────────── */
const STEP = 1024;

/**
 * Posizione da assegnare inserendo fra `before` e `after` (entrambe
 * opzionali: fuori dalla lista si va a passo fisso). Il chiamante
 * riordina una riga sola invece di riscrivere tutta la colonna.
 */
export function positionBetween(before?: Task | null, after?: Task | null): number {
  if (before && after) return (before.position + after.position) / 2;
  if (before) return before.position + STEP;
  if (after) return after.position - STEP;
  return STEP;
}

/* ═══════════════════════════════════════════════════════════════════
   Supabase
   ═══════════════════════════════════════════════════════════════════ */
const GROUPS = 'it_task_groups';
const MEMBERS = 'it_task_members';
const TASKS = 'it_tasks';
const SUBTASKS = 'it_subtasks';

const GROUP_COLS = 'id,name,description,color,sort_order,active';
const MEMBER_COLS = 'id,full_name,email,color,sort_order,active';
const TASK_COLS =
  'id,title,description,notes,group_id,assignee_id,status,priority,start_date,due_date,estimated_hours,position,completed_at,created_by_name,created_at,updated_at';
const SUBTASK_COLS = 'id,task_id,title,description,assignee_id,status,position,created_at,updated_at';

// PostgREST può restituire numeric come stringa a seconda del driver.
function toTask(row: Record<string, unknown>): Task {
  return {
    ...(row as unknown as Task),
    position: Number(row.position) || 0,
    estimated_hours: row.estimated_hours === null || row.estimated_hours === undefined ? null : Number(row.estimated_hours),
  };
}
function toSubtask(row: Record<string, unknown>): Subtask {
  return { ...(row as unknown as Subtask), position: Number(row.position) || 0 };
}

/* ── Gruppi di progetto ────────────────────────────────────────── */
export async function listGroups(): Promise<TaskGroup[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(GROUPS)
    .select(GROUP_COLS)
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data || []) as unknown as TaskGroup[];
}

export async function createGroup(input: { name: string; description?: string; color: string }): Promise<TaskGroup> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(GROUPS)
    .insert({
      name: input.name,
      description: input.description || null,
      color: input.color,
      sort_order: 100,
    })
    .select(GROUP_COLS)
    .single();
  if (error) throw error;
  return data as unknown as TaskGroup;
}

export async function updateGroup(id: string, patch: Partial<TaskGroup>): Promise<TaskGroup> {
  const sb = getSupabase();
  const { data, error } = await sb.from(GROUPS).update(patch).eq('id', id).select(GROUP_COLS).single();
  if (error) throw error;
  return data as unknown as TaskGroup;
}

/** Soft delete: le task collegate restano, senza gruppo. */
export async function archiveGroup(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(GROUPS).update({ active: false }).eq('id', id);
  if (error) throw error;
}

/* ── Membri del team ───────────────────────────────────────────── */
export async function listMembers(): Promise<TaskMember[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(MEMBERS)
    .select(MEMBER_COLS)
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('full_name', { ascending: true });
  if (error) throw error;
  return (data || []) as unknown as TaskMember[];
}

/* ── Task ──────────────────────────────────────────────────────── */
export async function listTasks(): Promise<Task[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TASKS)
    .select(TASK_COLS)
    .order('position', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => toTask(r as Record<string, unknown>));
}

export async function createTask(input: NewTask): Promise<Task> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TASKS)
    .insert({
      title: input.title,
      description: input.description || null,
      notes: input.notes || null,
      group_id: input.group_id || null,
      assignee_id: input.assignee_id || null,
      status: input.status || 'open',
      priority: input.priority || 'medium',
      start_date: input.start_date || null,
      due_date: input.due_date || null,
      estimated_hours: input.estimated_hours ?? null,
      position: input.position ?? 0,
      created_by_name: input.created_by_name || null,
    })
    .select(TASK_COLS)
    .single();
  if (error) throw error;
  return toTask(data as Record<string, unknown>);
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<Task> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TASKS).update(patch).eq('id', id).select(TASK_COLS).single();
  if (error) throw error;
  return toTask(data as Record<string, unknown>);
}

export async function deleteTask(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(TASKS).delete().eq('id', id);
  if (error) throw error;
}

/* ── Sotto-task ────────────────────────────────────────────────── */
/** Tutte in una query sola: sono poche e servono i contatori in board. */
export async function listSubtasks(): Promise<Subtask[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(SUBTASKS)
    .select(SUBTASK_COLS)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((r) => toSubtask(r as Record<string, unknown>));
}

export async function createSubtask(input: NewSubtask): Promise<Subtask> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(SUBTASKS)
    .insert({
      task_id: input.task_id,
      title: input.title,
      description: input.description || null,
      assignee_id: input.assignee_id || null,
      status: input.status || 'open',
      position: input.position ?? 0,
    })
    .select(SUBTASK_COLS)
    .single();
  if (error) throw error;
  return toSubtask(data as Record<string, unknown>);
}

export async function updateSubtask(id: string, patch: Partial<Subtask>): Promise<Subtask> {
  const sb = getSupabase();
  const { data, error } = await sb.from(SUBTASKS).update(patch).eq('id', id).select(SUBTASK_COLS).single();
  if (error) throw error;
  return toSubtask(data as Record<string, unknown>);
}

export async function deleteSubtask(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(SUBTASKS).delete().eq('id', id);
  if (error) throw error;
}
