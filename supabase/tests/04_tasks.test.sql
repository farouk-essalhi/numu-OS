-- Tasks next to deliverables: types, the to-do/done rule, standalone tasks,
-- pinned due days and generator titles, and what a creator may do.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

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

-- Fixtures
insert into public.team_members (id, full_name, email, access_level) values
  ('bbbbbbbb-4000-4000-8000-000000000001', 'Task Lead',    'task.lead@test.example',    'account_lead'),
  ('bbbbbbbb-4000-4000-8000-000000000002', 'Task Creator', 'task.creator@test.example', 'creator');
insert into auth.users (id, email) values
  ('aaaaaaaa-4000-4000-8000-000000000001', 'task.lead@test.example'),
  ('aaaaaaaa-4000-4000-8000-000000000002', 'task.creator@test.example');
insert into public.clients (id, name_en, account_lead_id) values
  ('cccccccc-4000-4000-8000-000000000001', 'Task Client', 'bbbbbbbb-4000-4000-8000-000000000001');
insert into public.retainers (id, client_id, status, start_date, monthly_fee_minor) values
  ('dddddddd-4000-4000-8000-000000000001', 'cccccccc-4000-4000-8000-000000000001', 'active', '2026-01-01', 1000000);

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select code from public.deliverable_types where not is_content order by sort_order $$,
  $$ values ('follow_up'), ('content_calendar'), ('report'), ('meeting'), ('task') $$,
  'five task types, after the content types'
);
select ok(
  (select bool_and(is_content) from public.deliverable_types where code in ('reel', 'static_post', 'carousel', 'story_set', 'long_video', 'shoot_day', 'ad_set', 'influencer_post')),
  'the eight content types stay content'
);

-- ---------------------------------------------------------------------------
-- Standalone tasks and the parent rule
-- ---------------------------------------------------------------------------
select pg_temp.login('aaaaaaaa-4000-4000-8000-000000000001');

select lives_ok(
  $$ insert into public.deliverables (id, client_id, deliverable_type, title, month, due_date, effort_points)
     values ('99999999-4000-4000-8000-000000000001', 'cccccccc-4000-4000-8000-000000000001', 'follow_up',
             'Chase the Ramadan brief', '2026-11-01', '2026-11-10', 1) $$,
  'a task can belong to just a client'
);
select throws_ok(
  $$ insert into public.deliverables (client_id, deliverable_type, title, month, due_date, effort_points)
     values ('cccccccc-4000-4000-8000-000000000001', 'reel', 'Loose reel', '2026-11-01', '2026-11-10', 3) $$,
  '23514', null,
  'content still needs a retainer or a campaign'
);
select lives_ok(
  $$ insert into public.deliverables (id, client_id, retainer_id, deliverable_type, title, month, due_date, effort_points)
     values ('99999999-4000-4000-8000-000000000002', 'cccccccc-4000-4000-8000-000000000001',
             'dddddddd-4000-4000-8000-000000000001', 'report', 'October report', '2026-11-01', '2026-11-03', 2) $$,
  'a task can also sit on a retainer'
);
select throws_ok(
  $$ update public.deliverables set deliverable_type = 'reel' where id = '99999999-4000-4000-8000-000000000001' $$,
  '23514', null,
  'turning a standalone task into content is refused'
);

-- ---------------------------------------------------------------------------
-- To do or done
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ update public.deliverables set status = 'editing' where id = '99999999-4000-4000-8000-000000000001' $$,
  '23514', 'A task is either to do (Planned) or Done',
  'a task can''t go into production steps'
);

select pg_temp.login('aaaaaaaa-4000-4000-8000-000000000002');
select lives_ok(
  $$ update public.deliverables set status = 'done' where id = '99999999-4000-4000-8000-000000000001' $$,
  'anyone on the team can tick a task done'
);
select pg_temp.logout();

select is(
  (select array_agg(to_status::text order by id) from public.status_events where deliverable_id = '99999999-4000-4000-8000-000000000001'),
  array['planned', 'done'],
  'the history records Done'
);
select is(
  (select changed_by_team_member_id from public.status_events
    where deliverable_id = '99999999-4000-4000-8000-000000000001' and to_status = 'done'),
  'bbbbbbbb-4000-4000-8000-000000000002'::uuid,
  '...by whoever ticked it'
);
select is(
  (select is_overdue from public.deliverable_board where id = '99999999-4000-4000-8000-000000000001'),
  false,
  'a done task is never overdue'
);
select is(
  (select is_overdue from public.deliverable_board where id = '99999999-4000-4000-8000-000000000002'),
  (private.qatar_today() > '2026-11-03'::date),
  'a task still to do is overdue after its due date'
);

select pg_temp.login('aaaaaaaa-4000-4000-8000-000000000001');
select lives_ok(
  $$ insert into public.deliverables (id, client_id, retainer_id, deliverable_type, title, month, due_date, effort_points)
     values ('99999999-4000-4000-8000-000000000003', 'cccccccc-4000-4000-8000-000000000001',
             'dddddddd-4000-4000-8000-000000000001', 'reel', 'Reel', '2026-11-01', '2026-11-10', 3) $$,
  'content on a retainer still works'
);
select throws_ok(
  $$ update public.deliverables set status = 'done' where id = '99999999-4000-4000-8000-000000000003' $$,
  '23514', null,
  'content can''t be marked Done'
);
select pg_temp.logout();

-- ---------------------------------------------------------------------------
-- Creators add their own tasks
-- ---------------------------------------------------------------------------
select pg_temp.login('aaaaaaaa-4000-4000-8000-000000000002');
select lives_ok(
  $$ insert into public.deliverables (client_id, deliverable_type, title, month, due_date, effort_points)
     values ('cccccccc-4000-4000-8000-000000000001', 'follow_up', 'Mine', '2026-11-01', '2026-11-10', 1) $$,
  'creators add tasks too (default permission)'
);
select pg_temp.logout();

-- ---------------------------------------------------------------------------
-- Recurring tasks through the generator
-- ---------------------------------------------------------------------------
insert into public.scope_lines (id, retainer_id, deliverable_type, quantity_per_month, due_day) values
  ('eeeeeeee-4000-4000-8000-000000000001', 'dddddddd-4000-4000-8000-000000000001', 'content_calendar', 1, 20),
  ('eeeeeeee-4000-4000-8000-000000000002', 'dddddddd-4000-4000-8000-000000000001', 'report', 1, 31),
  ('eeeeeeee-4000-4000-8000-000000000003', 'dddddddd-4000-4000-8000-000000000001', 'follow_up', 4, 5);

select is(
  public.generate_month_deliverables('2026-02-01', 'dddddddd-4000-4000-8000-000000000001'),
  6,
  'one calendar, one report and four weekly follow-ups for February'
);
select results_eq(
  $$ select title, due_date from public.deliverables
      where scope_line_id in ('eeeeeeee-4000-4000-8000-000000000001', 'eeeeeeee-4000-4000-8000-000000000002')
        and month = '2026-02-01' order by due_date $$,
  -- 20 Feb 2026 is a Friday -> Sunday 22nd. The 31st doesn't exist: the last working day, Thursday 26th.
  $$ values ('Content calendar', '2026-02-22'::date), ('Report', '2026-02-26'::date) $$,
  'a pinned day moves to the next working day, or the month''s last; no "1/1" in titles'
);
select is(
  (select count(distinct due_date)::int from public.deliverables
    where scope_line_id = 'eeeeeeee-4000-4000-8000-000000000003' and month = '2026-02-01'),
  4,
  'with more than one a month the due day is ignored and they spread out'
);

select * from finish();
rollback;
