-- ═══════════════════════════════════════════════════════════════════
-- Student device log — one row per Student Check-in / Check-out form
-- submitted from /modulo-student. Run this once in the Supabase SQL
-- Editor.
--
-- La firma è salvata come piccola immagine (WebP/JPEG ridotta, di
-- solito 3–10 KB) in formato data URL: si apre incollandola nella barra
-- del browser. Il limite di 60 KB protegge la quota del piano free.
--
-- Per scelta, NESSUN nome/cognome dello studente: lo identifica solo
-- l'email.
--
-- Solo IT/admin possono leggere e inserire. Nessuna policy di update o
-- delete: le righe sono un registro; correzioni dal Table Editor.
--
-- Rieseguibile senza effetti collaterali.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- Stessa funzione di 0001/0003 (identica): ripetuta per autosufficienza.
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
      and lower(coalesce(p.role, '')) in ('it', 'admin')
  );
$$;

create table if not exists public.student_device_log (
  id             uuid        primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  operation      text        not null check (operation in ('Check-in', 'Check-out')),
  student_email  text        not null check (length(btrim(student_email)) > 0),
  school         text,
  macbook_id     text,
  ipad_id        text,
  signed_by      text,
  signature      text        check (signature is null or (signature like 'data:image/%' and length(signature) <= 60000)),
  created_by     uuid        default auth.uid() references auth.users (id) on delete set null
);

-- Se la tabella era già stata creata con nome/cognome, li rimuove.
alter table public.student_device_log drop column if exists first_name;
alter table public.student_device_log drop column if exists last_name;

create index if not exists student_device_log_email_idx   on public.student_device_log (lower(student_email));
create index if not exists student_device_log_created_idx on public.student_device_log (created_at desc);
create index if not exists student_device_log_macbook_idx on public.student_device_log (macbook_id);
create index if not exists student_device_log_ipad_idx    on public.student_device_log (ipad_id);

alter table public.student_device_log enable row level security;

drop policy if exists student_device_log_select on public.student_device_log;
create policy student_device_log_select on public.student_device_log
  for select to authenticated using (public.is_it_staff());

drop policy if exists student_device_log_insert on public.student_device_log;
create policy student_device_log_insert on public.student_device_log
  for insert to authenticated with check (public.is_it_staff() and created_by = auth.uid());
