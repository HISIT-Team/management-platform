-- ═══════════════════════════════════════════════════════════════════
-- Sessions, "remember this device" for MFA, admin-only IT sections.
-- Run once in the Supabase SQL Editor, AFTER 0015. Rieseguibile.
-- NOTE: 0017 (Owner + permissions) redefines several functions and policies
-- of this file: if you re-run it, re-run 0017 afterwards.
--
-- 1. Inactivity timeout per role (minutes, 5–1440, default 60), set by a
--    Super Admin in Gestione Backend → Sicurezza. Stored in
--    mfa_role_policy.idle_minutes; the browser reads my_idle_minutes().
--
-- 2. "Ricorda questo dispositivo": after passing the authenticator code
--    a browser can be trusted for N hours (platform_settings
--    'mfa_remember_hours', default 24, 0 = feature off). The browser keeps
--    a random token and sends it as the x-mfa-device header; here only its
--    SHA-256 is stored. mfa_ok() accepts a session that is aal2 OR comes
--    from a trusted browser of the same user, so the rule still holds in
--    the database and in the Edge Functions, not only in the pages.
--    The password is still required at every login.
--    Revoked by: the user (My profile → Dimentica i dispositivi), a Super
--    Admin (Gestione Utenti → Azzera MFA), lowering the hours setting, or
--    expiry. Every trust / revoke is written to audit_log.
--
-- 3. IT Budget Management and Task Manager: admin and superadmin only
--    (the IT role keeps check-in/out, registries and device history).
--    New is_platform_admin(); budget and task tables switch to it.
--    NOTE: 0001 and 0003 still create their policies with is_it_staff():
--    if you ever re-run them, re-run this file afterwards.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. Inactivity timeout per role ────────────────────────────────
alter table public.mfa_role_policy
  add column if not exists idle_minutes integer not null default 60;
alter table public.mfa_role_policy drop constraint if exists mfa_role_policy_idle_minutes_check;
alter table public.mfa_role_policy
  add constraint mfa_role_policy_idle_minutes_check check (idle_minutes between 5 and 1440);

insert into public.mfa_role_policy (role) values ('guest') on conflict (role) do nothing;

create or replace function public.my_idle_minutes()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select m.idle_minutes from public.mfa_role_policy m
      where m.role = coalesce(nullif(lower(btrim((select p.role from public.profiles p where p.id = auth.uid()))), ''), 'guest')),
    60);
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

-- ─── 2. Platform settings (key → integer) ──────────────────────────
create table if not exists public.platform_settings (
  key         text primary key,
  int_value   integer not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);
insert into public.platform_settings (key, int_value) values ('mfa_remember_hours', 24)
on conflict (key) do nothing;

alter table public.platform_settings enable row level security;
drop policy if exists platform_settings_select on public.platform_settings;
create policy platform_settings_select on public.platform_settings
  for select to authenticated using (true);           -- not sensitive
revoke insert, update, delete on public.platform_settings from anon, authenticated;

create or replace function public.mfa_remember_hours()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select s.int_value from public.platform_settings s where s.key = 'mfa_remember_hours'), 24);
$$;

create or replace function public.admin_set_mfa_remember_hours(p_hours integer)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_old integer := public.mfa_remember_hours();
  v_email text;
begin
  if not public.is_superadmin() then
    raise exception 'Only a Super Admin can change this setting' using errcode = '42501';
  end if;
  if p_hours is null or p_hours < 0 or p_hours > 720 then
    raise exception 'Hours must be between 0 and 720' using errcode = '22023';
  end if;
  select u.email into v_email from auth.users u where u.id = auth.uid();
  insert into public.platform_settings (key, int_value, updated_at, updated_by)
  values ('mfa_remember_hours', p_hours, now(), v_email)
  on conflict (key) do update set int_value = excluded.int_value, updated_at = now(), updated_by = excluded.updated_by;
  if v_old is distinct from p_hours then
    perform public.audit_write('mfa_remember_changed', 'setting', 'mfa_remember_hours', 'Ricorda dispositivo (ore)',
      jsonb_build_object('from', v_old, 'to', p_hours));
  end if;
end;
$$;

-- ─── 2b. Trusted browsers ──────────────────────────────────────────
create table if not exists public.mfa_trusted_devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  token_hash    text not null unique,
  label         text,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);
create index if not exists mfa_trusted_devices_user_idx on public.mfa_trusted_devices (user_id);

-- No policies: only the SECURITY DEFINER functions below touch it.
alter table public.mfa_trusted_devices enable row level security;
revoke all on public.mfa_trusted_devices from anon, authenticated;

-- SHA-256 (hex) of the x-mfa-device header of the current request, or null.
create or replace function public.mfa_device_header_hash()
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_headers text := current_setting('request.headers', true);
  v_token text;
begin
  if v_headers is null or v_headers = '' then
    return null;
  end if;
  v_token := (v_headers::json) ->> 'x-mfa-device';
  if v_token is null or length(v_token) < 32 or length(v_token) > 200 then
    return null;
  end if;
  return encode(sha256(convert_to(v_token, 'UTF8')), 'hex');
exception when others then
  return null;
end;
$$;

-- Is this request coming from a browser the user trusted (and still valid)?
create or replace function public.mfa_device_trusted()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.mfa_remember_hours() > 0
     and exists (
       select 1 from public.mfa_trusted_devices d
        where d.user_id = auth.uid()
          and d.token_hash = public.mfa_device_header_hash()
          and d.expires_at > now()
          -- lowering the setting shortens browsers already trusted
          and d.created_at + make_interval(hours => public.mfa_remember_hours()) > now()
     );
$$;

-- Second factor passed in this session, or trusted browser, or not required.
create or replace function public.mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not public.role_requires_mfa((select p.role from public.profiles p where p.id = auth.uid()))
      or public.mfa_device_trusted();
$$;

-- Trust the current browser. Only right after the code was entered (aal2).
create or replace function public.mfa_trust_device(p_token text, p_label text default null)
returns timestamptz
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_hours integer := public.mfa_remember_hours();
  v_exp timestamptz;
  v_email text;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'Enter the authenticator code first' using errcode = '42501';
  end if;
  if v_hours <= 0 then
    raise exception 'Remember this device is turned off' using errcode = '22023';
  end if;
  if p_token is null or length(p_token) < 32 or length(p_token) > 200 then
    raise exception 'Invalid device token' using errcode = '22023';
  end if;
  v_exp := now() + make_interval(hours => v_hours);

  delete from public.mfa_trusted_devices where user_id = v_uid and expires_at <= now();
  -- keep at most 10 browsers per user
  delete from public.mfa_trusted_devices
   where id in (select id from public.mfa_trusted_devices where user_id = v_uid
                 order by created_at desc offset 9);
  insert into public.mfa_trusted_devices (user_id, token_hash, label, expires_at)
  values (v_uid, encode(sha256(convert_to(p_token, 'UTF8')), 'hex'), left(p_label, 200), v_exp)
  on conflict (token_hash) do update set expires_at = excluded.expires_at, created_at = now();

  select u.email into v_email from auth.users u where u.id = v_uid;
  perform public.audit_write('mfa_device_trusted', 'user', v_uid::text, v_email,
    jsonb_build_object('hours', v_hours, 'device', left(p_label, 200)));
  return v_exp;
end;
$$;

-- Forget all my trusted browsers.
create or replace function public.mfa_forget_my_devices()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  n int;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  delete from public.mfa_trusted_devices where user_id = auth.uid();
  get diagnostics n = row_count;
  if n > 0 then
    select u.email into v_email from auth.users u where u.id = auth.uid();
    perform public.audit_write('mfa_devices_forgotten', 'user', auth.uid()::text, v_email, jsonb_build_object('devices', n));
  end if;
  return n;
end;
$$;

-- How many browsers I trusted (for My profile).
create or replace function public.mfa_my_devices_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.mfa_trusted_devices
   where user_id = auth.uid() and expires_at > now()
     and created_at + make_interval(hours => public.mfa_remember_hours()) > now();
$$;

-- Super Admin reset (lost phone) also forgets the user's trusted browsers.
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

-- ─── 3. Admin-only sections: IT Budget and Task Manager ────────────
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'superadmin')
  ) and public.mfa_ok();
$$;

do $$
declare
  t text;
begin
  foreach t in array array['it_budget_expenses', 'it_task_groups', 'it_task_members', 'it_tasks', 'it_subtasks'] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_platform_admin())', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_platform_admin())', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin())', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_platform_admin())', t || '_delete', t);
  end loop;
end;
$$;

-- ─── Grants ────────────────────────────────────────────────────────
revoke execute on function
  public.my_idle_minutes(), public.admin_set_idle_timeout(text, integer),
  public.mfa_remember_hours(), public.admin_set_mfa_remember_hours(integer),
  public.mfa_device_header_hash(), public.mfa_device_trusted(), public.mfa_ok(),
  public.mfa_trust_device(text, text), public.mfa_forget_my_devices(), public.mfa_my_devices_count(),
  public.admin_reset_mfa(uuid), public.is_platform_admin()
from public, anon;
grant execute on function
  public.my_idle_minutes(), public.admin_set_idle_timeout(text, integer),
  public.mfa_remember_hours(), public.admin_set_mfa_remember_hours(integer),
  public.mfa_device_header_hash(), public.mfa_device_trusted(), public.mfa_ok(),
  public.mfa_trust_device(text, text), public.mfa_forget_my_devices(), public.mfa_my_devices_count(),
  public.admin_reset_mfa(uuid), public.is_platform_admin()
to authenticated;
