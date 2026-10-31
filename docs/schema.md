# NUMU OS data model

The reference for every table, status and rule. Phase 1 tables are built (`supabase/migrations/`) and match this document exactly; later tables are the plan for their phase and will be confirmed when that phase starts.

The key idea: a **retainer** holds **scope lines**, and on the 25th of each month the system turns those lines into next month's **deliverables**. Approval, invoicing and profit all hang off those deliverables.

## Conventions

| Thing | Rule |
| --- | --- |
| IDs | `uuid` primary keys (`gen_random_uuid()`); `status_events` uses a `bigint` identity |
| Money | `bigint` integer minor units in `*_minor` columns + `currency char(3)` (default `QAR`). QAR 18,000 = `1800000` |
| Dates | `date` = a Doha calendar date. `timestamptz` = a moment. "Today" = `private.qatar_today()` |
| Week | Sunday–Saturday. Working days Sunday–Thursday (`private.is_working_day()`) |
| Bilingual | Client-facing text in `_en` / `_ar` pairs |
| Audit | Every table has `created_at`, `updated_at` (trigger-maintained) unless append-only |
| Links | Google Drive stays the file store. We store URLs (`*_url`), never files |
| Enums | Stored as English `snake_case`. Labels in EN/AR live in the app |

## Roles

Four roles. Team roles come from `team_members.access_level`; a client login is a `contacts` row with a `user_id`. A login with neither (or an inactive team member) sees nothing.

Logins are linked to people by email, whichever is created first: a trigger on `auth.users` links matching `team_members`/`contacts` rows, and inserting a person whose email already has a login links it straight away. Signups are disabled; partners invite.

## Access matrix

R = read, W = create/edit, D = delete. Enforced by row-level security and tested in `supabase/tests/03_access.test.sql`.

| Table | partner | account_lead | creator | client (phase 1) | anon |
| --- | --- | --- | --- | --- | --- |
| deliverable_types | R | R | R | R | – |
| team_members | RWD | R | R | – | – |
| clients | RWD | RW | R | R own | – |
| contacts | RWD | RWD | R | R self | – |
| retainers (fees) | RWD | RW | – | – | – |
| scope_lines | RWD | RWD | R | – | – |
| projects (fees) | RWD | RW | – | – | – |
| deliverables | RWD | RWD | R + edit (move cards) | – | – |
| status_events | R | R | R | – | – |
| comments | R, W own, D any | R, W own, D own | R, W own, D own | – | – |
| deliverable_board (view) | R | R | R | – | – |
| `generate_month_deliverables()` | run | run | – | – | – |

Sign-off (into/out of Client review, into Approved) is limited to partners and account leads by the workflow trigger, on top of the table rights above. Clients get the portal in phase 3 through narrow functions that only expose client-safe fields (no internal comments, no revision counts), not through these tables.

## Deliverable types

Fixed list in `deliverable_types` (changed by migration only). Effort points drive capacity planning and are proposals until the Phase 0 workshop confirms them.

| code | English | Arabic | Points |
| --- | --- | --- | --- |
| `reel` | Reel | ريل | 3 |
| `static_post` | Static post | منشور ثابت | 1 |
| `carousel` | Carousel | منشور كاروسيل | 2 |
| `story_set` | Story set | مجموعة ستوريز | 1 |
| `long_video` | Long video | فيديو طويل | 5 |
| `shoot_day` | Shoot day | يوم تصوير | 5 |
| `ad_set` | Ad set | مجموعة إعلانات | 2 |
| `influencer_post` | Influencer post | منشور مؤثر | 2 |

Arabic labels need a check by a native speaker on the team.

## Deliverable statuses

| # | Value | English | Arabic | Meaning |
| --- | --- | --- | --- | --- |
| 1 | `planned` | Planned | مخطط | Created (usually by the generator); owner and due date set |
| 2 | `scripting` | Scripting | كتابة السيناريو | |
| 3 | `shooting` | Shooting | تصوير | |
| 4 | `editing` | Editing | مونتاج | Also where revisions come back to |
| 5 | `internal_review` | Internal review | مراجعة داخلية | Farouk or the account lead signs off |
| 6 | `client_review` | Client review | مراجعة العميل | Visible in the client portal (phase 3) |
| 7 | `approved` | Approved | معتمد | |
| 8 | `scheduled` | Scheduled | مجدول | Needs a post date |
| 9 | `posted` | Posted | منشور | Post link added; `posted_at` stamped |

The enum is in this order, so `status < 'client_review'` means "still with the team".

**Rules (trigger-enforced):**
1. Moving into or out of `client_review`, or into `approved`, needs a partner or account lead. (The system, with no logged-in user, can do anything.)
2. `client_review` → any earlier status adds 1 to `revision_count`. Internal send-backs (Internal review → Editing) don't count. People can't edit `revision_count`.
3. `scheduled` requires `post_date`.
4. `posted` sets `posted_at` (keeps a value the app sends, so "posted yesterday" works); leaving `posted` clears it.
5. Every change of status inserts a `status_events` row with who made it. Creation logs `null → planned`.

Any other move is allowed, including skipping steps.

**Flags** (computed in `deliverable_board`):
- `flag_many_revisions`: `revision_count >= 2`
- `flag_waiting_on_client`: in `client_review` for more than 48 hours
- `is_overdue`: before `client_review` and `due_date` has passed, or `approved`/`scheduled` and `post_date` has passed

## Phase 1 tables (built)

### team_members
Everyone at NUMU, with or without a login.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | |
| user_id | uuid → auth.users | Unique. Linked by email |
| full_name | text | |
| email | text | Unique, case-insensitive. Used to link the login |
| phone | text | |
| job_title | text | e.g. Video editor |
| access_level | access_level | `partner`, `account_lead`, `creator` (default) |
| employment | employment_type | `full_time` (default), `part_time`, `freelance` |
| weekly_capacity_points | integer | Effort points per week. 0 = not set |
| is_active | boolean | Inactive people lose all access and stop getting generated work |

### clients
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | |
| name_en, name_ar | text | `name_en` required and unique |
| industry | text | |
| status | client_status | `active` (default), `paused`, `ended`. Only active clients get generated work |
| account_lead_id | uuid → team_members | Fallback owner for generated work |
| brand_kit_url, drive_folder_url | text | Google Drive links |

### contacts
People at a client. A contact with a `user_id` is a client login.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | |
| client_id | uuid → clients | Cascade delete |
| user_id | uuid → auth.users | Linked by email. Unique per client |
| full_name, job_title | text | |
| phone | text | WhatsApp number, `+974…` |
| email | text | Unique per client, case-insensitive |
| is_approver | boolean | Can approve in the portal (phase 3) |
| preferred_language | language_code | `en` (default) or `ar`, for emails |

### retainers
A client's monthly contract. A price change is a new retainer row (end the old one), so history stays true.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | |
| client_id | uuid → clients | |
| status | retainer_status | `draft` (default), `active`, `paused`, `ended` |
| start_date, end_date | date | `end_date` null = open-ended |
| monthly_fee_minor | bigint | e.g. `1800000` = QAR 18,000 |
| currency | char(3) | `QAR` default |
| billing_day | smallint | 1–31; null = last working day of the month |
| notes | text | |

### scope_lines
What a retainer buys each month.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | |
| retainer_id | uuid → retainers | Cascade delete |
| deliverable_type | text → deliverable_types | |
| quantity_per_month | smallint | 1–100 |
| platform | platform | `instagram`, `tiktok`, `snapchat`, `youtube`, `x`, `linkedin`, `facebook`; null for e.g. shoot days |
| default_owner_id | uuid → team_members | Who gets generated items; else the account lead |
| notes | text | |

Changing a quantity affects months not yet generated. Re-running the generator after an increase adds the difference.

### projects
One-off campaigns: a client, a fixed fee, a deliverable list and a deadline, no monthly repeat.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | |
| client_id | uuid → clients | |
| name_en, name_ar | text | |
| status | project_status | `planned` (default), `active`, `delivered`, `cancelled` |
| fixed_fee_minor, currency | bigint, char(3) | |
| start_date, deadline | date | |
| notes | text | |

### deliverables
Every piece of work. The production board.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | |
| client_id | uuid → clients | Set from the retainer/project by trigger; mismatches rejected |
| retainer_id | uuid → retainers | Exactly one of retainer_id / project_id |
| scope_line_id | uuid → scope_lines | Must belong to the retainer. Null on a retainer item = extra outside scope |
| project_id | uuid → projects | |
| deliverable_type | text → deliverable_types | |
| title | text | Generator: "Reel 3/6 · Instagram" |
| month | date | 1st of the month it counts against; defaults from `due_date` |
| seq | smallint | 1..quantity within its scope line and month (generator) |
| platform | platform | Copied from the scope line by default |
| owner_id | uuid → team_members | |
| due_date | date | Required. When it must be ready for Client review |
| post_date | date | Planned go-live. Required from Scheduled |
| status | deliverable_status | `planned` default |
| revision_count | smallint | Trigger-maintained |
| effort_points | smallint | Defaults from the type; can be raised for a heavy item |
| script_url, raw_url, final_url, post_url | text | Drive / live links |
| posted_at | timestamptz | Trigger-maintained |

Unique `(scope_line_id, month, seq)` makes the generator idempotent.

### status_events
Append-only history. Nobody can insert, edit or delete rows through the API; only the trigger writes.

| Column | Type | Notes |
| --- | --- | --- |
| id | bigint identity | |
| deliverable_id | uuid → deliverables | Cascade delete |
| from_status | deliverable_status | Null = created |
| to_status | deliverable_status | |
| changed_by_team_member_id | uuid → team_members | |
| changed_by_contact_id | uuid → contacts | Client approvals (phase 3). Both null = system |
| changed_at | timestamptz | |

### comments
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | |
| deliverable_id | uuid → deliverables | Fixed after posting |
| author_team_member_id | uuid → team_members | Set from the login by trigger, whatever the app sends |
| author_contact_id | uuid → contacts | For client comments (phase 3); such comments are never internal |
| body | text | Up to 10,000 characters |
| is_internal | boolean | Default true. Clients never see internal comments |

### deliverable_board (view)
`deliverables` joined with client, type and owner names, plus `status_changed_at`, `is_overdue`, `flag_many_revisions`, `flag_waiting_on_client`. Runs with the caller's permissions (`security_invoker`), so it never shows more than the tables do. Use it for the board, My work and the ops dashboard.

### Functions
- `public.generate_month_deliverables(p_month date default next month, p_retainer_id uuid default all)` → number created. Partners/leads (or the system). Scheduled with pg_cron: `0 6 25 * *` UTC = 09:00 Doha on the 25th.
- `private.*`: role helpers for RLS, triggers, `qatar_today()`, `is_working_day()`, `platform_label()`. Not callable through the API.

## Later phases (planned, not built)

Fields below are the starting proposal; each phase confirms them before its migration.

### Phase 2: Money
- **invoices**: number (sequential, e.g. `NUMU-2026-0001`), client_id, retainer_id or project_id, period (month), issue_date, due_date, currency, status (`draft`, `sent`, `paid`, `void`), paid_date (derived from payments), pdf_url, notes. Bilingual PDF with paid stamp.
- **invoice_lines**: invoice_id, description_en, description_ar, quantity, unit_price_minor, amount_minor. (Not in the original 16; an invoice needs lines.)
- **payments**: invoice_id, amount_minor, currency, paid_on, method (`bank_transfer`, `cheque`, `cash`, `card`), reference.
- **expenses**: amount_minor, currency, category (`freelancer`, `influencer`, `ads`, `gear`, `office`, `software`), client_id and/or project_id (null = overhead), spent_on, vendor, description, receipt_url.
- **Partner draws and the 20% reserve**: table or expense category to be decided with Ali (open question: partner split and reserve rule).
- All partner-only.

### Phase 3: Clients in the loop
- **Content calendar**: on `deliverables`: `caption_en`, `caption_ar` (+ `post_date`, already there). Calendar view per client and platform.
- **Client portal**: private link per client; approve or request changes via narrow functions (writes `status_events.changed_by_contact_id`, client comments with `is_internal = false`).
- **shoots**: shoot_date, start/end time, location, client_id, call_sheet_url, equipment (text), notes; with crew (team_members), talent and the deliverables it covers as link tables.
- Approval and reminder emails (Resend), bilingual by `preferred_language`.

### Phase 4: Sales and talent
- **leads**: company, contact name/phone, source, estimated_value_minor, stage (`new`, `contacted`, `proposal_sent`, `negotiating`, `won`, `lost`), proposal_url, next_step, next_step_date, won_lost_reason, client_id once won.
- **talent**: name, handle, platforms, followers per platform, rate card (per deliverable type), notes; bookings link talent to projects/shoots with the agreed fee.

### Phase 5: Reports and AI
- **metrics**: client_id, platform, month, reach, views, engagement, followers, ad_spend_minor, leads. One row per client, platform and month. Manual entry first, Meta/TikTok import later.
- Monthly client report (bilingual PDF) and the MCP server for Claude.

## Metrics (definitions)

| Metric | Definition |
| --- | --- |
| Monthly recurring revenue | Sum of `monthly_fee_minor` of retainers active in the month (QAR) |
| Margin per client | Month's retainer + project revenue − expenses tagged to the client − estimated team cost (effort points delivered × cost per point; method to confirm in phase 2) |
| On-time delivery % | Of deliverables posted in the period, share with `posted_at` (Doha date) ≤ `post_date` (or `due_date` if never scheduled) |
| Revisions per deliverable | Average `revision_count` of deliverables approved in the period |
| Client approval time | Hours from entering `client_review` to leaving it, from `status_events` |
| Capacity used % | Effort points of a person's deliverables due in the week ÷ `weekly_capacity_points` |
| Receivables | Unpaid invoice balances, by age past due (0–30, 31–60, 61–90, 90+ days) |
| Pipeline | Sum of open leads' estimated value × stage weight |
