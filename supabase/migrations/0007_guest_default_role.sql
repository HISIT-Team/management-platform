-- ═══════════════════════════════════════════════════════════════════
-- New users get the `guest` role (instead of `parent`) and only a
-- Super Admin can change roles. Run once in the Supabase SQL Editor,
-- BEFORE 0008. Rieseguibile senza effetti collaterali.
-- Existing users are NOT touched.
--
-- Rules enforced by a trigger on public.profiles:
--   INSERT by a signed-in user (sign-up / first login creating their own
--          profile)                     → role is always forced to 'guest'
--          (unless a superadmin is creating someone else's profile).
--   INSERT with no signed-in user (Supabase auth trigger, SQL editor,
--          Table Editor)                → empty or 'parent' becomes 'guest';
--          a role chosen explicitly in the dashboard is kept.
--   UPDATE of `role` by a signed-in user who is not superadmin → ignored
--          (role stays as it was). Changes from the Supabase dashboard /
--          SQL editor or by a superadmin are allowed.
--   UPDATE of someone else's `email` by a signed-in user → ignored
--          (the profile email mirrors the login email).
-- ═══════════════════════════════════════════════════════════════════

alter table public.profiles alter column role set default 'guest';

create or replace function public.profiles_role_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_is_superadmin boolean := false;
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
    return new;
  end if;

  -- UPDATE
  if caller is not null and not caller_is_superadmin and new.role is distinct from old.role then
    new.role := old.role;
  end if;
  if caller is not null and caller <> old.id and new.email is distinct from old.email then
    new.email := old.email;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard
  before insert or update on public.profiles
  for each row execute function public.profiles_role_guard();
