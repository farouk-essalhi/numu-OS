-- NUMU OS · 02 · People, clients, retainers and projects
-- Tables: team_members, clients, contacts, retainers, scope_lines, projects.
-- Also: the role helpers every RLS policy uses, and linking of logins to people.

-- ---------------------------------------------------------------------------
-- team_members: everyone at NUMU, with or without a login.
-- ---------------------------------------------------------------------------
create table public.team_members (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid unique references auth.users (id) on delete set null,
  full_name              text not null check (length(trim(full_name)) > 0),
  email                  text check (email is null or email ~ '^[^@\s]+@[^@\s]+$'),
  phone                  text,
  job_title              text,
  access_level           public.access_level not null default 'creator',
  employment             public.employment_type not null default 'full_time',
  -- Effort points this person can take per week. 0 means "not set yet".
  weekly_capacity_points integer not null default 0 check (weekly_capacity_points >= 0),
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create unique index team_members_email_key on public.team_members (lower(email));

comment on column public.team_members.access_level is
  'partner: everything incl. finance. account_lead: clients, retainers, planning, sign-off. creator: production work.';

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
create table public.clients (
  id               uuid primary key default gen_random_uuid(),
  name_en          text not null check (length(trim(name_en)) > 0),
  name_ar          text,
  industry         text,
  status           public.client_status not null default 'active',
  account_lead_id  uuid references public.team_members (id) on delete set null,
  brand_kit_url    text,
  drive_folder_url text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index clients_name_en_key on public.clients (lower(name_en));
create index clients_account_lead_id_idx on public.clients (account_lead_id);

-- ---------------------------------------------------------------------------
-- contacts: people at a client. A contact with a user_id can log in (client role).
-- ---------------------------------------------------------------------------
create table public.contacts (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references public.clients (id) on delete cascade,
  user_id            uuid references auth.users (id) on delete set null,
  full_name          text not null check (length(trim(full_name)) > 0),
  job_title          text,
  phone              text, -- WhatsApp number, international format (+974...)
  email              text check (email is null or email ~ '^[^@\s]+@[^@\s]+$'),
  is_approver        boolean not null default false,
  preferred_language public.language_code not null default 'en',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (client_id, user_id)
);

create unique index contacts_client_email_key on public.contacts (client_id, lower(email));
create index contacts_user_id_idx on public.contacts (user_id);

-- ---------------------------------------------------------------------------
-- retainers: a client's monthly contract. Price changes = a new retainer row.
-- ---------------------------------------------------------------------------
create table public.retainers (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients (id) on delete restrict,
  status            public.retainer_status not null default 'draft',
  start_date        date not null,
  end_date          date,
  -- Money is always integer minor units: fils for QAR (QAR x 100), cents for USD.
  monthly_fee_minor bigint not null check (monthly_fee_minor >= 0),
  currency          char(3) not null default 'QAR' check (currency ~ '^[A-Z]{3}$'),
  -- Day of month the invoice goes out. Null = last working day of the month.
  billing_day       smallint check (billing_day between 1 and 31),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint retainers_dates_check check (end_date is null or end_date >= start_date)
);

create index retainers_client_id_idx on public.retainers (client_id);

-- ---------------------------------------------------------------------------
-- scope_lines: what a retainer buys each month (e.g. 6 Reels on Instagram).
-- Editing a quantity only affects months that have not been generated yet.
-- ---------------------------------------------------------------------------
create table public.scope_lines (
  id                 uuid primary key default gen_random_uuid(),
  retainer_id        uuid not null references public.retainers (id) on delete cascade,
  deliverable_type   text not null references public.deliverable_types (code),
  quantity_per_month smallint not null check (quantity_per_month between 1 and 100),
  platform           public.platform,
  -- Who gets these by default when the month is generated. Falls back to the
  -- client's account lead.
  default_owner_id   uuid references public.team_members (id) on delete set null,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index scope_lines_retainer_id_idx on public.scope_lines (retainer_id);

-- ---------------------------------------------------------------------------
-- projects: one-off campaigns. A client, a fixed fee, a deliverable list and a
-- deadline, without the monthly repeat.
-- ---------------------------------------------------------------------------
create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients (id) on delete restrict,
  name_en         text not null check (length(trim(name_en)) > 0),
  name_ar         text,
  status          public.project_status not null default 'planned',
  fixed_fee_minor bigint not null check (fixed_fee_minor >= 0),
  currency        char(3) not null default 'QAR' check (currency ~ '^[A-Z]{3}$'),
  start_date      date,
  deadline        date,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint projects_dates_check check (deadline is null or start_date is null or deadline >= start_date)
);

create index projects_client_id_idx on public.projects (client_id);

-- updated_at triggers
create trigger team_members_updated_at before update on public.team_members
  for each row execute function private.touch_updated_at();
create trigger clients_updated_at before update on public.clients
  for each row execute function private.touch_updated_at();
create trigger contacts_updated_at before update on public.contacts
  for each row execute function private.touch_updated_at();
create trigger retainers_updated_at before update on public.retainers
  for each row execute function private.touch_updated_at();
create trigger scope_lines_updated_at before update on public.scope_lines
  for each row execute function private.touch_updated_at();
create trigger projects_updated_at before update on public.projects
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Role helpers. Every RLS policy goes through these. SECURITY DEFINER so they
-- can read team_members/contacts without tripping those tables' own policies.
-- Always call them as (select private.fn()) in policies so Postgres evaluates
-- them once per statement, not once per row.
-- ---------------------------------------------------------------------------
create function private.current_team_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tm.id
  from public.team_members tm
  where tm.user_id = (select auth.uid())
    and tm.is_active
$$;

create function private.current_access_level()
returns public.access_level
language sql
stable
security definer
set search_path = ''
as $$
  select tm.access_level
  from public.team_members tm
  where tm.user_id = (select auth.uid())
    and tm.is_active
$$;

create function private.is_team()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_access_level() is not null
$$;

create function private.is_partner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_access_level() = 'partner', false)
$$;

create function private.is_lead_or_partner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_access_level() in ('partner', 'account_lead'), false)
$$;

-- Clients the logged-in user is a contact for (client role). Empty for the team.
create function private.current_client_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.client_id
  from public.contacts c
  where c.user_id = (select auth.uid())
$$;

grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Linking logins to people. NUMU OS is invite-only: a partner adds a person
-- (team member or client contact) with their email, then invites that email.
-- Whichever happens first, the auth user and the person row get linked by email.
-- ---------------------------------------------------------------------------
create function private.link_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null then
    return new;
  end if;

  update public.team_members
     set user_id = new.id
   where user_id is null
     and email is not null
     and lower(email) = lower(new.email);

  update public.contacts
     set user_id = new.id
   where user_id is null
     and email is not null
     and lower(email) = lower(new.email);

  return new;
end;
$$;

create trigger numu_link_auth_user
  after insert on auth.users
  for each row execute function private.link_new_auth_user();

create function private.link_person_to_existing_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null and new.email is not null then
    select u.id into new.user_id
    from auth.users u
    where lower(u.email) = lower(new.email)
    limit 1;
  end if;
  return new;
end;
$$;

create trigger team_members_link_auth_user
  before insert or update of email on public.team_members
  for each row execute function private.link_person_to_existing_auth_user();

create trigger contacts_link_auth_user
  before insert or update of email on public.contacts
  for each row execute function private.link_person_to_existing_auth_user();
