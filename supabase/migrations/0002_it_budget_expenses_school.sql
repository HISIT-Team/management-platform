-- ═══════════════════════════════════════════════════════════════════
-- IT Budget Management — split the ledger per school.
-- Run this in the Supabase SQL Editor after 0001.
--
-- Existing rows were all recorded against the Venezia budget, so the
-- column defaults to 'venezia' and backfills them correctly.
-- ═══════════════════════════════════════════════════════════════════

alter table public.it_budget_expenses
  add column if not exists school text not null default 'venezia';

alter table public.it_budget_expenses
  drop constraint if exists it_budget_expenses_school_check;

alter table public.it_budget_expenses
  add constraint it_budget_expenses_school_check
  check (school in ('venezia', 'vicenza', 'rosa'));

create index if not exists it_budget_expenses_school_idx
  on public.it_budget_expenses (school, budget_code);
