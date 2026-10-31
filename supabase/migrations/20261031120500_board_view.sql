-- NUMU OS · 06 · Board view
-- One row per deliverable with the names and flags the board, My work and the
-- ops dashboard need. security_invoker: it runs with the caller's RLS, so it
-- never shows more than the underlying tables would.

create view public.deliverable_board
with (security_invoker = true)
as
select
  d.id,
  d.client_id,
  c.name_en                  as client_name_en,
  c.name_ar                  as client_name_ar,
  d.retainer_id,
  d.scope_line_id,
  d.project_id,
  d.deliverable_type,
  dt.name_en                 as type_name_en,
  dt.name_ar                 as type_name_ar,
  d.title,
  d.month,
  d.platform,
  d.owner_id,
  tm.full_name               as owner_name,
  d.due_date,
  d.post_date,
  d.status,
  d.revision_count,
  d.effort_points,
  d.script_url,
  d.raw_url,
  d.final_url,
  d.post_url,
  d.posted_at,
  last_change.changed_at     as status_changed_at,
  -- Late for the team: still in production after the due date, or approved
  -- but not live after the planned post date.
  (
    (d.status < 'client_review'::public.deliverable_status and d.due_date < private.qatar_today())
    or (d.status in ('approved', 'scheduled') and d.post_date < private.qatar_today())
  )                          as is_overdue,
  -- The two flags from the spec.
  (d.revision_count >= 2)    as flag_many_revisions,
  (
    d.status = 'client_review'
    and last_change.changed_at < now() - interval '48 hours'
  )                          as flag_waiting_on_client,
  d.created_at,
  d.updated_at
from public.deliverables d
join public.clients c on c.id = d.client_id
join public.deliverable_types dt on dt.code = d.deliverable_type
left join public.team_members tm on tm.id = d.owner_id
left join lateral (
  select max(se.changed_at) as changed_at
  from public.status_events se
  where se.deliverable_id = d.id
) last_change on true;

comment on view public.deliverable_board is
  'Board/My work rows with client, type and owner names, status_changed_at and flags (is_overdue, flag_many_revisions, flag_waiting_on_client).';

revoke all on public.deliverable_board from anon;
grant select on public.deliverable_board to authenticated;
