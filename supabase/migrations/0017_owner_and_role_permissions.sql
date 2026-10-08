-- ═══════════════════════════════════════════════════════════════════
-- Owner role + permissions per role ("cosa vede ogni ruolo").
-- Run once in the Supabase SQL Editor, AFTER 0016. Rieseguibile.
-- NOTE: 0022 makes budget and tasks Owner / Super Admin / Admin only:
--       if you re-run this file, re-run 0022 afterwards.
-- NOTE: 0018 extends roles, permissions and the budget policies: if you
-- re-run this file, re-run 0018 afterwards.
--
-- 1. OWNER — above Super Admin. It can do everything a Super Admin does
--    and, in addition, only an Owner can:
--      • give or take away the Owner role;
--      • edit, delete or reset the MFA of an Owner account;
--      • change the MFA / timeout rules of the Owner role.
--    There is always at least one Owner (the last one can't step down).
--    Make yourself Owner ONCE, here in the SQL Editor (the page can't,
--    by design):
--      update public.profiles set role = 'owner'
--       where id = (select id from auth.users where email = 'your.name@h-farmschool.com');
--
-- 2. PERMISSIONS — what each role can open, editable by Owner and Super
--    Admin from Gestione Backend → Permessi ruoli. Owner and Super Admin
--    always see everything (so nobody can lock themselves out); Guest
--    sees nothing. The other roles start with what they had before.
--    Enforced in the database too: device history, budget and tasks are
--    readable/writable only with the matching permission.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Roles ─────────────────────────────────────────────────────────
create or replace function public.platform_roles()
returns text[]
language sql
immutable
as $$
  select array['owner', 'superadmin', 'admin', 'it', 'hr', 'boarding', 'office', 'parent', 'guest'];
$$;

create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(lower(btrim((select p.role from public.profiles p where p.id = auth.uid()))), ''), 'guest');
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.my_role() = 'owner' and public.mfa_ok();
$$;

-- Owner counts as Super Admin everywhere.
create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.my_role() in ('superadmin', 'owner') and public.mfa_ok();
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.my_role() in ('admin', 'superadmin', 'owner') and public.mfa_ok();
$$;

insert into public.mfa_role_policy (role, required, idle_minutes)
select 'owner', m.required, m.idle_minutes from public.mfa_role_policy m where m.role = 'superadmin'
on conflict (role) do nothing;
insert into public.mfa_role_policy (role) values ('owner') on conflict (role) do nothing;

-- ─── Permissions ───────────────────────────────────────────────────
create or replace function public.permission_keys()
returns text[]
language sql
immutable
as $$
  select array[
    'it', 'it.checkin_student', 'it.checkin_employee', 'it.history', 'it.registries', 'it.budget', 'it.tasks',
    'hr', 'hr.onboarding', 'hr.offboarding', 'hr.registries',
    'boarding', 'boarding.rooms',
    'office'
  ];
$$;

-- Roles whose permissions can be edited (Owner / Super Admin: all; Guest: none).
create or replace function public.configurable_roles()
returns text[]
language sql
immutable
as $$
  select array['admin', 'it', 'hr', 'boarding', 'office', 'parent'];
$$;

create table if not exists public.role_permissions (
  role        text not null,
  perm        text not null,
  updated_at  timestamptz not null default now(),
  updated_by  text,
  primary key (role, perm)
);
alter table public.role_permissions enable row level security;
drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions
  for select to authenticated using (true);          -- not sensitive: which role sees which section
revoke insert, update, delete on public.role_permissions from anon, authenticated;

-- Defaults = what each role could open before this migration.
insert into public.role_permissions (role, perm)
select r, p from (values
  ('admin', 'it'), ('admin', 'it.checkin_student'), ('admin', 'it.checkin_employee'), ('admin', 'it.history'),
  ('admin', 'it.registries'), ('admin', 'it.budget'), ('admin', 'it.tasks'),
  ('admin', 'hr'), ('admin', 'hr.onboarding'), ('admin', 'hr.offboarding'), ('admin', 'hr.registries'),
  ('admin', 'boarding'), ('admin', 'boarding.rooms'), ('admin', 'office'),
  ('it', 'it'), ('it', 'it.checkin_student'), ('it', 'it.checkin_employee'), ('it', 'it.history'), ('it', 'it.registries'),
  ('hr', 'hr'), ('hr', 'hr.onboarding'), ('hr', 'hr.offboarding'), ('hr', 'hr.registries'),
  ('boarding', 'boarding'), ('boarding', 'boarding.rooms'),
  ('office', 'office')
) as d(r, p)
on conflict (role, perm) do nothing;

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
    or exists (select 1 from public.role_permissions rp where rp.role = public.my_role() and rp.perm = p_perm)
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
    else coalesce((select array_agg(rp.perm order by rp.perm) from public.role_permissions rp where rp.role = public.my_role()), '{}')
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

-- ─── Data access by permission ─────────────────────────────────────
-- Kept for compatibility (older policies / functions call it).
create or replace function public.is_it_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('it');
$$;

-- Device history: read / delete with "Storico assegnazioni", write with the student form.
drop policy if exists student_device_log_select on public.student_device_log;
create policy student_device_log_select on public.student_device_log
  for select to authenticated using (public.has_permission('it.history'));
drop policy if exists student_device_log_insert on public.student_device_log;
create policy student_device_log_insert on public.student_device_log
  for insert to authenticated with check (public.has_permission('it.checkin_student') and created_by = auth.uid());
drop policy if exists student_device_log_delete on public.student_device_log;
create policy student_device_log_delete on public.student_device_log
  for delete to authenticated using (public.has_permission('it.history'));

do $$
declare
  t text;
  k text;
begin
  foreach t in array array['it_budget_expenses', 'it_task_groups', 'it_task_members', 'it_tasks', 'it_subtasks'] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    k := case when t = 'it_budget_expenses' then 'it.budget' else 'it.tasks' end;
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.has_permission(%L))', t || '_select', t, k);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_permission(%L))', t || '_insert', t, k);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.has_permission(%L)) with check (public.has_permission(%L))', t || '_update', t, k, k);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.has_permission(%L))', t || '_delete', t, k);
  end loop;
end;
$$;

-- ─── Profile triggers: Owner protection ────────────────────────────
create or replace function public.profiles_role_guard()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller uuid := auth.uid();
  caller_role text := '';
  caller_is_top boolean := false;
  meta jsonb;
begin
  if caller is not null then
    select lower(coalesce(p.role, '')) into caller_role from public.profiles p where p.id = caller;
    caller_is_top := coalesce(caller_role, '') in ('superadmin', 'owner');
  end if;

  if tg_op = 'INSERT' then
    if caller is not null and not (caller_is_top and new.id <> caller) then
      new.role := 'guest';
    elsif new.role is null or btrim(new.role) = '' or lower(new.role) = 'parent' then
      new.role := 'guest';
    end if;
    -- Only an Owner (or the SQL Editor) creates an Owner.
    if caller is not null and lower(coalesce(new.role, '')) = 'owner' and caller_role <> 'owner' then
      new.role := 'guest';
    end if;
    if caller is not null and new.id = caller then
      select u.email into new.email from auth.users u where u.id = caller;
    end if;
    if nullif(btrim(coalesce(new.first_name, '')), '') is null
       or nullif(btrim(coalesce(new.last_name, '')), '') is null then
      select u.raw_user_meta_data into meta from auth.users u where u.id = new.id;
      if meta is not null then
        new.first_name := coalesce(nullif(btrim(coalesce(new.first_name, '')), ''), nullif(btrim(meta ->> 'first_name'), ''));
        new.last_name  := coalesce(nullif(btrim(coalesce(new.last_name, '')), ''), nullif(btrim(meta ->> 'last_name'), ''));
      end if;
    end if;
    return new;
  end if;

  -- UPDATE
  if caller is not null and not caller_is_top and new.role is distinct from old.role then
    new.role := old.role;
  end if;
  -- Owner role given or taken away: Owners only.
  if caller is not null and caller_role <> 'owner' and new.role is distinct from old.role
     and (lower(coalesce(old.role, '')) = 'owner' or lower(coalesce(new.role, '')) = 'owner') then
    new.role := old.role;
  end if;
  if caller is not null and new.email is distinct from old.email then
    new.email := old.email;
  end if;
  return new;
end;
$$;

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  jwt_role text := coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '');
begin
  -- service_role / SQL editor / GoTrue: no restriction
  if jwt_role not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.role is distinct from old.role
     and (lower(coalesce(old.role, '')) = 'owner' or lower(coalesce(new.role, '')) = 'owner')
     and not public.is_owner() then
    raise exception 'Only an Owner can give or remove the Owner role' using errcode = '42501';
  end if;

  -- Super Admin / Owner: may choose the role of other users' profiles
  if public.is_superadmin() and (tg_op = 'UPDATE' or new.id <> auth.uid()) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role := null;               -- profiles_role_guard then makes it 'guest'
  elsif new.role is distinct from old.role then
    raise exception 'role cannot be changed from the client';
  end if;
  return new;
end;
$function$;

-- ─── User management with Owner protection ─────────────────────────
create or replace function public.admin_update_user(p_id uuid, p_first_name text, p_last_name text, p_role text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text := lower(btrim(coalesce(p_role, '')));
  v_email text;
  v_saved text;
  v_old text;
  v_me_owner boolean := public.is_owner();
begin
  if not public.is_superadmin() then
    raise exception 'Only a Super Admin can edit users' using errcode = '42501';
  end if;
  if not (v_role = any (public.platform_roles())) then
    raise exception 'Unknown role: %', p_role using errcode = '22023';
  end if;
  select u.email into v_email from auth.users u where u.id = p_id;
  if v_email is null then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  select lower(coalesce(role, '')) into v_old from public.profiles where id = p_id;

  if v_old = 'owner' and not v_me_owner then
    raise exception 'Only an Owner can edit an Owner account' using errcode = '42501';
  end if;
  if v_role = 'owner' and coalesce(v_old, '') <> 'owner' and not v_me_owner then
    raise exception 'Only an Owner can give the Owner role' using errcode = '42501';
  end if;
  if v_old = 'owner' and v_role <> 'owner'
     and (select count(*) from public.profiles where lower(coalesce(role, '')) = 'owner') <= 1 then
    raise exception 'There must always be at least one Owner' using errcode = '42501';
  end if;
  if p_id = auth.uid() and not v_me_owner and v_role <> 'superadmin' then
    raise exception 'You cannot remove your own Super Admin role' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles where id = p_id) then
    update public.profiles
       set first_name = nullif(btrim(p_first_name), ''),
           last_name  = nullif(btrim(p_last_name), ''),
           role       = v_role
     where id = p_id;
  else
    insert into public.profiles (id, email, first_name, last_name, role)
    values (p_id, v_email, nullif(btrim(p_first_name), ''), nullif(btrim(p_last_name), ''), v_role);
  end if;

  select role into v_saved from public.profiles where id = p_id;
  if v_saved is distinct from v_role then
    raise exception 'Role was not saved (still %)', coalesce(v_saved, 'empty') using errcode = '42501';
  end if;
end;
$$;

create or replace function public.admin_delete_user(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Only a Super Admin can delete users' using errcode = '42501';
  end if;
  if p_id = auth.uid() then
    raise exception 'You cannot delete your own account' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = p_id and lower(coalesce(role, '')) = 'owner') and not public.is_owner() then
    raise exception 'Only an Owner can delete an Owner account' using errcode = '42501';
  end if;
  delete from public.profiles where id = p_id;
  delete from auth.users where id = p_id;
end;
$$;

create or replace function public.admin_reset_mfa(p_id uuid)
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  n int;
  d int;
  v_email text;
begin
  if not public.is_superadmin() then
    raise exception 'Only a Super Admin can reset MFA' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = p_id and lower(coalesce(role, '')) = 'owner') and not public.is_owner() then
    raise exception 'Only an Owner can reset the MFA of an Owner' using errcode = '42501';
  end if;
  select u.email into v_email from auth.users u where u.id = p_id;
  if v_email is null then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  delete from auth.mfa_factors where user_id = p_id;
  get diagnostics n = row_count;
  delete from public.mfa_trusted_devices where user_id = p_id;
  get diagnostics d = row_count;
  perform public.audit_write('mfa_reset', 'user', p_id::text, v_email,
    jsonb_build_object('factors_removed', n, 'devices_forgotten', d));
  return n;
end;
$$;

-- Security rules of the Owner role: Owners only.
create or replace function public.admin_set_mfa_policy(p_role text, p_required boolean)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text := lower(btrim(coalesce(p_role, '')));
  v_old boolean;
  v_email text;
begin
  if not public.is_superadmin() then
    raise exception 'Only a Super Admin can change the MFA policy' using errcode = '42501';
  end if;
  if v_role = 'owner' and not public.is_owner() then
    raise exception 'Only an Owner can change the rules of the Owner role' using errcode = '42501';
  end if;
  if not exists (select 1 from public.mfa_role_policy where role = v_role) then
    raise exception 'Unknown role: %', p_role using errcode = '22023';
  end if;
  select required into v_old from public.mfa_role_policy where role = v_role;
  select u.email into v_email from auth.users u where u.id = auth.uid();
  update public.mfa_role_policy
     set required = coalesce(p_required, false), updated_at = now(), updated_by = v_email
   where role = v_role;
  if v_old is distinct from coalesce(p_required, false) then
    perform public.audit_write('mfa_policy_changed', 'role', v_role, v_role,
      jsonb_build_object('from', v_old, 'to', coalesce(p_required, false)));
  end if;
end;
$$;

create or replace function public.admin_set_idle_timeout(p_role text, p_minutes integer)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text := lower(btrim(coalesce(p_role, '')));
  v_old integer;
  v_email text;
begin
  if not public.is_superadmin() then
    raise exception 'Only a Super Admin can change the inactivity timeout' using errcode = '42501';
  end if;
  if v_role = 'owner' and not public.is_owner() then
    raise exception 'Only an Owner can change the rules of the Owner role' using errcode = '42501';
  end if;
  if p_minutes is null or p_minutes < 5 or p_minutes > 1440 then
    raise exception 'Timeout must be between 5 and 1440 minutes' using errcode = '22023';
  end if;
  select idle_minutes into v_old from public.mfa_role_policy where role = v_role;
  if not found then
    raise exception 'Unknown role: %', p_role using errcode = '22023';
  end if;
  select u.email into v_email from auth.users u where u.id = auth.uid();
  update public.mfa_role_policy
     set idle_minutes = p_minutes, updated_at = now(), updated_by = v_email
   where role = v_role;
  if v_old is distinct from p_minutes then
    perform public.audit_write('idle_timeout_changed', 'role', v_role, v_role,
      jsonb_build_object('from', v_old, 'to', p_minutes));
  end if;
end;
$$;

-- ─── Grants ────────────────────────────────────────────────────────
revoke execute on function
  public.my_role(), public.is_owner(), public.is_superadmin(), public.is_platform_admin(), public.is_it_staff(),
  public.has_permission(text), public.my_permissions(), public.admin_set_role_permission(text, text, boolean),
  public.admin_update_user(uuid, text, text, text), public.admin_delete_user(uuid), public.admin_reset_mfa(uuid),
  public.admin_set_mfa_policy(text, boolean), public.admin_set_idle_timeout(text, integer)
from public, anon;
grant execute on function
  public.my_role(), public.is_owner(), public.is_superadmin(), public.is_platform_admin(), public.is_it_staff(),
  public.has_permission(text), public.my_permissions(), public.admin_set_role_permission(text, text, boolean),
  public.admin_update_user(uuid, text, text, text), public.admin_delete_user(uuid), public.admin_reset_mfa(uuid),
  public.admin_set_mfa_policy(text, boolean), public.admin_set_idle_timeout(text, integer)
to authenticated;
grant execute on function public.platform_roles(), public.permission_keys(), public.configurable_roles() to authenticated;
