-- Direct, per-person budget access.  A scope may cover every school in a
-- budget (*) or just one of its three schools.  This replaces the UI flow
-- that asked administrators to type an arbitrary role name.

create table if not exists public.budget_person_access (
  budget_id uuid not null references public.budget_catalog(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  school_code text not null default '*',
  can_view boolean not null default true,
  can_edit boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  primary key (budget_id, profile_id, school_code),
  check (can_view or not can_edit)
);
alter table public.budget_person_access enable row level security;
drop policy if exists budget_person_access_admin on public.budget_person_access;
create policy budget_person_access_admin on public.budget_person_access
  for all to authenticated using (public.is_budget_admin()) with check (public.is_budget_admin());

create or replace function public.budget_can_view(p_budget uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_budget_admin()
    or exists (select 1 from public.budget_person_access a where a.budget_id=p_budget and a.profile_id=auth.uid() and a.can_view)
    or exists (
      select 1 from public.budget_role_members m join public.budget_role_scopes s on s.role_id=m.role_id
      where m.profile_id=auth.uid() and s.budget_id=p_budget and s.can_view
    );
$$;

create or replace function public.budget_can_edit(p_budget uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_budget_admin()
    or exists (select 1 from public.budget_person_access a where a.budget_id=p_budget and a.profile_id=auth.uid() and a.school_code='*' and a.can_edit)
    or exists (
      select 1 from public.budget_role_members m join public.budget_role_scopes s on s.role_id=m.role_id
      where m.profile_id=auth.uid() and s.budget_id=p_budget and s.can_edit
    );
$$;

create or replace function public.budget_school_can_view(p_school text)
returns boolean language sql stable security definer set search_path=public as $$
  select case lower(p_school)
    when 'venezia' then public.has_permission('it.budget')
    when 'vicenza' then public.has_permission('vi.budget')
    when 'rosa' then public.has_permission('ro.budget')
    else public.is_budget_admin()
      or exists (
        select 1 from public.budget_person_access a join public.budget_schools bs on bs.budget_id=a.budget_id
        where bs.code=lower(p_school) and a.profile_id=auth.uid() and a.can_view and a.school_code in ('*', lower(p_school))
      )
      or exists (
        select 1 from public.budget_role_members m join public.budget_role_scopes s on s.role_id=m.role_id
        where m.profile_id=auth.uid() and s.budget_id=public.budget_school_budget(p_school) and s.can_view
      )
  end;
$$;

create or replace function public.budget_school_can_edit(p_school text)
returns boolean language sql stable security definer set search_path=public as $$
  select case lower(p_school)
    when 'venezia' then public.has_permission('it.budget')
    when 'vicenza' then public.has_permission('vi.budget')
    when 'rosa' then public.has_permission('ro.budget')
    else public.is_budget_admin()
      or exists (
        select 1 from public.budget_person_access a join public.budget_schools bs on bs.budget_id=a.budget_id
        where bs.code=lower(p_school) and a.profile_id=auth.uid() and a.can_edit and a.school_code in ('*', lower(p_school))
      )
      or exists (
        select 1 from public.budget_role_members m join public.budget_role_scopes s on s.role_id=m.role_id
        where m.profile_id=auth.uid() and s.budget_id=public.budget_school_budget(p_school) and s.can_edit
      )
  end;
$$;

drop policy if exists budget_schools_read on public.budget_schools;
create policy budget_schools_read on public.budget_schools for select to authenticated using (public.budget_school_can_view(code));

drop function if exists public.budget_access_list(uuid);
create function public.budget_access_list(p_budget uuid)
returns table(profile_id uuid, email text, first_name text, last_name text, school_code text, can_edit boolean)
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_budget_admin() then raise exception 'Budget administrator required' using errcode='42501'; end if;
  return query select p.id,p.email,p.first_name,p.last_name,a.school_code,a.can_edit
    from public.budget_person_access a join public.profiles p on p.id=a.profile_id
    where a.budget_id=p_budget order by p.last_name,p.first_name,p.email,a.school_code;
end;
$$;

drop function if exists public.budget_grant_access(uuid, text, uuid, boolean);
create function public.budget_grant_access(p_budget uuid, p_profile uuid, p_can_edit boolean, p_school_code text default '*')
returns void language plpgsql security definer set search_path=public as $$
declare v_school text:=lower(btrim(coalesce(p_school_code,'*')));
begin
  if not public.is_budget_admin() then raise exception 'Budget administrator required' using errcode='42501'; end if;
  if not exists(select 1 from public.budget_catalog where id=p_budget and active) then raise exception 'Budget not found' using errcode='P0002'; end if;
  if not exists(select 1 from public.profiles where id=p_profile) then raise exception 'Person not found' using errcode='P0002'; end if;
  if v_school <> '*' and not exists(select 1 from public.budget_schools where budget_id=p_budget and code=v_school) then raise exception 'School does not belong to this budget' using errcode='22023'; end if;
  if v_school='*' then delete from public.budget_person_access where budget_id=p_budget and profile_id=p_profile;
  elsif exists(select 1 from public.budget_person_access where budget_id=p_budget and profile_id=p_profile and school_code='*') then return;
  end if;
  insert into public.budget_person_access(budget_id,profile_id,school_code,can_view,can_edit)
  values(p_budget,p_profile,v_school,true,coalesce(p_can_edit,false))
  on conflict(budget_id,profile_id,school_code) do update set can_view=true,can_edit=excluded.can_edit;
end;
$$;
grant execute on function public.budget_access_list(uuid), public.budget_grant_access(uuid,uuid,boolean,text) to authenticated;
