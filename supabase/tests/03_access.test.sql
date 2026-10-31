-- Row-level security: each role sees and changes only what it should.
-- This is the "log in as each role" gate check, automated.
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function pg_temp.login_anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $$;

create function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures: one person per role, two clients with a full month's setup each.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-2000-4000-8000-000000000001', 'acl.partner@test.example'),
  ('aaaaaaaa-2000-4000-8000-000000000002', 'acl.lead@test.example'),
  ('aaaaaaaa-2000-4000-8000-000000000003', 'acl.creator@test.example'),
  ('aaaaaaaa-2000-4000-8000-000000000004', 'acl.client@test.example'),
  ('aaaaaaaa-2000-4000-8000-000000000005', 'acl.stranger@test.example'),
  ('aaaaaaaa-2000-4000-8000-000000000006', 'acl.former@test.example');

insert into public.team_members (id, full_name, email, access_level, is_active) values
  ('bbbbbbbb-2000-4000-8000-000000000001', 'ACL Partner', 'acl.partner@test.example', 'partner',      true),
  ('bbbbbbbb-2000-4000-8000-000000000002', 'ACL Lead',    'acl.lead@test.example',    'account_lead', true),
  ('bbbbbbbb-2000-4000-8000-000000000003', 'ACL Creator', 'acl.creator@test.example', 'creator',      true),
  ('bbbbbbbb-2000-4000-8000-000000000006', 'ACL Former',  'acl.former@test.example',  'partner',      false);

insert into public.clients (id, name_en, account_lead_id) values
  ('cccccccc-2000-4000-8000-000000000001', 'ACL Client A', 'bbbbbbbb-2000-4000-8000-000000000002'),
  ('cccccccc-2000-4000-8000-000000000002', 'ACL Client B', 'bbbbbbbb-2000-4000-8000-000000000002');

insert into public.contacts (id, client_id, full_name, email, is_approver) values
  ('cdcdcdcd-2000-4000-8000-000000000001', 'cccccccc-2000-4000-8000-000000000001', 'Client A approver', 'acl.client@test.example', true),
  ('cdcdcdcd-2000-4000-8000-000000000002', 'cccccccc-2000-4000-8000-000000000001', 'Client A colleague', 'colleague@a.example', false),
  ('cdcdcdcd-2000-4000-8000-000000000003', 'cccccccc-2000-4000-8000-000000000002', 'Client B approver', 'approver@b.example', true);

insert into public.retainers (id, client_id, status, start_date, monthly_fee_minor) values
  ('dddddddd-2000-4000-8000-000000000001', 'cccccccc-2000-4000-8000-000000000001', 'active', '2026-01-01', 2000000),
  ('dddddddd-2000-4000-8000-000000000002', 'cccccccc-2000-4000-8000-000000000002', 'active', '2026-01-01', 2500000);

insert into public.scope_lines (retainer_id, deliverable_type, quantity_per_month, default_owner_id) values
  ('dddddddd-2000-4000-8000-000000000001', 'reel', 2, 'bbbbbbbb-2000-4000-8000-000000000003'),
  ('dddddddd-2000-4000-8000-000000000002', 'reel', 2, 'bbbbbbbb-2000-4000-8000-000000000003');

insert into public.projects (id, client_id, name_en, fixed_fee_minor) values
  ('ffffffff-2000-4000-8000-000000000001', 'cccccccc-2000-4000-8000-000000000001', 'ACL Campaign', 3000000);

select public.generate_month_deliverables('2031-03-01', 'dddddddd-2000-4000-8000-000000000001');
select public.generate_month_deliverables('2031-03-01', 'dddddddd-2000-4000-8000-000000000002');

insert into public.deliverables (id, retainer_id, deliverable_type, title, due_date) values
  ('99999999-2000-4000-8000-000000000001', 'dddddddd-2000-4000-8000-000000000001', 'reel', 'Known reel', '2031-03-05');

insert into public.comments (id, deliverable_id, author_team_member_id, body)
select '77777777-2000-4000-8000-000000000001', d.id, 'bbbbbbbb-2000-4000-8000-000000000002', 'Internal note'
from public.deliverables d
where d.retainer_id = 'dddddddd-2000-4000-8000-000000000001'
order by d.seq
limit 1;

-- ---------------------------------------------------------------------------
-- Not logged in
-- ---------------------------------------------------------------------------
select pg_temp.login_anon();

select throws_ok($$ select * from public.clients $$, '42501', null, 'anon: no access to clients');
select throws_ok($$ select * from public.deliverables $$, '42501', null, 'anon: no access to deliverables');
select throws_ok($$ select * from public.deliverable_board $$, '42501', null, 'anon: no access to the board');
select throws_ok($$ select * from public.retainers $$, '42501', null, 'anon: no access to retainers');
select throws_ok(
  $$ select public.generate_month_deliverables('2031-04-01') $$,
  '42501', null, 'anon: cannot run the generator'
);

-- ---------------------------------------------------------------------------
-- Logged in, but not a team member or contact (or no longer active)
-- ---------------------------------------------------------------------------
select pg_temp.login('aaaaaaaa-2000-4000-8000-000000000005');

select is_empty($$ select 1 from public.clients $$,      'stranger: sees no clients');
select is_empty($$ select 1 from public.team_members $$, 'stranger: sees no team');
select is_empty($$ select 1 from public.deliverables $$, 'stranger: sees no deliverables');
select is_empty($$ select 1 from public.contacts $$,     'stranger: sees no contacts');
select is_empty($$ select 1 from public.comments $$,     'stranger: sees no comments');
select throws_ok(
  $$ insert into public.clients (name_en) values ('Sneaky') $$,
  '42501', null, 'stranger: cannot add a client'
);

select pg_temp.login('aaaaaaaa-2000-4000-8000-000000000006');
select is_empty($$ select 1 from public.clients $$, 'deactivated partner: sees nothing');

-- ---------------------------------------------------------------------------
-- Creator
-- ---------------------------------------------------------------------------
select pg_temp.login('aaaaaaaa-2000-4000-8000-000000000003');

select isnt_empty(
  $$ select 1 from public.clients where id = 'cccccccc-2000-4000-8000-000000000001' $$,
  'creator: sees clients'
);
select isnt_empty($$ select 1 from public.scope_lines where retainer_id = 'dddddddd-2000-4000-8000-000000000001' $$,
  'creator: sees what each client buys');
select is(
  (select count(*) from public.deliverable_board where client_id in ('cccccccc-2000-4000-8000-000000000001', 'cccccccc-2000-4000-8000-000000000002')),
  5::bigint,
  'creator: sees the whole board'
);
select is_empty($$ select 1 from public.retainers $$, 'creator: cannot see retainers (fees)');
select is_empty($$ select 1 from public.projects $$,  'creator: cannot see projects (fees)');
select isnt_empty($$ select 1 from public.comments where id = '77777777-2000-4000-8000-000000000001' $$,
  'creator: sees internal comments');
select throws_ok(
  $$ insert into public.deliverables (retainer_id, deliverable_type, title, due_date)
     values ('dddddddd-2000-4000-8000-000000000001', 'reel', 'Extra', '2031-03-10') $$,
  '42501', null, 'creator: cannot add deliverables'
);
select lives_ok(
  $$ update public.deliverables set status = 'editing' where retainer_id = 'dddddddd-2000-4000-8000-000000000001' and seq = 1 $$,
  'creator: can move a card'
);
select throws_ok(
  $$ select public.generate_month_deliverables('2031-04-01') $$,
  '42501', null, 'creator: cannot run the generator'
);
select throws_ok(
  $$ insert into public.status_events (deliverable_id, to_status)
     select id, 'posted' from public.deliverables limit 1 $$,
  '42501', null, 'creator: cannot write status history'
);

-- Writes RLS silently filters out (0 rows), checked as admin below.
update public.team_members set weekly_capacity_points = 99 where id = 'bbbbbbbb-2000-4000-8000-000000000003';
delete from public.deliverables where retainer_id = 'dddddddd-2000-4000-8000-000000000002';
update public.clients set name_en = 'Renamed by creator' where id = 'cccccccc-2000-4000-8000-000000000001';

select pg_temp.logout();
select is(
  (select weekly_capacity_points from public.team_members where id = 'bbbbbbbb-2000-4000-8000-000000000003'),
  0,
  'creator: cannot change their own capacity'
);
select is(
  (select count(*) from public.deliverables where retainer_id = 'dddddddd-2000-4000-8000-000000000002'),
  2::bigint,
  'creator: cannot delete deliverables'
);
select is(
  (select name_en from public.clients where id = 'cccccccc-2000-4000-8000-000000000001'),
  'ACL Client A',
  'creator: cannot edit clients'
);

-- ---------------------------------------------------------------------------
-- Account lead
-- ---------------------------------------------------------------------------
select pg_temp.login('aaaaaaaa-2000-4000-8000-000000000002');

select is(
  (select count(*) from public.retainers where id in ('dddddddd-2000-4000-8000-000000000001', 'dddddddd-2000-4000-8000-000000000002')),
  2::bigint,
  'lead: sees retainers'
);
select isnt_empty($$ select 1 from public.projects where id = 'ffffffff-2000-4000-8000-000000000001' $$, 'lead: sees projects');
select lives_ok(
  $$ insert into public.deliverables (retainer_id, deliverable_type, title, due_date)
     values ('dddddddd-2000-4000-8000-000000000001', 'reel', 'Extra outside scope', '2031-03-10') $$,
  'lead: can add a deliverable (an extra outside scope)'
);
select lives_ok(
  $$ update public.clients set industry = 'Retail' where id = 'cccccccc-2000-4000-8000-000000000001' $$,
  'lead: can edit clients'
);
select lives_ok(
  $$ select public.generate_month_deliverables('2031-04-01', 'dddddddd-2000-4000-8000-000000000001') $$,
  'lead: can run the generator'
);
select throws_ok(
  $$ insert into public.team_members (full_name, access_level) values ('New hire', 'creator') $$,
  '42501', null, 'lead: cannot add team members'
);

delete from public.retainers where id = 'dddddddd-2000-4000-8000-000000000002';

select pg_temp.logout();
select isnt_empty(
  $$ select 1 from public.retainers where id = 'dddddddd-2000-4000-8000-000000000002' $$,
  'lead: cannot delete retainers'
);

-- ---------------------------------------------------------------------------
-- Partner
-- ---------------------------------------------------------------------------
select pg_temp.login('aaaaaaaa-2000-4000-8000-000000000001');

select lives_ok(
  $$ insert into public.team_members (full_name, email, access_level) values ('New hire', 'new.hire@test.example', 'creator') $$,
  'partner: can add team members'
);
select lives_ok(
  $$ update public.team_members set weekly_capacity_points = 20 where email = 'new.hire@test.example' $$,
  'partner: can set capacity'
);
select is(
  (select count(*) from public.retainers where id in ('dddddddd-2000-4000-8000-000000000001', 'dddddddd-2000-4000-8000-000000000002')),
  2::bigint,
  'partner: sees retainers'
);
select throws_ok(
  $$ update public.deliverable_types set effort_points = 9 where code = 'reel' $$,
  '42501', null, 'partner: deliverable types change by migration only'
);
select throws_ok(
  $$ delete from public.status_events $$,
  '42501', null, 'partner: status history cannot be deleted'
);

-- ---------------------------------------------------------------------------
-- Client contact (phase 1: their own client and contact row, nothing else)
-- ---------------------------------------------------------------------------
select pg_temp.login('aaaaaaaa-2000-4000-8000-000000000004');

select results_eq(
  $$ select id from public.clients $$,
  $$ values ('cccccccc-2000-4000-8000-000000000001'::uuid) $$,
  'client: sees only their own client'
);
select results_eq(
  $$ select id from public.contacts $$,
  $$ values ('cdcdcdcd-2000-4000-8000-000000000001'::uuid) $$,
  'client: sees only their own contact row'
);
select is_empty($$ select 1 from public.deliverables $$,   'client: no direct access to deliverables (portal comes in phase 3)');
select is_empty($$ select 1 from public.deliverable_board $$, 'client: board is empty');
select is_empty($$ select 1 from public.comments $$,       'client: never sees internal comments');
select is_empty($$ select 1 from public.retainers $$,      'client: no retainers');
select is_empty($$ select 1 from public.team_members $$,   'client: no team list');
select is_empty($$ select 1 from public.status_events $$,  'client: no status history');
select throws_ok(
  $$ insert into public.comments (deliverable_id, body)
     values ('99999999-2000-4000-8000-000000000001', 'hello') $$,
  '42501', null, 'client: cannot comment directly yet'
);
update public.contacts set is_approver = false where id = 'cdcdcdcd-2000-4000-8000-000000000001';

select pg_temp.logout();
select is(
  (select is_approver from public.contacts where id = 'cdcdcdcd-2000-4000-8000-000000000001'),
  true,
  'client: cannot edit their own contact row'
);

select * from finish();
rollback;
