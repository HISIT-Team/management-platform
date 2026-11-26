-- Login attempts are kept separately from administrative actions.  No
-- password, token, IP address or authentication provider secret is stored.
create or replace function public.audit_login_attempt(p_email text, p_granted boolean)
returns void language plpgsql security definer set search_path=public as $$
declare v_email text:=lower(left(btrim(coalesce(p_email,'')),320));
begin
  if v_email='' then return; end if;
  insert into public.audit_log(actor_id,actor_email,action,target_type,target_id,target_label,details)
  values (case when p_granted then auth.uid() else null end,v_email,'login_attempt','authentication',null,v_email,jsonb_build_object('result',case when p_granted then 'granted' else 'denied' end));
end;
$$;
grant execute on function public.audit_login_attempt(text,boolean) to anon, authenticated;
