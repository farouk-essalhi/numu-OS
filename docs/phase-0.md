# Phase 0: Map and decide (Nov 1–14, 2026)

Goal: agree on exactly what we're building before the app gets written. The Phase 1 database is already drafted and tested so the workshop can react to something concrete; nothing has been applied to a real Supabase project.

> **Real client data does not go in this repo.** Fill in the templates below in a copy on Google Drive. The repo only holds the blank templates and fictional seed data.

## 1. Workshop (90 minutes, Ali, Farouk and the team)

1. **One real month, start to finish (40 min).** Pick one retainer client. Walk through last month: how the scope was agreed, how work was planned, who did what, how it was reviewed internally, how the client approved (and on which WhatsApp thread), how it was posted, invoiced and paid. Write down every place it broke or depended on someone remembering.
2. **Check the model against that month (20 min).** Does every step map to a status? Does every piece of work map to a deliverable type? Anything that didn't fit is a gap in the spec.
3. **Confirm the fixed lists (15 min).** Deliverable types and effort points, the nine statuses, the four roles and who sees what (`docs/schema.md`, "Access matrix").
4. **Open questions (15 min).** Below. Record each answer as a line in `docs/decisions.md`.

## 2. Open questions

From the plan:
- [ ] What exactly do we use ClickUp for, what do we use Jira for, and what do we pay for both each month?
- [ ] Which clients are monthly retainers and which are one-off projects? What is each one's exact monthly scope? (Template below)
- [ ] Who is the account lead for each client?
- [ ] Which team members are full-time, part-time or freelance, and what is each person's weekly capacity in points?
- [ ] Do clients see internal comments or revision counts? *Proposal: no. Built that way: clients never get direct table access.*
- [ ] Do any clients need invoices in another currency or format (e.g. USD)? *Supported: each retainer has its own currency.*
- [ ] What is the partner split and the reserve rule the finance module should apply? (Plan says a 20% company reserve.)
- [ ] Which clients would agree to try the approval portal first?
- [ ] Who is the ops champion?

Raised while drafting the database (each has a default already built; confirm or change):
- [ ] **Effort points:** Reel 3, Static 1, Carousel 2, Story set 1, Long video 5, Shoot day 5, Ad set 2, Influencer post 2. Right?
- [ ] **Fees:** account leads can see and edit retainer and project fees; creators can't. Right?
- [ ] **Scope:** account leads can change scope lines (quantities); only partners delete retainers. Right?
- [ ] **Extras:** only partners and account leads add deliverables (incl. extras outside scope); creators move cards. Right?
- [ ] **Due date** means "ready for Client review", spread evenly over the month's working days by the generator. Should there be a fixed lead time before the post date instead?
- [ ] **Holidays:** the generator skips Fridays and Saturdays but not public holidays (National Day, Eid). Fine to fix by hand on the 25th?
- [ ] **Mid-month starts:** a new retainer gets the full monthly quantity in its first month, and the account lead trims it. Right?
- [ ] **Posted** doesn't require a post link (stories have none); the app will ask for one. Right?
- [ ] **Contact language:** default email language for client contacts is English unless set to Arabic. Right?

## 3. Retainer scope template (one per active client)

Copy to Drive and fill in. This is what gets entered into NUMU OS in Phase 1.

| Field | Value |
| --- | --- |
| Client name (English) | |
| Client name (Arabic) | |
| Industry | |
| Account lead | |
| Retainer or one-off project? | |
| Monthly fee and currency | e.g. QAR 18,000 |
| Billing day | e.g. last working day |
| Contract start / end | |
| Brand kit link / Drive folder | |
| Approver(s): name, role, WhatsApp, email, language | |

Monthly scope:

| Deliverable type | Quantity per month | Platform | Usually done by |
| --- | --- | --- | --- |
| e.g. Reel | 6 | Instagram | |
| | | | |

For one-off projects: name, fixed fee, deadline, and the deliverable list (type, quantity, platform, due date).

## 4. ClickUp and Jira export

- [ ] Export everything from both to CSV; store the archive in Drive (not in this repo).
- [ ] List the features we actually used weekly. Anything not on the list is not rebuilt.
- [ ] Note what we pay per month for each (for the Phase 5 "cancel subscriptions" gate).

## 5. Setup (gate: repo, Supabase project and Netlify site exist)

GitHub
- [ ] **Make the repository private.** It is currently public; the plan calls for a private repo, and finance and client details will be described here over time. (GitHub → Settings → General → Danger zone → Change visibility.)
- [ ] Give Ali admin access.

Supabase
- [ ] Create the project (region closest to Doha that Supabase offers; check latency from Doha). Free tier to start, Pro ($25/month, daily backups) once live.
- [ ] Authentication: turn **off** "Allow new users to sign up"; keep email (magic link) on; set the Site URL and redirect URLs to the Netlify site once it exists.
- [ ] After spec sign-off: `supabase link --project-ref <ref>` then `supabase db push` to apply the migrations. Don't run `seed.sql` on the real project.
- [ ] Check pg_cron is on (Integrations → Cron) and the job `numu-generate-next-month` is listed.
- [ ] Add Farouk and Ali as team members (partner) and invite them.

Netlify
- [ ] Create the site from this repo once the Next.js app exists (start of Phase 1).
- [ ] Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or publishable key). Server-only secrets (service role key) never use the `NEXT_PUBLIC_` prefix.

## 6. Backlog (Phase 6 and later)

Ideas go here, not into the current phase.
- Meta Ads and TikTok data import into metrics
- Time-saving deliverable templates per client
- A design-tool plugin that feeds finished statics straight into deliverables
- Skip public holidays when spreading due dates
