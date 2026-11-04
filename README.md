# NUMU OS

NUMU's internal system for retainers, deliverables, client approvals and money. It replaces ClickUp and Jira.

- **Spec and rules:** [CLAUDE.md](CLAUDE.md)
- **Data model, statuses, access matrix, metrics:** [docs/schema.md](docs/schema.md)
- **Decisions and why:** [docs/decisions.md](docs/decisions.md)
- **Phase 0 workshop, open questions, setup:** [docs/phase-0.md](docs/phase-0.md)

## Status

Phase 0. The Phase 1 database (clients, retainers, scope, projects, deliverables, status history, comments, access rules and the monthly deliverable generator) is drafted and covered by tests. The app's screens run on fictional demo data until the Supabase project exists.

## Running the app

```bash
npm install
npm run dev        # http://localhost:3000
```

Works on desktop, tablet and phone. Settings → "View as" switches between a partner, an account lead and a creator to see what each role gets. ⌘K searches everything. Light and dark follow the device, or use the toggle in the top bar.

```bash
npm test           # unit tests
npm run lint && npm run typecheck && npm run build
```

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
