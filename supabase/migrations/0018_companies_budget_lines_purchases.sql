-- ═══════════════════════════════════════════════════════════════════
-- Three companies (H-IS Venezia, Vicenza, Rosà), new roles, budget
-- lines in the database. (Purchases was removed: see 0019.)
-- Run once in the Supabase SQL Editor, AFTER 0017. Rieseguibile.
--
-- 1. New roles: teachers.hvi, office.hvi (H-IS Vicenza),
--    teachers.hro, office.hro (H-IS Rosà). Owner / Super Admin / Admin
--    see every company; the existing roles keep H-IS Venezia.
-- 2. New permissions: vi.budget, ro.budget (budget of Vicenza / Rosà),
--    it.budget stays the Venezia budget (section IT).
--    Defaults: office.hvi → vi.budget; office.hro → ro.budget;
--    teachers.hvi, teachers.hro → nothing; admin → everything.
-- 3. Budget lines ("commesse") move from the code to the table
--    budget_lines: a new line can be created and its allocation raised
--    or lowered from the page; every change is kept in
--    budget_adjustments and in the activity log.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. Roles ──────────────────────────────────────────────────────
create or replace function public.platform_roles()
returns text[]
language sql
immutable
as $$
  select array['owner', 'superadmin', 'admin', 'it', 'hr', 'boarding', 'office', 'parent',
                'office.hvi', 'teachers.hvi', 'office.hro', 'teachers.hro', 'guest'];
$$;

create or replace function public.configurable_roles()
returns text[]
language sql
immutable
as $$
  select array['admin', 'it', 'hr', 'boarding', 'office', 'parent', 'office.hvi', 'teachers.hvi', 'office.hro', 'teachers.hro'];
$$;

insert into public.mfa_role_policy (role)
select r from unnest(array['office.hvi', 'teachers.hvi', 'office.hro', 'teachers.hro']) as r
on conflict (role) do nothing;

-- ─── 2. Permissions ────────────────────────────────────────────────
create or replace function public.permission_keys()
returns text[]
language sql
immutable
as $$
  select array[
    'it', 'it.checkin_student', 'it.checkin_employee', 'it.history', 'it.registries', 'it.budget', 'it.tasks',
    'hr', 'hr.onboarding', 'hr.offboarding', 'hr.registries',
    'boarding', 'boarding.rooms',
    'office',
    'vi.budget',
    'ro.budget'
  ];
$$;

insert into public.role_permissions (role, perm)
select r, p from (values
  ('admin', 'vi.budget'), ('admin', 'ro.budget'),
  ('office.hvi', 'vi.budget'),
  ('office.hro', 'ro.budget')
) as d(r, p)
on conflict (role, perm) do nothing;

-- Permission that opens the budget of a school.
create or replace function public.school_budget_perm(p_school text)
returns text
language sql
immutable
as $$
  select case lower(coalesce(p_school, ''))
    when 'venezia' then 'it.budget'
    when 'vicenza' then 'vi.budget'
    when 'rosa' then 'ro.budget'
    else '-' end;
$$;

-- ─── 3. Budget lines ───────────────────────────────────────────────
create table if not exists public.budget_lines (
  id          uuid primary key default gen_random_uuid(),
  school      text not null check (school in ('venezia', 'vicenza', 'rosa')),
  code        text not null check (code ~ '^[a-z0-9_]{2,40}$'),
  name        text not null check (length(btrim(name)) between 1 and 120),
  caption     text,
  accent      text not null default '#8B1A2B',
  accent_soft text not null default '#F9EFF0',
  allocated   numeric(14,2) not null default 0 check (allocated >= 0),
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by_name text,
  unique (school, code)
);

-- Seed = the lines that were in src/lib/budgets.ts.
insert into public.budget_lines (school, code, name, caption, accent, accent_soft, allocated, sort_order) values
  ('venezia', 'indirect', 'IT Indirect & Infrastructure 26/27', 'Infrastruttura, servizi e costi indiretti', '#8B1A2B', '#F9EFF0', 55400, 1),
  ('venezia', 'hardware', 'IT Hardware & Consumables 26/27', 'Hardware, ricambi e materiali di consumo', '#C9A227', '#FBF4DF', 28500, 2),
  ('venezia', 'capex', 'CAPEX IT 26/27', 'Investimenti e progetti capitalizzati', '#2F6E5B', '#E7F2EE', 182600, 3),
  ('vicenza', 'indirect', 'IT Indirect & Infrastructure 26/27', 'Infrastruttura, servizi e costi indiretti', '#8B1A2B', '#F9EFF0', 37250, 1),
  ('vicenza', 'hardware', 'IT Hardware & Consumables 26/27', 'Hardware, ricambi e materiali di consumo', '#C9A227', '#FBF4DF', 21000, 2),
  ('vicenza', 'capex', 'CAPEX IT 26/27', 'Investimenti e progetti capitalizzati', '#2F6E5B', '#E7F2EE', 69700, 3),
  ('rosa', 'indirect', 'IT Indirect & Infrastructure 26/27', 'Infrastruttura, servizi e costi indiretti', '#8B1A2B', '#F9EFF0', 28500, 1),
  ('rosa', 'hardware', 'IT Hardware & Consumables 26/27', 'Hardware, ricambi e materiali di consumo', '#C9A227', '#FBF4DF', 14100, 2),
  ('rosa', 'capex', 'CAPEX IT 26/27', 'Investimenti e progetti capitalizzati', '#2F6E5B', '#E7F2EE', 45495, 3)
on conflict (school, code) do nothing;

create table if not exists public.budget_adjustments (
  id              uuid primary key default gen_random_uuid(),
  school          text not null,
  budget_code     text not null,
  amount          numeric(14,2) not null,       -- + raised, − lowered (or the initial allocation of a new line)
  allocated_after numeric(14,2) not null,
  reason          text,
  kind            text not null default 'adjust' check (kind in ('create', 'adjust', 'archive')),
  created_by      uuid default auth.uid(),
  created_by_name text,
  created_at      timestamptz not null default now()
);
create index if not exists budget_adjustments_line_idx on public.budget_adjustments (school, budget_code, created_at desc);

alter table public.budget_lines enable row level security;
alter table public.budget_adjustments enable row level security;
drop policy if exists budget_lines_select on public.budget_lines;
create policy budget_lines_select on public.budget_lines
  for select to authenticated using (public.has_permission(public.school_budget_perm(school)));
drop policy if exists budget_adjustments_select on public.budget_adjustments;
create policy budget_adjustments_select on public.budget_adjustments
  for select to authenticated using (public.has_permission(public.school_budget_perm(school)));
-- Changes only through the functions below.
revoke insert, update, delete on public.budget_lines, public.budget_adjustments from anon, authenticated;

-- Expenses: any active line of the school (no more fixed list of codes),
-- readable / writable with the budget permission of THAT school.
alter table public.it_budget_expenses drop constraint if exists it_budget_expenses_budget_code_check;
do $$
declare
  op text;
begin
  foreach op in array array['select', 'insert', 'update', 'delete'] loop
    execute format('drop policy if exists %I on public.it_budget_expenses', 'it_budget_expenses_' || op);
  end loop;
end;
$$;
create policy it_budget_expenses_select on public.it_budget_expenses
  for select to authenticated using (public.has_permission(public.school_budget_perm(school)));
create policy it_budget_expenses_insert on public.it_budget_expenses
  for insert to authenticated with check (
    public.has_permission(public.school_budget_perm(school))
    and exists (select 1 from public.budget_lines l where l.school = it_budget_expenses.school and l.code = it_budget_expenses.budget_code and l.active)
  );
create policy it_budget_expenses_update on public.it_budget_expenses
  for update to authenticated using (public.has_permission(public.school_budget_perm(school)))
  with check (public.has_permission(public.school_budget_perm(school)));
create policy it_budget_expenses_delete on public.it_budget_expenses
  for delete to authenticated using (public.has_permission(public.school_budget_perm(school)));

create or replace function public.my_display_name()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    (select u.email from auth.users u where u.id = auth.uid()))
  from public.profiles p where p.id = auth.uid();
$$;

-- New budget line. Returns its code.
create or replace function public.budget_create_line(p_school text, p_name text, p_caption text, p_allocated numeric, p_accent text, p_accent_soft text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school text := lower(btrim(coalesce(p_school, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_base text;
  v_code text;
  n int := 1;
  v_who text := public.my_display_name();
begin
  if not public.has_permission(public.school_budget_perm(v_school)) then
    raise exception 'You cannot manage this budget' using errcode = '42501';
  end if;
  if v_name = '' or length(v_name) > 120 then
    raise exception 'Give the budget line a name (max 120 characters)' using errcode = '22023';
  end if;
  if p_allocated is null or p_allocated < 0 then
    raise exception 'The allocation must be zero or more' using errcode = '22023';
  end if;
  v_base := left(trim(both '_' from regexp_replace(lower(translate(v_name, 'àèéìòùÀÈÉÌÒÙ', 'aeeiouAEEIOU')), '[^a-z0-9]+', '_', 'g')), 32);
  if length(v_base) < 2 then v_base := 'commessa'; end if;
  v_code := v_base;
  while exists (select 1 from public.budget_lines where school = v_school and code = v_code) loop
    n := n + 1;
    v_code := v_base || '_' || n;
  end loop;
  insert into public.budget_lines (school, code, name, caption, accent, accent_soft, allocated, sort_order, created_by_name)
  values (v_school, v_code, v_name, nullif(btrim(coalesce(p_caption, '')), ''),
          coalesce(nullif(p_accent, ''), '#8B1A2B'), coalesce(nullif(p_accent_soft, ''), '#F9EFF0'),
          round(p_allocated, 2),
          coalesce((select max(sort_order) + 1 from public.budget_lines where school = v_school), 1), v_who);
  insert into public.budget_adjustments (school, budget_code, amount, allocated_after, reason, kind, created_by_name)
  values (v_school, v_code, round(p_allocated, 2), round(p_allocated, 2), 'Nuova commessa', 'create', v_who);
  perform public.audit_write('budget_line_created', 'budget_line', v_school || '/' || v_code, v_name,
    jsonb_build_object('school', v_school, 'allocated', p_allocated));
  return v_code;
end;
$$;

-- Raise (amount > 0) or lower (amount < 0) a line's allocation.
create or replace function public.budget_adjust_line(p_school text, p_code text, p_amount numeric, p_reason text)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school text := lower(btrim(coalesce(p_school, '')));
  v_new numeric;
  v_name text;
  v_who text := public.my_display_name();
begin
  if not public.has_permission(public.school_budget_perm(v_school)) then
    raise exception 'You cannot manage this budget' using errcode = '42501';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'Enter an amount different from zero' using errcode = '22023';
  end if;
  select allocated + round(p_amount, 2), name into v_new, v_name
    from public.budget_lines where school = v_school and code = p_code and active;
  if not found then
    raise exception 'Budget line not found' using errcode = 'P0002';
  end if;
  if v_new < 0 then
    raise exception 'The allocation cannot go below zero' using errcode = '22023';
  end if;
  update public.budget_lines set allocated = v_new where school = v_school and code = p_code;
  insert into public.budget_adjustments (school, budget_code, amount, allocated_after, reason, kind, created_by_name)
  values (v_school, p_code, round(p_amount, 2), v_new, nullif(btrim(coalesce(p_reason, '')), ''), 'adjust', v_who);
  perform public.audit_write('budget_adjusted', 'budget_line', v_school || '/' || p_code, v_name,
    jsonb_build_object('school', v_school, 'amount', p_amount, 'allocated_after', v_new, 'reason', p_reason));
  return v_new;
end;
$$;

-- Hide a line created by mistake (only without expenses).
create or replace function public.budget_archive_line(p_school text, p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school text := lower(btrim(coalesce(p_school, '')));
  v_name text;
begin
  if not public.has_permission(public.school_budget_perm(v_school)) then
    raise exception 'You cannot manage this budget' using errcode = '42501';
  end if;
  if exists (select 1 from public.it_budget_expenses where school = v_school and budget_code = p_code) then
    raise exception 'This budget line has expenses: it cannot be removed' using errcode = '22023';
  end if;
  update public.budget_lines set active = false where school = v_school and code = p_code and active
  returning name into v_name;
  if not found then
    raise exception 'Budget line not found' using errcode = 'P0002';
  end if;
  insert into public.budget_adjustments (school, budget_code, amount, allocated_after, reason, kind, created_by_name)
  values (v_school, p_code, 0, 0, 'Commessa rimossa', 'archive', public.my_display_name());
  perform public.audit_write('budget_line_archived', 'budget_line', v_school || '/' || p_code, v_name, jsonb_build_object('school', v_school));
end;
$$;

-- ─── Grants ────────────────────────────────────────────────────────
revoke execute on function
  public.school_budget_perm(text), public.my_display_name(),
  public.budget_create_line(text, text, text, numeric, text, text), public.budget_adjust_line(text, text, numeric, text),
  public.budget_archive_line(text, text)
from public, anon;
grant execute on function
  public.school_budget_perm(text), public.my_display_name(),
  public.budget_create_line(text, text, text, numeric, text, text), public.budget_adjust_line(text, text, numeric, text),
  public.budget_archive_line(text, text),
  public.platform_roles(), public.configurable_roles(), public.permission_keys()
to authenticated;
