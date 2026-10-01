'use client';
/* IT Task Manager — board delle attività del team IT.
   Vista kanban per status con drag & drop, vista lista ordinabile,
   filtri per gruppo di progetto / assegnatario / priorità, e per ogni
   task un pannello di dettaglio con le sotto-task.
   Tutto persistito in Supabase (vedi src/lib/tasks.ts e la migrazione
   supabase/migrations/0005_task_manager.sql). */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Topbar from '@/components/Topbar';
import { useToast } from '@/components/useToast';
import { getCurrentUser, loadProfile, profileName } from '@/lib/auth';
import {
  NEUTRAL,
  PRIORITIES,
  STATUSES,
  type Subtask,
  type Task,
  type TaskGroup,
  type TaskMember,
  type TaskPriority,
  type TaskStatus,
  archiveGroup,
  createGroup,
  createSubtask,
  createTask,
  daysUntil,
  deleteSubtask,
  deleteTask,
  formatDate,
  formatDateShort,
  formatHours,
  initials,
  listGroups,
  listMembers,
  listSubtasks,
  listTasks,
  parseHours,
  positionBetween,
  priorityMeta,
  priorityRank,
  statusMeta,
  updateSubtask,
  updateTask,
} from '@/lib/tasks';

/* ── Icone ─────────────────────────────────────────────────────── */
const IconBoard = (
  <svg viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18M15 3v10" />
  </svg>
);
const IconList = (
  <svg viewBox="0 0 24 24">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <circle cx="4" cy="6" r="1" />
    <circle cx="4" cy="12" r="1" />
    <circle cx="4" cy="18" r="1" />
  </svg>
);
const IconPlus = (
  <svg viewBox="0 0 24 24">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const IconClose = (
  <svg viewBox="0 0 24 24">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IconTrash = (
  <svg viewBox="0 0 24 24">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);
const IconSearch = (
  <svg viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="7" />
    <line x1="16.5" y1="16.5" x2="21" y2="21" />
  </svg>
);
const IconCalendar = (
  <svg viewBox="0 0 24 24">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);
const IconPlay = (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="9" />
    <polyline points="10 8 15 12 10 16" />
  </svg>
);
const IconClock = (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15.5 14" />
  </svg>
);
const IconCheck = (
  <svg viewBox="0 0 24 24">
    <polyline points="4 12.5 9.5 18 20 6.5" />
  </svg>
);
const IconFolders = (
  <svg viewBox="0 0 24 24">
    <path d="M3 8a2 2 0 0 1 2-2h3.5l2 2H17a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M7 6V5a2 2 0 0 1 2-2h2.2l2 2H17" />
  </svg>
);
const IconNote = (
  <svg viewBox="0 0 24 24">
    <path d="M5 4a1.6 1.6 0 0 1 1.6-1.6H14l5 5v11.2A1.6 1.6 0 0 1 17.4 20H6.6A1.6 1.6 0 0 1 5 18.4z" />
    <polyline points="14 2.5 14 7.5 19 7.5" />
    <line x1="8.5" y1="12.5" x2="15" y2="12.5" />
    <line x1="8.5" y1="16" x2="13" y2="16" />
  </svg>
);
const IconTask = (
  <svg viewBox="0 0 24 24">
    <rect x="4" y="3" width="16" height="18" rx="2.5" />
    <polyline points="8.5 9 10.5 11 14 7.5" />
    <line x1="8.5" y1="15" x2="15.5" y2="15" />
  </svg>
);

/* ── Helper ────────────────────────────────────────────────────── */
const vars = (accent: string, soft: string) =>
  ({ '--accent': accent, '--accent-soft': soft }) as React.CSSProperties;

const GROUP_COLORS = ['#8B1A2B', '#3C5A8A', '#2F6E5B', '#C9A227', '#6E4E8A', '#B4703A', '#2B7A8B', '#6E6468'];

/** Riferimento stabile: evita di ricreare un array a ogni render. */
const EMPTY_SUBS: Subtask[] = [];

type SortKey = 'position' | 'priority' | 'due_date' | 'start_date' | 'title' | 'created_at';
interface SortOption {
  key: string;
  by: SortKey;
  dir: 1 | -1;
  label: string;
}
const SORTS: SortOption[] = [
  { key: 'manual', by: 'position', dir: 1, label: 'Ordine manuale' },
  { key: 'priority', by: 'priority', dir: -1, label: 'Priorità (alta → bassa)' },
  { key: 'due', by: 'due_date', dir: 1, label: 'Scadenza (più vicina)' },
  { key: 'due-desc', by: 'due_date', dir: -1, label: 'Scadenza (più lontana)' },
  { key: 'start', by: 'start_date', dir: 1, label: 'Data inizio (più vicina)' },
  { key: 'title', by: 'title', dir: 1, label: 'Titolo (A → Z)' },
  { key: 'created', by: 'created_at', dir: -1, label: 'Creazione (più recente)' },
];

function makeComparator(by: SortKey, dir: 1 | -1) {
  return (a: Task, b: Task): number => {
    if (by === 'due_date' || by === 'start_date') {
      const av = a[by];
      const bv = b[by];
      // Le task senza data restano in fondo in entrambi i versi.
      if (!av && !bv) return a.position - b.position;
      if (!av) return 1;
      if (!bv) return -1;
      return av.localeCompare(bv) * dir || a.position - b.position;
    }
    if (by === 'priority') {
      return (priorityRank(a.priority) - priorityRank(b.priority)) * dir || a.position - b.position;
    }
    if (by === 'title') return a.title.localeCompare(b.title, 'it') * dir;
    if (by === 'created_at') return a.created_at.localeCompare(b.created_at) * dir;
    return (a.position - b.position) * dir;
  };
}

type ModalState = { mode: 'create'; status: TaskStatus } | { mode: 'edit'; id: string } | null;
interface DropTarget {
  status: TaskStatus;
  index: number;
}

/* ── Pezzi di UI ───────────────────────────────────────────────────
   Definiti fuori dal componente: ridichiararli a ogni render creerebbe
   un tipo nuovo ogni volta, React rimonterebbe le card e il drag in
   corso verrebbe annullato dal browser. */

function Avatar({ member, big }: { member?: TaskMember | null; big?: boolean }) {
  if (!member) {
    return (
      <span className={'avatar ghost' + (big ? ' lg' : '')} title="Nessun assegnatario" aria-label="Nessun assegnatario">
        —
      </span>
    );
  }
  return (
    <span
      className={'avatar' + (big ? ' lg' : '')}
      style={vars(member.color, member.color)}
      title={member.full_name}
      aria-label={member.full_name}
    >
      {initials(member.full_name)}
    </span>
  );
}

/** Più assegnatari: avatar sovrapposti, oltre `max` un "+N". */
function AvatarStack({ members, max = 3, big }: { members: TaskMember[]; max?: number; big?: boolean }) {
  if (!members.length) return <Avatar member={null} big={big} />;
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  return (
    <span className="avatar-stack" title={members.map((m) => m.full_name).join(', ')}>
      {shown.map((m) => (
        <Avatar key={m.id} member={m} big={big} />
      ))}
      {extra > 0 ? <span className={'avatar more' + (big ? ' lg' : '')}>+{extra}</span> : null}
    </span>
  );
}

function DueChip({ task }: { task: Task }) {
  if (!task.due_date) return null;
  const d = daysUntil(task.due_date);
  const done = task.status === 'completed';
  const cls = done || d === null ? '' : d < 0 ? ' overdue' : d <= 2 ? ' due-soon' : '';
  const label =
    done || d === null
      ? formatDateShort(task.due_date)
      : d < 0
        ? `${formatDateShort(task.due_date)} · ${-d}g di ritardo`
        : d === 0
          ? 'Scade oggi'
          : d === 1
            ? 'Scade domani'
            : formatDateShort(task.due_date);
  return (
    <span className={'chip-meta' + cls} title={'Due date: ' + formatDate(task.due_date)}>
      {IconCalendar}
      {label}
    </span>
  );
}

/** Quante sotto-task si vedono in card prima di riassumere le altre. */
const SUBS_ON_CARD = 5;

interface TaskCardProps {
  task: Task;
  group?: TaskGroup | null;
  assignees: TaskMember[];
  members: Map<string, TaskMember>;
  subs: Subtask[];
  dragging: boolean;
  onDragStart: (ev: React.DragEvent, task: Task) => void;
  onDragEnd: () => void;
  onDragOver: (ev: React.DragEvent) => void;
  onOpen: (task: Task) => void;
  onDelete: (task: Task) => void;
  onToggleSub: (sub: Subtask) => void;
}

function TaskCard({
  task,
  group,
  assignees,
  members,
  subs,
  dragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onOpen,
  onDelete,
  onToggleSub,
}: TaskCardProps) {
  const pr = priorityMeta(task.priority);
  const doneSubs = subs.filter((s) => s.status === 'completed').length;
  const shown = subs.slice(0, SUBS_ON_CARD);
  const hidden = subs.length - shown.length;
  return (
    <div
      className={'tcard' + (dragging ? ' dragging' : '') + (task.status === 'completed' ? ' done' : '')}
      style={vars(group?.color || pr.accent, group ? group.color + '1f' : pr.soft)}
      draggable
      role="button"
      tabIndex={0}
      onDragStart={(ev) => onDragStart(ev, task)}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onClick={() => onOpen(task)}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          onOpen(task);
        }
      }}
    >
      <div className="tcard-top">
        <span className="pill" style={vars(pr.accent, pr.soft)}>
          {pr.label}
        </span>
        <span className="spacer" />
        <button
          className="icon-btn"
          title="Elimina task"
          aria-label={'Elimina la task ' + task.title}
          onClick={(ev) => {
            ev.stopPropagation();
            onDelete(task);
          }}
        >
          {IconTrash}
        </button>
      </div>

      <div className="tcard-title">{task.title}</div>
      {task.description ? <div className="tcard-desc">{task.description}</div> : null}

      {task.notes ? (
        <div className="note-block" title={task.notes}>
          {IconNote}
          <span>{task.notes}</span>
        </div>
      ) : null}

      {group || task.due_date || task.start_date ? (
        <div className="tcard-tags">
          {group ? (
            <span className="tag" style={vars(group.color, group.color + '1f')}>
              <i className="dot" style={vars(group.color, group.color)} />
              {group.name}
            </span>
          ) : null}
          {task.start_date && !task.due_date ? (
            <span className="chip-meta" title={'Start date: ' + formatDate(task.start_date)}>
              {IconPlay}
              {formatDateShort(task.start_date)}
            </span>
          ) : null}
          <DueChip task={task} />
        </div>
      ) : null}

      <div className="tcard-foot">
        <AvatarStack members={assignees} />
        {subs.length ? (
          <span className="subprog" title={`${doneSubs} di ${subs.length} sotto-task completate`}>
            <span className="bar">
              <i style={{ width: (doneSubs / subs.length) * 100 + '%' }} />
            </span>
            {doneSubs}/{subs.length}
          </span>
        ) : null}
        <span className="spacer" />
        {task.estimated_hours ? (
          <span className="chip-meta" title="Tempo stimato">
            {IconClock}
            {formatHours(task.estimated_hours)}
          </span>
        ) : null}
      </div>

      {/* Le sotto-task si leggono e si spuntano senza aprire la task. */}
      {subs.length ? (
        <div className="tcard-subs">
          {shown.map((s) => {
            const done = s.status === 'completed';
            const who = s.assignee_id ? members.get(s.assignee_id) : null;
            return (
              <div className={'tcard-sub' + (done ? ' done' : '')} key={s.id}>
                <button
                  type="button"
                  className={'sub-check tiny' + (done ? ' on' : '')}
                  title={done ? 'Riapri la sotto-task' : 'Segna come completata'}
                  aria-label={(done ? 'Riapri' : 'Completa') + ' la sotto-task ' + s.title}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onToggleSub(s);
                  }}
                >
                  {IconCheck}
                </button>
                <span className="tcard-sub-title">{s.title}</span>
                {who ? (
                  <span className="avatar tiny" style={vars(who.color, who.color)} title={who.full_name}>
                    {initials(who.full_name)}
                  </span>
                ) : null}
              </div>
            );
          })}
          {hidden > 0 ? (
            <div className="tcard-more">
              +{hidden} {hidden === 1 ? 'altra sotto-task' : 'altre sotto-task'}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ── Componente ────────────────────────────────────────────────── */
export default function TaskManagerClient() {
  const { showToast, toastNode } = useToast();

  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [members, setMembers] = useState<TaskMember[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [busy, setBusy] = useState(false);

  // Vista e filtri
  const [view, setView] = useState<'board' | 'list'>('board');
  const [query, setQuery] = useState('');
  const [fGroup, setFGroup] = useState('all');
  const [fAssignee, setFAssignee] = useState('all');
  const [fPriority, setFPriority] = useState<'all' | TaskPriority>('all');
  const [fStatus, setFStatus] = useState<'all' | TaskStatus>('all');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [sortKey, setSortKey] = useState('manual');

  // Modali
  const [modal, setModal] = useState<ModalState>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Task | null>(null);

  // Form task
  const [fTitle, setFTitle] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fNotes, setFNotes] = useState('');
  const [fGroupId, setFGroupId] = useState<string>('');
  const [fAssigneeIds, setFAssigneeIds] = useState<string[]>([]);
  const [fTaskStatus, setFTaskStatus] = useState<TaskStatus>('open');
  const [fTaskPriority, setFTaskPriority] = useState<TaskPriority>('medium');
  const [fStart, setFStart] = useState('');
  const [fDue, setFDue] = useState('');
  const [fEst, setFEst] = useState('');

  // Form sotto-task
  const [subTitle, setSubTitle] = useState('');
  const [subAssignee, setSubAssignee] = useState('');

  // Form nuovo gruppo
  const [gName, setGName] = useState('');
  const [gDesc, setGDesc] = useState('');
  const [gColor, setGColor] = useState(GROUP_COLORS[0]);

  // Drag & drop
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  /* ── Caricamento iniziale ────────────────────────────────────── */
  useEffect(() => {
    let active = true;
    Promise.all([listGroups(), listMembers(), listTasks(), listSubtasks()])
      .then(([g, m, t, s]) => {
        if (!active) return;
        setGroups(g);
        setMembers(m);
        setTasks(t);
        setSubtasks(s);
        setSetupError(null);
      })
      .catch((e: Error) => {
        if (active) setSetupError(e.message || 'Impossibile caricare le task.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    getCurrentUser()
      .then(async (u) => {
        if (!u) return '';
        try {
          return profileName(await loadProfile(u.id), u.email || '');
        } catch {
          return u.email || '';
        }
      })
      .then((name) => {
        if (active) setUserName(name);
      })
      .catch(() => {
        /* il nome è metadato opzionale */
      });

    return () => {
      active = false;
    };
  }, []);

  // Escape chiude l'overlay aperto più interno.
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key !== 'Escape' || busy) return;
      if (toDelete) setToDelete(null);
      else if (groupsOpen) setGroupsOpen(false);
      else if (modal) setModal(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, groupsOpen, toDelete, busy]);

  /* ── Indici ──────────────────────────────────────────────────── */
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const subsByTask = useMemo(() => {
    const out = new Map<string, Subtask[]>();
    for (const s of subtasks) {
      const arr = out.get(s.task_id);
      if (arr) arr.push(s);
      else out.set(s.task_id, [s]);
    }
    return out;
  }, [subtasks]);

  const sort = useMemo(() => SORTS.find((s) => s.key === sortKey) ?? SORTS[0], [sortKey]);
  const manualOrder = sort.by === 'position';

  const assigneesOf = useCallback(
    (t: Task) => t.assignee_ids.map((id) => memberById.get(id)).filter((m): m is TaskMember => !!m),
    [memberById],
  );

  /* ── Filtri ──────────────────────────────────────────────────── */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cmp = makeComparator(sort.by, sort.dir);
    return tasks
      .filter((t) => {
        if (fGroup !== 'all' && (t.group_id || 'none') !== fGroup) return false;
        if (fAssignee === 'none' && t.assignee_ids.length) return false;
        if (fAssignee !== 'all' && fAssignee !== 'none' && !t.assignee_ids.includes(fAssignee)) return false;
        if (fPriority !== 'all' && t.priority !== fPriority) return false;
        if (fStatus !== 'all' && t.status !== fStatus) return false;
        if (onlyOverdue) {
          const d = daysUntil(t.due_date);
          if (t.status === 'completed' || d === null || d >= 0) return false;
        }
        if (q) {
          const group = t.group_id ? groupById.get(t.group_id)?.name ?? '' : '';
          const who = assigneesOf(t)
            .map((m) => m.full_name)
            .join(' ');
          const hay = (t.title + ' ' + (t.description || '') + ' ' + group + ' ' + who).toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort(cmp);
  }, [tasks, query, fGroup, fAssignee, fPriority, fStatus, onlyOverdue, sort, groupById, assigneesOf]);

  const byStatus = useMemo(() => {
    const out = {} as Record<TaskStatus, Task[]>;
    for (const s of STATUSES) out[s.value] = [];
    for (const t of filtered) out[t.status]?.push(t);
    return out;
  }, [filtered]);

  const counts = useMemo(() => {
    const out = { open: 0, in_progress: 0, on_hold: 0, completed: 0 } as Record<TaskStatus, number>;
    const hours = { open: 0, in_progress: 0, on_hold: 0, completed: 0 } as Record<TaskStatus, number>;
    let overdue = 0;
    for (const t of tasks) {
      out[t.status] = (out[t.status] || 0) + 1;
      hours[t.status] = (hours[t.status] || 0) + (t.estimated_hours || 0);
      const d = daysUntil(t.due_date);
      if (t.status !== 'completed' && d !== null && d < 0) overdue++;
    }
    return { ...out, hours, overdue };
  }, [tasks]);

  const filtersOn =
    query.trim() !== '' || fGroup !== 'all' || fAssignee !== 'all' || fPriority !== 'all' || fStatus !== 'all' || onlyOverdue;

  function resetFilters() {
    setQuery('');
    setFGroup('all');
    setFAssignee('all');
    setFPriority('all');
    setFStatus('all');
    setOnlyOverdue(false);
  }

  /* ── Apertura modali ─────────────────────────────────────────── */
  const openCreate = useCallback(
    (status: TaskStatus = 'open') => {
      setFTitle('');
      setFDesc('');
      setFNotes('');
      setFGroupId(fGroup !== 'all' && fGroup !== 'none' ? fGroup : '');
      setFAssigneeIds(fAssignee !== 'all' && fAssignee !== 'none' ? [fAssignee] : []);
      setFTaskStatus(status);
      setFTaskPriority('medium');
      setFStart('');
      setFDue('');
      setFEst('');
      setSubTitle('');
      setSubAssignee('');
      setModal({ mode: 'create', status });
    },
    [fGroup, fAssignee],
  );

  const openEdit = useCallback((t: Task) => {
    setFTitle(t.title);
    setFDesc(t.description || '');
    setFNotes(t.notes || '');
    setFGroupId(t.group_id || '');
    setFAssigneeIds(t.assignee_ids);
    setFTaskStatus(t.status);
    setFTaskPriority(t.priority);
    setFStart(t.start_date || '');
    setFDue(t.due_date || '');
    setFEst(t.estimated_hours ? String(t.estimated_hours).replace('.', ',') : '');
    setSubTitle('');
    setSubAssignee('');
    setModal({ mode: 'edit', id: t.id });
  }, []);

  // Link diretto a una task (es. dalla notifica Teams): /task-manager?task=<id>
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (loading || deepLinkDone.current) return;
    const id = new URLSearchParams(window.location.search).get('task');
    if (!id) return;
    deepLinkDone.current = true;
    window.history.replaceState(null, '', '/task-manager');
    const t = tasks.find((x) => x.id === id);
    window.setTimeout(() => {
      if (t) openEdit(t);
      else showToast('La task del link non esiste più o è stata eliminata.', true);
    }, 0);
  }, [loading, tasks, openEdit, showToast]);

  const current = modal?.mode === 'edit' ? tasks.find((t) => t.id === modal.id) ?? null : null;

  /* ── Salvataggio task ────────────────────────────────────────── */
  async function handleSaveTask() {
    const title = fTitle.trim();
    if (!title) return showToast('Il titolo della task è obbligatorio.', true);
    if (fStart && fDue && fDue < fStart) return showToast('La due date non può precedere la start date.', true);

    const est = fEst.trim() ? parseHours(fEst) : null;
    if (fEst.trim() && est === null) return showToast('Tempo stimato non valido — usa ad esempio 2,5 oppure 2h 30m.', true);

    setBusy(true);
    try {
      if (modal?.mode === 'edit') {
        const row = await updateTask(modal.id, {
          title,
          description: fDesc.trim() || null,
          notes: fNotes.trim() || null,
          group_id: fGroupId || null,
          assignee_ids: fAssigneeIds,
          status: fTaskStatus,
          priority: fTaskPriority,
          start_date: fStart || null,
          due_date: fDue || null,
          estimated_hours: est,
        });
        setTasks((prev) => prev.map((t) => (t.id === row.id ? row : t)));
        showToast('Task aggiornata ✓');
      } else {
        const column = tasks.filter((t) => t.status === fTaskStatus).sort((a, b) => a.position - b.position);
        const row = await createTask({
          title,
          description: fDesc.trim() || null,
          notes: fNotes.trim() || null,
          group_id: fGroupId || null,
          assignee_ids: fAssigneeIds,
          status: fTaskStatus,
          priority: fTaskPriority,
          start_date: fStart || null,
          due_date: fDue || null,
          estimated_hours: est,
          position: positionBetween(column[column.length - 1], null),
          created_by_name: userName,
        });
        setTasks((prev) => [...prev, row]);
        // Si resta nel pannello: da qui si aggiungono subito le sotto-task.
        setModal({ mode: 'edit', id: row.id });
        showToast('Task creata ✓ — puoi aggiungere le sotto-task');
      }
    } catch (e) {
      showToast('Errore: ' + (e as Error).message, true);
    }
    setBusy(false);
  }

  async function handleDeleteTask() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await deleteTask(toDelete.id);
      setTasks((prev) => prev.filter((t) => t.id !== toDelete.id));
      setSubtasks((prev) => prev.filter((s) => s.task_id !== toDelete.id));
      if (modal?.mode === 'edit' && modal.id === toDelete.id) setModal(null);
      setToDelete(null);
      showToast('Task eliminata — con tutte le sue sotto-task');
    } catch (e) {
      showToast('Errore: ' + (e as Error).message, true);
    }
    setBusy(false);
  }

  /** Cambio di status/posizione senza aprire il pannello (drag, select in lista). */
  async function moveTask(task: Task, status: TaskStatus, position: number) {
    const before = task;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status, position } : t)));
    try {
      const row = await updateTask(task.id, { status, position });
      setTasks((prev) => prev.map((t) => (t.id === row.id ? row : t)));
    } catch (e) {
      setTasks((prev) => prev.map((t) => (t.id === before.id ? before : t)));
      showToast('Errore: ' + (e as Error).message, true);
    }
  }

  /* ── Sotto-task ──────────────────────────────────────────────── */
  async function handleAddSubtask() {
    if (modal?.mode !== 'edit') return;
    const title = subTitle.trim();
    if (!title) return;
    const siblings = subsByTask.get(modal.id) || [];
    setBusy(true);
    try {
      const row = await createSubtask({
        task_id: modal.id,
        title,
        assignee_id: subAssignee || null,
        status: 'open',
        position: (siblings[siblings.length - 1]?.position ?? 0) + 1024,
      });
      setSubtasks((prev) => [...prev, row]);
      setSubTitle('');
    } catch (e) {
      showToast('Errore: ' + (e as Error).message, true);
    }
    setBusy(false);
  }

  async function patchSubtask(sub: Subtask, patch: Partial<Subtask>) {
    const before = sub;
    setSubtasks((prev) => prev.map((s) => (s.id === sub.id ? { ...s, ...patch } : s)));
    try {
      const row = await updateSubtask(sub.id, patch);
      setSubtasks((prev) => prev.map((s) => (s.id === row.id ? row : s)));
    } catch (e) {
      setSubtasks((prev) => prev.map((s) => (s.id === before.id ? before : s)));
      showToast('Errore: ' + (e as Error).message, true);
    }
  }

  /** Spunta/riapre una sotto-task dalla card, senza aprire la task. */
  const toggleSubtask = useCallback((sub: Subtask) => {
    const next: TaskStatus = sub.status === 'completed' ? 'open' : 'completed';
    setSubtasks((prev) => prev.map((s) => (s.id === sub.id ? { ...s, status: next } : s)));
    updateSubtask(sub.id, { status: next })
      .then((row) => setSubtasks((prev) => prev.map((s) => (s.id === row.id ? row : s))))
      .catch((e: Error) => {
        setSubtasks((prev) => prev.map((s) => (s.id === sub.id ? sub : s)));
        showToast('Errore: ' + e.message, true);
      });
  }, [showToast]);

  async function removeSubtask(sub: Subtask) {
    const before = subtasks;
    setSubtasks((prev) => prev.filter((s) => s.id !== sub.id));
    try {
      await deleteSubtask(sub.id);
    } catch (e) {
      setSubtasks(before);
      showToast('Errore: ' + (e as Error).message, true);
    }
  }

  /* ── Gruppi ──────────────────────────────────────────────────── */
  async function handleAddGroup() {
    const name = gName.trim();
    if (!name) return showToast('Dai un nome al gruppo di progetto.', true);
    if (groups.some((g) => g.name.toLowerCase() === name.toLowerCase()))
      return showToast('Esiste già un gruppo con questo nome.', true);
    setBusy(true);
    try {
      const row = await createGroup({ name, description: gDesc.trim(), color: gColor });
      setGroups((prev) => [...prev, row]);
      setGName('');
      setGDesc('');
      setGColor(GROUP_COLORS[(groups.length + 1) % GROUP_COLORS.length]);
      showToast('Gruppo creato ✓');
    } catch (e) {
      showToast('Errore: ' + (e as Error).message, true);
    }
    setBusy(false);
  }

  async function handleArchiveGroup(g: TaskGroup) {
    setBusy(true);
    try {
      await archiveGroup(g.id);
      setGroups((prev) => prev.filter((x) => x.id !== g.id));
      setTasks((prev) => prev.map((t) => (t.group_id === g.id ? { ...t, group_id: null } : t)));
      if (fGroup === g.id) setFGroup('all');
      showToast('Gruppo archiviato — le task restano, senza gruppo');
    } catch (e) {
      showToast('Errore: ' + (e as Error).message, true);
    }
    setBusy(false);
  }

  /* ── Drag & drop ─────────────────────────────────────────────── */
  function onCardDragStart(ev: React.DragEvent, task: Task) {
    setDraggingId(task.id);
    ev.dataTransfer.effectAllowed = 'move';
    // Serve un payload perché Firefox avvii il drag.
    ev.dataTransfer.setData('text/plain', task.id);
  }

  function onCardDragOver(ev: React.DragEvent, status: TaskStatus, index: number) {
    if (!draggingId) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = 'move';
    if (!manualOrder) {
      setDropTarget({ status, index: byStatus[status].length });
      return;
    }
    const box = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const after = ev.clientY - box.top > box.height / 2;
    setDropTarget({ status, index: after ? index + 1 : index });
  }

  function onColumnDragOver(ev: React.DragEvent, status: TaskStatus) {
    if (!draggingId) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    setDropTarget({ status, index: byStatus[status].length });
  }

  function onColumnDrop(ev: React.DragEvent, status: TaskStatus) {
    ev.preventDefault();
    const id = draggingId || ev.dataTransfer.getData('text/plain');
    const target = dropTarget && dropTarget.status === status ? dropTarget : { status, index: byStatus[status].length };
    setDraggingId(null);
    setDropTarget(null);
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    // `target.index` è calcolato sulla colonna mostrata, che include la
    // card trascinata: tolta quella, gli indici a valle scalano di uno.
    const column = byStatus[status];
    const selfIndex = column.findIndex((t) => t.id === task.id);
    const withoutSelf = selfIndex === -1 ? column : column.filter((t) => t.id !== task.id);
    const index = selfIndex !== -1 && selfIndex < target.index ? target.index - 1 : target.index;

    // Rilasciata dov'era già: niente da scrivere.
    if (selfIndex === index) return;

    void moveTask(task, status, positionBetween(withoutSelf[index - 1] ?? null, withoutSelf[index] ?? null));
  }

  function onDragEnd() {
    setDraggingId(null);
    setDropTarget(null);
  }

  /* ── Render ──────────────────────────────────────────────────── */
  const visibleStatuses = fStatus === 'all' ? STATUSES : STATUSES.filter((s) => s.value === fStatus);

  return (
    <AuthGuard roles={['it', 'admin']}>
      <Topbar label="IT" href="/it" variant="back" />
      <div className="task-page">
        <div className="shell">
          {/* ── Testata ── */}
          <div className="t-head">
            <div className="t-head-left">
              <div className="logo">{IconTask}</div>
              <div>
                <p className="t-eyebrow">H-FARM International School · IT</p>
                <h1>
                  Task <em>Manager</em>
                </h1>
                <p>Attività del team IT, gruppi di progetto e sotto-task</p>
              </div>
            </div>
            <div className="t-head-actions">
              <button className="btn-quiet" onClick={() => setGroupsOpen(true)}>
                {IconFolders}
                Gruppi
              </button>
              <button className="btn-primary" onClick={() => openCreate('open')}>
                {IconPlus}
                Nuova task
              </button>
            </div>
          </div>

          {setupError ? (
            <div className="setup-note">
              <b>Archivio task non raggiungibile.</b> {setupError}
              <br />
              Esegui la migrazione <code>supabase/migrations/0005_task_manager.sql</code> nel SQL Editor di Supabase.
            </div>
          ) : null}

          {/* ── Riepilogo ── */}
          {loading ? (
            <div className="skeleton" />
          ) : (
            <div className="stat-row">
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  className={'tstat' + (fStatus === s.value ? ' active' : '')}
                  style={vars(s.accent, s.soft)}
                  onClick={() => {
                    setOnlyOverdue(false);
                    setFStatus((prev) => (prev === s.value ? 'all' : s.value));
                  }}
                >
                  <div className="tstat-lbl">{s.label}</div>
                  <div className="tstat-val">{counts[s.value]}</div>
                  <div className="tstat-sub">
                    {counts[s.value] === 0
                      ? 'nessuna task'
                      : counts.hours[s.value] > 0
                        ? formatHours(counts.hours[s.value]) + ' stimate'
                        : 'senza stima'}
                  </div>
                </button>
              ))}
              <button
                className={'tstat' + (onlyOverdue ? ' active' : '')}
                style={vars('#A32D2D', '#FBEAEA')}
                onClick={() => {
                  setFStatus('all');
                  setOnlyOverdue((v) => !v);
                }}
              >
                <div className="tstat-lbl">In ritardo</div>
                <div className="tstat-val">{counts.overdue}</div>
                <div className="tstat-sub">oltre la due date</div>
              </button>
            </div>
          )}

          {/* ── Barra strumenti ── */}
          <div className="toolbar">
            <div className="search">
              {IconSearch}
              <input
                type="text"
                placeholder="Cerca per titolo, descrizione, gruppo o persona…"
                value={query}
                onChange={(ev) => setQuery(ev.target.value)}
                aria-label="Cerca fra le task"
              />
            </div>

            <div className="seg" role="group" aria-label="Vista">
              <button className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}>
                {IconBoard}
                Board
              </button>
              <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
                {IconList}
                Lista
              </button>
            </div>

            <div className={'tselect' + (fPriority !== 'all' ? ' is-set' : '')}>
              <select
                value={fPriority}
                onChange={(ev) => setFPriority(ev.target.value as 'all' | TaskPriority)}
                aria-label="Filtra per priorità"
              >
                <option value="all">Tutte le priorità</option>
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    Priorità {p.label.toLowerCase()}
                  </option>
                ))}
              </select>
            </div>

            <div className={'tselect' + (fGroup !== 'all' ? ' is-set' : '')}>
              <select value={fGroup} onChange={(ev) => setFGroup(ev.target.value)} aria-label="Filtra per gruppo di progetto">
                <option value="all">Tutti i gruppi</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
                <option value="none">Senza gruppo</option>
              </select>
            </div>

            <div className={'tselect' + (sortKey !== 'manual' ? ' is-set' : '')}>
              <select value={sortKey} onChange={(ev) => setSortKey(ev.target.value)} aria-label="Ordina le task">
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    Ordina: {s.label}
                  </option>
                ))}
              </select>
            </div>

            {filtersOn ? (
              <button className="btn-quiet" onClick={resetFilters}>
                {IconClose}
                Azzera filtri
              </button>
            ) : null}
          </div>

          {/* ── Chip assegnatari ── */}
          <div className="filters">
            <button className={'fchip pad' + (fAssignee === 'all' ? ' active' : '')} onClick={() => setFAssignee('all')}>
              Tutto il team
            </button>
            {members.map((m) => (
              <button
                key={m.id}
                className={'fchip' + (fAssignee === m.id ? ' active' : '')}
                onClick={() => setFAssignee((prev) => (prev === m.id ? 'all' : m.id))}
              >
                <span className="avatar" style={vars(m.color, m.color)}>
                  {initials(m.full_name)}
                </span>
                {m.full_name}
              </button>
            ))}
            <button
              className={'fchip pad' + (fAssignee === 'none' ? ' active' : '')}
              onClick={() => setFAssignee((prev) => (prev === 'none' ? 'all' : 'none'))}
            >
              Non assegnate
            </button>
          </div>

          {/* ── Board ── */}
          {loading ? (
            <div className="skeleton" style={{ height: 320 }} />
          ) : view === 'board' ? (
            <div
              className="board"
              style={visibleStatuses.length < 4 ? { gridTemplateColumns: `repeat(${visibleStatuses.length}, minmax(260px, 1fr))` } : undefined}
            >
              {visibleStatuses.map((s) => {
                const column = byStatus[s.value];
                const over = dropTarget?.status === s.value && draggingId !== null;
                return (
                  <section
                    key={s.value}
                    className={'col' + (over ? ' is-over' : '')}
                    style={vars(s.accent, s.soft)}
                    onDragOver={(ev) => onColumnDragOver(ev, s.value)}
                    onDrop={(ev) => onColumnDrop(ev, s.value)}
                    onDragLeave={(ev) => {
                      if (!(ev.currentTarget as HTMLElement).contains(ev.relatedTarget as Node)) setDropTarget(null);
                    }}
                    aria-label={s.label}
                  >
                    <div className="col-head">
                      <i className="dot" style={vars(s.accent, s.accent)} />
                      <span className="col-name">{s.label}</span>
                      <span className="col-count">{column.length}</span>
                      <button
                        className="icon-btn"
                        title={'Nuova task in "' + s.label + '"'}
                        aria-label={'Nuova task in ' + s.label}
                        onClick={() => openCreate(s.value)}
                        style={{ marginLeft: 4 }}
                      >
                        {IconPlus}
                      </button>
                    </div>

                    <div className="col-body">
                      {column.length === 0 && !over ? (
                        <div className="col-empty">
                          {filtersOn ? 'Nessuna task con questi filtri' : 'Trascina qui una task'}
                        </div>
                      ) : null}
                      {column.map((t, i) => (
                        <React.Fragment key={t.id}>
                          {manualOrder && over && dropTarget?.index === i ? (
                            <div className="drop-line" style={vars(s.accent, s.soft)} />
                          ) : null}
                          <TaskCard
                            task={t}
                            group={t.group_id ? groupById.get(t.group_id) : null}
                            assignees={assigneesOf(t)}
                            members={memberById}
                            subs={subsByTask.get(t.id) || EMPTY_SUBS}
                            dragging={draggingId === t.id}
                            onDragStart={onCardDragStart}
                            onDragEnd={onDragEnd}
                            onDragOver={(ev) => onCardDragOver(ev, s.value, i)}
                            onOpen={openEdit}
                            onDelete={setToDelete}
                            onToggleSub={toggleSubtask}
                          />
                        </React.Fragment>
                      ))}
                      {over && (dropTarget?.index === column.length || !manualOrder) ? (
                        <div className="drop-line" style={vars(s.accent, s.soft)} />
                      ) : null}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            /* ── Lista ── */
            <div className="ledger">
              {filtered.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">{IconTask}</div>
                  <h3>{filtersOn ? 'Nessuna task con questi filtri' : 'Nessuna task'}</h3>
                  <p>
                    {filtersOn
                      ? 'Prova ad azzerare i filtri per vedere tutte le attività.'
                      : 'Usa «Nuova task» per creare la prima attività del team.'}
                  </p>
                </div>
              ) : (
                <div className="ledger-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Task</th>
                        <th>Gruppo</th>
                        <th>Assegnatari</th>
                        <th>Priorità</th>
                        <th>Status</th>
                        <th>Start</th>
                        <th>Due</th>
                        <th>Stima</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((t) => {
                        const g = t.group_id ? groupById.get(t.group_id) : null;
                        const who = assigneesOf(t);
                        const pr = priorityMeta(t.priority);
                        const st = statusMeta(t.status);
                        const subs = subsByTask.get(t.id) || [];
                        const doneSubs = subs.filter((s) => s.status === 'completed').length;
                        return (
                          <React.Fragment key={t.id}>
                          <tr className={'trow' + (subs.length ? ' has-subs' : '')} onClick={() => openEdit(t)}>
                            <td>
                              <div className="t-title">{t.title}</div>
                              {t.description ? <div className="t-desc">{t.description}</div> : null}
                              {t.notes ? (
                                <div className="note-block" title={t.notes}>
                                  {IconNote}
                                  <span>{t.notes}</span>
                                </div>
                              ) : null}
                            </td>
                            <td>
                              {g ? (
                                <span className="tag" style={vars(g.color, g.color + '1f')}>
                                  <i className="dot" style={vars(g.color, g.color)} />
                                  {g.name}
                                </span>
                              ) : (
                                <span className="tag" style={vars(NEUTRAL.accent, NEUTRAL.soft)}>
                                  Senza gruppo
                                </span>
                              )}
                            </td>
                            <td>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                <AvatarStack members={who} />
                                {who.length ? (
                                  <span className="who-names">{who.map((m) => m.full_name).join(', ')}</span>
                                ) : (
                                  <span style={{ color: 'var(--faint)' }}>—</span>
                                )}
                              </span>
                            </td>
                            <td>
                              <span className="pill" style={vars(pr.accent, pr.soft)}>
                                {pr.label}
                              </span>
                            </td>
                            <td>
                              <select
                                className="mini-select"
                                style={vars(st.accent, st.soft)}
                                value={t.status}
                                onClick={(ev) => ev.stopPropagation()}
                                onChange={(ev) => {
                                  ev.stopPropagation();
                                  const next = ev.target.value as TaskStatus;
                                  const column = tasks.filter((x) => x.status === next).sort((a, b) => a.position - b.position);
                                  void moveTask(t, next, positionBetween(column[column.length - 1], null));
                                }}
                                aria-label={'Status di ' + t.title}
                              >
                                {STATUSES.map((s) => (
                                  <option key={s.value} value={s.value}>
                                    {s.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="col-date">{formatDate(t.start_date) || '—'}</td>
                            <td className="col-date">
                              {t.due_date ? <DueChip task={t} /> : '—'}
                            </td>
                            <td className="col-date">{formatHours(t.estimated_hours) || '—'}</td>
                            <td className="col-actions">
                              <button
                                className="icon-btn"
                                title="Elimina task"
                                aria-label={'Elimina la task ' + t.title}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  setToDelete(t);
                                }}
                              >
                                {IconTrash}
                              </button>
                            </td>
                          </tr>
                          {subs.length ? (
                            <tr className="row-subs" onClick={() => openEdit(t)}>
                              <td colSpan={9}>
                                <div className="row-subs-wrap">
                                  <span className="row-subs-lbl">
                                    {doneSubs}/{subs.length} sotto-task
                                  </span>
                                  {subs.map((s) => {
                                    const done = s.status === 'completed';
                                    const who = s.assignee_id ? memberById.get(s.assignee_id) : null;
                                    return (
                                      <span className={'row-sub' + (done ? ' done' : '')} key={s.id}>
                                        <button
                                          type="button"
                                          className={'sub-check tiny' + (done ? ' on' : '')}
                                          title={done ? 'Riapri la sotto-task' : 'Segna come completata'}
                                          aria-label={(done ? 'Riapri' : 'Completa') + ' la sotto-task ' + s.title}
                                          onClick={(ev) => {
                                            ev.stopPropagation();
                                            toggleSubtask(s);
                                          }}
                                        >
                                          {IconCheck}
                                        </button>
                                        {s.title}
                                        {who ? (
                                          <span
                                            className="avatar tiny"
                                            style={vars(who.color, who.color)}
                                            title={who.full_name}
                                          >
                                            {initials(who.full_name)}
                                          </span>
                                        ) : null}
                                      </span>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                          ) : null}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <footer className="t-footer">
            H-FARM International School · IT — Task Manager
            <span>Via Adriano Olivetti 1 - 31056 Roncade (TV)</span>
          </footer>
        </div>

        {/* ══ Pannello task ══ */}
        {modal ? (
          <div
            className="t-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={modal.mode === 'create' ? 'Nuova task' : 'Dettaglio task'}
            onMouseDown={(ev) => {
              if (ev.target === ev.currentTarget && !busy) setModal(null);
            }}
          >
            <div className="t-modal" style={vars(priorityMeta(fTaskPriority).accent, priorityMeta(fTaskPriority).soft)}>
              <div className="t-modal-head">
                <div className="mi">{modal.mode === 'create' ? IconPlus : IconTask}</div>
                <div>
                  <h2>{modal.mode === 'create' ? 'Nuova task' : 'Dettaglio task'}</h2>
                  <p>
                    {modal.mode === 'create'
                      ? 'Salva per poter aggiungere le sotto-task'
                      : current?.created_by_name
                        ? 'Creata da ' + current.created_by_name
                        : 'Modifica i campi e salva'}
                  </p>
                </div>
                <button className="t-modal-close" onClick={() => setModal(null)} disabled={busy} aria-label="Chiudi">
                  {IconClose}
                </button>
              </div>

              <div className="t-modal-body">
                <div className="field">
                  <label htmlFor="tm-title">
                    Titolo <span className="req">*</span>
                  </label>
                  <input
                    id="tm-title"
                    type="text"
                    placeholder="es. Rinnovo licenze Microsoft 365 26/27"
                    value={fTitle}
                    onChange={(ev) => setFTitle(ev.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="tm-desc">Descrizione</label>
                  <textarea
                    id="tm-desc"
                    placeholder="Contesto, link, riferimenti…"
                    value={fDesc}
                    onChange={(ev) => setFDesc(ev.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="tm-notes">Note</label>
                  <textarea
                    id="tm-notes"
                    className="notes-input"
                    placeholder="Appunti, aggiornamenti, cose da ricordare…"
                    value={fNotes}
                    onChange={(ev) => setFNotes(ev.target.value)}
                  />
                  <p className="hint">Se c&apos;è una nota, la card in board e la riga in lista la mostrano.</p>
                </div>

                <div className="field">
                  <label>Gruppo di progetto</label>
                  <div className="picker">
                    <button
                      type="button"
                      className={'pick pad' + (fGroupId === '' ? ' selected' : '')}
                      style={vars(NEUTRAL.accent, NEUTRAL.soft)}
                      onClick={() => setFGroupId('')}
                    >
                      Nessuno
                    </button>
                    {groups.map((g) => (
                      <button
                        type="button"
                        key={g.id}
                        className={'pick' + (fGroupId === g.id ? ' selected' : '')}
                        style={vars(g.color, g.color + '1f')}
                        onClick={() => setFGroupId(g.id)}
                      >
                        <i className="dot" style={vars(g.color, g.color)} />
                        {g.name}
                      </button>
                    ))}
                    <button type="button" className="pick pad" onClick={() => setGroupsOpen(true)}>
                      + Nuovo gruppo
                    </button>
                  </div>
                </div>

                <div className="field">
                  <label>
                    Assegnatari <span className="label-hint">— puoi selezionarne più di uno</span>
                  </label>
                  <div className="picker">
                    <button
                      type="button"
                      className={'pick pad' + (fAssigneeIds.length === 0 ? ' selected' : '')}
                      style={vars(NEUTRAL.accent, NEUTRAL.soft)}
                      onClick={() => setFAssigneeIds([])}
                    >
                      Non assegnata
                    </button>
                    {members.map((m) => (
                      <button
                        type="button"
                        key={m.id}
                        className={'pick' + (fAssigneeIds.includes(m.id) ? ' selected' : '')}
                        style={vars(m.color, m.color + '1f')}
                        aria-pressed={fAssigneeIds.includes(m.id)}
                        onClick={() =>
                          setFAssigneeIds((prev) => (prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id]))
                        }
                      >
                        <span className="avatar" style={vars(m.color, m.color)}>
                          {initials(m.full_name)}
                        </span>
                        {m.full_name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label>Status</label>
                  <div className="opts">
                    {STATUSES.map((s) => (
                      <button
                        type="button"
                        key={s.value}
                        className={'opt' + (fTaskStatus === s.value ? ' selected' : '')}
                        style={vars(s.accent, s.soft)}
                        onClick={() => setFTaskStatus(s.value)}
                      >
                        <i className="dot" style={vars(s.accent, s.accent)} />
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label>Priorità</label>
                  <div className="opts">
                    {PRIORITIES.map((p) => (
                      <button
                        type="button"
                        key={p.value}
                        className={'opt' + (fTaskPriority === p.value ? ' selected' : '')}
                        style={vars(p.accent, p.soft)}
                        onClick={() => setFTaskPriority(p.value)}
                      >
                        <i className="dot" style={vars(p.accent, p.accent)} />
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="row3">
                  <div className="field">
                    <label htmlFor="tm-start">Start date</label>
                    <input id="tm-start" type="date" value={fStart} onChange={(ev) => setFStart(ev.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="tm-due">Due date</label>
                    <input id="tm-due" type="date" value={fDue} onChange={(ev) => setFDue(ev.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="tm-est">Tempo stimato</label>
                    <input
                      id="tm-est"
                      type="text"
                      inputMode="decimal"
                      placeholder="es. 2,5 o 2h 30m"
                      value={fEst}
                      onChange={(ev) => setFEst(ev.target.value)}
                    />
                  </div>
                </div>

                {/* ── Sotto-task ── */}
                {modal.mode === 'edit' && current ? (
                  <div className="field" style={{ marginTop: 22 }}>
                    <label>Sotto-task ({(subsByTask.get(current.id) || []).length})</label>
                    <div className="subs">
                      {(subsByTask.get(current.id) || []).map((s) => {
                        const st = statusMeta(s.status);
                        const done = s.status === 'completed';
                        return (
                          <div className={'sub' + (done ? ' done' : '')} key={s.id}>
                            <button
                              type="button"
                              className={'sub-check' + (done ? ' on' : '')}
                              aria-label={done ? 'Riapri la sotto-task' : 'Segna come completata'}
                              onClick={() => void patchSubtask(s, { status: done ? 'open' : 'completed' })}
                            >
                              {IconCheck}
                            </button>
                            <div className="sub-main">
                              <div className="sub-title">{s.title}</div>
                              {s.description ? <div className="sub-desc">{s.description}</div> : null}
                              <div className="sub-meta">
                                <select
                                  className="mini-select"
                                  style={vars(st.accent, st.soft)}
                                  value={s.status}
                                  onChange={(ev) => void patchSubtask(s, { status: ev.target.value as TaskStatus })}
                                  aria-label={'Status della sotto-task ' + s.title}
                                >
                                  {STATUSES.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  className="mini-select"
                                  // --accent è ereditata dalla modale (colore della priorità):
                                  // qui va sovrascritta, altrimenti la select prende quel colore.
                                  style={vars(
                                    (s.assignee_id ? memberById.get(s.assignee_id)?.color : null) || NEUTRAL.accent,
                                    NEUTRAL.soft,
                                  )}
                                  value={s.assignee_id || ''}
                                  onChange={(ev) => void patchSubtask(s, { assignee_id: ev.target.value || null })}
                                  aria-label={'Assegnatario della sotto-task ' + s.title}
                                >
                                  <option value="">Non assegnata</option>
                                  {members.map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.full_name}
                                    </option>
                                  ))}
                                </select>
                                {s.assignee_id ? <Avatar member={memberById.get(s.assignee_id)} /> : null}
                              </div>
                            </div>
                            <button
                              className="icon-btn"
                              title="Elimina sotto-task"
                              aria-label={'Elimina la sotto-task ' + s.title}
                              onClick={() => void removeSubtask(s)}
                            >
                              {IconTrash}
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <div className="sub-add">
                      <input
                        type="text"
                        placeholder="Aggiungi una sotto-task…"
                        value={subTitle}
                        onChange={(ev) => setSubTitle(ev.target.value)}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter') {
                            ev.preventDefault();
                            void handleAddSubtask();
                          }
                        }}
                        aria-label="Titolo della nuova sotto-task"
                      />
                      <select
                        value={subAssignee}
                        onChange={(ev) => setSubAssignee(ev.target.value)}
                        style={{ width: 'auto', minWidth: 150 }}
                        aria-label="Assegnatario della nuova sotto-task"
                      >
                        <option value="">Non assegnata</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.full_name}
                          </option>
                        ))}
                      </select>
                      <button className="btn-quiet" onClick={() => void handleAddSubtask()} disabled={busy || !subTitle.trim()}>
                        {IconPlus}
                        Aggiungi
                      </button>
                    </div>
                    <p className="hint">
                      Le sotto-task hanno titolo, descrizione facoltativa, assegnatario e status; il conteggio compare sulla
                      card in board.
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="t-modal-foot">
                {modal.mode === 'edit' && current ? (
                  <button className="btn-quiet btn-danger left" onClick={() => setToDelete(current)} disabled={busy}>
                    {IconTrash}
                    Elimina
                  </button>
                ) : null}
                <button className="btn-quiet" onClick={() => setModal(null)} disabled={busy}>
                  {modal.mode === 'edit' ? 'Chiudi' : 'Annulla'}
                </button>
                <button className="btn-primary" onClick={() => void handleSaveTask()} disabled={busy}>
                  {busy ? 'Salvataggio…' : modal.mode === 'create' ? 'Crea task' : 'Salva modifiche'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* ══ Gruppi di progetto ══ */}
        {groupsOpen ? (
          <div
            className="t-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Gruppi di progetto"
            onMouseDown={(ev) => {
              if (ev.target === ev.currentTarget && !busy) setGroupsOpen(false);
            }}
          >
            <div className="t-modal" style={{ ...vars(gColor, gColor + '1f'), maxWidth: 560 }}>
              <div className="t-modal-head">
                <div className="mi">{IconFolders}</div>
                <div>
                  <h2>Gruppi di progetto</h2>
                  <p>Servono a raggruppare le task per area di lavoro</p>
                </div>
                <button className="t-modal-close" onClick={() => setGroupsOpen(false)} disabled={busy} aria-label="Chiudi">
                  {IconClose}
                </button>
              </div>

              <div className="t-modal-body">
                <div className="field">
                  <label>Gruppi attivi</label>
                  <div className="grouplist">
                    {groups.length === 0 ? <p className="hint">Nessun gruppo ancora — creane uno qui sotto.</p> : null}
                    {groups.map((g) => {
                      const n = tasks.filter((t) => t.group_id === g.id).length;
                      return (
                        <div className="grow" key={g.id}>
                          <i className="dot" style={vars(g.color, g.color)} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="gname">{g.name}</div>
                            <div className="gsub">
                              {n} {n === 1 ? 'task' : 'task'}
                              {g.description ? ' · ' + g.description : ''}
                            </div>
                          </div>
                          <button
                            className="icon-btn"
                            title="Archivia gruppo"
                            aria-label={'Archivia il gruppo ' + g.name}
                            onClick={() => void handleArchiveGroup(g)}
                            disabled={busy}
                          >
                            {IconTrash}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="tm-gname">Nuovo gruppo</label>
                  <input
                    id="tm-gname"
                    type="text"
                    placeholder="es. Rete e connettività"
                    value={gName}
                    onChange={(ev) => setGName(ev.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="tm-gdesc">Descrizione</label>
                  <input
                    id="tm-gdesc"
                    type="text"
                    placeholder="Facoltativa"
                    value={gDesc}
                    onChange={(ev) => setGDesc(ev.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Colore</label>
                  <div className="swatches">
                    {GROUP_COLORS.map((c) => (
                      <button
                        type="button"
                        key={c}
                        className={'swatch' + (gColor === c ? ' selected' : '')}
                        style={vars(c, c)}
                        onClick={() => setGColor(c)}
                        aria-label={'Colore ' + c}
                      />
                    ))}
                  </div>
                </div>
                <p className="hint">
                  L&apos;archiviazione non cancella le task: restano, senza gruppo. Per rimetterlo in lista basta rimettere{' '}
                  <code>active = true</code> nella tabella <code>it_task_groups</code> su Supabase.
                </p>
              </div>

              <div className="t-modal-foot">
                <button className="btn-quiet" onClick={() => setGroupsOpen(false)} disabled={busy}>
                  Chiudi
                </button>
                <button className="btn-primary" onClick={() => void handleAddGroup()} disabled={busy || !gName.trim()}>
                  {IconPlus}
                  Crea gruppo
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* ══ Conferma eliminazione ══ */}
        {toDelete ? (
          <div
            className="t-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Conferma eliminazione"
            onMouseDown={(ev) => {
              if (ev.target === ev.currentTarget && !busy) setToDelete(null);
            }}
          >
            <div className="t-modal" style={{ ...vars('#A32D2D', '#FBEAEA'), maxWidth: 420 }}>
              <div className="t-modal-head">
                <div className="mi">{IconTrash}</div>
                <div>
                  <h2>Eliminare la task?</h2>
                  <p>L&apos;operazione non è reversibile</p>
                </div>
              </div>
              <div className="t-modal-body">
                <p style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--muted)' }}>
                  <strong style={{ color: 'var(--ink)' }}>{toDelete.title}</strong>
                  {(subsByTask.get(toDelete.id) || []).length
                    ? ` — verranno eliminate anche le ${(subsByTask.get(toDelete.id) || []).length} sotto-task collegate.`
                    : '.'}
                </p>
              </div>
              <div className="t-modal-foot">
                <button className="btn-quiet" onClick={() => setToDelete(null)} disabled={busy}>
                  Annulla
                </button>
                <button className="btn-primary" onClick={() => void handleDeleteTask()} disabled={busy}>
                  {busy ? 'Eliminazione…' : 'Elimina'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {toastNode}
      </div>
    </AuthGuard>
  );
}
