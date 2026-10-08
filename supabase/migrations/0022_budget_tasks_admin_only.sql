-- ═══════════════════════════════════════════════════════════════════
-- Budget Management (all three schools) and Task Manager: only Owner,
-- Super Admin and Admin. Run once in the Supabase SQL Editor, AFTER
-- 0021. Rieseguibile.
--
-- it.budget (H-IS Venezia), vi.budget (H-IS Vicenza), ro.budget
-- (H-IS Rosà) and it.tasks become ADMIN-ONLY permissions:
--   - Owner, Super Admin and Admin always have them;
--   - no other role can have them, even if a row exists in
--     role_permissions or someone tries to grant them from
--     "Permessi ruoli" (refused);
--   - the rows given before (e.g. office.hvi → vi.budget,
--     office.hro → ro.budget) are removed.
-- Every data policy on budget and tasks already goes through
-- has_permission(), so the rule applies to the database too, not only
-- to the menu.
--
-- NOTE: 0017 redefines has_permission / my_permissions /
-- admin_set_role_permission: if you re-run 0017, re-run this file after.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.admin_only_permissions()
returns text[]
language sql
immutable
as $$
  select array['it.budget', 'vi.budget', 'ro.budget', 'it.tasks'];
$$;

-- Does the current session have this permission? (MFA rule included.)
create or replace function public.has_permission(p_perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.mfa_ok() and (
    public.my_role() in ('owner', 'superadmin')
    or case
         when p_perm = any (public.admin_only_permissions()) then public.my_role() = 'admin'
         else exists (select 1 from public.role_permissions rp where rp.role = public.my_role() and rp.perm = p_perm)
       end
  );
$$;

-- For the pages (navigation): the permissions of my role.
create or replace function public.my_permissions()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.my_role() in ('owner', 'superadmin') then public.permission_keys()
    else coalesce((
      select array_agg(distinct p order by p) from (
        select rp.perm as p from public.role_permissions rp
         where rp.role = public.my_role() and not (rp.perm = any (public.admin_only_permissions()))
        union all
        select unnest(public.admin_only_permissions()) where public.my_role() = 'admin'
      ) x
    ), '{}')
  end;
$$;

create or replace function public.admin_set_role_permission(p_role text, p_perm text, p_allowed boolean)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text := lower(btrim(coalesce(p_role, '')));
  v_had boolean;
  v_email text;
begin
  if not public.is_superadmin() then
    raise exception 'Only an Owner or a Super Admin can change permissions' using errcode = '42501';
  end if;
  if not (v_role = any (public.configurable_roles())) then
    raise exception 'The permissions of role % cannot be changed', p_role using errcode = '22023';
  end if;
  if not (p_perm = any (public.permission_keys())) then
    raise exception 'Unknown permission: %', p_perm using errcode = '22023';
  end if;
  if p_perm = any (public.admin_only_permissions()) then
    raise exception 'Budget Management e Task Manager sono riservati a Owner, Super Admin e Admin' using errcode = '42501';
  end if;
  select exists (select 1 from public.role_permissions where role = v_role and perm = p_perm) into v_had;
  select u.email into v_email from auth.users u where u.id = auth.uid();
  if coalesce(p_allowed, false) then
    insert into public.role_permissions (role, perm, updated_at, updated_by) values (v_role, p_perm, now(), v_email)
    on conflict (role, perm) do update set updated_at = now(), updated_by = excluded.updated_by;
  else
    delete from public.role_permissions where role = v_role and perm = p_perm;
  end if;
  if v_had is distinct from coalesce(p_allowed, false) then
    perform public.audit_write('permission_changed', 'role', v_role, v_role,
      jsonb_build_object('permission', p_perm, 'allowed', coalesce(p_allowed, false)));
  end if;
end;
$$;

-- Clean up: only admin keeps rows for these permissions.
delete from public.role_permissions
 where perm = any (public.admin_only_permissions()) and role <> 'admin';
insert into public.role_permissions (role, perm)
select 'admin', p from unnest(public.admin_only_permissions()) p
on conflict (role, perm) do nothing;

revoke execute on function public.admin_only_permissions() from public, anon;
grant execute on function public.admin_only_permissions(), public.has_permission(text), public.my_permissions() to authenticated;
