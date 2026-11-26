-- Consolidated, Finance-only budget ledger.
create or replace function public.finance_budget_overview()
returns table(budget_id uuid, budget_name text, lifecycle text, school_code text, school_name text, line_code text, line_name text, expense_id uuid, description text, supplier text, amount numeric, spent_on date, created_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_budget_admin() then raise exception 'Finance overview required' using errcode='42501'; end if;
  return query
    select resolved.id,resolved.name,resolved.lifecycle, e.school,
      coalesce(bs.name, case e.school when 'venezia' then 'Venezia' when 'vicenza' then 'Vicenza' when 'rosa' then 'Rosà' else e.school end),
      e.budget_code,coalesce(l.name,e.budget_code),e.id,e.description,e.supplier,e.amount,e.spent_on,e.created_at
    from public.it_budget_expenses e
    left join public.budget_schools bs on bs.code=e.school
    left join public.budget_catalog bc on bc.id=bs.budget_id
    left join public.budget_lines l on l.school=e.school and l.code=e.budget_code
    left join public.budget_catalog it on it.legacy_it
    cross join lateral (select coalesce(bc.id,it.id) id, coalesce(bc.name,it.name) name, coalesce(bc.lifecycle,it.lifecycle) lifecycle) resolved
    order by e.spent_on desc,e.created_at desc;
end;
$$;
grant execute on function public.finance_budget_overview() to authenticated;
