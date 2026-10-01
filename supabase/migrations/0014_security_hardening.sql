-- ═══════════════════════════════════════════════════════════════════
-- Security & GDPR hardening (audit 2026-10-02). Run once in the Supabase
-- SQL Editor, AFTER 0013. Rieseguibile senza effetti collaterali.
--
-- 1. audit_log — who did what on users, roles and device records
--    (accountability, GDPR art. 5.2 / 32). Written only by triggers,
--    readable only by Super Admins, never editable from the platform.
-- 2. profiles.email can no longer be changed by the user from the browser
--    (it mirrors the login email: it changes only through the confirmed
--    email-change flow or the Supabase dashboard). Gestione Utenti now
--    always shows the real login email.
-- 3. Retention: purge_device_log_signatures(months) removes signatures
--    older than N months from the device history. Schedule it once the
--    retention period is decided (see the commented cron at the end).
-- 4. Duplicate RLS policies on profiles removed (same rules, two names).
-- 5. is_it_staff() re-asserted with 'superadmin'. If you ever re-run an
--    older migration (0001/0003/0005), run this file again afterwards.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 0. IT staff check includes Super Admin (re-asserted here because
--        0001/0003/0005 define the same function without it: re-running
--        one of those files would otherwise lock Super Admins out of IT).
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
  );
$$;

-- Role checks are meaningless for visitors who are not signed in.
revoke execute on function public.is_it_staff() from anon, public;
grant execute on function public.is_it_staff() to authenticated;
do $$ begin
  revoke execute on function public.is_superadmin() from anon, public;
  grant execute on function public.is_superadmin() to authenticated;
exception when undefined_function then null; end $$;

-- ─── 1. Audit log ─────────────────────────────────────────────────
create table if not exists public.audit_log (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  actor_id     uuid,
  actor_email  text,
  action       text not null,
  target_type  text not null,
  target_id    text,
  target_label text,
  details      jsonb not null default '{}'::jsonb
);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
create index if not exists audit_log_target_idx  on public.audit_log (target_type, target_id);

alter table public.audit_log enable row level security;
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select to authenticated using (public.is_superadmin());
-- No insert/update/delete policies: rows come only from the triggers below.
revoke insert, update, delete on public.audit_log from anon, authenticated;

create or replace function public.audit_write(p_action text, p_type text, p_id text, p_label text, p_details jsonb)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_email text;
begin
  if v_actor is not null then
    select u.email into v_email from auth.users u where u.id = v_actor;
  end if;
  insert into public.audit_log (actor_id, actor_email, action, target_type, target_id, target_label, details)
  values (v_actor, coalesce(v_email, 'Supabase (dashboard / sistema)'), p_action, p_type, p_id, p_label, coalesce(p_details, '{}'::jsonb));
end;
$$;
revoke all on function public.audit_write(text, text, text, text, jsonb) from public, anon, authenticated;

-- Profiles: role changes, edits made by someone else, deletions.
create or replace function public.audit_profiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.audit_write('user_deleted', 'user', old.id::text, old.email,
      jsonb_build_object('role', old.role, 'first_name', old.first_name, 'last_name', old.last_name));
    return old;
  end if;
  if new.role is distinct from old.role then
    perform public.audit_write('role_changed', 'user', new.id::text, new.email,
      jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  if (new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name)
     and auth.uid() is distinct from new.id then
    perform public.audit_write('user_edited', 'user', new.id::text, new.email,
      jsonb_build_object('from', jsonb_build_object('first_name', old.first_name, 'last_name', old.last_name),
                         'to',   jsonb_build_object('first_name', new.first_name, 'last_name', new.last_name)));
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit
  after update or delete on public.profiles
  for each row execute function public.audit_profiles();

-- Device history: deleted records.
create or replace function public.audit_device_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.audit_write('device_record_deleted', 'device_record', old.id::text, old.student_email,
    jsonb_build_object('operation', old.operation, 'recorded_at', old.created_at,
                       'macbook_id', old.macbook_id, 'ipad_id', old.ipad_id, 'school', old.school));
  return old;
end;
$$;
drop trigger if exists student_device_log_audit on public.student_device_log;
create trigger student_device_log_audit
  after delete on public.student_device_log
  for each row execute function public.audit_device_log();

-- Read access for the Gestione Backend page.
create or replace function public.admin_list_audit(p_limit int default 500)
returns setof public.audit_log
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Only a Super Admin can read the audit log' using errcode = '42501';
  end if;
  return query select * from public.audit_log order by created_at desc limit least(greatest(p_limit, 1), 5000);
end;
$$;
revoke all on function public.admin_list_audit(int) from public, anon;
grant execute on function public.admin_list_audit(int) to authenticated;

-- ─── 2. profiles.email follows the login email only ───────────────
create or replace function public.profiles_role_guard()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller uuid := auth.uid();
  caller_is_superadmin boolean := false;
  meta jsonb;
begin
  if caller is not null then
    select exists (
      select 1 from public.profiles p
      where p.id = caller and lower(coalesce(p.role, '')) = 'superadmin'
    ) into caller_is_superadmin;
  end if;

  if tg_op = 'INSERT' then
    if caller is not null and not (caller_is_superadmin and new.id <> caller) then
      new.role := 'guest';
    elsif new.role is null or btrim(new.role) = '' or lower(new.role) = 'parent' then
      new.role := 'guest';
    end if;
    -- A signed-in user creating their own profile: email = their login email.
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
  if caller is not null and not caller_is_superadmin and new.role is distinct from old.role then
    new.role := old.role;
  end if;
  -- Nobody changes profiles.email from the browser (own or others'):
  -- only the email-change trigger / dashboard (no signed-in caller) can.
  if caller is not null and new.email is distinct from old.email then
    new.email := old.email;
  end if;
  return new;
end;
$$;

-- Gestione Utenti: always the real login email.
drop function if exists public.admin_list_users();
create function public.admin_list_users()
returns table (
  id uuid, email text, first_name text, last_name text, role text,
  created_at timestamptz, last_sign_in_at timestamptz, email_confirmed_at timestamptz, has_profile boolean
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
           u.created_at, u.last_sign_in_at, u.email_confirmed_at, (p.id is not null)
    from auth.users u
    left join public.profiles p on p.id = u.id
    order by u.created_at desc;
end;
$$;
revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

-- Realign any profile email that drifted from the login email.
update public.profiles p set email = u.email
from auth.users u
where u.id = p.id and p.email is distinct from u.email;

-- ─── 3. Retention of signatures in the device history ─────────────
create or replace function public.purge_device_log_signatures(p_months int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if p_months is null or p_months < 1 then
    raise exception 'p_months must be >= 1';
  end if;
  update public.student_device_log
     set signature = null
   where signature is not null
     and created_at < now() - make_interval(months => p_months);
  get diagnostics n = row_count;
  if n > 0 then
    perform public.audit_write('signatures_purged', 'device_record', null, null,
      jsonb_build_object('older_than_months', p_months, 'records', n));
  end if;
  return n;
end;
$$;
revoke all on function public.purge_device_log_signatures(int) from public, anon, authenticated;

-- Once the retention period is decided (e.g. 24 months after the end of
-- the loan), enable the daily job — Database → Extensions → pg_cron, then:
--   select cron.schedule('purge-device-signatures', '30 3 * * *',
--                        $$select public.purge_device_log_signatures(24)$$);

-- ─── 4. Duplicate policies on profiles (kept: profiles_self_*) ────
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can view own profile"   on public.profiles;
