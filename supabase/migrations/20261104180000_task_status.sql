-- NUMU OS · 07 · A "Done" status for tasks
--
-- Tasks (client follow-ups, reports, content calendars, meetings) are not
-- content: they don't go through scripting, review and posting. They are to
-- do (Planned) or Done. See 20261104180100_tasks.sql for the rules.
--
-- Its own migration: Postgres can't use a new enum value in the same
-- transaction that adds it. 'done' sorts after 'posted', so it is the last
-- board column and never counts as "still with the team".
alter type public.deliverable_status add value if not exists 'done' after 'posted';
