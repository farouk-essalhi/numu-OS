-- NUMU OS · 01 · Foundation
-- Schemas, enums, reference data and small shared helpers.
-- Rules that apply to every migration are in CLAUDE.md ("Rules").

-- `private` holds helper and trigger functions. It is NOT exposed through the
-- Supabase API, so nothing in it can be called directly from the app.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums. Values are stored in English snake_case; labels (EN/AR) live in the app.
-- ---------------------------------------------------------------------------

-- What a team member is allowed to do. Clients are not team members: a client
-- login is a `contacts` row with a user_id (see docs/schema.md, "Roles").
create type public.access_level as enum ('partner', 'account_lead', 'creator');

create type public.employment_type as enum ('full_time', 'part_time', 'freelance');

create type public.client_status as enum ('active', 'paused', 'ended');

create type public.retainer_status as enum ('draft', 'active', 'paused', 'ended');

create type public.project_status as enum ('planned', 'active', 'delivered', 'cancelled');

-- The nine deliverable statuses, in workflow order. Order matters: the enum's
-- sort order is the board's column order.
create type public.deliverable_status as enum (
  'planned',
  'scripting',
  'shooting',
  'editing',
  'internal_review',
  'client_review',
  'approved',
  'scheduled',
  'posted'
);

create type public.platform as enum (
  'instagram', 'tiktok', 'snapchat', 'youtube', 'x', 'linkedin', 'facebook'
);

create type public.language_code as enum ('ar', 'en');

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

-- Today's date in Doha. Use this instead of current_date anywhere a calendar
-- date matters (due dates, "this week", overdue).
create function private.qatar_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Qatar')::date
$$;

-- Qatar's working week is Sunday to Thursday.
create function private.is_working_day(p_day date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select extract(isodow from p_day) in (7, 1, 2, 3, 4)
$$;

create function private.platform_label(p_platform public.platform)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_platform
    when 'instagram' then 'Instagram'
    when 'tiktok'    then 'TikTok'
    when 'snapchat'  then 'Snapchat'
    when 'youtube'   then 'YouTube'
    when 'x'         then 'X'
    when 'linkedin'  then 'LinkedIn'
    when 'facebook'  then 'Facebook'
  end
$$;

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Deliverable types: the fixed list, with an effort score used for capacity.
-- A lookup table (not an enum) so points can be tuned without a schema change.
-- Effort points are proposals until confirmed in the Phase 0 workshop.
-- ---------------------------------------------------------------------------
create table public.deliverable_types (
  code          text primary key check (code ~ '^[a-z_]+$'),
  name_en       text not null,
  name_ar       text not null,
  effort_points smallint not null check (effort_points between 0 and 20),
  sort_order    smallint not null default 0
);

comment on table public.deliverable_types is
  'Fixed list of deliverable types and their effort points (capacity planning). Changed by migration only.';

insert into public.deliverable_types (code, name_en, name_ar, effort_points, sort_order) values
  ('reel',            'Reel',            'ريل',             3, 10),
  ('static_post',     'Static post',     'منشور ثابت',      1, 20),
  ('carousel',        'Carousel',        'منشور كاروسيل',   2, 30),
  ('story_set',       'Story set',       'مجموعة ستوريز',   1, 40),
  ('long_video',      'Long video',      'فيديو طويل',      5, 50),
  ('shoot_day',       'Shoot day',       'يوم تصوير',       5, 60),
  ('ad_set',          'Ad set',          'مجموعة إعلانات',  2, 70),
  ('influencer_post', 'Influencer post', 'منشور مؤثر',      2, 80);
