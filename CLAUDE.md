# NUMU OS

NUMU's internal operating system. NUMU is a content agency in Doha. NUMU OS replaces ClickUp and Jira with one system built around how we make money:

**lead → retainer → monthly deliverables → client approval → invoice → profit**

We are not rebuilding ClickUp. We build the one thing generic tools can't give us: retainers, deliverables, approvals and money in one place, shaped to how a Doha content agency works.

Read before building anything: this file, then `docs/schema.md`. Why things are the way they are: `docs/decisions.md`.

## Current phase

**Phase 0 (Map and decide), Nov 1–14 2026.** The Phase 1 database is tested and live in the `numu-os` Supabase project (empty, for NUMU's own data). The deployed app reads and writes it; locally, without Supabase env vars, it runs on demo data.

Phase 0 gate (all must be true before Phase 1 starts):
- [ ] Ali and Farouk have signed off on this spec and `docs/schema.md`
- [ ] Every active client's retainer scope is written down (types, quantities, fee, billing day). Use `docs/phase-0.md`
- [x] Repo, Supabase project and Netlify site exist (Netlify: https://numu-os.netlify.app; Supabase: `numu-os`, ref `cfadsngaimxmgtmfacmi`, Mumbai)
- [ ] Open questions in `docs/phase-0.md` are answered, and `docs/decisions.md` updated

**Next: Phase 1 (Core production), Nov 15–Dec 5.** Goal: the team runs daily work in NUMU OS instead of ClickUp.
- [x] Database: clients, contacts, retainers, scope lines, projects, deliverables, status history, comments, RLS (`supabase/migrations`, tested)
- [x] Monthly deliverable generator (database function + pg_cron on the 25th), with tests
- [x] App shell and design system: responsive sidebar/top bar/tab bar, ⌘K search, notifications, light/dark, installable (PWA manifest)
- [x] Screens on demo data: Overview dashboard, My work, Approvals, Deliverables (board + list) and deliverable detail, Calendar, Clients and client detail, Campaigns, Capacity, Reports, Settings, New deliverable panel
- [x] Connect to Supabase: email + password login, read/write through RLS (`lib/store.tsx` + `lib/backend.ts`)
- [x] Clients, contacts, retainers and scope lines: create and edit screens; "Generate {month}" per retainer
- [x] One-off projects: create and edit (the first real campaign goes in here)
- [x] Team members: add/edit (partners); board drag and drop by status and by person
- [ ] Enter every active client, retainer and scope; generate December

Phase 1 gate: all active clients and December deliverables are in the system; the whole team used My work every day for a week; two weeks alongside ClickUp with nothing missing.

Later phases (do not build yet): 2 Money (Dec 6–19), 3 Clients in the loop (Dec 20–Jan 9), 4 Sales and talent (Jan 10–23), 5 Reports and AI (Jan 24–Feb 4). Everything runs the agency by **Feb 4, 2027**, before Ramadan.

## How to work in this repo

- **Propose, then build.** For each module: update this file for the phase, propose the plan (tables, screens, policies), wait for approval, then code.
- **One module at a time.** Each phase must be in daily use before the next one starts. New ideas go to the Phase 6 backlog in `docs/phase-0.md`, not into the current phase.
- **Build only what we use weekly.** If a feature isn't used within a month of shipping, it gets cut.
- **Every database change is a new migration** in `supabase/migrations/` (`YYYYMMDDHHMMSS_name.sql`). Never edit a migration that has run on the real project. Add or update tests in `supabase/tests/` in the same change.
- **Record decisions.** Anything that changes behaviour, the schema or scope gets one line in `docs/decisions.md`.
- **After each module:** review what you built against the gate checklist above and list anything missing or risky.
- Run `scripts/db/test.sh` before pushing any database change, and `npm run lint && npm test && npm run build` before pushing app changes.
- **This Next.js (16.x) differs from older versions** (Cache Components, routes kept mounted with `<Activity>`, `use(browser())`). Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code (see `AGENTS.md`).

## Users and roles

| Role | Who | Can |
| --- | --- | --- |
| `partner` | Farouk, Ali | Everything, incl. finance, team and fees |
| `account_lead` | Runs client accounts | Clients, contacts, retainers, scope, projects, planning, sign-off. No finance tables (phase 2) |
| `creator` | Everyone making content | See clients, scope and the whole board; move cards; comment. **No fees** |
| `client` | Approvers at each client | Phase 1: their own client and contact row only. Phase 3: portal |

**Sign-in (decisions 33–35):** Supabase Auth, email + password (dummy `@numu.test` addresses for now). A partner adds the person in Team (app), then creates their login in the Supabase dashboard (Authentication → Users → Add user, auto-confirm) with the same email; the trigger links them. The browser holds the session (`lib/supabase.ts`, publishable key only) and `components/shell/app-root.tsx` sends anyone without one to `/login`; every read and write goes through RLS as that person. Pages are static shells with no data. Don't add a `proxy.ts`: Netlify's Next.js plugin (5.16.6) packages it in a way its function upload rejects (deploys fail with HTTP 500). Without `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (local dev, tests) the app runs on demo data and Settings has "View as". Never commit passwords; the service role key is never used by the app.

A team member's role is `team_members.access_level`. A client login is a `contacts` row with a `user_id`. There is no separate profiles table. NUMU OS is **invite-only**: a partner adds the person with their email, then invites that email; the login links to the person by email automatically. Signups are off.

Who sees what, table by table: `docs/schema.md`, "Access matrix". Never widen access without a decision line and a test.

## Domain essentials

**Deliverable types** (fixed list, `deliverable_types` table, effort points for capacity):
Reel 3 · Static post 1 · Carousel 2 · Story set 1 · Long video 5 · Shoot day 5 · Ad set 2 · Influencer post 2 (points are proposals until confirmed).

**Nine statuses**, in order: Planned → Scripting → Shooting → Editing → Internal review → Client review → Approved → Scheduled → Posted. Cards may skip steps (a static post has no shoot).

Rules, enforced in the database (not just the UI):
- Only partners and account leads move work **into or out of Client review**, or **into Approved**.
- **Client review → any earlier status = revision +1.** Nobody edits `revision_count` by hand.
- **Scheduled needs a post date.** Marking **Posted** stamps `posted_at`.
- Every status change writes a `status_events` row (trigger only, the app never writes history).
- A deliverable belongs to exactly **one retainer or one project**. A retainer deliverable with no scope line is an **extra outside scope**.

Flags: **2+ revisions**; **in Client review for more than 48 hours**; **overdue** = still before Client review after the due date, or approved/scheduled but not posted after the post date.

Dates on a deliverable: `due_date` = when it must be ready for Client review (the team's deadline). `post_date` = when it goes live. `month` = which month of the retainer it counts against.

**The monthly generator** (`public.generate_month_deliverables(month, retainer)`): on the 25th at 09:00 Doha, every active retainer of an active client turns its scope lines into next month's deliverables: numbered titles ("Reel 3/6 · Instagram"), owner = scope line default owner else the client's account lead, due dates spread evenly over the working days (Sun–Thu), status Planned. Safe to re-run; it only creates what's missing. Account leads adjust afterwards.

Weekly rhythm the app must support: Sunday 30-min planning (ops view: owners, dates, capacity), daily My work, Thursday 20-min review (late, waiting on client, needs a nudge).

## Rules

- **Money is integer minor units, never decimals.** Columns end in `_minor` (`bigint`) with a `currency` column (default `QAR`): 1 QAR = 100 fils, so QAR 18,000 is `1800000`. Format only at the edge (UI, PDF).
- **Time zone is Asia/Qatar.** Timestamps are `timestamptz`; calendar dates are `date` in Doha time. In SQL use `private.qatar_today()`, never `current_date`. The week runs Sunday–Saturday; working days are Sunday–Thursday.
- **Arabic and English for anything a client sees** (names, titles, invoices, reports, emails). Use `_en` / `_ar` column pairs. Arabic is right-to-left: test layouts with `dir="rtl"`.
- **Every table has row-level security**, policies `to authenticated` only, using the helpers in `private` (`is_team()`, `is_partner()`, `is_lead_or_partner()`, `current_team_member_id()`, `current_client_ids()`), wrapped as `(select private.fn())`. New tables: enable RLS, `revoke all ... from anon`, add policies and tests in the same migration.
- **Functions** set `search_path = ''` and schema-qualify everything. Helpers and triggers live in `private` (not exposed by the API). Public RPCs revoke `execute` from `public, anon`.
- **Secrets only in environment variables**, never in the repo. The service role key never reaches the browser.
- **Never put real client data in the repo** (seed, tests, docs, screenshots). The seed is fictional.

## Stack

Supabase (Postgres, auth with magic links, RLS, storage, pg_cron) · Next.js + Tailwind + shadcn/ui · Netlify · Recharts · HTML-to-PDF in headless Chromium for bilingual invoices and reports (Arabic RTL renders correctly) · Resend for email · MCP server on Supabase for Claude (phase 5). Private GitHub repo.

## Repo layout

```
CLAUDE.md                 this spec: rules, current phase
docs/schema.md            tables, fields, statuses, access matrix, metrics
docs/decisions.md         one line per decision and why
docs/phase-0.md           workshop agenda, open questions, scope template, setup, backlog
netlify.toml              Netlify build settings (Next.js runtime)
supabase/config.toml      local Supabase settings (invite-only auth)
supabase/migrations/      every database change, in order
supabase/seed.sql         fictional clients, retainers and a month of deliverables
supabase/tests/           pgTAP tests (generator, workflow, access per role)
scripts/db/               run migrations + tests on plain Postgres (no Docker)
app/(app)/                pages: overview, my-work, approvals, deliverables, calendar, clients, campaigns, team, reports, settings
components/shell/         sidebar, top bar, phone tab bar, ⌘K command palette, navigation config
components/               ui.tsx (primitives), charts.tsx, deliverables.tsx (table, stepper), board.tsx (drag-and-drop board),
                          forms.tsx + entity-forms.tsx (sheets to add/edit clients, contacts, retainers, scope, campaigns, team),
                          new-deliverable-sheet.tsx; shell/app-root.tsx (session guard, live vs demo)
lib/                      types (mirror the DB), dates (Doha), workflow rules, selectors, insights (dashboard numbers),
                          store (one API, live or demo), backend (Supabase reads/writes), supabase (browser client),
                          database.types (generated), generator (demo copy of the monthly generator)
lib/demo/                 demo data for local dev and tests (fictional clients; the team's first names)
app/login/                sign-in page (Supabase email + password)
mcp/                      Claude connection (phase 5)
```

## Commands

```bash
npm run dev             # app on http://localhost:3000 (demo data unless NEXT_PUBLIC_SUPABASE_* are set)
npm test                # unit tests: dates, workflow rules, selectors, demo data
npm run lint && npm run typecheck && npm run build

# Database tests on any Postgres 15+ with pgTAP (no Docker). Uses PG* env vars.
scripts/db/test.sh

# Netlify env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (public; baked in at build,
# so redeploy after changing). Logins: Supabase dashboard → Authentication → Users.

# Deploy: Netlify project "numu-os" (https://numu-os.netlify.app), built by Netlify from
# netlify.toml (npm run build, publish .next, @netlify/plugin-nextjs). Not connected to Git yet:
# each deploy is an upload, so pushes do not redeploy. Without the plugin it publishes the raw
# .next folder and every page 404s.

# Or the full local Supabase stack (needs Docker)
supabase start          # API, Studio, local inbox for magic links
supabase db reset       # re-apply migrations + seed
supabase test db        # pgTAP tests
```

## Out of scope

Never: chat, docs editing, file storage (Google Drive stays; we store links), minute-by-minute time tracking, Gantt charts, anything for clients we don't have yet.

Not yet (later phases): invoices, payments, expenses, partner draws (2) · content calendar, client portal, approval emails, shoots (3) · leads, talent (4) · metrics, reports, MCP, WhatsApp (5).

## Design

Calm and fast. One clear number per screen (each dashboard opens on the number that matters to that person). Dark mode. Mobile first for the team (move cards from a shoot), desktop first for partners. If something takes longer in NUMU OS than in WhatsApp, fix the app, not the people.

The visual language, adapted from the product dashboards Farouk shared (Efferd, Nexora, Wiko, VERIQ, Nakdis). Tokens live in `app/globals.css`:
- **Shell** (`components/shell/`): left sidebar with grouped navigation and count badges (full width from 1024px, icon rail from 768px, a drawer on phones); top bar with breadcrumb, ⌘K search, theme toggle and "Needs you" notifications; on phones a bottom tab bar (Overview, My work, Board, Approvals).
- **Surfaces**: white cards with hairline borders on a soft plane, ink for primary actions, NUMU orange only for the brand mark and attention badges. Dark mode is its own tuned palette, not an inversion.
- **Data**: KPI cards show the change vs the previous period; lists are sortable tables with tabs on desktop and cards on phones; the board has a board/list toggle; a status is a neutral pill with a coloured dot (`STATUS_META[status].color`).
- **Charts** (`components/charts.tsx`) follow the data-viz rules: categorical colours in fixed order (blue, orange, aqua, yellow), bars at most 24px with 4px rounded ends and 2px gaps, a legend for two or more series, hover/focus tooltips and a hidden data table. Status colours (good, warning, serious, critical) are reserved and always come with an icon and a label.
- Every screen must work at 390px (phone), 768–1023px (tablet) and 1440px (desktop), in light and dark. Check all three before pushing UI changes.
- Use the existing components (`components/ui.tsx`, `charts.tsx`, `deliverables.tsx`) before adding new ones.
