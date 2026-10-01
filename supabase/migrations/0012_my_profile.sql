-- ═══════════════════════════════════════════════════════════════════
-- "My profile": profile picture + email change.
-- Run once in the Supabase SQL Editor. Rieseguibile senza effetti
-- collaterali.
--
-- 1. profiles.avatar — the profile picture, stored as a small image
--    (resized in the browser to 256×256, usually 10–25 KB) in data-URL
--    form. Capped at 150 KB to protect the free-plan quota.
--    Each user can change only their own (existing RLS self_update).
-- 2. When a user confirms an email change (link sent by Supabase through
--    Resend), auth.users.email changes: this trigger copies the new
--    address into profiles.email so the platform shows it everywhere.
-- ═══════════════════════════════════════════════════════════════════

alter table public.profiles add column if not exists avatar text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_avatar_size' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_avatar_size
      check (avatar is null or (avatar like 'data:image/%' and length(avatar) <= 150000));
  end if;
end;
$$;

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email();
