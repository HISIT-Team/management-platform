-- ═══════════════════════════════════════════════════════════════════
-- Fix: first/last name typed in the sign-up form were not saved in
-- `profiles` (they live in auth.users.raw_user_meta_data, but the
-- profile row is created without them). Run once in the SQL Editor,
-- AFTER 0007 and 0008. Rieseguibile senza effetti collaterali.
--
-- 1. The 0007 trigger now also fills first_name / last_name from the
--    sign-up data whenever a profile is created without them.
-- 2. Existing profiles with an empty name are filled the same way.
-- ═══════════════════════════════════════════════════════════════════

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
    -- Role: new accounts are guests (see 0007).
    if caller is not null and not (caller_is_superadmin and new.id <> caller) then
      new.role := 'guest';
    elsif new.role is null or btrim(new.role) = '' or lower(new.role) = 'parent' then
      new.role := 'guest';
    end if;

    -- Names: take them from the sign-up form if the row has none.
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

  -- UPDATE (unchanged from 0007)
  if caller is not null and not caller_is_superadmin and new.role is distinct from old.role then
    new.role := old.role;
  end if;
  if caller is not null and caller <> old.id and new.email is distinct from old.email then
    new.email := old.email;
  end if;
  return new;
end;
$$;

-- Backfill profiles created so far without a name.
update public.profiles p
set first_name = coalesce(nullif(btrim(coalesce(p.first_name, '')), ''), nullif(btrim(u.raw_user_meta_data ->> 'first_name'), '')),
    last_name  = coalesce(nullif(btrim(coalesce(p.last_name, '')), ''), nullif(btrim(u.raw_user_meta_data ->> 'last_name'), ''))
from auth.users u
where u.id = p.id
  and (nullif(btrim(coalesce(p.first_name, '')), '') is null or nullif(btrim(coalesce(p.last_name, '')), '') is null)
  and (u.raw_user_meta_data ->> 'first_name' is not null or u.raw_user_meta_data ->> 'last_name' is not null);
