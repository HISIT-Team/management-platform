-- ═══════════════════════════════════════════════════════════════════
-- MFA (TOTP authenticator app) required per role.
-- Run once in the Supabase SQL Editor, AFTER 0014. Rieseguibile.
-- NOTE: 0016 redefines mfa_ok() and admin_reset_mfa(): if you re-run this
-- file, re-run 0016 afterwards.
--
-- • mfa_role_policy: which roles must use the second factor. Changed
--   only by a Super Admin from Gestione Backend → Sicurezza (every change
--   is written to audit_log). All roles start NOT required: turn them on
--   from the page once you have set up your own authenticator.
-- • Enforced in the database, not only in the pages: when a role requires
--   MFA, is_it_staff() / is_superadmin() are false until the session has
--   passed the second factor (JWT claim aal = 'aal2'), so IT data, budget,
--   tasks, device history and user management stay closed to a password
--   alone — even calling Supabase directly.
-- • Lost phone: a Super Admin resets the user's MFA from Gestione Utenti;
--   if YOU lose it, run in the SQL Editor:
--     delete from auth.mfa_factors where user_id =
--       (select id from auth.users where email = 'your.name@h-farmschool.com');
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.mfa_role_policy (
  role        text primary key,
  required    boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  text
);
insert into public.mfa_role_policy (role)
select r from unnest(array['superadmin', 'admin', 'it', 'hr', 'boarding', 'office', 'parent']) as r
on conflict (role) do nothing;

alter table public.mfa_role_policy enable row level security;
drop policy if exists mfa_role_policy_select on public.mfa_role_policy;
create policy mfa_role_policy_select on public.mfa_role_policy
  for select to authenticated using (true);          -- not sensitive: which roles need MFA
revoke insert, update, delete on public.mfa_role_policy from anon, authenticated;

create or replace function public.role_requires_mfa(p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select m.required from public.mfa_role_policy m where m.role = lower(btrim(coalesce(p_role, '')))), false);
$$;

-- Has the current session passed the second factor (or does it not need to)?
create or replace function public.mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not public.role_requires_mfa((select p.role from public.profiles p where p.id = auth.uid()));
$$;

-- For the pages: must I complete MFA?
create or replace function public.mfa_required_for_me()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.role_requires_mfa((select p.role from public.profiles p where p.id = auth.uid()));
$$;

-- ─── Role checks now also require MFA when the role demands it ─────
create or replace function public.is_it_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('it', 'admin', 'superadmin')
  ) and public.mfa_ok();
$$;

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
  ) and public.mfa_ok();
$$;

revoke execute on function public.role_requires_mfa(text), public.mfa_ok(), public.mfa_required_for_me(),
                          public.is_it_staff(), public.is_superadmin() from anon, public;
grant execute on function public.role_requires_mfa(text), public.mfa_ok(), public.mfa_required_for_me(),
                          public.is_it_staff(), public.is_superadmin() to authenticated;

-- ─── Super Admin: policy per role ─────────────────────────────────
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

-- ─── Super Admin: reset a user's MFA (lost phone) ─────────────────
create or replace function public.admin_reset_mfa(p_id uuid)
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  n int;
  v_email text;
begin
  if not public.is_superadmin() then
    raise exception 'Only a Super Admin can reset MFA' using errcode = '42501';
  end if;
  select u.email into v_email from auth.users u where u.id = p_id;
  if v_email is null then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  delete from auth.mfa_factors where user_id = p_id;
  get diagnostics n = row_count;
  perform public.audit_write('mfa_reset', 'user', p_id::text, v_email, jsonb_build_object('factors_removed', n));
  return n;
end;
$$;

-- ─── Gestione Utenti: add the MFA status column ───────────────────
drop function if exists public.admin_list_users();
create function public.admin_list_users()
returns table (
  id uuid, email text, first_name text, last_name text, role text,
  created_at timestamptz, last_sign_in_at timestamptz, email_confirmed_at timestamptz,
  has_profile boolean, mfa_enabled boolean
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
    select u.id, u.email::text, p.first_name::text, p.last_name::text,
           coalesce(nullif(lower(btrim(p.role)), ''), 'guest')::text,
           u.created_at, u.last_sign_in_at, u.email_confirmed_at, (p.id is not null),
           exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified')
    from auth.users u
    left join public.profiles p on p.id = u.id
    order by u.created_at desc;
end;
$$;

revoke all on function public.admin_set_mfa_policy(text, boolean), public.admin_reset_mfa(uuid), public.admin_list_users() from public, anon;
grant execute on function public.admin_set_mfa_policy(text, boolean), public.admin_reset_mfa(uuid), public.admin_list_users() to authenticated;
