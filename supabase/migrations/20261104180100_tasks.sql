-- NUMU OS · 08 · Tasks next to deliverables
--
-- Not everything the team does is content. Following up with a client,
-- writing the monthly report or sending next month's content calendar are
-- tasks: they live in the same table as deliverables (one board, one My
-- work, one calendar, one capacity count) but:
--   * their type has is_content = false;
--   * they are Planned (to do) or Done, nothing in between;
--   * they need a client but not a retainer or campaign (content still needs
--     exactly one of the two);
--   * they never count as an "extra outside scope", and content metrics
--     (on time, approvals, revisions) ignore them.
-- Recurring tasks are scope lines like any other: "1 Content calendar a
-- month, due on the 20th" is generated every month by the same generator.
-- For that, a scope line can now pin its due day (quantity 1 only).

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
alter table public.deliverable_types
  add column is_content boolean not null default true;

comment on column public.deliverable_types.is_content is
  'true = content that goes through production, client review and posting. false = a task (to do or done).';

insert into public.deliverable_types (code, name_en, name_ar, effort_points, sort_order, is_content) values
  ('follow_up',        'Client follow-up', 'متابعة مع العميل', 1, 110, false),
  ('content_calendar', 'Content calendar', 'تقويم المحتوى',   2, 120, false),
  ('report',           'Report',           'تقرير',           2, 130, false),
  ('meeting',          'Meeting',          'اجتماع',          1, 140, false),
  ('task',             'Other task',       'مهمة أخرى',       1, 150, false);

-- ---------------------------------------------------------------------------
-- Parent: content needs exactly one retainer or campaign; a task may have none
-- ---------------------------------------------------------------------------
alter table public.deliverables drop constraint deliverables_one_parent;
alter table public.deliverables
  add constraint deliverables_at_most_one_parent check (num_nonnulls(retainer_id, project_id) <= 1);

create or replace function private.deliverable_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id  uuid;
  v_is_content boolean;
begin
  select dt.is_content into v_is_content from public.deliverable_types dt where dt.code = new.deliverable_type;

  if new.retainer_id is null and new.project_id is null and coalesce(v_is_content, true) then
    raise exception 'A deliverable belongs to a retainer or a campaign (only tasks can stand alone)'
      using errcode = '23514';
  end if;

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

-- Also re-check when the type changes (a task turned into content needs a parent).
drop trigger deliverables_10_defaults on public.deliverables;
create trigger deliverables_10_defaults
  before insert or update of client_id, retainer_id, project_id, scope_line_id, deliverable_type on public.deliverables
  for each row execute function private.deliverable_defaults();

-- ---------------------------------------------------------------------------
-- Workflow: tasks are to do or done; content never uses Done
-- ---------------------------------------------------------------------------
create or replace function private.deliverable_workflow()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_is_person  boolean := (select auth.uid()) is not null;
  v_is_content boolean;
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

-- ---------------------------------------------------------------------------
-- Scope lines can pin a due day (for things that happen once a month on a
-- set day: the report on the 3rd, next month's calendar on the 20th)
-- ---------------------------------------------------------------------------
alter table public.scope_lines
  add column due_day smallint check (due_day between 1 and 31);

comment on column public.scope_lines.due_day is
  'Day of the month it is due, for a quantity of 1: that day, or the next working day (the last working day if the month ends first). Null = spread evenly.';

-- ---------------------------------------------------------------------------
-- Generator: "Report" rather than "Report 1/1", and the pinned due day
-- ---------------------------------------------------------------------------
create or replace function public.generate_month_deliverables(
  p_month date default null,
  p_retainer_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month      date;
  v_month_end  date;
  v_days       date[];
  v_day_count  integer;
  v_created    integer;
begin
  -- Logged-in people must be a partner or account lead. No user = cron/admin.
  if (select auth.uid()) is not null and not private.is_lead_or_partner() then
    raise exception 'Only partners and account leads can generate deliverables'
      using errcode = '42501';
  end if;

  v_month := date_trunc(
    'month',
    coalesce(p_month, (private.qatar_today() + interval '1 month')::date)::timestamp
  )::date;
  v_month_end := (v_month + interval '1 month' - interval '1 day')::date;

  select array_agg(d::date order by d)
    into v_days
  from generate_series(v_month::timestamp, v_month_end::timestamp, interval '1 day') as d
  where private.is_working_day(d::date);

  v_day_count := array_length(v_days, 1);

  insert into public.deliverables (
    client_id, retainer_id, scope_line_id, deliverable_type, title, month, seq,
    platform, owner_id, due_date, effort_points
  )
  select
    r.client_id,
    r.id,
    sl.id,
    sl.deliverable_type,
    dt.name_en
      || case when sl.quantity_per_month > 1 then ' ' || s.seq || '/' || sl.quantity_per_month else '' end
      || coalesce(' · ' || private.platform_label(sl.platform), ''),
    v_month,
    s.seq,
    sl.platform,
    coalesce(default_owner.id, lead.id),
    case
      when sl.due_day is not null and sl.quantity_per_month = 1 then (
        -- The pinned day, or the next working day; the last one if the month runs out.
        select coalesce(
          min(w) filter (where w >= v_month + (least(sl.due_day::integer, extract(day from v_month_end)::integer) - 1)),
          max(w)
        )
        from unnest(v_days) as w
      )
      -- Evenly spaced: the middle of the seq-th of n equal slices of the month.
      else v_days[1 + floor((2 * s.seq - 1) * v_day_count / (2.0 * sl.quantity_per_month))::integer]
    end,
    dt.effort_points
  from public.retainers r
  join public.clients c on c.id = r.client_id
  join public.scope_lines sl on sl.retainer_id = r.id
  join public.deliverable_types dt on dt.code = sl.deliverable_type
  cross join lateral generate_series(1, sl.quantity_per_month::integer) as s(seq)
  left join public.team_members default_owner
    on default_owner.id = sl.default_owner_id and default_owner.is_active
  left join public.team_members lead
    on lead.id = c.account_lead_id and lead.is_active
  where r.status = 'active'
    and c.status = 'active'
    and r.start_date <= v_month_end
    and (r.end_date is null or r.end_date >= v_month)
    and (p_retainer_id is null or r.id = p_retainer_id)
  on conflict (scope_line_id, month, seq) do nothing;

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;
