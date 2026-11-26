-- Production Budget section.  V1 keeps using its legacy IT tables unchanged.
-- Run this once in the Supabase SQL Editor after 0024.

create or replace function public.platform_roles() returns text[] language sql immutable as $$
  select array['owner','superadmin','admin','it','hr','boarding','office','parent','office.hvi','teachers.hvi','office.hro','teachers.hro','controller','guest'];
$$;

insert into public.mfa_role_policy (role) values ('controller') on conflict (role) do nothing;

-- Controller manages the legacy IT budget too, without changing V1's UI.
create or replace function public.has_permission(p_perm text) returns boolean language sql stable security definer set search_path=public as $$
  select public.mfa_ok() and (
    public.my_role() in ('owner','superadmin')
    or (public.my_role() = 'controller' and p_perm = any(array['it.budget','vi.budget','ro.budget']))
    or case when p_perm = any(public.admin_only_permissions()) then public.my_role() = 'admin'
            else exists (select 1 from public.role_permissions rp where rp.role=public.my_role() and rp.perm=p_perm) end
  );
$$;

create table if not exists public.budget_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}$'),
  name text not null check (length(btrim(name)) between 2 and 80),
  description text,
  legacy_it boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
insert into public.budget_catalog (slug,name,description,legacy_it)
values ('it','Budget IT','Budget IT esistente, diviso per sede.',true) on conflict (slug) do nothing;

create table if not exists public.budget_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 2 and 80),
  created_at timestamptz not null default now(), created_by uuid default auth.uid()
);
create table if not exists public.budget_role_scopes (
  role_id uuid not null references public.budget_roles(id) on delete cascade,
  budget_id uuid not null references public.budget_catalog(id) on delete cascade,
  can_view boolean not null default true, can_edit boolean not null default false,
  primary key(role_id,budget_id), check (not can_edit or can_view)
);
create table if not exists public.budget_role_members (
  role_id uuid not null references public.budget_roles(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key(role_id,profile_id)
);

create or replace function public.is_budget_admin() returns boolean language sql stable security definer set search_path=public as $$
  select public.mfa_ok() and public.my_role() in ('owner','superadmin','controller');
$$;
create or replace function public.budget_can_view(p_budget uuid) returns boolean language sql stable security definer set search_path=public as $$
  select public.is_budget_admin() or exists (
    select 1 from public.budget_role_members m join public.budget_role_scopes s on s.role_id=m.role_id
    where m.profile_id=auth.uid() and s.budget_id=p_budget and s.can_view
  );
$$;
create or replace function public.budget_can_edit(p_budget uuid) returns boolean language sql stable security definer set search_path=public as $$
  select public.is_budget_admin() or exists (
    select 1 from public.budget_role_members m join public.budget_role_scopes s on s.role_id=m.role_id
    where m.profile_id=auth.uid() and s.budget_id=p_budget and s.can_edit
  );
$$;
create or replace function public.budget_has_any_access() returns boolean language sql stable security definer set search_path=public as $$
  select public.is_budget_admin() or exists (select 1 from public.budget_role_members where profile_id=auth.uid());
$$;

create table if not exists public.managed_budget_lines (
  id uuid primary key default gen_random_uuid(), budget_id uuid not null references public.budget_catalog(id) on delete cascade,
  name text not null check(length(btrim(name)) between 2 and 120), caption text, allocated numeric(14,2) not null default 0 check(allocated>=0),
  accent text not null default '#3C5A8A', active boolean not null default true, sort_order int not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.managed_budget_expenses (
  id uuid primary key default gen_random_uuid(), budget_id uuid not null references public.budget_catalog(id) on delete cascade,
  line_id uuid not null references public.managed_budget_lines(id), description text not null, supplier text, amount numeric(14,2) not null check(amount>0),
  spent_on date not null default current_date, notes text, created_at timestamptz not null default now(), created_by uuid default auth.uid()
);

alter table public.budget_catalog enable row level security;
alter table public.budget_roles enable row level security;
alter table public.budget_role_scopes enable row level security;
alter table public.budget_role_members enable row level security;
alter table public.managed_budget_lines enable row level security;
alter table public.managed_budget_expenses enable row level security;
create policy budget_catalog_read on public.budget_catalog for select to authenticated using (public.budget_can_view(id));
create policy budget_catalog_admin on public.budget_catalog for all to authenticated using (public.is_budget_admin()) with check (public.is_budget_admin());
create policy budget_roles_admin on public.budget_roles for all to authenticated using (public.is_budget_admin()) with check (public.is_budget_admin());
create policy budget_scopes_admin on public.budget_role_scopes for all to authenticated using (public.is_budget_admin()) with check (public.is_budget_admin());
create policy budget_members_admin on public.budget_role_members for all to authenticated using (public.is_budget_admin()) with check (public.is_budget_admin());
create policy managed_lines_read on public.managed_budget_lines for select to authenticated using (public.budget_can_view(budget_id));
create policy managed_lines_write on public.managed_budget_lines for all to authenticated using (public.budget_can_edit(budget_id)) with check (public.budget_can_edit(budget_id));
create policy managed_expenses_read on public.managed_budget_expenses for select to authenticated using (public.budget_can_view(budget_id));
create policy managed_expenses_write on public.managed_budget_expenses for all to authenticated using (public.budget_can_edit(budget_id)) with check (public.budget_can_edit(budget_id));

grant execute on function public.budget_has_any_access(), public.budget_can_view(uuid), public.budget_can_edit(uuid) to authenticated;
