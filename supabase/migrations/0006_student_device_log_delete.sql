-- ═══════════════════════════════════════════════════════════════════
-- NOTE: since 0017 access is decided by the role permissions (has_permission()):
--       if you re-run this file, re-run 0017 afterwards.
-- Student device log — allow IT staff / admins to delete records
-- (button in the /device-history dashboard). Run once in the Supabase
-- SQL Editor, after 0005. Rieseguibile senza effetti collaterali.
--
-- Updates remain NOT allowed: a wrong record is deleted and re-entered.
-- ═══════════════════════════════════════════════════════════════════

drop policy if exists student_device_log_delete on public.student_device_log;
create policy student_device_log_delete on public.student_device_log
  for delete to authenticated using (public.is_it_staff());
