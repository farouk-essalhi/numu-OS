-- Subtasks and the In progress step for tasks.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

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

insert into public.team_members (id, full_name, email, access_level) values
  ('bbbbbbbb-7000-4000-8000-000000000001', 'Sub Lead',    'sub.lead@test.example',    'account_lead'),
  ('bbbbbbbb-7000-4000-8000-000000000002', 'Sub Creator', 'sub.creator@test.example', 'creator');
insert into auth.users (id, email) values
  ('aaaaaaaa-7000-4000-8000-000000000001', 'sub.lead@test.example'),
  ('aaaaaaaa-7000-4000-8000-000000000002', 'sub.creator@test.example');
insert into public.clients (id, name_en) values
  ('cccccccc-7000-4000-8000-000000000001', 'Sub Client'),
  ('cccccccc-7000-4000-8000-000000000002', 'Other Client');
insert into public.projects (id, client_id, name_en, fixed_fee_minor) values
  ('ffffffff-7000-4000-8000-000000000001', 'cccccccc-7000-4000-8000-000000000001', 'Website rebuild', 4000000);
insert into public.retainers (id, client_id, status, start_date, monthly_fee_minor) values
  ('dddddddd-7000-4000-8000-000000000002', 'cccccccc-7000-4000-8000-000000000002', 'active', '2026-01-01', 1000000);

-- The big task, on a campaign
insert into public.deliverables (id, client_id, project_id, deliverable_type, title, month, due_date, effort_points) values
  ('99999999-7000-4000-8000-000000000001', 'cccccccc-7000-4000-8000-000000000001', 'ffffffff-7000-4000-8000-000000000001',
   'task', 'Website rebuild', '2026-11-01', '2026-11-30', 1);

select pg_temp.login('aaaaaaaa-7000-4000-8000-000000000002'); -- creator (may create tasks)
select lives_ok(
  $$ insert into public.deliverables (id, client_id, parent_id, deliverable_type, title, month, due_date, effort_points, owner_id, sort_order)
     values ('99999999-7000-4000-8000-000000000002', 'cccccccc-7000-4000-8000-000000000002', '99999999-7000-4000-8000-000000000001',
             'task', 'Homepage design', '2026-11-01', '2026-11-12', 2, 'bbbbbbbb-7000-4000-8000-000000000002', 1) $$,
  'anyone who creates tasks can add a subtask'
);
select pg_temp.logout();
select results_eq(
  $$ select client_id, project_id, retainer_id from public.deliverables where id = '99999999-7000-4000-8000-000000000002' $$,
  $$ values ('cccccccc-7000-4000-8000-000000000001'::uuid, 'ffffffff-7000-4000-8000-000000000001'::uuid, null::uuid) $$,
  'a subtask takes its parent''s client and campaign, whatever was sent'
);

insert into public.deliverables (id, client_id, parent_id, deliverable_type, title, month, due_date, effort_points, sort_order) values
  ('99999999-7000-4000-8000-000000000003', 'cccccccc-7000-4000-8000-000000000001', '99999999-7000-4000-8000-000000000001',
   'task', 'Copywriting', '2026-11-01', '2026-11-15', 1, 2);

select throws_ok(
  $$ insert into public.deliverables (client_id, parent_id, deliverable_type, title, month, due_date, effort_points)
     values ('cccccccc-7000-4000-8000-000000000001', '99999999-7000-4000-8000-000000000002', 'task', 'Too deep', '2026-11-01', '2026-11-12', 1) $$,
  '23514', 'Subtasks can''t have subtasks of their own',
  'one level only'
);
select throws_ok(
  $$ insert into public.deliverables (client_id, parent_id, deliverable_type, title, month, due_date, effort_points)
     values ('cccccccc-7000-4000-8000-000000000001', '99999999-7000-4000-8000-000000000001', 'reel', 'A reel', '2026-11-01', '2026-11-12', 3) $$,
  '23514', 'Subtasks are tasks, not content',
  'subtasks are tasks, so content numbers stay clean'
);
select throws_ok(
  $$ update public.deliverables set parent_id = '99999999-7000-4000-8000-000000000003' where id = '99999999-7000-4000-8000-000000000001' $$,
  '23514', null,
  'a task with subtasks can''t become a subtask'
);
select throws_ok(
  $$ update public.deliverables set parent_id = id where id = '99999999-7000-4000-8000-000000000003' $$,
  '23514', null,
  'nothing is its own parent'
);

-- In progress
select pg_temp.login('aaaaaaaa-7000-4000-8000-000000000002');
select lives_ok(
  $$ update public.deliverables set status = 'in_progress' where id = '99999999-7000-4000-8000-000000000002' $$,
  'a task goes To do → In progress'
);
select lives_ok(
  $$ update public.deliverables set status = 'done' where id = '99999999-7000-4000-8000-000000000002' $$,
  '...→ Done'
);
select throws_ok(
  $$ update public.deliverables set status = 'editing' where id = '99999999-7000-4000-8000-000000000003' $$,
  '23514', 'A task is To do, In progress or Done',
  'tasks still can''t use content steps'
);
select pg_temp.logout();
select is(
  (select array_agg(to_status::text order by id) from public.status_events where deliverable_id = '99999999-7000-4000-8000-000000000002'),
  array['planned', 'in_progress', 'done'],
  'every step is in the history'
);
update public.deliverables set status = 'in_progress', due_date = '2020-01-10' where id = '99999999-7000-4000-8000-000000000003';
select is(
  (select is_overdue from public.deliverable_board where id = '99999999-7000-4000-8000-000000000003'),
  true,
  'work in progress past its due date is late'
);

insert into public.deliverables (id, client_id, retainer_id, deliverable_type, title, month, due_date, effort_points) values
  ('99999999-7000-4000-8000-000000000009', 'cccccccc-7000-4000-8000-000000000002', 'dddddddd-7000-4000-8000-000000000002',
   'reel', 'Some reel', '2026-11-01', '2026-11-12', 3);
select throws_ok(
  $$ update public.deliverables set status = 'in_progress' where id = '99999999-7000-4000-8000-000000000009' $$,
  '23514', null,
  'content doesn''t use In progress'
);

-- The parent moves: subtasks follow
update public.deliverables set project_id = null, retainer_id = 'dddddddd-7000-4000-8000-000000000002', client_id = 'cccccccc-7000-4000-8000-000000000002'
 where id = '99999999-7000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.deliverables
    where parent_id = '99999999-7000-4000-8000-000000000001'
      and client_id = 'cccccccc-7000-4000-8000-000000000002' and retainer_id = 'dddddddd-7000-4000-8000-000000000002' and project_id is null),
  2,
  'when the parent moves to another client, its subtasks go with it'
);
select is(
  (select scope_line_id from public.deliverables where id = '99999999-7000-4000-8000-000000000002'),
  null,
  'subtasks never count against scope'
);

-- Order and delete
select results_eq(
  $$ select title from public.deliverables where parent_id = '99999999-7000-4000-8000-000000000001' order by sort_order $$,
  $$ values ('Homepage design'), ('Copywriting') $$,
  'subtasks keep the order they were put in'
);
select pg_temp.login('aaaaaaaa-7000-4000-8000-000000000001'); -- lead
delete from public.deliverables where id = '99999999-7000-4000-8000-000000000001';
select pg_temp.logout();
select is(
  (select count(*)::int from public.deliverables where parent_id = '99999999-7000-4000-8000-000000000001'),
  0,
  'deleting a task deletes its subtasks'
);
select is(
  (select count(*)::int from public.status_events where deliverable_id = '99999999-7000-4000-8000-000000000002'),
  0,
  '...and their history'
);

select * from finish();
rollback;
