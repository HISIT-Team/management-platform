-- ═══════════════════════════════════════════════════════════════════
-- Storico assegnazioni: chargers and cables. Run once in the Supabase SQL Editor,
-- AFTER 0020. Rieseguibile.
--
-- Four new columns on student_device_log: were the MacBook charger,
-- the MacBook cable, the iPad charger and the iPad cable part of the
-- delivery or of the return?
--   true  = yes, false = no, null = not recorded (records saved before
--   this migration: the form didn't keep it).
-- The form fills them from the "MacBook Charger", "MacBook Cable",
-- "iPad Charger" and "iPad Cable" tiles; they can be corrected with the
-- pencil (device_log_update now takes them too, so the old 8-argument
-- version is removed).
-- ═══════════════════════════════════════════════════════════════════

alter table public.student_device_log add column if not exists macbook_charger boolean;
alter table public.student_device_log add column if not exists ipad_charger boolean;
alter table public.student_device_log add column if not exists macbook_cable boolean;
alter table public.student_device_log add column if not exists ipad_cable boolean;

drop function if exists public.device_log_update(uuid, timestamptz, text, text, text, text, text, text);
drop function if exists public.device_log_update(uuid, timestamptz, text, text, text, text, text, text, boolean, boolean);

create or replace function public.device_log_update(
  p_id         uuid,
  p_created_at timestamptz,
  p_operation  text,
  p_email      text,
  p_school     text,
  p_macbook_id text,
  p_ipad_id    text,
  p_signed_by  text,
  p_macbook_charger boolean,
  p_ipad_charger    boolean,
  p_macbook_cable   boolean,
  p_ipad_cable      boolean
)
returns public.student_device_log
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.student_device_log;
  v_new public.student_device_log;
  v_before jsonb := '{}'::jsonb;
  v_after  jsonb := '{}'::jsonb;
  k text;
begin
  if not public.has_permission('it.history') then
    raise exception 'Non hai i permessi per modificare lo storico' using errcode = '42501';
  end if;

  if p_operation is null or p_operation not in ('Check-in', 'Check-out') then
    raise exception 'Operazione non valida';
  end if;
  if p_email is null or btrim(p_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Email studente non valida';
  end if;
  if p_created_at is null or p_created_at > now() + interval '1 day' then
    raise exception 'Data non valida';
  end if;
  if p_school is not null and p_school not in ('H-INTERNATIONAL SCHOOL SRL', 'H-INTERNATIONAL SCHOOL VICENZA SRL', 'H-INTERNATIONAL SCHOOL ROSÀ SRL') then
    raise exception 'Scuola non valida';
  end if;
  if p_signed_by is not null and p_signed_by not in ('Student', 'Parent', 'IT Support') then
    raise exception 'Firmatario non valido';
  end if;

  select * into v_old from public.student_device_log where id = p_id for update;
  if not found then
    raise exception 'Record non trovato' using errcode = 'P0002';
  end if;

  update public.student_device_log
     set created_at    = p_created_at,
         operation     = p_operation,
         student_email = btrim(p_email),
         school        = p_school,
         macbook_id    = nullif(btrim(coalesce(p_macbook_id, '')), ''),
         ipad_id       = nullif(btrim(coalesce(p_ipad_id, '')), ''),
         signed_by     = p_signed_by,
         macbook_charger = p_macbook_charger,
         ipad_charger    = p_ipad_charger,
         macbook_cable   = p_macbook_cable,
         ipad_cable      = p_ipad_cable
   where id = p_id
  returning * into v_new;

  -- Only the fields that actually changed go to the activity log.
  foreach k in array array['created_at', 'operation', 'student_email', 'school', 'macbook_id', 'ipad_id', 'signed_by', 'macbook_charger', 'ipad_charger', 'macbook_cable', 'ipad_cable'] loop
    if (to_jsonb(v_old) -> k) is distinct from (to_jsonb(v_new) -> k) then
      v_before := v_before || jsonb_build_object(k, to_jsonb(v_old) -> k);
      v_after  := v_after  || jsonb_build_object(k, to_jsonb(v_new) -> k);
    end if;
  end loop;
  if v_after <> '{}'::jsonb then
    perform public.audit_write('device_record_updated', 'device_record', p_id::text, v_new.student_email,
      jsonb_build_object('before', v_before, 'after', v_after));
  end if;

  v_new.signature := null; -- never sent back to the browser
  return v_new;
end;
$$;

revoke execute on function public.device_log_update(uuid, timestamptz, text, text, text, text, text, text, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.device_log_update(uuid, timestamptz, text, text, text, text, text, text, boolean, boolean, boolean, boolean) to authenticated;
