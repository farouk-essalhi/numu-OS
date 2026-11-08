-- Usernames and first sign-in setup: who can look up a username, who can set
-- one, the rules, and partners asking someone to set up again.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

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

insert into public.team_members (id, full_name, email, access_level) values
  ('bbbbbbbb-6000-4000-8000-000000000001', 'Login Partner', 'login.partner@test.example', 'partner'),
  ('bbbbbbbb-6000-4000-8000-000000000002', 'Login Creator', 'login.creator@test.example', 'creator'),
  ('bbbbbbbb-6000-4000-8000-000000000003', 'Login Other',   'login.other@test.example',   'creator');
insert into auth.users (id, email) values
  ('aaaaaaaa-6000-4000-8000-000000000001', 'login.partner@test.example'),
  ('aaaaaaaa-6000-4000-8000-000000000002', 'login.creator@test.example'),
  ('aaaaaaaa-6000-4000-8000-000000000003', 'login.other@test.example'),
  ('aaaaaaaa-6000-4000-8000-000000000009', 'nobody@test.example');

select is(
  (select credentials_set_at from public.team_members where id = 'bbbbbbbb-6000-4000-8000-000000000002'),
  null,
  'new people haven''t chosen their login yet, so they''re asked at next sign-in'
);

-- Setting your own username
select pg_temp.login('aaaaaaaa-6000-4000-8000-000000000002'); -- creator
select lives_ok($$ select public.set_my_login('  Khaled.K ') $$, 'a team member sets their username');
select pg_temp.logout();
select results_eq(
  $$ select username, credentials_set_at is not null from public.team_members where id = 'bbbbbbbb-6000-4000-8000-000000000002' $$,
  $$ values ('khaled.k'::text, true) $$,
  'stored lowercase and trimmed, and the setup is marked done'
);

select pg_temp.login('aaaaaaaa-6000-4000-8000-000000000003'); -- other creator
select throws_ok($$ select public.set_my_login('KHALED.K') $$, '23505', 'That username is taken', 'usernames are unique, whatever the case');
select throws_ok($$ select public.set_my_login('ab') $$, '23514', null, 'too short');
select throws_ok($$ select public.set_my_login('9lives') $$, '23514', null, 'must start with a letter');
select throws_ok($$ select public.set_my_login('rand aziz') $$, '23514', null, 'no spaces');
-- Row-level security skips rows you may not change: the update touches nothing.
update public.team_members set username = 'sneaky' where id = 'bbbbbbbb-6000-4000-8000-000000000002';
select pass('nobody edits someone else''s username directly...');
select pg_temp.logout();
select is(
  (select username from public.team_members where id = 'bbbbbbbb-6000-4000-8000-000000000002'),
  'khaled.k',
  '...it stays theirs'
);

select pg_temp.login('aaaaaaaa-6000-4000-8000-000000000009'); -- a login with no team member
select throws_ok($$ select public.set_my_login('stranger') $$, '42501', null, 'a login that isn''t on the team can''t set one');

-- Username -> email, before sign-in
select pg_temp.login_anon();
select is(public.login_email('Khaled.K'), 'login.creator@test.example', 'the sign-in page finds the email behind a username');
select is(public.login_email('nobody-here'), null, 'unknown usernames give nothing');
select throws_ok($$ select public.set_my_login('anon') $$, '42501', null, 'signed-out visitors can''t set usernames');
select pg_temp.logout();

update public.team_members set is_active = false where id = 'bbbbbbbb-6000-4000-8000-000000000002';
select pg_temp.login_anon();
select is(public.login_email('khaled.k'), null, 'inactive people can''t be looked up');
select pg_temp.logout();
update public.team_members set is_active = true where id = 'bbbbbbbb-6000-4000-8000-000000000002';

-- A partner asks someone to set up again (e.g. after a password reset)
select pg_temp.login('aaaaaaaa-6000-4000-8000-000000000001'); -- partner
update public.team_members set credentials_set_at = null where id = 'bbbbbbbb-6000-4000-8000-000000000002';
select pg_temp.logout();
select is(
  (select credentials_set_at from public.team_members where id = 'bbbbbbbb-6000-4000-8000-000000000002'),
  null,
  'a partner can ask someone to choose their login again'
);
select is(
  (select username from public.team_members where id = 'bbbbbbbb-6000-4000-8000-000000000002'),
  'khaled.k',
  '...their username stays until they change it'
);

select * from finish();
rollback;
