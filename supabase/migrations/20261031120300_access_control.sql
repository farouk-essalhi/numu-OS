-- NUMU OS · 04 · Access control (row-level security)
--
-- Who sees what (see docs/schema.md, "Access matrix"):
--   partner       everything
--   account_lead  everything in production + retainers and projects (fees);
--                 can sign off work. No finance tables (phase 2).
--   creator       clients, contacts, scope, the board, comments. No fees.
--   client        their own client row and their own contact row only, for
--                 now. The portal (phase 3) gets its own narrow functions.
--   anon          nothing.
--
-- Every table has RLS on. Policies target `authenticated` only; `anon` gets no
-- table privileges at all.

-- ---------------------------------------------------------------------------
-- Table privileges (defence in depth on top of RLS)
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
-- TRUNCATE ignores RLS; nobody needs it, references or triggers from the API.
revoke truncate, references, trigger on all tables in schema public from authenticated;

grant select, insert, update, delete on
  public.team_members, public.clients, public.contacts, public.retainers,
  public.scope_lines, public.projects, public.deliverables, public.comments
  to authenticated;

-- Reference data and history are read-only from the app.
revoke insert, update, delete, truncate on public.deliverable_types from authenticated;
revoke insert, update, delete, truncate on public.status_events from authenticated;
grant select on public.deliverable_types, public.status_events to authenticated;

alter table public.deliverable_types enable row level security;
alter table public.team_members      enable row level security;
alter table public.clients           enable row level security;
alter table public.contacts          enable row level security;
alter table public.retainers         enable row level security;
alter table public.scope_lines       enable row level security;
alter table public.projects          enable row level security;
alter table public.deliverables      enable row level security;
alter table public.status_events     enable row level security;
alter table public.comments          enable row level security;

-- ---------------------------------------------------------------------------
-- deliverable_types: reference data, readable by any logged-in user.
-- ---------------------------------------------------------------------------
create policy "deliverable types are readable when logged in"
  on public.deliverable_types for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- team_members
-- ---------------------------------------------------------------------------
create policy "team can see the team"
  on public.team_members for select to authenticated
  using ((select private.is_team()));

create policy "partners add team members"
  on public.team_members for insert to authenticated
  with check ((select private.is_partner()));

create policy "partners edit team members"
  on public.team_members for update to authenticated
  using ((select private.is_partner()))
  with check ((select private.is_partner()));

create policy "partners remove team members"
  on public.team_members for delete to authenticated
  using ((select private.is_partner()));

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
create policy "team sees all clients, contacts see their own"
  on public.clients for select to authenticated
  using (
    (select private.is_team())
    or id in (select private.current_client_ids())
  );

create policy "leads and partners add clients"
  on public.clients for insert to authenticated
  with check ((select private.is_lead_or_partner()));

create policy "leads and partners edit clients"
  on public.clients for update to authenticated
  using ((select private.is_lead_or_partner()))
  with check ((select private.is_lead_or_partner()));

create policy "partners delete clients"
  on public.clients for delete to authenticated
  using ((select private.is_partner()));

-- ---------------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------------
create policy "team sees contacts, a contact sees themself"
  on public.contacts for select to authenticated
  using (
    (select private.is_team())
    or user_id = (select auth.uid())
  );

create policy "leads and partners add contacts"
  on public.contacts for insert to authenticated
  with check ((select private.is_lead_or_partner()));

create policy "leads and partners edit contacts"
  on public.contacts for update to authenticated
  using ((select private.is_lead_or_partner()))
  with check ((select private.is_lead_or_partner()));

create policy "leads and partners delete contacts"
  on public.contacts for delete to authenticated
  using ((select private.is_lead_or_partner()));

-- ---------------------------------------------------------------------------
-- retainers and projects carry fees: partners and account leads only.
-- ---------------------------------------------------------------------------
create policy "leads and partners see retainers"
  on public.retainers for select to authenticated
  using ((select private.is_lead_or_partner()));

create policy "leads and partners add retainers"
  on public.retainers for insert to authenticated
  with check ((select private.is_lead_or_partner()));

create policy "leads and partners edit retainers"
  on public.retainers for update to authenticated
  using ((select private.is_lead_or_partner()))
  with check ((select private.is_lead_or_partner()));

create policy "partners delete retainers"
  on public.retainers for delete to authenticated
  using ((select private.is_partner()));

create policy "leads and partners see projects"
  on public.projects for select to authenticated
  using ((select private.is_lead_or_partner()));

create policy "leads and partners add projects"
  on public.projects for insert to authenticated
  with check ((select private.is_lead_or_partner()));

create policy "leads and partners edit projects"
  on public.projects for update to authenticated
  using ((select private.is_lead_or_partner()))
  with check ((select private.is_lead_or_partner()));

create policy "partners delete projects"
  on public.projects for delete to authenticated
  using ((select private.is_partner()));

-- ---------------------------------------------------------------------------
-- scope_lines: no money here, so the whole team can see what a client buys.
-- ---------------------------------------------------------------------------
create policy "team sees scope"
  on public.scope_lines for select to authenticated
  using ((select private.is_team()));

create policy "leads and partners add scope"
  on public.scope_lines for insert to authenticated
  with check ((select private.is_lead_or_partner()));

create policy "leads and partners edit scope"
  on public.scope_lines for update to authenticated
  using ((select private.is_lead_or_partner()))
  with check ((select private.is_lead_or_partner()));

create policy "leads and partners delete scope"
  on public.scope_lines for delete to authenticated
  using ((select private.is_lead_or_partner()));

-- ---------------------------------------------------------------------------
-- deliverables: the whole team sees and moves cards; leads and partners plan
-- (create/delete). Sign-off rules are enforced by the workflow trigger.
-- ---------------------------------------------------------------------------
create policy "team sees the board"
  on public.deliverables for select to authenticated
  using ((select private.is_team()));

create policy "leads and partners add deliverables"
  on public.deliverables for insert to authenticated
  with check ((select private.is_lead_or_partner()));

create policy "team moves deliverables"
  on public.deliverables for update to authenticated
  using ((select private.is_team()))
  with check ((select private.is_team()));

create policy "leads and partners delete deliverables"
  on public.deliverables for delete to authenticated
  using ((select private.is_lead_or_partner()));

-- ---------------------------------------------------------------------------
-- status_events: read-only history. No insert/update/delete policies at all;
-- only the SECURITY DEFINER trigger writes here.
-- ---------------------------------------------------------------------------
create policy "team sees status history"
  on public.status_events for select to authenticated
  using ((select private.is_team()));

-- ---------------------------------------------------------------------------
-- comments: team only in phase 1. Authors edit their own; partners can remove any.
-- ---------------------------------------------------------------------------
create policy "team sees comments"
  on public.comments for select to authenticated
  using ((select private.is_team()));

create policy "team comments as themselves"
  on public.comments for insert to authenticated
  with check ((select private.is_team()));

create policy "authors edit their own comments"
  on public.comments for update to authenticated
  using (author_team_member_id = (select private.current_team_member_id()))
  with check (author_team_member_id = (select private.current_team_member_id()));

create policy "authors and partners delete comments"
  on public.comments for delete to authenticated
  using (
    author_team_member_id = (select private.current_team_member_id())
    or (select private.is_partner())
  );
