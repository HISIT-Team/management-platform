-- Budget-specific access management.  These roles deliberately sit outside
-- the platform's global roles: a colleague may see or edit only Marketing
-- (for example), without gaining access to IT, HR, or the rest of the app.
-- Run after 0026.

create or replace function public.budget_access_list(p_budget uuid)
returns table(
  role_id uuid,
  role_name text,
  profile_id uuid,
  email text,
  first_name text,
  last_name text,
  can_edit boolean
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_budget_admin() then
    raise exception 'Budget administrator required' using errcode = '42501';
  end if;
  return query
    select r.id, r.name, p.id, p.email, p.first_name, p.last_name, s.can_edit
    from public.budget_role_scopes s
    join public.budget_roles r on r.id = s.role_id
    join public.budget_role_members m on m.role_id = r.id
    join public.profiles p on p.id = m.profile_id
    where s.budget_id = p_budget
    order by r.name, p.last_name, p.first_name, p.email;
end;
$$;

create or replace function public.budget_grant_access(
  p_budget uuid,
  p_role_name text,
  p_profile uuid,
  p_can_edit boolean default false
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_role_id uuid;
  v_name text := btrim(coalesce(p_role_name, ''));
begin
  if not public.is_budget_admin() then
    raise exception 'Budget administrator required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.budget_catalog where id = p_budget and active) then
    raise exception 'Budget not found' using errcode = 'P0002';
  end if;
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'Role name must contain 2 to 80 characters' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile) then
    raise exception 'Person not found' using errcode = 'P0002';
  end if;

  insert into public.budget_roles(name) values (v_name)
  on conflict (name) do nothing;
  select id into v_role_id from public.budget_roles where name = v_name;

  insert into public.budget_role_scopes(role_id, budget_id, can_view, can_edit)
  values (v_role_id, p_budget, true, coalesce(p_can_edit, false))
  on conflict (role_id, budget_id) do update
    set can_view = true, can_edit = excluded.can_edit;
  insert into public.budget_role_members(role_id, profile_id)
  values (v_role_id, p_profile)
  on conflict do nothing;
end;
$$;

grant execute on function public.budget_access_list(uuid), public.budget_grant_access(uuid, text, uuid, boolean) to authenticated;
