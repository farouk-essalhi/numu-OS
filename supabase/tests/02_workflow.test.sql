-- Deliverable workflow: parent consistency, status history, revisions,
-- sign-off rules, Scheduled/Posted rules, comment authors, login linking.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

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
-- Fixtures. Team members are added before their logins exist, like real invites.
-- ---------------------------------------------------------------------------
insert into public.team_members (id, full_name, email, access_level) values
  ('bbbbbbbb-1000-4000-8000-000000000001', 'Flow Lead',    'flow.lead@test.example',    'account_lead'),
  ('bbbbbbbb-1000-4000-8000-000000000002', 'Flow Creator', 'flow.creator@test.example', 'creator');

insert into auth.users (id, email) values
  ('aaaaaaaa-1000-4000-8000-000000000001', 'FLOW.LEAD@test.example'),
  ('aaaaaaaa-1000-4000-8000-000000000002', 'flow.creator@test.example');

select is(
  (select user_id from public.team_members where id = 'bbbbbbbb-1000-4000-8000-000000000001'),
  'aaaaaaaa-1000-4000-8000-000000000001'::uuid,
  'a login is linked to its team member by email (case-insensitive) when the user is created'
);

insert into auth.users (id, email) values ('aaaaaaaa-1000-4000-8000-000000000003', 'late.joiner@test.example');
insert into public.team_members (id, full_name, email, access_level) values
  ('bbbbbbbb-1000-4000-8000-000000000003', 'Late Joiner', 'late.joiner@test.example', 'creator');

select is(
  (select user_id from public.team_members where id = 'bbbbbbbb-1000-4000-8000-000000000003'),
  'aaaaaaaa-1000-4000-8000-000000000003'::uuid,
  '...and when the team member is added after the login exists'
);

insert into public.clients (id, name_en, account_lead_id) values
  ('cccccccc-1000-4000-8000-000000000001', 'Flow Client A', 'bbbbbbbb-1000-4000-8000-000000000001'),
  ('cccccccc-1000-4000-8000-000000000002', 'Flow Client B', 'bbbbbbbb-1000-4000-8000-000000000001');

insert into public.retainers (id, client_id, status, start_date, monthly_fee_minor) values
  ('dddddddd-1000-4000-8000-000000000001', 'cccccccc-1000-4000-8000-000000000001', 'active', '2026-01-01', 1000000),
  ('dddddddd-1000-4000-8000-000000000002', 'cccccccc-1000-4000-8000-000000000002', 'active', '2026-01-01', 1000000);

insert into public.scope_lines (id, retainer_id, deliverable_type, quantity_per_month) values
  ('eeeeeeee-1000-4000-8000-000000000001', 'dddddddd-1000-4000-8000-000000000001', 'reel', 4),
  ('eeeeeeee-1000-4000-8000-000000000002', 'dddddddd-1000-4000-8000-000000000002', 'reel', 4);

insert into public.projects (id, client_id, name_en, fixed_fee_minor) values
  ('ffffffff-1000-4000-8000-000000000001', 'cccccccc-1000-4000-8000-000000000001', 'Flow Campaign', 3000000);

-- ---------------------------------------------------------------------------
-- Parent consistency and defaults
-- ---------------------------------------------------------------------------
insert into public.deliverables (id, retainer_id, scope_line_id, deliverable_type, title, owner_id, due_date) values
  ('99999999-1000-4000-8000-000000000001', 'dddddddd-1000-4000-8000-000000000001',
   'eeeeeeee-1000-4000-8000-000000000001', 'reel', 'Flow reel', 'bbbbbbbb-1000-4000-8000-000000000002', '2031-03-12');

select is(
  (select client_id from public.deliverables where id = '99999999-1000-4000-8000-000000000001'),
  'cccccccc-1000-4000-8000-000000000001'::uuid,
  'client comes from the retainer'
);

select is(
  (select month from public.deliverables where id = '99999999-1000-4000-8000-000000000001'),
  '2031-03-01'::date,
  'month defaults to the due date''s month'
);

select is(
  (select effort_points from public.deliverables where id = '99999999-1000-4000-8000-000000000001'),
  3::smallint,
  'effort points default from the type'
);

select throws_ok(
  $$ insert into public.deliverables (client_id, retainer_id, deliverable_type, title, due_date)
     values ('cccccccc-1000-4000-8000-000000000002', 'dddddddd-1000-4000-8000-000000000001', 'reel', 'x', '2031-03-12') $$,
  '23514', null,
  'a client that does not match the retainer is rejected'
);

select throws_ok(
  $$ insert into public.deliverables (retainer_id, scope_line_id, deliverable_type, title, due_date)
     values ('dddddddd-1000-4000-8000-000000000001', 'eeeeeeee-1000-4000-8000-000000000002', 'reel', 'x', '2031-03-12') $$,
  '23514', null,
  'a scope line from another retainer is rejected'
);

select throws_ok(
  $$ insert into public.deliverables (retainer_id, project_id, deliverable_type, title, due_date)
     values ('dddddddd-1000-4000-8000-000000000001', 'ffffffff-1000-4000-8000-000000000001', 'reel', 'x', '2031-03-12') $$,
  '23514', null,
  'a deliverable cannot belong to a retainer and a project at once'
);

select lives_ok(
  $$ insert into public.deliverables (id, project_id, deliverable_type, title, due_date)
     values ('99999999-1000-4000-8000-000000000002', 'ffffffff-1000-4000-8000-000000000001', 'influencer_post', 'Campaign post', '2031-03-20') $$,
  'project deliverables need no scope line'
);

-- ---------------------------------------------------------------------------
-- Status history
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select from_status::text, to_status::text from public.status_events
      where deliverable_id = '99999999-1000-4000-8000-000000000001' $$,
  $$ values (null::text, 'planned'::text) $$,
  'creating a deliverable logs its first status'
);

select pg_temp.login('aaaaaaaa-1000-4000-8000-000000000002'); -- creator

update public.deliverables set status = 'editing' where id = '99999999-1000-4000-8000-000000000001';
update public.deliverables set final_url = 'https://drive.example/cut1' where id = '99999999-1000-4000-8000-000000000001';

select pg_temp.logout();

select results_eq(
  $$ select from_status::text, to_status::text, changed_by_team_member_id from public.status_events
      where deliverable_id = '99999999-1000-4000-8000-000000000001' and from_status is not null $$,
  $$ values ('planned'::text, 'editing'::text, 'bbbbbbbb-1000-4000-8000-000000000002'::uuid) $$,
  'a status change is logged with who made it; other edits are not logged'
);

-- ---------------------------------------------------------------------------
-- Sign-off rules
-- ---------------------------------------------------------------------------
select pg_temp.login('aaaaaaaa-1000-4000-8000-000000000002'); -- creator

select lives_ok(
  $$ update public.deliverables set status = 'internal_review' where id = '99999999-1000-4000-8000-000000000001' $$,
  'creators can send work to Internal review'
);

select throws_ok(
  $$ update public.deliverables set status = 'client_review' where id = '99999999-1000-4000-8000-000000000001' $$,
  '42501', null,
  'creators cannot send work to the client'
);

select throws_ok(
  $$ update public.deliverables set status = 'approved' where id = '99999999-1000-4000-8000-000000000001' $$,
  '42501', null,
  'creators cannot approve'
);

select pg_temp.login('aaaaaaaa-1000-4000-8000-000000000001'); -- lead

select lives_ok(
  $$ update public.deliverables set status = 'client_review' where id = '99999999-1000-4000-8000-000000000001' $$,
  'account leads send work to the client (their default permission)'
);

select pg_temp.login('aaaaaaaa-1000-4000-8000-000000000002'); -- creator

select throws_ok(
  $$ update public.deliverables set status = 'editing' where id = '99999999-1000-4000-8000-000000000001' $$,
  '42501', null,
  'creators cannot pull work back out of Client review'
);

-- ---------------------------------------------------------------------------
-- Revisions
-- ---------------------------------------------------------------------------
select pg_temp.login('aaaaaaaa-1000-4000-8000-000000000001'); -- lead

update public.deliverables set status = 'editing' where id = '99999999-1000-4000-8000-000000000001';

select is(
  (select revision_count from public.deliverables where id = '99999999-1000-4000-8000-000000000001'),
  1::smallint,
  'Client review back to Editing counts a revision'
);

update public.deliverables set status = 'internal_review' where id = '99999999-1000-4000-8000-000000000001';
update public.deliverables set status = 'editing' where id = '99999999-1000-4000-8000-000000000001';

select is(
  (select revision_count from public.deliverables where id = '99999999-1000-4000-8000-000000000001'),
  1::smallint,
  'an internal send-back is not a client revision'
);

update public.deliverables set revision_count = 0 where id = '99999999-1000-4000-8000-000000000001';

select is(
  (select revision_count from public.deliverables where id = '99999999-1000-4000-8000-000000000001'),
  1::smallint,
  'people cannot edit the revision count by hand'
);

update public.deliverables set status = 'client_review' where id = '99999999-1000-4000-8000-000000000001';

select throws_ok(
  $$ update public.deliverables set status = 'approved' where id = '99999999-1000-4000-8000-000000000001' $$,
  '42501', null,
  'account leads can''t approve unless a partner gives them that permission'
);

select pg_temp.logout();
update public.team_members set can_approve = true where id = 'bbbbbbbb-1000-4000-8000-000000000001';
select pg_temp.login('aaaaaaaa-1000-4000-8000-000000000001'); -- lead, now allowed to approve

update public.deliverables set status = 'approved' where id = '99999999-1000-4000-8000-000000000001';

select is(
  (select revision_count from public.deliverables where id = '99999999-1000-4000-8000-000000000001'),
  1::smallint,
  'approval does not count a revision'
);

-- ---------------------------------------------------------------------------
-- Scheduled and Posted
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ update public.deliverables set status = 'scheduled' where id = '99999999-1000-4000-8000-000000000001' $$,
  '23514', null,
  'Scheduled needs a post date'
);

select lives_ok(
  $$ update public.deliverables set status = 'scheduled', post_date = '2031-03-15' where id = '99999999-1000-4000-8000-000000000001' $$,
  '...and works with one'
);

select pg_temp.login('aaaaaaaa-1000-4000-8000-000000000002'); -- creator
update public.deliverables
   set status = 'posted', post_url = 'https://www.instagram.com/p/flow'
 where id = '99999999-1000-4000-8000-000000000001';

select isnt(
  (select posted_at from public.deliverables where id = '99999999-1000-4000-8000-000000000001'),
  null,
  'marking Posted stamps posted_at'
);

update public.deliverables set status = 'scheduled' where id = '99999999-1000-4000-8000-000000000001';

select is(
  (select posted_at from public.deliverables where id = '99999999-1000-4000-8000-000000000001'),
  null,
  'moving it back clears posted_at'
);

select is(
  (select count(*) from public.status_events where deliverable_id = '99999999-1000-4000-8000-000000000001'),
  12::bigint,
  'every one of the status changes above is in the history'
);

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
insert into public.comments (id, deliverable_id, author_team_member_id, body) values
  ('77777777-1000-4000-8000-000000000001', '99999999-1000-4000-8000-000000000001',
   'bbbbbbbb-1000-4000-8000-000000000001', 'Pretending to be the lead');

select is(
  (select author_team_member_id from public.comments where id = '77777777-1000-4000-8000-000000000001'),
  'bbbbbbbb-1000-4000-8000-000000000002'::uuid,
  'the author is whoever is logged in, whatever the app sends'
);

select is(
  (select is_internal from public.comments where id = '77777777-1000-4000-8000-000000000001'),
  true,
  'team comments are internal by default'
);

update public.comments
   set author_team_member_id = 'bbbbbbbb-1000-4000-8000-000000000001', body = 'Edited'
 where id = '77777777-1000-4000-8000-000000000001';

select results_eq(
  $$ select author_team_member_id, body from public.comments where id = '77777777-1000-4000-8000-000000000001' $$,
  $$ values ('bbbbbbbb-1000-4000-8000-000000000002'::uuid, 'Edited'::text) $$,
  'authors can edit the text but not who wrote it'
);

select pg_temp.login('aaaaaaaa-1000-4000-8000-000000000001'); -- lead
update public.comments set body = 'Lead was here' where id = '77777777-1000-4000-8000-000000000001';
select pg_temp.logout();

select is(
  (select body from public.comments where id = '77777777-1000-4000-8000-000000000001'),
  'Edited',
  'nobody edits someone else''s comment'
);

select * from finish();
rollback;
