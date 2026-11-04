-- The monthly deliverable generator: right count per scope line, right dates,
-- right owners, safe to re-run, and only for active retainers of active clients.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'gen.lead@test.example'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'gen.creator@test.example');

insert into public.team_members (id, full_name, email, access_level, is_active) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'Gen Lead',     'gen.lead@test.example',    'account_lead', true),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Gen Creator',  'gen.creator@test.example', 'creator',      true),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'Gen Departed', null,                        'creator',      false);

insert into public.clients (id, name_en, account_lead_id, status) values
  ('cccccccc-0000-4000-8000-000000000001', 'Gen Active Client', 'bbbbbbbb-0000-4000-8000-000000000001', 'active'),
  ('cccccccc-0000-4000-8000-000000000002', 'Gen Paused Client', 'bbbbbbbb-0000-4000-8000-000000000001', 'paused');

insert into public.retainers (id, client_id, status, start_date, end_date, monthly_fee_minor) values
  -- the one that should generate
  ('dddddddd-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'active', '2026-01-01', null,         1000000),
  -- ones that should not
  ('dddddddd-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000001', 'paused', '2026-01-01', null,         1000000),
  ('dddddddd-0000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-000000000001', 'active', '2026-01-01', '2031-02-28', 1000000),
  ('dddddddd-0000-4000-8000-000000000004', 'cccccccc-0000-4000-8000-000000000001', 'draft',  '2026-01-01', null,         1000000),
  ('dddddddd-0000-4000-8000-000000000005', 'cccccccc-0000-4000-8000-000000000002', 'active', '2026-01-01', null,         1000000),
  ('dddddddd-0000-4000-8000-000000000006', 'cccccccc-0000-4000-8000-000000000001', 'active', '2031-04-01', null,         1000000);

insert into public.scope_lines (id, retainer_id, deliverable_type, quantity_per_month, platform, default_owner_id) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 'reel',        6, 'instagram', 'bbbbbbbb-0000-4000-8000-000000000002'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000001', 'static_post', 8, 'instagram', 'bbbbbbbb-0000-4000-8000-000000000003'),
  ('eeeeeeee-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000001', 'shoot_day',   1, null,        null);

insert into public.scope_lines (retainer_id, deliverable_type, quantity_per_month)
select r.id, 'reel', 2
from public.retainers r
where r.id in ('dddddddd-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000003',
               'dddddddd-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000005',
               'dddddddd-0000-4000-8000-000000000006');

-- ---------------------------------------------------------------------------
-- Generating March 2031 for the active retainer
-- ---------------------------------------------------------------------------
select is(
  public.generate_month_deliverables('2031-03-01', 'dddddddd-0000-4000-8000-000000000001'),
  15,
  'creates one deliverable per unit of scope (6 + 8 + 1)'
);

select results_eq(
  $$ select sl.quantity_per_month::bigint, count(d.id)
       from public.scope_lines sl
       left join public.deliverables d on d.scope_line_id = sl.id and d.month = '2031-03-01'
      where sl.retainer_id = 'dddddddd-0000-4000-8000-000000000001'
      group by sl.id, sl.quantity_per_month
      order by sl.quantity_per_month $$,
  $$ values (1::bigint, 1::bigint), (6, 6), (8, 8) $$,
  'every scope line gets exactly its monthly quantity'
);

select is(
  (select count(*) from public.deliverables
    where retainer_id = 'dddddddd-0000-4000-8000-000000000001'
      and month = '2031-03-01'
      and due_date between '2031-03-01' and '2031-03-31'),
  15::bigint,
  'all due dates fall inside the month'
);

select is(
  (select count(*) from public.deliverables
    where retainer_id = 'dddddddd-0000-4000-8000-000000000001'
      and extract(isodow from due_date) in (5, 6)),
  0::bigint,
  'no due dates on Friday or Saturday'
);

select is(
  (select count(distinct due_date) from public.deliverables
    where scope_line_id = 'eeeeeeee-0000-4000-8000-000000000001'),
  6::bigint,
  'Reels are spread over six different days'
);

select ok(
  (select max(due_date) - min(due_date) >= 20 from public.deliverables
    where scope_line_id = 'eeeeeeee-0000-4000-8000-000000000002'),
  'statics span most of the month, not bunched at the start'
);

select results_eq(
  $$ select title from public.deliverables
      where scope_line_id = 'eeeeeeee-0000-4000-8000-000000000001' order by seq $$,
  $$ values ('Reel 1/6 · Instagram'), ('Reel 2/6 · Instagram'), ('Reel 3/6 · Instagram'),
            ('Reel 4/6 · Instagram'), ('Reel 5/6 · Instagram'), ('Reel 6/6 · Instagram') $$,
  'titles are numbered and name the platform'
);

select is(
  (select title from public.deliverables where scope_line_id = 'eeeeeeee-0000-4000-8000-000000000003'),
  'Shoot day',
  'one a month: no "1/1", and no platform, no platform suffix'
);

select is(
  (select array_agg(distinct owner_id) from public.deliverables where scope_line_id = 'eeeeeeee-0000-4000-8000-000000000001'),
  array['bbbbbbbb-0000-4000-8000-000000000002'::uuid],
  'the scope line''s default owner gets the work'
);

select is(
  (select array_agg(distinct owner_id) from public.deliverables
    where scope_line_id in ('eeeeeeee-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000003')),
  array['bbbbbbbb-0000-4000-8000-000000000001'::uuid],
  'no default owner, or an inactive one, falls back to the account lead'
);

select is(
  (select array_agg(distinct status::text) from public.deliverables where retainer_id = 'dddddddd-0000-4000-8000-000000000001'),
  array['planned'],
  'everything starts Planned'
);

select is(
  (select array_agg(distinct effort_points) from public.deliverables where scope_line_id = 'eeeeeeee-0000-4000-8000-000000000001'),
  array[3::smallint],
  'effort points come from the deliverable type'
);

select is(
  (select array_agg(distinct client_id) from public.deliverables where retainer_id = 'dddddddd-0000-4000-8000-000000000001'),
  array['cccccccc-0000-4000-8000-000000000001'::uuid],
  'deliverables carry the retainer''s client'
);

select is(
  (select count(*) from public.status_events se
     join public.deliverables d on d.id = se.deliverable_id
    where d.retainer_id = 'dddddddd-0000-4000-8000-000000000001'
      and se.from_status is null and se.to_status = 'planned'),
  15::bigint,
  'each new deliverable has its "created" status event'
);

-- ---------------------------------------------------------------------------
-- Re-running
-- ---------------------------------------------------------------------------
select is(
  public.generate_month_deliverables('2031-03-01', 'dddddddd-0000-4000-8000-000000000001'),
  0,
  'running the same month again creates nothing'
);

update public.scope_lines set quantity_per_month = 8 where id = 'eeeeeeee-0000-4000-8000-000000000001';

select is(
  public.generate_month_deliverables('2031-03-01', 'dddddddd-0000-4000-8000-000000000001'),
  2,
  'raising a quantity and re-running adds only the difference'
);

-- ---------------------------------------------------------------------------
-- Which retainers count
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select public.generate_month_deliverables('2031-03-01') $$,
  'generating for every retainer works'
);

select is(
  (select count(*) from public.deliverables
    where retainer_id in ('dddddddd-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000003',
                          'dddddddd-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000005',
                          'dddddddd-0000-4000-8000-000000000006')),
  0::bigint,
  'paused, ended, draft, not-yet-started retainers and paused clients get nothing'
);

-- ---------------------------------------------------------------------------
-- Month argument
-- ---------------------------------------------------------------------------
select is(
  public.generate_month_deliverables('2031-05-17', 'dddddddd-0000-4000-8000-000000000001'),
  17,
  'any date inside a month generates that month (8 + 8 + 1 now)'
);

select is(
  (select array_agg(distinct month) from public.deliverables
    where retainer_id = 'dddddddd-0000-4000-8000-000000000001' and due_date between '2031-05-01' and '2031-05-31'),
  array['2031-05-01'::date],
  '...and files it under the 1st of the month'
);

select is(
  public.generate_month_deliverables(null, 'dddddddd-0000-4000-8000-000000000001'),
  17,
  'with no month it generates next month'
);

select ok(
  exists (select 1 from public.deliverables
           where retainer_id = 'dddddddd-0000-4000-8000-000000000001'
             and month = date_trunc('month', (private.qatar_today() + interval '1 month')::timestamp)::date),
  '...where next month is counted from today in Doha'
);

-- ---------------------------------------------------------------------------
-- Schedule: the job on the 25th exists wherever pg_cron is installed
-- (always on Supabase; skipped on plain Postgres).
-- ---------------------------------------------------------------------------
create function pg_temp.generator_is_scheduled() returns boolean language plpgsql as $$
declare
  v_found boolean;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return null;
  end if;
  execute $q$ select exists (select 1 from cron.job
                              where jobname = 'numu-generate-next-month'
                                and schedule = '0 6 25 * *'
                                and command = 'select public.generate_month_deliverables()') $q$
    into v_found;
  return v_found;
end $$;

select case
  when pg_temp.generator_is_scheduled() is null then skip('pg_cron is not installed here', 1)
  else ok(pg_temp.generator_is_scheduled(), 'pg_cron runs the generator at 06:00 UTC (09:00 Doha) on the 25th')
end;

-- ---------------------------------------------------------------------------
-- Who can run it
-- ---------------------------------------------------------------------------
select pg_temp.login('aaaaaaaa-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.generate_month_deliverables('2031-06-01', 'dddddddd-0000-4000-8000-000000000001') $$,
  '42501', null,
  'creators cannot run the generator'
);

select pg_temp.login('aaaaaaaa-0000-4000-8000-000000000001');
select is(
  public.generate_month_deliverables('2031-06-01', 'dddddddd-0000-4000-8000-000000000001'),
  17,
  'account leads can'
);
select pg_temp.logout();

select * from finish();
rollback;
