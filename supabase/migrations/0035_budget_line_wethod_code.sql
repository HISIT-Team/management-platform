-- ═══════════════════════════════════════════════════════════════════
-- Budget lines: manual Wethod Job Order code
--
-- budget_lines.code corresponds to the Job_Order column of the
-- Wethod order export, for example MY_2627_SUP.
--
-- Existing budget lines remain unchanged.
-- ═══════════════════════════════════════════════════════════════════

-- The old constraint only accepted lowercase codes.
alter table public.budget_lines
  drop constraint if exists budget_lines_code_check;

-- Accept both existing lowercase codes and Wethod Job Order codes.
alter table public.budget_lines
  add constraint budget_lines_code_check
  check (code ~ '^[A-Za-z0-9_-]{2,80}$');

-- Remove the old overload that generated the code automatically.
drop function if exists public.budget_create_line(
  text,
  text,
  text,
  numeric,
  text,
  text
);

-- Create a budget line using the code supplied by the user.
create or replace function public.budget_create_line(
  p_school text,
  p_code text,
  p_name text,
  p_caption text,
  p_allocated numeric,
  p_accent text,
  p_accent_soft text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school text := lower(btrim(coalesce(p_school, '')));
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_who text := public.my_display_name();
begin
  if not public.budget_school_can_edit(v_school) then
    raise exception 'You cannot manage this budget'
      using errcode = '42501';
  end if;

  if v_name = '' or length(v_name) > 120 then
    raise exception 'Give the budget line a name (max 120 characters)'
      using errcode = '22023';
  end if;

  if v_code = '' then
    raise exception 'Enter the Wethod Job Order code'
      using errcode = '22023';
  end if;

  if length(v_code) < 2 or length(v_code) > 80 then
    raise exception 'The Wethod Job Order code must contain between 2 and 80 characters'
      using errcode = '22023';
  end if;

  if v_code !~ '^[A-Z0-9_-]+$' then
    raise exception 'The Wethod Job Order code may contain only letters, numbers, underscores and hyphens'
      using errcode = '22023';
  end if;

  if p_allocated is null or p_allocated < 0 then
    raise exception 'The allocation must be zero or more'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.budget_lines
    where school = v_school
      and upper(code) = v_code
  ) then
    raise exception 'A budget line with Wethod Job Order code % already exists in this school', v_code
      using errcode = '23505';
  end if;

  insert into public.budget_lines (
    school,
    code,
    name,
    caption,
    accent,
    accent_soft,
    allocated,
    sort_order,
    created_by_name
  )
  values (
    v_school,
    v_code,
    v_name,
    nullif(btrim(coalesce(p_caption, '')), ''),
    coalesce(nullif(p_accent, ''), '#8B1A2B'),
    coalesce(nullif(p_accent_soft, ''), '#F9EFF0'),
    round(p_allocated, 2),
    coalesce(
      (
        select max(sort_order) + 1
        from public.budget_lines
        where school = v_school
      ),
      1
    ),
    v_who
  );

  insert into public.budget_adjustments (
    school,
    budget_code,
    amount,
    allocated_after,
    reason,
    kind,
    created_by_name
  )
  values (
    v_school,
    v_code,
    round(p_allocated, 2),
    round(p_allocated, 2),
    'Nuova commessa',
    'create',
    v_who
  );

  perform public.audit_write(
    'budget_line_created',
    'budget_line',
    v_school || '/' || v_code,
    v_name,
    jsonb_build_object(
      'school', v_school,
      'code', v_code,
      'allocated', p_allocated
    )
  );

  return v_code;
end;
$$;

revoke execute on function public.budget_create_line(
  text,
  text,
  text,
  text,
  numeric,
  text,
  text
) from public, anon;

grant execute on function public.budget_create_line(
  text,
  text,
  text,
  text,
  numeric,
  text,
  text
) to authenticated;