-- NUMU OS · 10 · Usernames and choosing your own password
--
-- The team signs in with a username they choose, not the shared
-- @numu.test email and the password a partner handed out:
--   * team_members.username: lowercase, unique, 3-30 characters;
--   * team_members.credentials_set_at: when the person chose their own
--     username and password. Null = the app asks them to, before anything
--     else, the next time they sign in (everyone, at first);
--   * public.login_email(username): the sign-in page turns a username into
--     the email Supabase Auth signs in with. Callable before sign-in (anon),
--     returns nothing but that email, only for active team members;
--   * public.set_my_login(username): the signed-in person sets their own
--     username and marks their setup done (team_members is partners-only
--     for writes, so this is the narrow way in).
-- Passwords never touch these tables: the app changes them through
-- Supabase Auth (auth.updateUser) as the signed-in person.

alter table public.team_members
  add column username text,
  add column credentials_set_at timestamptz;

alter table public.team_members
  add constraint team_members_username_format check (username is null or username ~ '^[a-z][a-z0-9._-]{2,29}$');

create unique index team_members_username_key on public.team_members (username);

comment on column public.team_members.username is 'What the person signs in with (lowercase). Chosen by them on first sign-in.';
comment on column public.team_members.credentials_set_at is 'When they chose their own username and password. Null = asked to at next sign-in.';

-- ---------------------------------------------------------------------------
-- Username -> sign-in email (before sign-in)
-- ---------------------------------------------------------------------------
create function public.login_email(p_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select tm.email
  from public.team_members tm
  where tm.username = lower(trim(p_username))
    and tm.is_active
    and tm.user_id is not null
  limit 1
$$;

comment on function public.login_email(text) is
  'Sign-in page: the email behind a username (active team members with a login only). Nothing else is exposed.';

revoke execute on function public.login_email(text) from public;
grant execute on function public.login_email(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The signed-in person sets their username (and finishes their setup)
-- ---------------------------------------------------------------------------
create function public.set_my_login(p_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid := private.current_team_member_id();
  v_name   text := lower(trim(p_username));
begin
  if v_member is null then
    raise exception 'Only team members can set a username'
      using errcode = '42501';
  end if;
  if v_name !~ '^[a-z][a-z0-9._-]{2,29}$' then
    raise exception 'A username is 3 to 30 characters: letters, numbers, dots, dashes or underscores, starting with a letter'
      using errcode = '23514';
  end if;
  if exists (select 1 from public.team_members tm where tm.username = v_name and tm.id <> v_member) then
    raise exception 'That username is taken'
      using errcode = '23505';
  end if;

  update public.team_members
     set username = v_name,
         credentials_set_at = coalesce(credentials_set_at, now())
   where id = v_member;
end;
$$;

comment on function public.set_my_login(text) is
  'The signed-in team member sets their own username and marks their login setup as done.';

revoke execute on function public.set_my_login(text) from public, anon;
grant execute on function public.set_my_login(text) to authenticated, service_role;
