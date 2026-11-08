-- NUMU OS · 12 · Subtasks
--
-- A big task ("Website rebuild") can be broken into subtasks ("Homepage
-- design", "Copywriting", "QA on phones"), each with its own owner, due date
-- and status, so they show in each person's My work and can be tracked one
-- by one. Rules:
--   * one level only: a subtask can't have subtasks, and a task that has
--     subtasks can't become one;
--   * subtasks are tasks (not content), so content numbers don't change;
--   * a subtask always belongs to its parent's client, retainer or campaign
--     (copied by trigger, and kept in step if the parent moves);
--   * deleting a task deletes its subtasks;
--   * sort_order keeps the order people put them in.
-- Tasks also get In progress (20261108160000): To do → In progress → Done.

alter table public.deliverables
  add column parent_id uuid references public.deliverables (id) on delete cascade,
  add column sort_order integer not null default 0;

alter table public.deliverables
  add constraint deliverables_not_own_parent check (parent_id is null or parent_id <> id);

create index deliverables_parent_idx on public.deliverables (parent_id, sort_order);

comment on column public.deliverables.parent_id is 'The task this is a subtask of (one level only). Subtasks are always tasks, never content.';
comment on column public.deliverables.sort_order is 'Order of subtasks under their parent.';

-- ---------------------------------------------------------------------------
-- Before the other triggers (they run in name order): parent rules and the
-- parent's client, retainer and campaign copied onto the subtask.
-- ---------------------------------------------------------------------------
create function private.deliverable_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.deliverables%rowtype;
begin
  if new.parent_id is null then
    return new;
  end if;

  select * into v_parent from public.deliverables d where d.id = new.parent_id;
  if not found then
    raise exception 'The parent task doesn''t exist' using errcode = '23503';
  end if;
  if v_parent.parent_id is not null then
    raise exception 'Subtasks can''t have subtasks of their own' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and exists (select 1 from public.deliverables c where c.parent_id = new.id) then
    raise exception 'A task with subtasks can''t become a subtask' using errcode = '23514';
  end if;
  if exists (select 1 from public.deliverable_types dt where dt.code = new.deliverable_type and dt.is_content) then
    raise exception 'Subtasks are tasks, not content' using errcode = '23514';
  end if;

  new.client_id := v_parent.client_id;
  new.retainer_id := v_parent.retainer_id;
  new.project_id := v_parent.project_id;
  new.scope_line_id := null;
  return new;
end;
$$;

create trigger deliverables_05_parent
  before insert or update of parent_id, deliverable_type, client_id, retainer_id, project_id on public.deliverables
  for each row execute function private.deliverable_parent();

-- Keep subtasks with their parent if it moves to another client or campaign.
create function private.deliverable_children_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.client_id, new.retainer_id, new.project_id) is distinct from (old.client_id, old.retainer_id, old.project_id) then
    update public.deliverables c
       set client_id = new.client_id, retainer_id = new.retainer_id, project_id = new.project_id
     where c.parent_id = new.id;
  end if;
  return null;
end;
$$;

create trigger deliverables_40_children_follow
  after update of client_id, retainer_id, project_id on public.deliverables
  for each row execute function private.deliverable_children_follow();

-- ---------------------------------------------------------------------------
-- Workflow: tasks are To do, In progress or Done; content never uses either
-- (otherwise the same as 20261104190000_permissions.sql).
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

  if coalesce(v_is_content, true) and new.status in ('in_progress', 'done') then
    raise exception 'Content goes through its own steps and ends at Posted; In progress and Done are for tasks'
      using errcode = '23514';
  end if;
  if not coalesce(v_is_content, true) and new.status not in ('planned', 'in_progress', 'done') then
    raise exception 'A task is To do, In progress or Done'
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
