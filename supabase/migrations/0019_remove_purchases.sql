-- ═══════════════════════════════════════════════════════════════════
-- Removes Purchases (H-IS Vicenza), which was part of an earlier
-- version of 0018. Run once in the Supabase SQL Editor, AFTER 0018.
-- Rieseguibile, and harmless if Purchases was never installed.
--
-- Deletes the purchase_requests table WITH the requests saved in it,
-- the purchase_mark_sent function and the vi.purchases /
-- vi.purchases_admin permissions.
-- After running it, the Supabase secret WEBHOOK_PURCHASE_VICENZA (if
-- you created it) and the Power Automate flow are no longer used and
-- can be deleted.
-- ═══════════════════════════════════════════════════════════════════

drop function if exists public.purchase_mark_sent(uuid, boolean);
drop table if exists public.purchase_requests;

delete from public.role_permissions where perm in ('vi.purchases', 'vi.purchases_admin');

-- Same list as 0018, without the Purchases permissions.
create or replace function public.permission_keys()
returns text[]
language sql
immutable
as $$
  select array[
    'it', 'it.checkin_student', 'it.checkin_employee', 'it.history', 'it.registries', 'it.budget', 'it.tasks',
    'hr', 'hr.onboarding', 'hr.offboarding', 'hr.registries',
    'boarding', 'boarding.rooms',
    'office',
    'vi.budget',
    'ro.budget'
  ];
$$;
