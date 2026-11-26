-- Budgets are never physically deleted from the operational interface.
-- Administrators can archive them at year-end or move them to the trash;
-- their lines and expense history remain recoverable.
alter table public.budget_catalog add column if not exists lifecycle text not null default 'active'
  check (lifecycle in ('active','archived','trash'));
update public.budget_catalog set lifecycle = case when active then 'active' else 'archived' end where lifecycle = 'active' and not active;

create or replace function public.budget_set_lifecycle(p_budget uuid, p_lifecycle text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_budget_admin() then raise exception 'Budget administrator required' using errcode='42501'; end if;
  if p_lifecycle not in ('active','archived','trash') then raise exception 'Invalid budget lifecycle' using errcode='22023'; end if;
  update public.budget_catalog set lifecycle=p_lifecycle, active=(p_lifecycle='active') where id=p_budget and not legacy_it;
  if not found then raise exception 'Budget not found or protected' using errcode='P0002'; end if;
end;
$$;
grant execute on function public.budget_set_lifecycle(uuid,text) to authenticated;
