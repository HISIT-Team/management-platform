'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import AuthGuard, { useAccess } from '@/components/AuthGuard';
import Topbar from '@/components/Topbar';
import { useToast } from '@/components/useToast';
import { createManagedBudget, listManagedBudgets, setManagedBudgetLifecycle, type BudgetLifecycle, type ManagedBudget } from '@/lib/managedBudgets';
import { getSupabase } from '@/lib/supabase';

type User = { id: string; email: string; first_name: string | null; last_name: string | null };
type AccessRow = { profile_id: string; email: string; first_name: string | null; last_name: string | null; school_code: string; can_edit: boolean };
const SCHOOL_NAMES: Record<string, string> = { venezia: 'Venezia', vicenza: 'Vicenza', rosa: 'Rosà' };
const isBudgetAdmin = (roles: string[]) => roles.some((role) => ['owner', 'superadmin', 'controller'].includes(role));
const displayName = (user: Pick<User, 'first_name' | 'last_name' | 'email'>) => `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || user.email;

function Inner() {
  const access = useAccess();
  const canAdmin = isBudgetAdmin(access.roles);
  const { showToast, toastNode } = useToast();
  const [budgets, setBudgets] = useState<ManagedBudget[]>([]);
  const [lifecycle, setLifecycle] = useState<BudgetLifecycle>('active');
  const [users, setUsers] = useState<User[]>([]);
  const [newBudgetOpen, setNewBudgetOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedBudget, setSelectedBudget] = useState<ManagedBudget | null>(null);
  const [accessRows, setAccessRows] = useState<AccessRow[]>([]);
  const [memberId, setMemberId] = useState('');
  const [schoolCode, setSchoolCode] = useState('*');
  const [canEdit, setCanEdit] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadBudgets = async (scope = lifecycle) => {
    try { setBudgets(await listManagedBudgets(scope)); } catch (error) { showToast((error as Error).message, true); }
  };
  const loadAccess = async (budgetId: string) => {
    const { data, error } = await getSupabase().rpc('budget_access_list', { p_budget: budgetId });
    if (error) throw error;
    setAccessRows((data ?? []) as AccessRow[]);
  };

  useEffect(() => {
    listManagedBudgets(lifecycle).then(setBudgets).catch((error: Error) => showToast(error.message, true));
    if (!canAdmin) return;
    getSupabase().rpc('budget_admin_users').then(({ data, error }) => {
      if (error) return showToast(error.message, true);
      setUsers((data ?? []) as User[]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAdmin, lifecycle]);

  async function createBudget() {
    if (!name.trim()) return showToast('Inserisci il nome del budget.', true);
    setBusy(true);
    try {
      const budget = await createManagedBudget(name, description);
      await loadBudgets(); setName(''); setDescription(''); setNewBudgetOpen(false);
      showToast(`Budget “${budget.name}” creato con le tre scuole ✓`);
    } catch (error) { showToast((error as Error).message, true); } finally { setBusy(false); }
  }
  async function openAccess(budget: ManagedBudget) {
    setSelectedBudget(budget); setMemberId(''); setSchoolCode('*'); setCanEdit(false);
    try { await loadAccess(budget.id); } catch (error) { showToast((error as Error).message, true); }
  }
  async function grantAccess() {
    if (!selectedBudget || !memberId) return showToast('Seleziona una persona.', true);
    setBusy(true);
    try {
      const { error } = await getSupabase().rpc('budget_grant_access', { p_budget: selectedBudget.id, p_profile: memberId, p_can_edit: canEdit, p_school_code: schoolCode });
      if (error) throw error;
      await loadAccess(selectedBudget.id); setMemberId(''); setSchoolCode('*'); setCanEdit(false);
      showToast('Accesso al budget aggiornato ✓');
    } catch (error) { showToast((error as Error).message, true); } finally { setBusy(false); }
  }
  async function moveBudget(budget: ManagedBudget, next: BudgetLifecycle) {
    const action = next === 'archived' ? 'archiviare' : next === 'trash' ? 'spostare nel Cestino' : 'ripristinare';
    if (!window.confirm(`Vuoi ${action} il budget “${budget.name}”?`)) return;
    setBusy(true);
    try { await setManagedBudgetLifecycle(budget.id, next); await loadBudgets(); showToast(`Budget ${next === 'trash' ? 'spostato nel Cestino' : next === 'archived' ? 'archiviato' : 'ripristinato'} ✓`); }
    catch (error) { showToast((error as Error).message, true); } finally { setBusy(false); }
  }

  return <><Topbar label="Home" href="/" variant="back" /><div className="budget-page"><main className="shell shell--narrow">
    <div className="b-head"><div className="b-head-left"><div><p className="b-eyebrow">Gestione finanziaria</p><h1>Budget <em>Management</em></h1><p>Budget, commesse e movimenti per tutte le scuole.</p></div></div>{canAdmin ? <button className="btn-primary" onClick={() => setNewBudgetOpen(true)}>Nuovo budget</button> : null}</div>
    <div className="budget-tabs"><button className={lifecycle === 'active' ? 'active' : ''} onClick={() => setLifecycle('active')}>Attivi</button><button className={lifecycle === 'archived' ? 'active' : ''} onClick={() => setLifecycle('archived')}>Archivio</button><button className={lifecycle === 'trash' ? 'active' : ''} onClick={() => setLifecycle('trash')}>Cestino</button></div>
    <div className="schools">{budgets.map((budget) => <article className="school-card budget-card" key={budget.id}><div className="school-chip">{budget.name.slice(0, 2).toUpperCase()}</div>{lifecycle === 'active' ? <Link className="school-txt" href={budget.legacy_it ? '/budget/it' : `/budget/manage?budget=${encodeURIComponent(budget.id)}`}><div className="school-name">{budget.name}</div><div className="school-sub">{budget.description || 'Budget, commesse e registrazioni di spesa'}</div><div className="school-meta">Tre scuole · commesse · monitoraggio delle spese</div></Link> : <div className="school-txt"><div className="school-name">{budget.name}</div><div className="school-sub">{budget.description || 'Budget, commesse e registrazioni di spesa'}</div><div className="school-meta">{lifecycle === 'trash' ? 'Nel Cestino' : 'Budget archiviato'}</div></div>}<div className="budget-card-actions">{canAdmin && lifecycle === 'active' && !budget.legacy_it ? <><button className="btn-quiet" onClick={() => void openAccess(budget)}>Accessi</button><button className="btn-quiet" onClick={() => void moveBudget(budget, 'archived')}>Archivia</button><button className="btn-quiet danger" onClick={() => void moveBudget(budget, 'trash')}>Cestino</button></> : null}{canAdmin && lifecycle !== 'active' ? <button className="btn-quiet" onClick={() => void moveBudget(budget, 'active')}>Ripristina</button> : null}{lifecycle === 'active' ? <Link className="school-go" aria-label={`Apri ${budget.name}`} href={budget.legacy_it ? '/budget/it' : `/budget/manage?budget=${encodeURIComponent(budget.id)}`}>→</Link> : null}</div></article>)}</div>
  </main>
  {newBudgetOpen ? <div className="b-overlay" role="dialog" aria-modal="true" aria-label="Crea un nuovo budget"><div className="b-modal"><div className="b-modal-head"><div><h2>Nuovo budget</h2><p>Verranno create Venezia, Vicenza e Rosà.</p></div></div><div className="b-modal-body"><div className="field"><label htmlFor="budget-name">Nome <span className="req">*</span></label><input id="budget-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Es. Marketing 2026/27" autoFocus /></div><div className="field"><label htmlFor="budget-description">Descrizione</label><textarea id="budget-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Facoltativa" /></div></div><div className="b-modal-foot"><button className="btn-quiet" onClick={() => setNewBudgetOpen(false)} disabled={busy}>Annulla</button><button className="btn-primary" onClick={() => void createBudget()} disabled={busy}>{busy ? 'Creazione…' : 'Crea budget'}</button></div></div></div> : null}
  {selectedBudget ? <div className="b-overlay" role="dialog" aria-modal="true" aria-label={`Accessi per ${selectedBudget.name}`}><div className="b-modal"><div className="b-modal-head"><div><h2>Assegna accesso</h2><p>Permessi indipendenti dal ruolo globale della piattaforma.</p></div></div><div className="b-modal-body"><div className="field"><label htmlFor="access-budget">Budget attivo <span className="req">*</span></label><select id="access-budget" value={selectedBudget.id} onChange={(event) => { const budget = budgets.find((item) => item.id === event.target.value); if (budget) { setSelectedBudget(budget); setSchoolCode('*'); void loadAccess(budget.id); } }}>{budgets.filter((budget) => !budget.legacy_it).map((budget) => <option key={budget.id} value={budget.id}>{budget.name}</option>)}</select></div><div className="field"><label htmlFor="budget-person">Persona <span className="req">*</span></label><select id="budget-person" value={memberId} onChange={(event) => setMemberId(event.target.value)}><option value="">Seleziona una persona</option>{users.map((user) => <option key={user.id} value={user.id}>{displayName(user)} · {user.email}</option>)}</select></div><div className="field"><label htmlFor="access-school">Scuole autorizzate <span className="req">*</span></label><select id="access-school" value={schoolCode} onChange={(event) => setSchoolCode(event.target.value)}><option value="*">Tutte le scuole</option>{Object.entries(SCHOOL_NAMES).map(([key, label]) => <option key={key} value={`${selectedBudget.slug}_${key}`}>{label}</option>)}</select><p className="field-help">Puoi assegnare tutte le scuole oppure una sola sede.</p></div><label className="access-check"><input type="checkbox" checked={canEdit} onChange={(event) => setCanEdit(event.target.checked)} /> Può modificare stanziamenti e spese</label>{accessRows.length ? <div className="access-list">{accessRows.map((row) => <div className="access-row" key={`${row.profile_id}-${row.school_code}`}><div><strong>{`${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || row.email}</strong><span>{row.email} · {row.school_code === '*' ? 'Tutte le scuole' : SCHOOL_NAMES[row.school_code.split('_').at(-1) ?? '']}</span></div><span className={`pill ${row.can_edit ? 'ok' : 'warn'}`}>{row.can_edit ? 'Modifica' : 'Sola lettura'}</span></div>)}</div> : <p className="access-empty">Nessun accesso specifico assegnato.</p>}</div><div className="b-modal-foot"><button className="btn-quiet" onClick={() => setSelectedBudget(null)} disabled={busy}>Chiudi</button><button className="btn-primary" onClick={() => void grantAccess()} disabled={busy}>{busy ? 'Salvataggio…' : 'Assegna accesso'}</button></div></div></div> : null}
  {toastNode}</div></>;
}

export default function BudgetIndexClient() { return <AuthGuard><Inner /></AuthGuard>; }
