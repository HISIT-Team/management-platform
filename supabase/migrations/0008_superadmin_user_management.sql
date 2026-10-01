-- ═══════════════════════════════════════════════════════════════════
-- Super Admin role + "Gestione Backend → Gestione Utenti".
-- Run once in the Supabase SQL Editor, AFTER 0007.
-- Rieseguibile senza effetti collaterali.
--
-- The user-management page talks to the database ONLY through the
-- functions below (RPC). Each one checks that the caller is a
-- superadmin, so no new RLS policy on `profiles` is needed.
--
-- To create the first Super Admin, run in the SQL Editor:
--   update public.profiles set role = 'superadmin'
--   where email = 'your.name@h-farmschool.com';
-- ═══════════════════════════════════════════════════════════════════

-- ─── Who is a superadmin? ─────────────────────────────────────────
create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and lower(coalesce(p.role, '')) = 'superadmin'
  );
$$;

-- ─── Superadmins pass every IT check too (RLS of budget, tasks, device
--     log…). Same function as 0001/0003/0005 with 'superadmin' added:
--     if you ever re-run those older files, run this one again after.
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

-- ─── Roles that can be assigned from the page ─────────────────────
create or replace function public.platform_roles()
returns text[]
language sql
immutable
as $$
  select array['superadmin', 'admin', 'it', 'hr', 'boarding', 'office', 'parent', 'guest'];
$$;

-- ─── List every account (auth.users + profile) ────────────────────
-- Accounts that never got a profile row are listed too (role 'guest').
drop function if exists public.admin_list_users();
create function public.admin_list_users()
returns table (
  id uuid,
  email text,
  first_name text,
  last_name text,
  role text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  has_profile boolean
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Only a Super Admin can list users' using errcode = '42501';
  end if;
  return query
    select u.id,
           coalesce(p.email, u.email)::text,
           p.first_name::text,
           p.last_name::text,
           coalesce(nullif(lower(btrim(p.role)), ''), 'guest')::text,
           u.created_at,
           u.last_sign_in_at,
           u.email_confirmed_at,
           (p.id is not null)
    from auth.users u
    left join public.profiles p on p.id = u.id
    order by u.created_at desc;
end;
$$;

-- ─── Edit name / surname / role (never the email) ─────────────────
create or replace function public.admin_update_user(p_id uuid, p_first_name text, p_last_name text, p_role text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text := lower(btrim(coalesce(p_role, '')));
  v_email text;
begin
  if not public.is_superadmin() then
    raise exception 'Only a Super Admin can edit users' using errcode = '42501';
  end if;
  if not (v_role = any (public.platform_roles())) then
    raise exception 'Unknown role: %', p_role using errcode = '22023';
  end if;
  if p_id = auth.uid() and v_role <> 'superadmin' then
    raise exception 'You cannot remove your own Super Admin role' using errcode = '42501';
  end if;
  select u.email into v_email from auth.users u where u.id = p_id;
  if v_email is null then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  insert into public.profiles (id, email, first_name, last_name, role)
  values (p_id, v_email, nullif(btrim(p_first_name), ''), nullif(btrim(p_last_name), ''), v_role)
  on conflict (id) do update
    set first_name = excluded.first_name,
        last_name  = excluded.last_name,
        role       = excluded.role;
end;
$$;

-- ─── Delete an account for good (login + profile) ─────────────────
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
  delete from public.profiles where id = p_id;
  delete from auth.users where id = p_id;
end;
$$;

-- Only signed-in users may call them (the superadmin check is inside).
revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_update_user(uuid, text, text, text) from public, anon;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_update_user(uuid, text, text, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.is_superadmin() to authenticated;
