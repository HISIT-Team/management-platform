-- ═══════════════════════════════════════════════════════════════════
-- Storico assegnazioni: modifica di un record (matita accanto al
-- cestino). Run once in the Supabase SQL Editor, AFTER 0017.
-- Rieseguibile.
--
-- There is still NO update policy on student_device_log: a record is
-- changed only through device_log_update(), which
--   - needs the "Storico assegnazioni" permission (it.history), the
--     same one that allows deleting a record;
--   - changes only date/time, operation, student email, school,
--     MacBook ID, iPad ID and "signed by" (never the signature or who
--     created the record);
--   - writes the change to the activity log, with the values before
--     and after.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.device_log_update(
  p_id         uuid,
  p_created_at timestamptz,
  p_operation  text,
  p_email      text,
  p_school     text,
  p_macbook_id text,
  p_ipad_id    text,
  p_signed_by  text
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
         signed_by     = p_signed_by
   where id = p_id
  returning * into v_new;

  -- Only the fields that actually changed go to the activity log.
  foreach k in array array['created_at', 'operation', 'student_email', 'school', 'macbook_id', 'ipad_id', 'signed_by'] loop
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

revoke execute on function public.device_log_update(uuid, timestamptz, text, text, text, text, text, text) from public, anon;
grant execute on function public.device_log_update(uuid, timestamptz, text, text, text, text, text, text) to authenticated;
