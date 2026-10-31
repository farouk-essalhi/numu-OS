-- NUMU OS · 03 · Deliverables, status history and comments
-- The production board. Every deliverable belongs to exactly one retainer or
-- one project, moves through the nine statuses, and every status change is
-- logged to status_events by a trigger (never by the app).

create table public.deliverables (
  id               uuid primary key default gen_random_uuid(),
  -- Always the retainer's or project's client. Set by trigger; kept here so the
  -- board can filter by client and RLS can scope client logins cheaply.
  client_id        uuid not null references public.clients (id) on delete restrict,
  retainer_id      uuid references public.retainers (id) on delete restrict,
  -- Null on a retainer deliverable = an extra outside the agreed scope.
  scope_line_id    uuid references public.scope_lines (id) on delete set null,
  project_id       uuid references public.projects (id) on delete restrict,
  deliverable_type text not null references public.deliverable_types (code),
  title            text not null check (length(trim(title)) > 0),
  -- The month this counts against (always the 1st). Defaults to the due date's month.
  month            date not null check (extract(day from month) = 1),
  -- Position within its scope line for the month (1..quantity). Generator only.
  seq              smallint check (seq > 0),
  platform         public.platform,
  owner_id         uuid references public.team_members (id) on delete set null,
  -- When it must be ready for Client review (the team's deadline).
  due_date         date not null,
  -- When it is planned to go live. Required from Scheduled onwards.
  post_date        date,
  status           public.deliverable_status not null default 'planned',
  revision_count   smallint not null default 0 check (revision_count >= 0),
  effort_points    smallint not null check (effort_points >= 0),
  script_url       text,
  raw_url          text,
  final_url        text,
  post_url         text,
  posted_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint deliverables_one_parent check (num_nonnulls(retainer_id, project_id) = 1),
  constraint deliverables_scope_line_needs_retainer check (scope_line_id is null or retainer_id is not null),
  constraint deliverables_generated_key unique (scope_line_id, month, seq)
);

create index deliverables_client_month_idx on public.deliverables (client_id, month);
create index deliverables_owner_due_idx on public.deliverables (owner_id, due_date);
create index deliverables_status_idx on public.deliverables (status);
create index deliverables_retainer_id_idx on public.deliverables (retainer_id);
create index deliverables_project_id_idx on public.deliverables (project_id);

-- ---------------------------------------------------------------------------
-- status_events: append-only log of every status change. Powers on-time
-- delivery, turnaround and "hours in Client review". Written only by trigger.
-- ---------------------------------------------------------------------------
create table public.status_events (
  id                        bigint generated always as identity primary key,
  deliverable_id            uuid not null references public.deliverables (id) on delete cascade,
  from_status               public.deliverable_status, -- null = created
  to_status                 public.deliverable_status not null,
  -- Who made the change. Both null = the system (generator, cron, admin SQL).
  changed_by_team_member_id uuid references public.team_members (id) on delete set null,
  changed_by_contact_id     uuid references public.contacts (id) on delete set null,
  changed_at                timestamptz not null default now()
);

create index status_events_deliverable_idx on public.status_events (deliverable_id, changed_at);

-- ---------------------------------------------------------------------------
-- comments on a deliverable. Author is always the logged-in person (trigger).
-- Internal comments are never shown to clients.
-- ---------------------------------------------------------------------------
create table public.comments (
  id                    uuid primary key default gen_random_uuid(),
  deliverable_id        uuid not null references public.deliverables (id) on delete cascade,
  author_team_member_id uuid references public.team_members (id) on delete set null,
  author_contact_id     uuid references public.contacts (id) on delete set null,
  body                  text not null check (length(trim(body)) > 0 and length(body) <= 10000),
  is_internal           boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint comments_single_author check (num_nonnulls(author_team_member_id, author_contact_id) <= 1),
  constraint comments_client_comments_are_external check (author_contact_id is null or not is_internal)
);

create index comments_deliverable_idx on public.comments (deliverable_id, created_at);

-- ---------------------------------------------------------------------------
-- Trigger 1: keep a deliverable consistent with its parent, fill defaults.
-- SECURITY DEFINER because creators cannot read retainers (fees) but their
-- edits still need this check.
-- ---------------------------------------------------------------------------
create function private.deliverable_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
begin
  if new.retainer_id is not null then
    select r.client_id into v_client_id from public.retainers r where r.id = new.retainer_id;
  elsif new.project_id is not null then
    select p.client_id into v_client_id from public.projects p where p.id = new.project_id;
  end if;

  if v_client_id is not null then
    if tg_op = 'INSERT' and new.client_id is not null and new.client_id <> v_client_id then
      raise exception 'client_id does not match the deliverable''s retainer or project'
        using errcode = '23514';
    elsif tg_op = 'UPDATE' and new.client_id is distinct from old.client_id and new.client_id <> v_client_id then
      raise exception 'client_id does not match the deliverable''s retainer or project'
        using errcode = '23514';
    end if;
    new.client_id := v_client_id;
  end if;

  if new.scope_line_id is not null and not exists (
    select 1 from public.scope_lines sl
    where sl.id = new.scope_line_id and sl.retainer_id = new.retainer_id
  ) then
    raise exception 'scope line does not belong to the deliverable''s retainer'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if new.month is null then
      new.month := date_trunc('month', new.due_date::timestamp)::date;
    end if;
    if new.effort_points is null then
      select dt.effort_points into new.effort_points
      from public.deliverable_types dt where dt.code = new.deliverable_type;
    end if;
    if new.platform is null and new.scope_line_id is not null then
      select sl.platform into new.platform
      from public.scope_lines sl where sl.id = new.scope_line_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger deliverables_10_defaults
  before insert or update of client_id, retainer_id, project_id, scope_line_id on public.deliverables
  for each row execute function private.deliverable_defaults();

-- ---------------------------------------------------------------------------
-- Trigger 2: workflow rules.
--  * Only partners and account leads can sign off: move work into or out of
--    Client review, or into Approved. (Clients get their own path in phase 3.)
--  * Client review -> any earlier status = a revision (+1). People cannot edit
--    revision_count directly; the system (no logged-in user) can.
--  * Scheduled needs a post date.
--  * posted_at is stamped when a deliverable is marked Posted.
-- ---------------------------------------------------------------------------
create function private.deliverable_workflow()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_is_person boolean := (select auth.uid()) is not null;
begin
  if tg_op = 'UPDATE' then
    if v_is_person then
      new.revision_count := old.revision_count;
    end if;

    if new.status is distinct from old.status then
      if v_is_person
         and (new.status in ('client_review', 'approved') or old.status = 'client_review')
         and not (select private.is_lead_or_partner()) then
        raise exception 'Only partners and account leads can sign off work or move it in and out of Client review'
          using errcode = '42501';
      end if;

      if old.status = 'client_review'
         and new.status < 'client_review'::public.deliverable_status
         and new.revision_count = old.revision_count then
        new.revision_count := old.revision_count + 1;
      end if;
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

create trigger deliverables_20_workflow
  before insert or update on public.deliverables
  for each row execute function private.deliverable_workflow();

create trigger deliverables_updated_at
  before update on public.deliverables
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Trigger 3: log status changes. SECURITY DEFINER: nobody can write to
-- status_events directly, so the history cannot be edited from the app.
-- ---------------------------------------------------------------------------
create function private.log_status_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.deliverable_status;
begin
  if tg_op = 'UPDATE' then
    if new.status is not distinct from old.status then
      return null;
    end if;
    v_from := old.status;
  end if;

  insert into public.status_events (
    deliverable_id, from_status, to_status, changed_by_team_member_id, changed_by_contact_id
  ) values (
    new.id,
    v_from,
    new.status,
    private.current_team_member_id(),
    (select c.id from public.contacts c
      where c.user_id = (select auth.uid()) and c.client_id = new.client_id
      limit 1)
  );

  return null;
end;
$$;

create trigger deliverables_30_log_status
  after insert or update of status on public.deliverables
  for each row execute function private.log_status_event();

-- ---------------------------------------------------------------------------
-- Comments: author is always whoever is logged in; author and deliverable
-- cannot be changed after posting. A client contact's comments are never internal.
-- ---------------------------------------------------------------------------
create function private.comment_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact_id uuid;
begin
  if tg_op = 'UPDATE' then
    new.deliverable_id        := old.deliverable_id;
    new.author_team_member_id := old.author_team_member_id;
    new.author_contact_id     := old.author_contact_id;
    if old.author_contact_id is not null then
      new.is_internal := false;
    end if;
    return new;
  end if;

  -- INSERT by the system (seed, admin SQL): keep what was given.
  if (select auth.uid()) is null then
    return new;
  end if;

  new.author_team_member_id := private.current_team_member_id();
  new.author_contact_id := null;

  if new.author_team_member_id is null then
    select c.id into v_contact_id
    from public.contacts c
    join public.deliverables d on d.client_id = c.client_id
    where c.user_id = (select auth.uid()) and d.id = new.deliverable_id
    limit 1;

    if v_contact_id is null then
      raise exception 'Only the team or the client''s own contacts can comment'
        using errcode = '42501';
    end if;

    new.author_contact_id := v_contact_id;
    new.is_internal := false;
  end if;

  return new;
end;
$$;

create trigger comments_10_author
  before insert or update on public.comments
  for each row execute function private.comment_author();

create trigger comments_updated_at
  before update on public.comments
  for each row execute function private.touch_updated_at();

grant execute on all functions in schema private to authenticated, service_role;
