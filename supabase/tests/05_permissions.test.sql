-- Permissions per person: role defaults, who can change them, and what they
-- allow (approve, send to client / record the answer, create tasks).
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

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

-- Explicit values on insert are replaced by the role's defaults.
insert into public.team_members (id, full_name, email, access_level, can_approve) values
  ('bbbbbbbb-5000-4000-8000-000000000001', 'Perm Partner', 'perm.partner@test.example', 'partner',      false),
  ('bbbbbbbb-5000-4000-8000-000000000002', 'Perm Lead',    'perm.lead@test.example',    'account_lead', true),
  ('bbbbbbbb-5000-4000-8000-000000000003', 'Perm Creator', 'perm.creator@test.example', 'creator',      true);
insert into auth.users (id, email) values
  ('aaaaaaaa-5000-4000-8000-000000000001', 'perm.partner@test.example'),
  ('aaaaaaaa-5000-4000-8000-000000000002', 'perm.lead@test.example'),
  ('aaaaaaaa-5000-4000-8000-000000000003', 'perm.creator@test.example');
insert into public.clients (id, name_en) values ('cccccccc-5000-4000-8000-000000000001', 'Perm Client');
insert into public.retainers (id, client_id, status, start_date, monthly_fee_minor) values
  ('dddddddd-5000-4000-8000-000000000001', 'cccccccc-5000-4000-8000-000000000001', 'active', '2026-01-01', 1000000);
insert into public.deliverables (id, client_id, retainer_id, deliverable_type, title, month, due_date, effort_points, status) values
  ('99999999-5000-4000-8000-000000000001', 'cccccccc-5000-4000-8000-000000000001', 'dddddddd-5000-4000-8000-000000000001',
   'reel', 'Perm reel', '2026-11-01', '2026-11-10', 3, 'internal_review');

select results_eq(
  $$ select access_level::text, can_create_tasks, can_send_to_client, can_approve from public.team_members
      where id::text like 'bbbbbbbb-5000-%' order by access_level $$,
  $$ values ('account_lead', true, true, false), ('creator', true, false, false), ('partner', true, true, true) $$,
  'new people get their role''s permissions: partners approve, partners and leads send to the client, everyone creates tasks'
);

-- Only partners change permissions
select pg_temp.login('aaaaaaaa-5000-4000-8000-000000000002'); -- lead
update public.team_members set can_approve = true where id = 'bbbbbbbb-5000-4000-8000-000000000002';
select pg_temp.logout();
select is(
  (select can_approve from public.team_members where id = 'bbbbbbbb-5000-4000-8000-000000000002'),
  false,
  'an account lead can''t give themselves approval'
);

-- Approve
select pg_temp.login('aaaaaaaa-5000-4000-8000-000000000003'); -- creator
select throws_ok(
  $$ update public.deliverables set status = 'approved' where id = '99999999-5000-4000-8000-000000000001' $$,
  '42501', 'You don''t have permission to approve work. Partners set this in Team → Permissions',
  'without "approve", marking Approved is refused, with a reason'
);
select throws_ok(
  $$ insert into public.deliverables (client_id, retainer_id, deliverable_type, title, due_date, status)
     values ('cccccccc-5000-4000-8000-000000000001', 'dddddddd-5000-4000-8000-000000000001', 'reel', 'Pre-approved', '2026-11-12', 'approved') $$,
  '42501', null,
  '...also when adding work straight into Approved'
);
select throws_ok(
  $$ update public.deliverables set status = 'client_review' where id = '99999999-5000-4000-8000-000000000001' $$,
  '42501', null,
  'without "send to client", Client review is refused'
);

select pg_temp.login('aaaaaaaa-5000-4000-8000-000000000002'); -- lead
select lives_ok(
  $$ update public.deliverables set status = 'client_review' where id = '99999999-5000-4000-8000-000000000001' $$,
  'an account lead sends work to the client'
);
select throws_ok(
  $$ update public.deliverables set status = 'approved' where id = '99999999-5000-4000-8000-000000000001' $$,
  '42501', null,
  '...but can''t approve it'
);
select lives_ok(
  $$ update public.deliverables set status = 'editing' where id = '99999999-5000-4000-8000-000000000001' $$,
  '...and records the client''s changes'
);
select is(
  (select revision_count from public.deliverables where id = '99999999-5000-4000-8000-000000000001'),
  1::smallint,
  'which counts a revision'
);

-- A partner grants and revokes
select pg_temp.login('aaaaaaaa-5000-4000-8000-000000000001'); -- partner
update public.team_members set can_send_to_client = true, can_approve = true where id = 'bbbbbbbb-5000-4000-8000-000000000003';
update public.team_members set can_send_to_client = false where id = 'bbbbbbbb-5000-4000-8000-000000000002';

select pg_temp.login('aaaaaaaa-5000-4000-8000-000000000003'); -- creator, now trusted
select lives_ok(
  $$ update public.deliverables set status = 'client_review' where id = '99999999-5000-4000-8000-000000000001' $$,
  'a creator a partner trusts can send to the client'
);
select lives_ok(
  $$ update public.deliverables set status = 'approved' where id = '99999999-5000-4000-8000-000000000001' $$,
  '...and approve'
);
select is(
  (select changed_by_team_member_id from public.status_events
    where deliverable_id = '99999999-5000-4000-8000-000000000001' and to_status = 'approved'),
  'bbbbbbbb-5000-4000-8000-000000000003'::uuid,
  'the approval is recorded against them'
);

select pg_temp.login('aaaaaaaa-5000-4000-8000-000000000002'); -- lead, permission taken away
select throws_ok(
  $$ update public.deliverables set status = 'client_review' where id = '99999999-5000-4000-8000-000000000001' $$,
  '42501', null,
  'a lead whose "send to client" was turned off can''t any more'
);

-- Inactive people lose everything
select pg_temp.logout();
update public.team_members set is_active = false where id = 'bbbbbbbb-5000-4000-8000-000000000001';
select pg_temp.login('aaaaaaaa-5000-4000-8000-000000000001');
select throws_ok(
  $$ insert into public.deliverables (client_id, deliverable_type, title, due_date)
     values ('cccccccc-5000-4000-8000-000000000001', 'follow_up', 'Ghost task', '2026-11-12') $$,
  '42501', null,
  'an inactive partner can''t add work'
);

select * from finish();
rollback;
