-- ═══════════════════════════════════════════════════════════════════
-- Fix: role changes made by a Super Admin from "Gestione Utenti" were
-- silently lost. Cause: the pre-existing trigger `profiles_protect_role`
-- (function public.protect_profile_role) nulls the role on every client
-- INSERT and rejects every client role change — superadmins included —
-- and admin_update_user() used an upsert whose INSERT step went through
-- that trigger. Run once in the SQL Editor, AFTER 0009.
-- Rieseguibile senza effetti collaterali.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Same rules as before, but a Super Admin may set / change roles.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  jwt_role text := coalesce(
    current_setting('request.jwt.claims', true)::json ->> 'role',
    ''
  );
begin
  -- service_role / SQL editor / GoTrue: no restriction
  if jwt_role not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Super Admin: may choose the role of other users' profiles
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

-- 2. Edit name / surname / role: plain UPDATE when the profile exists,
--    INSERT only for accounts that never got one.
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

  -- Never report success if something silently kept the old role.
  select role into v_saved from public.profiles where id = p_id;
  if v_saved is distinct from v_role then
    raise exception 'Role was not saved (still %)', coalesce(v_saved, 'empty') using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.admin_update_user(uuid, text, text, text) from public, anon;
grant execute on function public.admin_update_user(uuid, text, text, text) to authenticated;
