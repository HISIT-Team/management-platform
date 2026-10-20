-- ═══════════════════════════════════════════════════════════════════
-- Device forms: DRAFTS ("Salva come bozza"). Run once in the Supabase
-- SQL Editor, AFTER 0023. Rieseguibile.
--
-- The IT team prepares a delivery/return in advance (QR scan, devices,
-- asset IDs, photos) and saves it as a draft; when the student is there
-- the draft is opened, signed and sent.
--
-- A draft is TEMPORARY by design:
--   • it is deleted as soon as the signed form is sent — by the submit-form
--     Edge Function (server side, right after the webhook accepted the
--     form) and, as a second safety net, by the browser;
--   • it expires after 14 days anyway: expired drafts are hidden at once
--     and deleted by device_drafts_purge_expired(), which the drafts page
--     calls every time it opens (pg_cron schedule optional, see bottom);
--   • the signature is never saved in a draft.
-- While it exists a draft holds the form data (names, emails, parent
-- emails, asset IDs, photos): visible only to users with the matching
-- permission (it.checkin_student / it.checkin_employee).
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.device_form_drafts (
  id              uuid        primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '14 days',
  kind            text        not null check (kind in ('student', 'employee')),
  operation       text        not null check (operation in ('Check-in', 'Check-out')),
  -- Summary for the drafts list (so the list never downloads the photos).
  label           text        not null check (length(label) between 1 and 200),
  email           text,
  devices         text[]      not null default '{}',
  photos_count    integer     not null default 0,
  -- The form state (no signature). Capped to protect the free-plan quota.
  data            jsonb       not null check (pg_column_size(data) <= 12000000),
  created_by      uuid        default auth.uid() references auth.users (id) on delete set null,
  created_by_name text        default public.my_display_name(),
  updated_by_name text
);
create index if not exists device_form_drafts_created_idx on public.device_form_drafts (created_at desc);
create index if not exists device_form_drafts_expires_idx on public.device_form_drafts (expires_at);

-- Permission of a draft kind.
create or replace function public.device_draft_perm(p_kind text)
returns text
language sql
immutable
as $$
  select case p_kind when 'student' then 'it.checkin_student' when 'employee' then 'it.checkin_employee' else 'none' end;
$$;

alter table public.device_form_drafts enable row level security;

drop policy if exists device_drafts_select on public.device_form_drafts;
create policy device_drafts_select on public.device_form_drafts
  for select to authenticated
  using (public.has_permission(public.device_draft_perm(kind)) and expires_at > now());

drop policy if exists device_drafts_insert on public.device_form_drafts;
create policy device_drafts_insert on public.device_form_drafts
  for insert to authenticated
  with check (public.has_permission(public.device_draft_perm(kind)) and created_by = auth.uid());

drop policy if exists device_drafts_update on public.device_form_drafts;
create policy device_drafts_update on public.device_form_drafts
  for update to authenticated
  using (public.has_permission(public.device_draft_perm(kind)) and expires_at > now())
  with check (public.has_permission(public.device_draft_perm(kind)));

drop policy if exists device_drafts_delete on public.device_form_drafts;
create policy device_drafts_delete on public.device_form_drafts
  for delete to authenticated
  using (public.has_permission(public.device_draft_perm(kind)));

grant select, insert, update, delete on public.device_form_drafts to authenticated;

-- Keep updated_at / updated_by_name current; a draft can't be moved to
-- someone else or have its expiry pushed beyond 14 days from now.
create or replace function public.device_drafts_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by_name := public.my_display_name();
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.created_by_name := old.created_by_name;
  new.expires_at := least(new.expires_at, now() + interval '14 days');
  return new;
end;
$$;
drop trigger if exists device_drafts_touch on public.device_form_drafts;
create trigger device_drafts_touch
  before update on public.device_form_drafts
  for each row execute function public.device_drafts_touch();

-- Deletes expired drafts (called by the drafts page; returns how many).
create or replace function public.device_drafts_purge_expired()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.device_form_drafts where expires_at <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.device_drafts_purge_expired() from public, anon;
grant execute on function public.device_drafts_purge_expired(), public.device_draft_perm(text) to authenticated;

-- Optional: daily cleanup even when nobody opens the drafts page
-- (Database → Extensions → pg_cron, then run once):
--   select cron.schedule('purge-device-drafts', '15 3 * * *', 'select public.device_drafts_purge_expired()');
