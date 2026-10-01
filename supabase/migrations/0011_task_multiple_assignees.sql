-- ═══════════════════════════════════════════════════════════════════
-- Task Manager: a task can be assigned to several people.
-- Run once in the Supabase SQL Editor. Rieseguibile senza effetti
-- collaterali. Sub-tasks keep a single assignee.
--
-- New column it_tasks.assignee_ids (uuid[]). The old assignee_id column
-- stays and is kept in sync (= first assignee) so nothing that still
-- reads it breaks.
-- ═══════════════════════════════════════════════════════════════════

alter table public.it_tasks add column if not exists assignee_ids uuid[] not null default '{}';

-- Existing single assignments become one-element lists.
update public.it_tasks
   set assignee_ids = array[assignee_id]
 where assignee_id is not null and cardinality(assignee_ids) = 0;

create index if not exists it_tasks_assignee_ids_idx on public.it_tasks using gin (assignee_ids);

create or replace function public.tm_sync_assignees()
returns trigger
language plpgsql
as $$
begin
  -- Clean the list: no nulls, no duplicates, original order kept.
  new.assignee_ids := coalesce(
    (select array_agg(x order by ord)
       from (select distinct on (x) x, ord
               from unnest(new.assignee_ids) with ordinality as t(x, ord)
              where x is not null
              order by x, ord) d),
    '{}');

  if tg_op = 'UPDATE' and new.assignee_ids = old.assignee_ids
     and new.assignee_id is distinct from old.assignee_id then
    -- An older client changed only assignee_id: mirror it in the list.
    new.assignee_ids := case when new.assignee_id is null then '{}' else array[new.assignee_id] end;
  elsif tg_op = 'INSERT' and cardinality(new.assignee_ids) = 0 and new.assignee_id is not null then
    new.assignee_ids := array[new.assignee_id];
  end if;

  new.assignee_id := new.assignee_ids[1];
  return new;
end;
$$;

drop trigger if exists it_tasks_sync_assignees on public.it_tasks;
create trigger it_tasks_sync_assignees
  before insert or update on public.it_tasks
  for each row execute function public.tm_sync_assignees();
