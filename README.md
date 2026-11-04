# NUMU OS

NUMU's internal system for retainers, deliverables, client approvals and money. It replaces ClickUp and Jira.

- **Spec and rules:** [CLAUDE.md](CLAUDE.md)
- **Data model, statuses, access matrix, metrics:** [docs/schema.md](docs/schema.md)
- **Decisions and why:** [docs/decisions.md](docs/decisions.md)
- **Phase 0 workshop, open questions, setup:** [docs/phase-0.md](docs/phase-0.md)

## Status

Phase 0. The Phase 1 database (clients, retainers, scope, projects, deliverables, status history, comments, access rules and the monthly deliverable generator) is tested and live in the `numu-os` Supabase project, empty and ready for NUMU's own clients. The deployed app reads and writes it; locally it runs on fictional demo data.

## Running the app

```bash
npm install
npm run dev        # http://localhost:3000
```

Works on desktop, tablet and phone. Without Supabase env vars it runs on demo data: Settings → "View as" switches between a partner, an account lead and a creator, and "Start empty" clears the demo clients to try entering your own. ⌘K searches everything. Light and dark follow the device, or use the toggle in the top bar. To run against Supabase, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`.

```bash
npm test           # unit tests
npm run lint && npm run typecheck && npm run build
```

## Signing in

The live site uses Supabase logins (email + password). To add someone: a partner adds them in Team (with the email they'll sign in with), then creates their login in the Supabase dashboard → Authentication → Users → Add user (same email, a password, "Auto Confirm User" on). To reset a password, use the same screen. Passwords are never stored in this repo. Running locally without the Supabase env vars, sign-in is off.

## Running the database tests

Any Postgres 15+ with [pgTAP](https://pgtap.org) installed, no Docker needed:

```bash
PGHOST=localhost PGUSER=postgres scripts/db/test.sh
```

This creates a throwaway `numu_test` database, applies `scripts/db/supabase-shim.sql` (a stand-in for Supabase's `auth` schema and roles), the migrations, the seed and the tests.

With Docker and the [Supabase CLI](https://supabase.com/docs/guides/local-development):

```bash
supabase start
supabase test db
```

`supabase start` also gives you Studio and a local inbox for magic-link logins. To log in locally, invite one of the seed team emails (e.g. `farouk@example.com`) from Studio and open the link from the local inbox.
