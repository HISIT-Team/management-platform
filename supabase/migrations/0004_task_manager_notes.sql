-- ═══════════════════════════════════════════════════════════════════
-- IT Task Manager — campo note sulle task e Alberto fra gli assegnatari.
-- Run this in the Supabase SQL Editor after 0003.
--
-- `notes` è separata da `description`: la descrizione dice cos'è la
-- task, le note sono gli appunti che si aggiungono strada facendo. La
-- board e la lista segnalano le task che ne hanno una.
--
-- Rieseguibile senza effetti collaterali.
-- ═══════════════════════════════════════════════════════════════════

alter table public.it_tasks
  add column if not exists notes text;

insert into public.it_task_members (full_name, color, sort_order) values
  ('Alberto Dalle Carbonare', '#6E4E8A', 5)
on conflict (lower(full_name)) do nothing;
