-- ═══════════════════════════════════════════════════════════════════
-- Task Manager → Teams notification when someone is assigned a task.
-- Run once in the Supabase SQL Editor, AFTER 0011. Rieseguibile.
--
-- How it works: after a task is created or its assignees change, the
-- trigger takes ONLY the people newly added (minus whoever made the
-- change) and POSTs one JSON to a Power Automate flow, which sends each
-- of them a Teams message. The call is asynchronous (pg_net): saving the
-- task never waits for, or fails because of, the notification.
--
-- Setup — run these two lines ONCE in the SQL Editor (values are kept
-- encrypted in Supabase Vault, not in the code):
--   select vault.create_secret('<Power Automate HTTP URL>', 'task_notify_webhook_url');
--   select vault.create_secret('https://<platform domain>', 'platform_url');
-- To change a value later:
--   select vault.update_secret((select id from vault.secrets where name = 'task_notify_webhook_url'), '<new URL>');
--
-- Recipients need an email in it_task_members.email (Table Editor):
-- people without one are skipped. The *_card fields carry the same text
-- escaped for the Adaptive Card JSON (see supabase/notifications/).
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pg_net;

-- Text escaped for use INSIDE a JSON string (quotes, new lines…): the
-- Teams Adaptive Card is JSON text where Power Automate pastes values
-- as they are, so raw titles with quotes would break the card.
create or replace function public.tm_json_text(t text)
returns text
language sql
immutable
as $$
  select case when t is null then '' else substr(to_jsonb(t)::text, 2, length(to_jsonb(t)::text) - 2) end;
$$;

create or replace function public.tm_notify_assignees()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url        text;
  v_site       text;
  v_added      uuid[];
  v_caller     uuid := auth.uid();
  v_caller_mail text;
  v_by         text;
  v_recipients jsonb;
  v_group      text;
begin
  -- Who was added?
  if tg_op = 'INSERT' then
    v_added := new.assignee_ids;
  else
    select coalesce(array_agg(x), '{}') into v_added
      from unnest(new.assignee_ids) as x
     where not (x = any (coalesce(old.assignee_ids, '{}')));
  end if;
  if v_added is null or cardinality(v_added) = 0 then
    return new;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'task_notify_webhook_url' limit 1;
  if v_url is null or btrim(v_url) = '' then
    return new;                              -- not configured yet: do nothing
  end if;
  select decrypted_secret into v_site from vault.decrypted_secrets where name = 'platform_url' limit 1;

  -- Who made the change (not notified about their own assignment).
  if v_caller is not null then
    select u.email into v_caller_mail from auth.users u where u.id = v_caller;
    select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') into v_by
      from public.profiles p where p.id = v_caller;
  end if;
  v_by := coalesce(v_by, v_caller_mail, new.created_by_name, 'Task Manager');

  select coalesce(jsonb_agg(jsonb_build_object('name', m.full_name, 'name_card', public.tm_json_text(m.full_name), 'email', m.email)
                            order by m.sort_order, m.full_name), '[]'::jsonb)
    into v_recipients
    from public.it_task_members m
   where m.id = any (v_added)
     and nullif(btrim(coalesce(m.email, '')), '') is not null
     and (v_caller is null or m.profile_id is distinct from v_caller)
     and (v_caller_mail is null or lower(m.email) <> lower(v_caller_mail));
  if jsonb_array_length(v_recipients) = 0 then
    return new;
  end if;

  select g.name into v_group from public.it_task_groups g where g.id = new.group_id;

  perform net.http_post(
    url     := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := jsonb_build_object(
      'event', case when tg_op = 'INSERT' then 'task_created' else 'task_assigned' end,
      'assigned_by', v_by,
      'assigned_by_card', public.tm_json_text(v_by),
      'recipients', v_recipients,
      'task', jsonb_build_object(
        'id', new.id,
        'title', new.title,
        'description', coalesce(new.description, ''),
        'title_card', public.tm_json_text(new.title),
        'description_card', public.tm_json_text(left(coalesce(new.description, ''), 400)),
        'priority', new.priority,
        'priority_label', case new.priority when 'high' then 'Alta' when 'medium' then 'Media' else 'Bassa' end,
        'status_label', case new.status when 'open' then 'Da fare' when 'in_progress' then 'In corso'
                                        when 'on_hold' then 'In attesa' else 'Completata' end,
        'group', coalesce(v_group, 'Senza gruppo'),
        'start_date', coalesce(to_char(new.start_date, 'DD/MM/YYYY'), ''),
        'due_date', coalesce(to_char(new.due_date, 'DD/MM/YYYY'), ''),
        'url', case when v_site is null then '' else rtrim(v_site, '/') || '/task-manager?task=' || new.id end
      )
    )
  );
  return new;
exception when others then
  -- A notification problem must never block saving the task.
  raise warning 'tm_notify_assignees: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists it_tasks_notify_assignees on public.it_tasks;
create trigger it_tasks_notify_assignees
  after insert or update of assignee_ids on public.it_tasks
  for each row execute function public.tm_notify_assignees();
