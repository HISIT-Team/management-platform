'use client';

import React, { useEffect, useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Topbar from '@/components/Topbar';
import { getSupabase } from '@/lib/supabase';

type Task = { id: string; workflow: string; employee_name: string; status: string; due_date: string | null };
type Subtask = { id: string; task_id: string; title: string; status: string };

const statuses = [
  { value: 'open', label: 'Aperto' },
  { value: 'in_progress', label: 'In corso' },
  { value: 'on_hold', label: 'In attesa' },
  { value: 'ready', label: 'Pronto' },
  { value: 'completed', label: 'Completato' },
];

const statusLabel = (status: string) => statuses.find((item) => item.value === status)?.label ?? status;

function StatusSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select className={`hr-status hr-status-${value}`} value={value} onChange={(event) => onChange(event.target.value)} aria-label={`Stato: ${statusLabel(value)}`}>
      {statuses.map((status) => <option value={status.value} key={status.value}>{status.label}</option>)}
    </select>
  );
}

function Inner() {
  const [workflow, setWorkflow] = useState<'onboarding' | 'offboarding'>('onboarding');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [taskResult, subtaskResult] = await Promise.all([
      getSupabase().from('hr_tasks').select('*').eq('workflow', workflow).order('created_at', { ascending: false }),
      getSupabase().from('hr_subtasks').select('*'),
    ]);
    setTasks((taskResult.data ?? []) as Task[]);
    setSubtasks((subtaskResult.data ?? []) as Subtask[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [workflow]);

  const updateStatus = async (table: 'hr_tasks' | 'hr_subtasks', id: string, status: string) => {
    await getSupabase().from(table).update({ status }).eq('id', id);
    await load();
  };

  const visibleTasks = useMemo(() => tasks.filter((task) => {
    const matchesName = task.employee_name.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
    return matchesName && matchesStatus;
  }), [tasks, query, statusFilter]);

  const title = workflow === 'onboarding' ? 'Onboarding' : 'Offboarding';

  return (
    <>
      <Topbar label="HR" href="/hr" variant="back" />
      <main className="hr-task-page">
        <header className="hr-task-header">
          <div>
            <p className="hr-task-eyebrow">HR workflow</p>
            <h1>Task <em>Manager</em></h1>
            <p>Monitora le attività di ingresso e uscita del personale.</p>
          </div>
          <div className="hr-task-summary"><b>{visibleTasks.length}</b><span>{title.toLowerCase()} attivi</span></div>
        </header>

        <div className="hr-task-toolbar">
          <div className="hr-task-tabs" role="tablist" aria-label="Flusso HR">
            <button className={workflow === 'onboarding' ? 'active' : ''} onClick={() => setWorkflow('onboarding')}>Onboarding</button>
            <button className={workflow === 'offboarding' ? 'active' : ''} onClick={() => setWorkflow('offboarding')}>Offboarding</button>
          </div>
          <div className="hr-task-filters">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca dipendente…" aria-label="Cerca dipendente" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtra per stato">
              <option value="all">Tutti gli stati</option>
              {statuses.map((status) => <option value={status.value} key={status.value}>{status.label}</option>)}
            </select>
          </div>
        </div>

        {loading ? <div className="hr-task-empty">Caricamento attività…</div> : visibleTasks.length === 0 ? (
          <div className="hr-task-empty"><b>Nessuna attività trovata</b><span>Le nuove attività {title.toLowerCase()} compariranno qui.</span></div>
        ) : (
          <section className="hr-task-grid" aria-label={`Attività ${title.toLowerCase()}`}>
            {visibleTasks.map((task) => {
              const taskSubtasks = subtasks.filter((subtask) => subtask.task_id === task.id);
              const completed = taskSubtasks.filter((subtask) => subtask.status === 'completed').length;
              const progress = taskSubtasks.length ? Math.round((completed / taskSubtasks.length) * 100) : 0;
              return (
                <article className="hr-task-card" key={task.id}>
                  <div className="hr-task-card-head">
                    <div>
                      <span className="hr-task-type">{title}</span>
                      <h2>{task.employee_name}</h2>
                      <p>{task.due_date ? `Scadenza ${new Intl.DateTimeFormat('it-IT').format(new Date(task.due_date))}` : 'Nessuna scadenza impostata'}</p>
                    </div>
                    <StatusSelect value={task.status} onChange={(status) => void updateStatus('hr_tasks', task.id, status)} />
                  </div>
                  <div className="hr-task-progress"><i style={{ width: `${progress}%` }} /><span>{completed}/{taskSubtasks.length} completate</span></div>
                  <div className="hr-subtask-list">
                    {taskSubtasks.map((subtask) => (
                      <div className="hr-subtask" key={subtask.id}>
                        <span className={subtask.status === 'completed' ? 'done' : ''}>{subtask.title}</span>
                        <StatusSelect value={subtask.status} onChange={(status) => void updateStatus('hr_subtasks', subtask.id, status)} />
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>
    </>
  );
}

export default function Page() {
  return <AuthGuard roles={['hr', 'admin']} perm="hr"><Inner /></AuthGuard>;
}
