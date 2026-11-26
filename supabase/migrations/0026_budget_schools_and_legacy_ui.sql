-- Every non-IT budget has the same three-school structure and the same
-- commesse/spese engine as Budget IT. Run after 0025.

create table if not exists public.budget_schools (
  budget_id uuid not null references public.budget_catalog(id) on delete cascade,
  code text primary key check (code ~ '^[a-z0-9_]{2,40}$'),
  school text not null check (school in ('venezia','vicenza','rosa')),
  name text not null, full_name text not null, location text not null,
  unique (budget_id, school)
);

-- Existing IT rows stay exactly as they are; new budgets receive three rows.
insert into public.budget_schools (budget_id,code,school,name,full_name,location)
select b.id, b.slug || '_' || s.school, s.school,
       case s.school when 'venezia' then 'Venezia' when 'vicenza' then 'Vicenza' else 'Rosà' end,
       case s.school when 'venezia' then 'H-International School Venezia' when 'vicenza' then 'H-International School Vicenza' else 'H-International School Rosà' end,
       case s.school when 'venezia' then 'Roncade (TV)' when 'vicenza' then 'Vicenza (VI)' else 'Rosà (VI)' end
from public.budget_catalog b cross join (values ('venezia'),('vicenza'),('rosa')) s(school)
where not b.legacy_it
on conflict (budget_id,school) do nothing;

alter table public.budget_schools enable row level security;
drop policy if exists budget_schools_read on public.budget_schools;
drop policy if exists budget_schools_admin on public.budget_schools;
create policy budget_schools_read on public.budget_schools for select to authenticated using (public.budget_can_view(budget_id));
create policy budget_schools_admin on public.budget_schools for all to authenticated using (public.is_budget_admin()) with check (public.is_budget_admin());

create or replace function public.budget_school_budget(p_school text) returns uuid language sql stable security definer set search_path=public as $$
  select budget_id from public.budget_schools where code=lower(p_school) limit 1;
$$;
create or replace function public.budget_school_can_view(p_school text) returns boolean language sql stable security definer set search_path=public as $$
  select case lower(p_school)
    when 'venezia' then public.has_permission('it.budget')
    when 'vicenza' then public.has_permission('vi.budget')
    when 'rosa' then public.has_permission('ro.budget')
    else public.budget_can_view(public.budget_school_budget(p_school)) end;
$$;
create or replace function public.budget_school_can_edit(p_school text) returns boolean language sql stable security definer set search_path=public as $$
  select case lower(p_school)
    when 'venezia' then public.has_permission('it.budget')
    when 'vicenza' then public.has_permission('vi.budget')
    when 'rosa' then public.has_permission('ro.budget')
    else public.budget_can_edit(public.budget_school_budget(p_school)) end;
$$;

alter table public.budget_lines drop constraint if exists budget_lines_school_check;
alter table public.it_budget_expenses drop constraint if exists it_budget_expenses_school_check;

drop policy if exists budget_lines_select on public.budget_lines;
create policy budget_lines_select on public.budget_lines for select to authenticated using (public.budget_school_can_view(school));
drop policy if exists it_budget_expenses_select on public.it_budget_expenses;
drop policy if exists it_budget_expenses_insert on public.it_budget_expenses;
drop policy if exists it_budget_expenses_update on public.it_budget_expenses;
drop policy if exists it_budget_expenses_delete on public.it_budget_expenses;
create policy it_budget_expenses_select on public.it_budget_expenses for select to authenticated using (public.budget_school_can_view(school));
create policy it_budget_expenses_insert on public.it_budget_expenses for insert to authenticated with check (public.budget_school_can_edit(school));
create policy it_budget_expenses_update on public.it_budget_expenses for update to authenticated using (public.budget_school_can_edit(school)) with check (public.budget_school_can_edit(school));
create policy it_budget_expenses_delete on public.it_budget_expenses for delete to authenticated using (public.budget_school_can_edit(school));

-- The three existing line-management routines are reused by the identical UI.
-- Replace their authorisation check from 0018 with the per-budget rule.
create or replace function public.budget_create_line(p_school text, p_name text, p_caption text, p_allocated numeric, p_accent text, p_accent_soft text)
returns text language plpgsql security definer set search_path=public as $$
declare v_school text:=lower(btrim(coalesce(p_school,''))); v_code text; v_base text; n int:=1;
begin
 if not public.budget_school_can_edit(v_school) then raise exception 'You cannot manage this budget' using errcode='42501'; end if;
 v_base:=left(trim(both '_' from regexp_replace(lower(coalesce(p_name,'')),'[^a-z0-9]+','_','g')),32); if length(v_base)<2 then v_base:='commessa'; end if; v_code:=v_base;
 while exists(select 1 from public.budget_lines where school=v_school and code=v_code) loop n:=n+1; v_code:=v_base||'_'||n; end loop;
 insert into public.budget_lines(school,code,name,caption,accent,accent_soft,allocated,sort_order) values(v_school,v_code,btrim(p_name),nullif(btrim(p_caption),''),coalesce(nullif(p_accent,''),'#8B1A2B'),coalesce(nullif(p_accent_soft,''),'#F9EFF0'),round(coalesce(p_allocated,0),2),coalesce((select max(sort_order)+1 from public.budget_lines where school=v_school),1));
 return v_code;
end; $$;
grant execute on function public.budget_school_can_view(text), public.budget_school_can_edit(text) to authenticated;

create or replace function public.budget_admin_users()
returns table(id uuid, email text, first_name text, last_name text)
language plpgsql security definer set search_path=public,auth as $$
begin
  if not public.is_budget_admin() then raise exception 'Budget administrator required' using errcode='42501'; end if;
  return query select p.id,p.email,p.first_name,p.last_name from public.profiles p order by p.last_name,p.first_name,p.email;
end; $$;
grant execute on function public.budget_admin_users() to authenticated;
