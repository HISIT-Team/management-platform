'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import BudgetClient from '@/app/budget-management/BudgetClient';
import AuthGuard from '@/components/AuthGuard';
import Topbar from '@/components/Topbar';
import { getSupabase } from '@/lib/supabase';
import type { School } from '@/lib/budgets';

type Budget = { id: string; name: string; description: string | null };
type BudgetSchool = School;

function Picker({ budget, schools }: { budget: Budget; schools: BudgetSchool[] }) {
  return <><Topbar label="Budget" href="/budget" variant="back" /><div className="budget-page"><div className="shell shell--narrow"><div className="b-head"><div className="b-head-left"><div><p className="b-eyebrow">Budget e commesse</p><h1>{budget.name} <em>Budget</em></h1><p>{budget.description || 'Seleziona la scuola di cui vuoi vedere le commesse'}</p></div></div></div><div className="schools">{schools.map((s) => <Link key={s.code} className="school-card" href={`/budget/manage?budget=${budget.id}&school=${s.code}`}><div className="school-chip">{s.name.slice(0, 2).toUpperCase()}</div><div className="school-txt"><div className="school-name">{s.name}</div><div className="school-sub">{s.fullName} · {s.location}</div><div className="school-meta">Apri commesse, stanziamenti e registrazioni</div></div><div className="school-go">→</div></Link>)}</div></div></div></>;
}

function Inner() {
  const params = useSearchParams(); const ref = params.get('budget') || ''; const requested = params.get('school');
  const [budget, setBudget] = useState<Budget | null>(null); const [schools, setSchools] = useState<BudgetSchool[]>([]); const [error, setError] = useState('');
  useEffect(() => { let live = true; (async () => { try { const sb = getSupabase(); const { data: b, error: e } = await sb.from('budget_catalog').select('id,name,description').eq('id', ref).single(); if (e) throw e; const { data, error } = await sb.from('budget_schools').select('code,name,full_name,location').eq('budget_id', b.id).order('school'); if (error) throw error; if (!live) return; setBudget(b); setSchools((data || []).map((x) => ({ code: x.code, name: x.name, fullName: x.full_name, location: x.location, status: 'active', lines: [] }))); } catch (err) { if (live) setError((err as Error).message); } })(); return () => { live = false; }; }, [ref]);
  if (error) return <div className="budget-page"><div className="shell"><div className="setup-note">{error}</div></div></div>;
  if (!budget) return null;
  const school = schools.find((x) => x.code === requested);
  return school ? <BudgetClient school={school} backHref={`/budget/manage?budget=${budget.id}`} budgetLabel={budget.name} /> : <Picker budget={budget} schools={schools} />;
}
export default function ManagedBudgetClient() { return <AuthGuard><Inner /></AuthGuard>; }
