-- ═══════════════════════════════════════════════════════════════════
-- IT → Accessori smarriti (lost accessories). Run once in the Supabase
-- SQL Editor, AFTER 0022. Rieseguibile.
--
-- 1. New permission it.lost_accessories ("Accessori smarriti"): given
--    by default to the roles it and admin, editable from Permessi ruoli.
-- 2. Table lost_accessories_log: one row per report. By design it keeps
--    NO first or last name (students or staff) and no parent emails:
--    only who (email), student or employee, which accessories, notes.
--    Names and parent emails travel only to the Power Automate flow
--    (secret WEBHOOK_LOST_ACCESSORIES of the submit-form function).
-- 3. Read / delete with it.lost_accessories; insert only as yourself;
--    no update. Every deletion goes to the activity log.
--
-- NOTE: permission_keys() is redefined here with the full list: if you
-- re-run 0018 or 0019, re-run this file afterwards.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. Permission ─────────────────────────────────────────────────
create or replace function public.permission_keys()
returns text[]
language sql
immutable
as $$
  select array[
    'it', 'it.checkin_student', 'it.checkin_employee', 'it.history', 'it.registries', 'it.lost_accessories', 'it.budget', 'it.tasks',
    'hr', 'hr.onboarding', 'hr.offboarding', 'hr.registries',
    'boarding', 'boarding.rooms',
    'office',
    'vi.budget',
    'ro.budget'
  ];
$$;

insert into public.role_permissions (role, perm)
values ('it', 'it.lost_accessories'), ('admin', 'it.lost_accessories')
on conflict (role, perm) do nothing;

-- ─── 2. Table ──────────────────────────────────────────────────────
create table if not exists public.lost_accessories_log (
  id           uuid        primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  person_type  text        not null check (person_type in ('student', 'employee')),
  email        text        not null check (btrim(email) ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  accessories  text[]      not null check (
                 cardinality(accessories) between 1 and 4
                 and accessories <@ array['mac_charger', 'ipad_charger', 'mac_magsafe_cable', 'ipad_usbc_cable']::text[]
               ),
  notes        text        check (notes is null or length(notes) <= 1000),
  created_by   uuid        default auth.uid() references auth.users (id) on delete set null,
  created_by_name text        default public.my_display_name()
);
create index if not exists lost_accessories_created_idx on public.lost_accessories_log (created_at desc);
create index if not exists lost_accessories_email_idx   on public.lost_accessories_log (lower(email));

-- ─── 3. Access ─────────────────────────────────────────────────────
alter table public.lost_accessories_log enable row level security;

drop policy if exists lost_accessories_select on public.lost_accessories_log;
create policy lost_accessories_select on public.lost_accessories_log
  for select to authenticated using (public.has_permission('it.lost_accessories'));

drop policy if exists lost_accessories_insert on public.lost_accessories_log;
create policy lost_accessories_insert on public.lost_accessories_log
  for insert to authenticated with check (public.has_permission('it.lost_accessories') and created_by = auth.uid());

drop policy if exists lost_accessories_delete on public.lost_accessories_log;
create policy lost_accessories_delete on public.lost_accessories_log
  for delete to authenticated using (public.has_permission('it.lost_accessories'));

revoke update on public.lost_accessories_log from anon, authenticated;
grant select, insert, delete on public.lost_accessories_log to authenticated;

-- Deleted reports → activity log.
create or replace function public.audit_lost_accessories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.audit_write('lost_accessory_deleted', 'lost_accessory', old.id::text, old.email,
    jsonb_build_object('person_type', old.person_type, 'recorded_at', old.created_at, 'accessories', to_jsonb(old.accessories)));
  return old;
end;
$$;
drop trigger if exists lost_accessories_audit on public.lost_accessories_log;
create trigger lost_accessories_audit
  after delete on public.lost_accessories_log
  for each row execute function public.audit_lost_accessories();

grant execute on function public.permission_keys() to authenticated;
