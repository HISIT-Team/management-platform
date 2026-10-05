-- ═══════════════════════════════════════════════════════════════════
-- NOTE: since 0017 access is decided by the role permissions (has_permission()):
--       if you re-run this file, re-run 0017 afterwards.
-- NOTE: since 0016 these tables are admin/superadmin only (is_platform_admin()).
--       If you re-run this file, re-run 0016 afterwards.
-- IT Task Manager — attività del team IT, gruppi di progetto e
-- sotto-task. Run this once in the Supabase SQL Editor.
--
-- Quattro tabelle:
--   it_task_groups   gruppi di progetto (nome, colore, ordine)
--   it_task_members  assegnatari selezionabili (il team IT)
--   it_tasks         le task
--   it_subtasks      le sotto-task di una task
--
-- Come per le commesse, gruppi e assegnatari NON stanno nel bundle:
-- vivono qui dietro RLS e si aggiungono o disattivano dal Table Editor
-- senza bisogno di un deploy.
--
-- Rieseguibile senza effetti collaterali.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ─── Access: IT staff and admins only ──────────────────────────────
-- Stessa funzione già creata da 0001: ripetuta qui perché questa
-- migrazione sia autosufficiente. La definizione è identica, quindi
-- rieseguirla non cambia nulla.
create or replace function public.is_it_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('it', 'admin', 'superadmin')
  );
$$;

-- ─── updated_at automatico ─────────────────────────────────────────
create or replace function public.tm_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─── completed_at coerente con lo status ───────────────────────────
create or replace function public.tm_sync_completed_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    -- OLD non esiste su INSERT: nessun confronto da fare.
    if new.status = 'completed' then
      new.completed_at := coalesce(new.completed_at, now());
    else
      new.completed_at := null;
    end if;
    return new;
  end if;

  if new.status = 'completed' and old.status is distinct from 'completed' then
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;


-- ═══════════════════════════════════════════════════════════════════
-- 1. Gruppi di progetto
-- ═══════════════════════════════════════════════════════════════════
create table if not exists public.it_task_groups (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null check (length(btrim(name)) > 0),
  description text,
  color       text        not null default '#3C5A8A',
  sort_order  integer     not null default 0,
  active      boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists it_task_groups_name_key
  on public.it_task_groups (lower(name));

drop trigger if exists it_task_groups_touch on public.it_task_groups;
create trigger it_task_groups_touch
  before update on public.it_task_groups
  for each row execute function public.tm_touch_updated_at();


-- ═══════════════════════════════════════════════════════════════════
-- 2. Membri del team (assegnatari)
--    `profile_id` è opzionale: collegalo se e quando la persona ha un
--    account sulla piattaforma. L'assegnazione funziona anche senza.
-- ═══════════════════════════════════════════════════════════════════
create table if not exists public.it_task_members (
  id          uuid        primary key default gen_random_uuid(),
  full_name   text        not null check (length(btrim(full_name)) > 0),
  email       text,
  color       text        not null default '#8B1A2B',
  profile_id  uuid        references public.profiles (id) on delete set null,
  sort_order  integer     not null default 0,
  active      boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists it_task_members_name_key
  on public.it_task_members (lower(full_name));

drop trigger if exists it_task_members_touch on public.it_task_members;
create trigger it_task_members_touch
  before update on public.it_task_members
  for each row execute function public.tm_touch_updated_at();


-- ═══════════════════════════════════════════════════════════════════
-- 3. Task
--    `position` è un float: spostando una card in kanban si scrive il
--    punto medio fra le due vicine, così basta un UPDATE su una riga.
-- ═══════════════════════════════════════════════════════════════════
create table if not exists public.it_tasks (
  id              uuid             primary key default gen_random_uuid(),
  title           text             not null check (length(btrim(title)) > 0),
  description     text,
  group_id        uuid             references public.it_task_groups (id)  on delete set null,
  assignee_id     uuid             references public.it_task_members (id) on delete set null,
  status          text             not null default 'open'
                                   check (status in ('open', 'in_progress', 'on_hold', 'completed')),
  priority        text             not null default 'medium'
                                   check (priority in ('low', 'medium', 'high')),
  start_date      date,
  due_date        date,
  estimated_hours numeric(7,2)     check (estimated_hours is null or estimated_hours >= 0),
  position        double precision not null default 0,
  completed_at    timestamptz,
  created_by      uuid             references auth.users (id) on delete set null default auth.uid(),
  created_by_name text,
  created_at      timestamptz      not null default now(),
  updated_at      timestamptz      not null default now()
);

create index if not exists it_tasks_status_idx   on public.it_tasks (status, position);
create index if not exists it_tasks_group_idx    on public.it_tasks (group_id);
create index if not exists it_tasks_assignee_idx on public.it_tasks (assignee_id);
create index if not exists it_tasks_due_idx      on public.it_tasks (due_date);

drop trigger if exists it_tasks_touch on public.it_tasks;
create trigger it_tasks_touch
  before update on public.it_tasks
  for each row execute function public.tm_touch_updated_at();

drop trigger if exists it_tasks_completed on public.it_tasks;
create trigger it_tasks_completed
  before insert or update of status on public.it_tasks
  for each row execute function public.tm_sync_completed_at();


-- ═══════════════════════════════════════════════════════════════════
-- 4. Sotto-task — cancellate insieme alla task che le contiene
-- ═══════════════════════════════════════════════════════════════════
create table if not exists public.it_subtasks (
  id          uuid             primary key default gen_random_uuid(),
  task_id     uuid             not null references public.it_tasks (id) on delete cascade,
  title       text             not null check (length(btrim(title)) > 0),
  description text,
  assignee_id uuid             references public.it_task_members (id) on delete set null,
  status      text             not null default 'open'
                               check (status in ('open', 'in_progress', 'on_hold', 'completed')),
  position    double precision not null default 0,
  created_at  timestamptz      not null default now(),
  updated_at  timestamptz      not null default now()
);

create index if not exists it_subtasks_task_idx on public.it_subtasks (task_id, position);

drop trigger if exists it_subtasks_touch on public.it_subtasks;
create trigger it_subtasks_touch
  before update on public.it_subtasks
  for each row execute function public.tm_touch_updated_at();


-- ═══════════════════════════════════════════════════════════════════
-- 5. Row Level Security
-- ═══════════════════════════════════════════════════════════════════
alter table public.it_task_groups  enable row level security;
alter table public.it_task_members enable row level security;
alter table public.it_tasks        enable row level security;
alter table public.it_subtasks     enable row level security;

-- ── it_task_groups ──
drop policy if exists it_task_groups_select on public.it_task_groups;
create policy it_task_groups_select on public.it_task_groups
  for select to authenticated using (public.is_it_staff());

drop policy if exists it_task_groups_insert on public.it_task_groups;
create policy it_task_groups_insert on public.it_task_groups
  for insert to authenticated with check (public.is_it_staff());

drop policy if exists it_task_groups_update on public.it_task_groups;
create policy it_task_groups_update on public.it_task_groups
  for update to authenticated using (public.is_it_staff()) with check (public.is_it_staff());

drop policy if exists it_task_groups_delete on public.it_task_groups;
create policy it_task_groups_delete on public.it_task_groups
  for delete to authenticated using (public.is_it_staff());

-- ── it_task_members ──
drop policy if exists it_task_members_select on public.it_task_members;
create policy it_task_members_select on public.it_task_members
  for select to authenticated using (public.is_it_staff());

drop policy if exists it_task_members_insert on public.it_task_members;
create policy it_task_members_insert on public.it_task_members
  for insert to authenticated with check (public.is_it_staff());

drop policy if exists it_task_members_update on public.it_task_members;
create policy it_task_members_update on public.it_task_members
  for update to authenticated using (public.is_it_staff()) with check (public.is_it_staff());

drop policy if exists it_task_members_delete on public.it_task_members;
create policy it_task_members_delete on public.it_task_members
  for delete to authenticated using (public.is_it_staff());

-- ── it_tasks ──
drop policy if exists it_tasks_select on public.it_tasks;
create policy it_tasks_select on public.it_tasks
  for select to authenticated using (public.is_it_staff());

drop policy if exists it_tasks_insert on public.it_tasks;
create policy it_tasks_insert on public.it_tasks
  for insert to authenticated with check (public.is_it_staff());

drop policy if exists it_tasks_update on public.it_tasks;
create policy it_tasks_update on public.it_tasks
  for update to authenticated using (public.is_it_staff()) with check (public.is_it_staff());

drop policy if exists it_tasks_delete on public.it_tasks;
create policy it_tasks_delete on public.it_tasks
  for delete to authenticated using (public.is_it_staff());

-- ── it_subtasks ──
drop policy if exists it_subtasks_select on public.it_subtasks;
create policy it_subtasks_select on public.it_subtasks
  for select to authenticated using (public.is_it_staff());

drop policy if exists it_subtasks_insert on public.it_subtasks;
create policy it_subtasks_insert on public.it_subtasks
  for insert to authenticated with check (public.is_it_staff());

drop policy if exists it_subtasks_update on public.it_subtasks;
create policy it_subtasks_update on public.it_subtasks
  for update to authenticated using (public.is_it_staff()) with check (public.is_it_staff());

drop policy if exists it_subtasks_delete on public.it_subtasks;
create policy it_subtasks_delete on public.it_subtasks
  for delete to authenticated using (public.is_it_staff());


-- ═══════════════════════════════════════════════════════════════════
-- 6. Seed — il team IT e qualche gruppo di progetto di partenza.
--    Da qui in poi si gestiscono dal Table Editor (o, per i gruppi,
--    dal pulsante «Gruppi» nella pagina).
-- ═══════════════════════════════════════════════════════════════════
insert into public.it_task_members (full_name, color, sort_order) values
  ('Alessandro Manzini', '#8B1A2B', 10),
  ('Valentina Corradi',  '#3C5A8A', 20),
  ('Elvis Kavazovic',    '#2F6E5B', 30),
  ('Georgios Andronis',  '#C9A227', 40)
on conflict (lower(full_name)) do nothing;

insert into public.it_task_groups (name, description, color, sort_order) values
  ('Infrastruttura',          'Rete, server, Wi-Fi, cablaggi',          '#3C5A8A', 10),
  ('Device & Hardware',       'Provisioning, riparazioni, magazzino',   '#8B1A2B', 20),
  ('Microsoft 365',           'Entra ID, licenze, Intune, SharePoint',  '#2F6E5B', 30),
  ('Apple / ASM',             'Apple School Manager, iPad, MDM',        '#C9A227', 40),
  ('Progetti & Automazioni',  'Piattaforma, Power Automate, sviluppo',  '#6E4E8A', 50)
on conflict (lower(name)) do nothing;
