-- NUMU OS · 09 · Permissions per person
--
-- Three things partners can switch on or off for each person (Team →
-- Permissions), on top of their role:
--   can_create_tasks    add tasks and deliverables, and assign them
--                       (default: everyone)
--   can_send_to_client  move work into Client review and record the client's
--                       answer (back to an earlier step = a revision)
--                       (default: partners and account leads)
--   can_approve         mark content Approved, i.e. good to go
--                       (default: partners only)
-- The role still decides fees, clients, scope and the team (see 04_access).
-- Replaces decision 13's "partners and account leads sign off".

alter table public.team_members
  add column can_create_tasks   boolean not null default true,
  add column can_send_to_client boolean not null default false,
  add column can_approve        boolean not null default false;

comment on column public.team_members.can_create_tasks is 'May add tasks and deliverables and assign them.';
comment on column public.team_members.can_send_to_client is 'May move work into Client review and record the client''s answer.';
comment on column public.team_members.can_approve is 'May mark content Approved (good to go).';

-- Someone new starts with their role's defaults; partners adjust afterwards.
create function private.team_member_permission_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.can_send_to_client := new.access_level in ('partner', 'account_lead');
  new.can_approve := new.access_level = 'partner';
  return new;
end;
$$;

create trigger team_members_permission_defaults
  before insert on public.team_members
  for each row execute function private.team_member_permission_defaults();

update public.team_members
   set can_send_to_client = access_level in ('partner', 'account_lead'),
       can_approve = access_level = 'partner';

-- ---------------------------------------------------------------------------
-- Helpers for the logged-in person (false for clients, strangers, inactive)
-- ---------------------------------------------------------------------------
create function private.can_create_tasks()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select tm.can_create_tasks from public.team_members tm where tm.user_id = (select auth.uid()) and tm.is_active),
    false
  )
$$;

create function private.can_send_to_client()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select tm.can_send_to_client from public.team_members tm where tm.user_id = (select auth.uid()) and tm.is_active),
    false
  )
$$;

create function private.can_approve()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select tm.can_approve from public.team_members tm where tm.user_id = (select auth.uid()) and tm.is_active),
    false
  )
$$;

grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Everyone with "create tasks" can add work (it was partners and leads)
-- ---------------------------------------------------------------------------
drop policy "leads and partners add deliverables" on public.deliverables;
create policy "people who create tasks add work"
  on public.deliverables for insert to authenticated
  with check ((select private.can_create_tasks()));

-- ---------------------------------------------------------------------------
-- Workflow: approval and client review follow the person's permissions.
-- Checked on insert too, now that more people can add work.
-- ---------------------------------------------------------------------------
create or replace function private.deliverable_workflow()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_is_person  boolean := (select auth.uid()) is not null;
  v_is_content boolean;
  v_from       public.deliverable_status := case when tg_op = 'INSERT' then 'planned'::public.deliverable_status else old.status end;
begin
  select dt.is_content into v_is_content from public.deliverable_types dt where dt.code = new.deliverable_type;

  if coalesce(v_is_content, true) and new.status = 'done' then
    raise exception 'Content goes through review and ends at Posted; Done is for tasks'
      using errcode = '23514';
  end if;
  if not coalesce(v_is_content, true) and new.status not in ('planned', 'done') then
    raise exception 'A task is either to do (Planned) or Done'
      using errcode = '23514';
  end if;

  if v_is_person and new.status is distinct from v_from then
    if new.status = 'approved' then
      if not (select private.can_approve()) then
        raise exception 'You don''t have permission to approve work. Partners set this in Team → Permissions'
          using errcode = '42501';
      end if;
    elsif (new.status = 'client_review' or v_from = 'client_review') and not (select private.can_send_to_client()) then
      raise exception 'You don''t have permission to send work to the client or record their answer. Partners set this in Team → Permissions'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if v_is_person then
      new.revision_count := old.revision_count;
    end if;

    if new.status is distinct from old.status
       and old.status = 'client_review'
       and new.status < 'client_review'::public.deliverable_status
       and new.revision_count = old.revision_count then
      new.revision_count := old.revision_count + 1;
    end if;
  end if;

  if new.status = 'scheduled' and new.post_date is null then
    raise exception 'Set a post date before marking a deliverable Scheduled'
      using errcode = '23514';
  end if;

  if new.status = 'posted' then
    new.posted_at := coalesce(new.posted_at, now());
  else
    new.posted_at := null;
  end if;

  return new;
end;
$$;
