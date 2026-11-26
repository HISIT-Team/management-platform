-- The operational roles are now Controller, Admin, IT and HR.  Retired
-- teaching/parent roles are kept only as historic profile values, never as
-- configurable permissions.
create or replace function public.configurable_roles() returns text[] language sql immutable as $$
  select array['controller','admin','it','hr'];
$$;

create or replace function public.platform_roles() returns text[] language sql immutable as $$
  select array['owner','superadmin','controller','admin','it','hr','guest'];
$$;
