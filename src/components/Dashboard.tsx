'use client';
/* Home dashboard (inside the app shell), for the company being viewed.
   H-IS Venezia: device KPIs and movements (IT), budget, tasks.
   H-IS Vicenza and H-IS Rosà: budget.
   Everything follows the role's permissions (Permessi ruoli). Right
   after login, a user with more than one company picks it first. */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon, { type IconName } from './Icon';
import { useShell } from './AppShell';
import Footer from './Footer';
import { allows, navFor } from '@/lib/nav';
import { getSupabase } from '@/lib/supabase';
import {
  type BudgetSummary,
  type DeviceStats,
  type RecentMove,
  type TaskSummary,
  loadDeviceStats,
  loadRecentMoves,
  loadSchoolBudget,
  loadTaskSummary,
} from '@/lib/dashboard';
import { BUDGET_PERM } from '@/lib/budgets';
import { type Company, companyPickPending, dismissCompanyPick, setCompany } from '@/lib/companies';

const eur0 = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' } as Intl.NumberFormatOptions);

const SECTION_META: Record<string, { desc: string; color: string; soft: string }> = {
  '/it': { desc: 'Consegne, restituzioni, storico e inventario', color: '#8B1A2B', soft: '#F9EFF0' },
  '/hr': { desc: 'Onboarding e offboarding del personale', color: '#6A3E8A', soft: '#F1EAF7' },
  '/boarding': { desc: 'Assegnazione camere e telecamere', color: '#2F6E5B', soft: '#E6F2EC' },
  '/student-office': { desc: 'Moduli e richieste degli studenti', color: '#9A5B00', soft: '#FFF3E4' },
  '/user-management': { desc: 'Utenti, ruoli e dati dei profili', color: '#3C5A8A', soft: '#E8EEF7' },
  '/audit-log': { desc: 'Chi ha cambiato cosa e quando', color: '#46636B', soft: '#E7EFF1' },
  '/security-settings': { desc: 'MFA, dispositivi ricordati, timeout', color: '#5B1220', soft: '#F3E3E6' },
  '/onboarding': { desc: 'Richiesta di setup per un nuovo dipendente', color: '#6A3E8A', soft: '#F1EAF7' },
  '/employee-management': { desc: 'Processo di uscita di un dipendente', color: '#6A3E8A', soft: '#F1EAF7' },
  '/hr-registry-hub': { desc: 'Registri di onboarding e offboarding', color: '#6A3E8A', soft: '#F1EAF7' },
  '/budget-management/vicenza': { desc: 'Commesse, spese e stanziamenti', color: '#3C5A8A', soft: '#E8EEF7' },
  '/budget-management/rosa': { desc: 'Commesse, spese e stanziamenti', color: '#2F6E5B', soft: '#E6F2EC' },
  '/role-permissions': { desc: 'Cosa può vedere ogni ruolo', color: '#5B1220', soft: '#F3E3E6' },
};

/** The first page after login when the user can open several companies. */
function CompanyPicker({ companies, onPick }: { companies: Company[]; onPick: () => void }) {
  return (
    <div className="co-pick">
      <h1>
        Scegli la <span>società</span>
      </h1>
      <p>Puoi cambiarla in qualsiasi momento dal menu laterale.</p>
      <div className="co-grid">
        {companies.map((c) => (
          <button
            key={c.id}
            type="button"
            className="co-card"
            style={{ ['--co' as string]: c.color, ['--co-soft' as string]: c.soft } as React.CSSProperties}
            onClick={() => {
              setCompany(c.id);
              onPick();
            }}
          >
            <span className="co-mono">{c.name.replace('H-IS ', '').slice(0, 2).toUpperCase()}</span>
            <span>
              <b>{c.name}</b>
              <small>
                {c.full} · {c.location}
              </small>
            </span>
            <span className="co-go">Entra →</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function greeting(d = new Date()): string {
  const h = d.getHours();
  return h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera';
}

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const hm = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Oggi ${hm}`;
  if (d.toDateString() === y.toDateString()) return `Ieri ${hm}`;
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) + ' ' + hm;
}

function dueLabel(iso: string | null): { text: string; late: boolean } {
  if (!iso) return { text: '—', late: false };
  const d = new Date(iso + 'T00:00:00');
  const today = new Date(new Date().toDateString());
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { text: 'in ritardo', late: true };
  if (days === 0) return { text: 'oggi', late: true };
  if (days === 1) return { text: 'domani', late: true };
  if (days < 7) return { text: d.toLocaleDateString('it-IT', { weekday: 'short' }), late: days <= 3 };
  return { text: d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }), late: false };
}

function Delta({ now, prev }: { now: number; prev: number }) {
  const d = now - prev;
  if (!prev && !now) return null;
  return <span className={'ui-chip ' + (d > 0 ? 'ok' : 'muted')}>{d > 0 ? `+${d}` : d === 0 ? '=' : d}</span>;
}

export default function Dashboard() {
  const { user, company, companies } = useShell();
  const [picking, setPicking] = useState(() => companies.length > 1 && companyPickPending());
  useEffect(() => {
    if (companies.length <= 1) dismissCompanyPick();
  }, [companies.length]);

  const access = { roles: user?.roles ?? [], perms: user?.perms ?? null };
  const co = company?.id ?? 'venezia';
  const onVe = co === 'venezia';
  // What the dashboard shows follows the company and the role's permissions.
  const isIt = onVe && allows(access, 'it.history', ['it', 'admin']); // device KPIs + movements
  const canStudentForm = onVe && allows(access, 'it.checkin_student', ['it', 'admin']);
  const canBudget = allows(access, BUDGET_PERM[co] ?? 'it.budget', co === 'vicenza' ? ['office.hvi', 'admin'] : co === 'rosa' ? ['office.hro', 'admin'] : ['admin']);
  const canTasks = onVe && allows(access, 'it.tasks', ['admin']);
  const canOnboarding = onVe && allows(access, 'hr.onboarding', ['hr', 'admin']);
  const canOffboarding = onVe && allows(access, 'hr.offboarding', ['hr', 'admin']);
  const isHr = canOnboarding || canOffboarding;
  const isBoarding = onVe && allows(access, 'boarding.rooms', ['boarding', 'admin']);

  const [stats, setStats] = useState<DeviceStats | null>(null);
  const [moves, setMoves] = useState<RecentMove[] | null>(null);
  const [budget, setBudget] = useState<BudgetSummary[] | null>(null);
  const [tasks, setTasks] = useState<TaskSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (picking) return;
    let active = true;
    (async () => {
      const { data } = await getSupabase().auth.getUser();
      const jobs: Promise<unknown>[] = [];
      if (isIt) {
        jobs.push(loadDeviceStats().then((v) => active && setStats(v)));
        jobs.push(loadRecentMoves().then((v) => active && setMoves(v)));
      }
      if (canBudget) jobs.push(loadSchoolBudget(co).then((v) => active && setBudget(v)));
      if (canTasks && data.user) jobs.push(loadTaskSummary(data.user.id).then((v) => active && setTasks(v)));
      await Promise.allSettled(jobs);
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [picking, co, isIt, canBudget, canTasks]);

  if (picking) return <CompanyPicker companies={companies} onPick={() => setPicking(false)} />;

  const first = (user?.name ?? '').split(' ')[0] || '';
  const sections = navFor(access, co)
    .flatMap((g) => g.items)
    .filter((i) => i.href !== '/');
  const quick = onVe ? sections.flatMap((s) => s.children ?? []) : [];
  const maxDay = Math.max(1, ...(stats?.outPerDay ?? [0]));

  const budAlloc = (budget ?? []).reduce((t, b) => t + b.allocated, 0);
  const budSpent = (budget ?? []).reduce((t, b) => t + b.spent, 0);
  const budgetHref = `/budget-management/${co}`;

  const budgetCard = budget ? (
    <section className="db-card">
      <div className="db-sec-head">
        <h2>Budget {company?.name ?? ''}</h2>
        <Link href={budgetHref}>Apri</Link>
      </div>
      <div className="db-budget">
        {budget.length === 0 ? <div className="db-empty">Nessuna commessa.</div> : null}
        {budget.map((b) => {
          const pct = b.allocated ? Math.round((b.spent / b.allocated) * 100) : 0;
          return (
            <Link key={b.code} href={budgetHref} className="db-budget-row" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div>
                <b>{b.name.replace(' 26/27', '')}</b>
                <span>
                  {pct}% di {eur0.format(b.allocated)}
                </span>
              </div>
              <div className="db-track">
                <i className={pct > 100 ? 'over' : ''} style={{ width: `${Math.min(100, pct)}%`, background: pct > 100 ? undefined : b.accent }} />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  ) : null;

  const tasksCard = tasks ? (
    <section className="db-card">
      <div className="db-sec-head">
        <h2>{tasks.mine ? 'Le mie task' : 'Prossime scadenze'}</h2>
        <Link href="/task-manager">Task Manager</Link>
      </div>
      <div className="db-tasks">
        {tasks.list.length === 0 ? (
          <div className="db-empty">Nessuna task aperta.</div>
        ) : (
          tasks.list.map((t) => {
            const due = dueLabel(t.due_date);
            return (
              <Link key={t.id} href={`/task-manager?task=${t.id}`} className="db-task">
                <i style={{ background: t.priority === 'high' ? '#C2410C' : t.priority === 'medium' ? '#C9A227' : '#3C5A8A' }} />
                <b>{t.title}</b>
                <small className={due.late ? 'late' : ''}>{due.text}</small>
              </Link>
            );
          })
        )}
      </div>
    </section>
  ) : null;

  const movesCard = isIt ? (
    <section className="db-card" style={{ overflow: 'hidden' }}>
      <div className="db-sec-head">
        <div>
          <h2>Ultimi movimenti</h2>
          <p>Consegne e restituzioni registrate dai form studenti</p>
        </div>
        <Link href="/device-history">Vedi tutto</Link>
      </div>
      {moves === null ? (
        <div className="db-empty">{loading ? 'Caricamento…' : 'Movimenti non disponibili.'}</div>
      ) : moves.length === 0 ? (
        <div className="db-empty">Nessun movimento registrato.</div>
      ) : (
        <>
          <div className="db-table-wrap">
            <table className="db-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Studente</th>
                  <th>Operazione</th>
                  <th>MacBook</th>
                  <th>iPad</th>
                  <th>Firmato da</th>
                </tr>
              </thead>
              <tbody>
                {moves.map((m) => (
                  <tr key={m.id}>
                    <td>{when(m.created_at)}</td>
                    <td>{m.student_email}</td>
                    <td>
                      <span className={'ui-chip ' + (m.operation === 'Check-out' ? 'out' : 'in')}>
                        {m.operation === 'Check-out' ? 'Consegna' : 'Restituzione'}
                      </span>
                    </td>
                    <td>{m.macbook_id || '—'}</td>
                    <td>{m.ipad_id || '—'}</td>
                    <td>{m.signed_by || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="db-list">
            {moves.map((m) => (
              <div className="db-list-row" key={m.id}>
                <div>
                  <b>{m.student_email.split('@')[0]}</b>
                  <small>
                    {[m.macbook_id && `MacBook ${m.macbook_id}`, m.ipad_id && `iPad ${m.ipad_id}`].filter(Boolean).join(' · ') || when(m.created_at)}
                  </small>
                </div>
                <span className={'ui-chip ' + (m.operation === 'Check-out' ? 'out' : 'in')}>
                  {m.operation === 'Check-out' ? 'Consegna' : 'Restituzione'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  ) : null;

  const left = movesCard;
  const right = budgetCard || tasksCard ? (
    <div className="db-col">
      {budgetCard}
      {tasksCard}
    </div>
  ) : null;

  return (
    <>
      <div className="db">
        <div className="db-hello">
          <div>
            <div className="db-date">
              {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              {company ? ` · ${company.name}` : ''}
            </div>
            <h1>
              {greeting()}
              {first ? (
                <>
                  , <span>{first}</span>
                </>
              ) : null}
            </h1>
          </div>
          <div className="db-actions">
            {canStudentForm ? (
              <>
                <Link className="ui-btn" href="/modulo-student?op=checkin">
                  <Icon name="return" size={17} />
                  Nuova restituzione
                </Link>
                <Link className="ui-btn primary" href="/modulo-student?op=checkout">
                  <Icon name="plus" size={17} />
                  Nuova consegna
                </Link>
              </>
            ) : null}
            {isIt ? (
              <Link className="ui-btn wide" href="/device-history">
                <Icon name="history" size={17} />
                Storico assegnazioni
              </Link>
            ) : null}
            {!canStudentForm && !isIt && isHr ? (
              <>
                {canOffboarding ? (
                  <Link className="ui-btn" href="/employee-management">
                    <Icon name="userMinus" size={17} />
                    Offboarding
                  </Link>
                ) : null}
                {canOnboarding ? (
                  <Link className="ui-btn primary" href="/onboarding">
                    <Icon name="userPlus" size={17} />
                    Nuovo onboarding
                  </Link>
                ) : null}
              </>
            ) : null}
            {!canStudentForm && !isIt && !isHr && isBoarding ? (
              <Link className="ui-btn primary" href="/room-assignment">
                <Icon name="house" size={17} />
                Assegna una camera
              </Link>
            ) : null}
            {!onVe && canBudget ? (
              <Link className="ui-btn primary" href={budgetHref}>
                <Icon name="wallet" size={17} />
                Budget
              </Link>
            ) : null}
          </div>
        </div>

        {isIt ? (
          loading && !stats ? (
            <div className="db-kpis">
              <div className="db-skel" />
              <div className="db-skel" />
              <div className="db-skel" />
              <div className="db-skel" />
            </div>
          ) : stats ? (
            <div className="db-kpis">
              <div className="db-card db-kpi">
                <div className="db-kpi-top">
                  Consegne · 7 giorni <Delta now={stats.outWeek} prev={stats.outPrevWeek} />
                </div>
                <div className="db-kpi-val">{stats.outWeek}</div>
                <div className="db-bars" aria-hidden="true">
                  {stats.outPerDay.map((n, i) => (
                    <i key={i} className={i === 6 ? 'now' : ''} style={{ height: `${Math.max(10, (n / maxDay) * 100)}%` }} />
                  ))}
                </div>
              </div>
              <div className="db-card db-kpi">
                <div className="db-kpi-top">
                  Restituzioni · 7 giorni <Delta now={stats.inWeek} prev={stats.inPrevWeek} />
                </div>
                <div className="db-kpi-val">{stats.inWeek}</div>
                <div className="db-kpi-sub">{stats.inPrevWeek} nei 7 giorni precedenti</div>
              </div>
              <div className="db-card db-kpi">
                <div className="db-kpi-top">Consegne dall&apos;1 settembre</div>
                <div className="db-kpi-val">{stats.outYear}</div>
                <div className="db-kpi-sub">{stats.inYear} restituzioni nello stesso periodo</div>
              </div>
              {canTasks && tasks ? (
                <div className="db-card db-kpi">
                  <div className="db-kpi-top">Task aperte</div>
                  <div className="db-kpi-val">{tasks.open}</div>
                  <div className={'db-kpi-sub' + (tasks.dueSoon ? ' alert' : '')}>
                    {tasks.dueSoon ? `${tasks.dueSoon} in scadenza entro 7 giorni` : 'Nessuna in scadenza'}
                  </div>
                </div>
              ) : (
                <div className="db-card db-kpi">
                  <div className="db-kpi-top">Saldo anno scolastico</div>
                  <div className="db-kpi-val">{stats.outYear - stats.inYear}</div>
                  <div className="db-kpi-sub">consegne meno restituzioni</div>
                </div>
              )}
            </div>
          ) : null
        ) : null}

        {!onVe && canBudget ? (
          loading && !budget ? (
            <div className="db-kpis">
              <div className="db-skel" />
              <div className="db-skel" />
              <div className="db-skel" />
            </div>
          ) : (
            <div className="db-kpis">
              {budget ? (
                <>
                  <div className="db-card db-kpi">
                    <div className="db-kpi-top">Budget stanziato</div>
                    <div className="db-kpi-val">{eur0.format(budAlloc)}</div>
                    <div className="db-kpi-sub">{budget.length} commesse</div>
                  </div>
                  <div className="db-card db-kpi">
                    <div className="db-kpi-top">Speso</div>
                    <div className="db-kpi-val">{eur0.format(budSpent)}</div>
                    <div className="db-kpi-sub">{budAlloc ? Math.round((budSpent / budAlloc) * 100) : 0}% del budget</div>
                  </div>
                  <div className="db-card db-kpi">
                    <div className="db-kpi-top">Disponibile</div>
                    <div className="db-kpi-val" style={{ color: budAlloc - budSpent < 0 ? '#A32D2D' : '#1F5A48' }}>
                      {eur0.format(budAlloc - budSpent)}
                    </div>
                    <div className="db-kpi-sub">{budAlloc - budSpent < 0 ? 'Budget superato' : 'residuo'}</div>
                  </div>
                </>
              ) : null}
            </div>
          )
        ) : null}

        {left && right ? (
          <div className="db-split">
            {left}
            {right}
          </div>
        ) : (
          left ?? right
        )}

        {quick.length && !isIt ? (
          <section className="db-sections">
            <h2>Collegamenti rapidi</h2>
            <div className="db-tiles">
              {quick.map((s) => {
                const meta = SECTION_META[s.href] ?? { desc: '', color: '#8B1A2B', soft: '#F9EFF0' };
                return (
                  <Link key={s.href} href={s.href} className="db-tile">
                    <span className="db-tile-ic" style={{ background: meta.soft, color: meta.color }}>
                      <Icon name={s.icon as IconName} size={20} />
                    </span>
                    <span>
                      <b>{s.label}</b>
                      <span>{meta.desc}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        {sections.length ? (
          <section className="db-sections">
            <h2>Le tue sezioni{company ? ` · ${company.name}` : ''}</h2>
            <div className="db-tiles">
              {sections.map((s) => {
                const meta = SECTION_META[s.href] ?? { desc: '', color: '#8B1A2B', soft: '#F9EFF0' };
                return (
                  <Link key={s.href} href={s.href} className="db-tile">
                    <span className="db-tile-ic" style={{ background: meta.soft, color: meta.color }}>
                      <Icon name={s.icon as IconName} size={20} />
                    </span>
                    <span>
                      <b>{s.label}</b>
                      <span>{meta.desc}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="db-card">
            <div className="db-empty">
              Per il tuo ruolo non ci sono ancora sezioni disponibili{company ? ` in ${company.name}` : ''}. Quando verranno attivate le
              troverai qui e nel menu.
            </div>
          </section>
        )}
      </div>
      <Footer text="" />
    </>
  );
}
