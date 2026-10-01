-- ═══════════════════════════════════════════════════════════════════
-- IT Budget Management — expense ledger for the four 26/27 budget
-- lines ("commesse"). Run this once in the Supabase SQL Editor.
--
-- The allocations themselves are not stored here: they live in
-- src/lib/budgets.ts (BUDGET_LINES). This table only records what has
-- been spent; the dashboard subtracts it from the allocation.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

create table if not exists public.it_budget_expenses (
  id              uuid primary key default gen_random_uuid(),
  budget_code     text          not null check (budget_code in ('indirect', 'hardware', 'capex', 'opex')),
  description     text          not null check (length(btrim(description)) > 0),
  supplier        text,
  amount          numeric(12,2) not null check (amount > 0),
  spent_on        date          not null default current_date,
  notes           text,
  created_by      uuid          references auth.users (id) on delete set null default auth.uid(),
  created_by_name text,
  created_at      timestamptz   not null default now()
);

create index if not exists it_budget_expenses_code_idx on public.it_budget_expenses (budget_code);
create index if not exists it_budget_expenses_date_idx on public.it_budget_expenses (spent_on desc);

-- ─── Access: IT staff and admins only ──────────────────────────────
-- SECURITY DEFINER so the policy can read public.profiles without the
-- caller needing its own select policy there.
create or replace function public.is_it_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('it', 'admin', 'superadmin')
  );
$$;

alter table public.it_budget_expenses enable row level security;

drop policy if exists it_budget_expenses_select on public.it_budget_expenses;
create policy it_budget_expenses_select on public.it_budget_expenses
  for select to authenticated using (public.is_it_staff());

drop policy if exists it_budget_expenses_insert on public.it_budget_expenses;
create policy it_budget_expenses_insert on public.it_budget_expenses
  for insert to authenticated with check (public.is_it_staff());

drop policy if exists it_budget_expenses_update on public.it_budget_expenses;
create policy it_budget_expenses_update on public.it_budget_expenses
  for update to authenticated using (public.is_it_staff()) with check (public.is_it_staff());

drop policy if exists it_budget_expenses_delete on public.it_budget_expenses;
create policy it_budget_expenses_delete on public.it_budget_expenses
  for delete to authenticated using (public.is_it_staff());
