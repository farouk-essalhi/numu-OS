-- NUMU OS · 05 · Monthly deliverable generator
--
-- The heart of the system. For every active retainer of an active client, turn
-- each scope line into `quantity_per_month` deliverables for the month:
--   * title    "Reel 3/6 · Instagram"
--   * owner    the scope line's default owner, else the client's account lead
--   * due date spread evenly over the month's working days (Sun-Thu)
--   * status   Planned
-- Safe to run again: it only creates what is missing (unique scope line +
-- month + seq). Raising a quantity and re-running adds just the difference;
-- lowering it never deletes anything, the account lead tidies up by hand.
--
-- Runs automatically on the 25th for next month (pg_cron, below). Partners and
-- account leads can also run it from the app, e.g. for a client signed mid-month.

create function public.generate_month_deliverables(
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
    dt.name_en || ' ' || s.seq || '/' || sl.quantity_per_month
      || coalesce(' · ' || private.platform_label(sl.platform), ''),
    v_month,
    s.seq,
    sl.platform,
    coalesce(default_owner.id, lead.id),
    -- Evenly spaced: the middle of the seq-th of n equal slices of the month.
    v_days[1 + floor((2 * s.seq - 1) * v_day_count / (2.0 * sl.quantity_per_month))::integer],
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

comment on function public.generate_month_deliverables(date, uuid) is
  'Creates the month''s deliverables from active retainers'' scope lines. Defaults to next month (Asia/Qatar). Idempotent. Returns how many were created.';

revoke execute on function public.generate_month_deliverables(date, uuid) from public, anon;
grant execute on function public.generate_month_deliverables(date, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Schedule: 06:00 UTC on the 25th = 09:00 in Doha. Skipped (with a notice) where
-- pg_cron is not available, e.g. plain Postgres used for local tests.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'numu-generate-next-month',
      '0 6 25 * *',
      'select public.generate_month_deliverables()'
    );
  else
    raise notice 'pg_cron is not available: generate_month_deliverables() will not run on the 25th automatically';
  end if;
end;
$$;
