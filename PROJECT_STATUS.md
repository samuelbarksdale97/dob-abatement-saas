# DOB Abatement SaaS — Project Status & Handoff Document

**Last updated:** 2026-03-11
**Author:** Samuel Barksdale + Claude Code (Opus 4.6)
**Repo:** https://github.com/samuelbarksdale97/dob-abatement-saas
**Vercel:** Connected to repo (auto-deploys on push to `main`)

---

## 0. Supporting Documents (in `docs/`)

All reference material is checked into the repo under `docs/`:

| File | What It Is |
|------|-----------|
| [technical-specification.md](docs/technical-specification.md) | Full tech spec — functional requirements, data models, acceptance criteria, UI/UX specs, implementation phases, user stories |
| [meeting-transcript-2026-01-12-kickoff.md](docs/meeting-transcript-2026-01-12-kickoff.md) | Team kickoff meeting (Chris Grant, Nikita Gray, Andy Parker, Sam Barksdale) — full lifecycle walkthrough, business context, 184 open violations |
| [meeting-transcript-2026-01-15-process-walkthrough.md](docs/meeting-transcript-2026-01-15-process-walkthrough.md) | 1-on-1 with Nikita — detailed process walkthrough, manual submission template, photo requirements, DOB portal demo |
| [DOB_Abatement_Flowchart.html](docs/DOB_Abatement_Flowchart.html) | Visual flowchart of the full abatement lifecycle (open in browser) |
| [n8n-parser-workflow.json](docs/n8n-parser-workflow.json) | Original n8n proof-of-concept workflow (pre-SaaS) for PDF parsing and photo matching |
| [sample-nois/](docs/sample-nois/) | Two real NOI PDFs for testing the parse pipeline |

---

## 1. What This Is

A SaaS platform that automates **DC Department of Buildings (DOB) Notice of Infraction (NOI)** processing for property managers. Upload an NOI PDF → AI extracts all violation data, evidence photos, and remediation tasks → dashboard tracks violations through the full abatement lifecycle.

**Target user:** Yoke Management (sam@yokemgmt.com) and similar DC property management companies that receive NOIs and need to track abatement deadlines, assign contractors, and submit evidence of compliance.

---

## 2. Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Framework** | Next.js 16.1.6 (App Router) | React 19, Turbopack dev server |
| **Styling** | Tailwind CSS 4 + shadcn/ui | `components.json` configured, 15+ UI components |
| **Auth** | Supabase Auth (SSR) | Email/password, JWT with custom claims hook |
| **Database** | Supabase PostgreSQL | RLS-secured, multi-tenant by org_id |
| **Storage** | Supabase Storage (`noi-pdfs` bucket) | Signed URLs for PDF access |
| **AI** | Google Gemini 2.5 Flash | Two-pass: structured extraction + page analysis |
| **Background Jobs** | Inngest | 7-step parse pipeline with retries, deadline cron, notification emails |
| **PDF Rendering** | react-pdf 10.3 | Client-side rendering of PDF pages as evidence photos |
| **Deployment** | Vercel | Connected to GitHub, auto-deploy on push |

---

## 3. Architecture Overview

```
┌──────────────┐     ┌───────────────┐     ┌──────────────────┐
│   Browser     │────▶│  Next.js App  │────▶│   Supabase       │
│  (React 19)  │     │  (API Routes) │     │  (Auth/DB/Store) │
└──────────────┘     └───────┬───────┘     └──────────────────┘
                             │
                     ┌───────▼───────┐
                     │   Inngest     │─────▶ Gemini 2.5 Flash
                     │  (Job Queue)  │       (AI Parse Pipeline)
                     └───────────────┘
```

### Parse Pipeline (Inngest Function: `parse-noi-pdf`)

The core value of the product — 7 deterministic steps:

1. **Init** — Mark violation as `PARSING`
2. **AI Parse** — Download PDF from Supabase Storage, send to Gemini for structured data extraction (notice ID, respondent, address, fines, violation items with codes/descriptions/deadlines)
3. **Check Duplicate** — Query for existing violation with same `notice_id` in the org; if found, stores `duplicate_detected: true` and `duplicate_violation_id` in `parse_metadata` JSONB
4. **Insert Records** — Write parsed violation data and items to Supabase
5. **Auto-Link Property** — Normalize infraction address (BR-004), match to existing property or create new one, extract and match/create unit, set `property_id` and `unit_id` on violation
6. **Analyze Pages** — Second Gemini call: identify which PDF pages are evidence photos vs. text, match each to a violation code
7. **Match Photos** — Link evidence photo pages to their violation items by code, insert into `photos` table

Each step uses `ParseLogger` which flushes progress to `violations.parse_metadata` (JSONB) after each step transition, enabling real-time UI updates via polling.

### Status Workflow

```
NEW → PARSING → PARSED → ASSIGNED → IN_PROGRESS → AWAITING_PHOTOS
→ PHOTOS_UPLOADED → READY_FOR_SUBMISSION → SUBMITTED → APPROVED → CLOSED
                                                     → REJECTED → IN_PROGRESS
```

Valid transitions are enforced in `src/lib/status-transitions.ts`.

---

## 4. Database Schema

**Supabase project:** `njewqntaitsdwuzvgftq`
**Migration file:** `supabase/migrations/001_initial_schema.sql`

### Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `organizations` | Multi-tenant orgs | name, slug, plan, settings |
| `profiles` | User accounts (extends auth.users) | org_id, full_name, email, role |
| `properties` | Managed properties | address, city, state |
| `units` | Individual units within properties | property_id, unit_number, is_vacant, occupant_name, occupant_phone |
| `violations` | NOI records (core entity) | notice_id, respondent, status, priority, parse_metadata, raw_ai_output |
| `violation_items` | Individual violation line items | violation_code, fine, violation_description, task_description |
| `photos` | Evidence photos (from PDF pages) | storage_path, page_number, matched_violation_code, violation_item_id |
| `work_orders` | Repair assignments | assigned_to, status, due_date |
| `submissions` | DOB compliance submissions | confirmation_number, response_status |
| `audit_log` | Auto-logged status changes | old_values, new_values |
| `notifications` | In-app notifications | title, message, type, priority, read |
| `contacts` | Universal contacts directory | name, company, category, tags, org_id |
| `contact_interactions` | Interaction log (auto/manual) | contact_id, type, direction, subject, details |
| `contact_entity_links` | Many-to-many entity links | contact_id, entity_type, entity_id |
| `invitations` | Team member invitations | email, role, token, expires_at, accepted_at |

### Key Database Functions & Triggers

- **`auth_org_id()`** — Reads `org_id` from JWT `app_metadata` for RLS
- **`auth_role()`** — Reads `role` from JWT `app_metadata` for RLS
- **`custom_access_token_hook()`** — Injects org_id and role from `profiles` table into every JWT. **Registered as a Supabase Auth Hook** (must be enabled in Supabase Dashboard → Authentication → Hooks → "Customize Access Token")
- **`sync_profile_to_app_metadata()`** — Trigger on `profiles` table that syncs org_id/role to `auth.users.raw_app_meta_data` (fallback for when JWT hook isn't refreshed yet)
- **`handle_new_user()`** — Auto-creates profile row on user signup if `org_id` is in user metadata
- **`log_violation_status_change()`** — Auto-logs to `audit_log` when violation status changes
- **`get_violation_stats()`** — RPC function for dashboard stats
- **`get_portfolio_stats()`** — RPC function for per-property violation rollups (Portfolio Home)
- **`get_property_detail(p_property_id)`** — RPC function for per-unit violation rollups within a property
- **`get_analytics(p_property_id, p_date_from, p_date_to)`** — RPC function for aggregated analytics (avg resolution, approval rate, fines, status distribution, contractor performance)

### Row Level Security (RLS)

Every table has RLS enabled. All policies use `auth_org_id()` to scope data to the current user's organization. Write access is restricted to `OWNER`, `PROJECT_MANAGER`, and `ADMIN` roles. Contractors can only see their assigned work orders and insert photos.

### Supabase Realtime

Granted to: `violations`, `violation_items`, `photos`, `work_orders`, `notifications`, `contacts`, `contact_interactions`

---

## 5. File Structure & Key Files

```
src/
├── app/
│   ├── (authenticated)/          # Auth-protected routes
│   │   ├── layout.tsx            # Auth check + sidebar layout
│   │   ├── dashboard/
│   │   │   ├── page.tsx          # Portfolio Home: stats + property cards
│   │   │   └── [id]/page.tsx     # Violation detail: Items tab, Photos tab, Activity tab
│   │   ├── violations/page.tsx   # All Violations: flat table for power users
│   │   ├── properties/
│   │   │   └── [id]/
│   │   │       ├── page.tsx      # Property Detail: stats, unit cards
│   │   │       └── units/[unitId]/page.tsx  # Unit Detail: info, violations
│   │   ├── contacts/
│   │   │   ├── page.tsx          # Contacts list: category tabs, search, add dialog
│   │   │   └── [id]/page.tsx     # Contact detail: info card, Timeline, Linked Entities
│   │   ├── analytics/page.tsx    # Analytics: KPI cards + 4 Recharts charts
│   │   ├── settings/page.tsx     # Settings: Gmail, Team, Notifications tabs
│   │   ├── parse/page.tsx        # Upload → Progress → Results state machine
│   │   ├── error.tsx             # Error boundary for authenticated routes
│   │   └── import/page.tsx       # CSV import page (basic)
│   ├── api/
│   │   ├── parse/route.ts        # POST: upload PDF, create violation, send Inngest event
│   │   ├── violations/route.ts   # GET (list+filter) and PATCH (update status/fields)
│   │   ├── stats/route.ts        # GET: calls get_violation_stats() RPC
│   │   ├── portfolio/route.ts    # GET: portfolio stats + property rollups
│   │   ├── properties/
│   │   │   ├── route.ts          # GET (list) / POST (create)
│   │   │   └── [id]/
│   │   │       ├── route.ts      # GET (detail) / PATCH (update)
│   │   │       └── units/
│   │   │           ├── route.ts  # GET (list) / POST (create)
│   │   │           └── [unitId]/route.ts  # PATCH (update)
│   │   ├── analytics/route.ts    # GET: calls get_analytics() RPC
│   │   ├── notifications/
│   │   │   ├── route.ts          # GET (list) / POST (mark-all-read)
│   │   │   ├── count/route.ts    # GET: unread count
│   │   │   └── [id]/route.ts     # PATCH: mark as read
│   │   ├── submissions/
│   │   │   ├── route.ts          # GET (list) / POST (create)
│   │   │   └── [id]/route.ts     # PATCH (update DOB response)
│   │   ├── contacts/
│   │   │   ├── route.ts          # GET (list+search) / POST (create)
│   │   │   ├── search/route.ts   # GET: typeahead search
│   │   │   └── [id]/
│   │   │       ├── route.ts      # GET / PATCH / DELETE (soft)
│   │   │       ├── interactions/route.ts  # GET / POST
│   │   │       └── link/route.ts # POST / DELETE entity links
│   │   ├── team/
│   │   │   ├── route.ts          # GET members
│   │   │   ├── invite/route.ts   # POST invite
│   │   │   └── [userId]/role/route.ts  # PATCH role
│   │   ├── contractor/[token]/photos/
│   │   │   ├── route.ts          # POST: upload photo
│   │   │   └── verify/route.ts   # POST: AI angle verification
│   │   ├── violations/
│   │   │   ├── route.ts          # GET (list+filter, 6 new params) / PATCH
│   │   │   └── [id]/merge/route.ts  # POST: merge duplicate violations
│   │   ├── import/route.ts       # POST: CSV import
│   │   └── inngest/route.ts      # Inngest webhook handler
│   ├── contractor/[token]/
│   │   ├── page.tsx              # Contractor portal (mobile-responsive)
│   │   └── error.tsx             # Error boundary for contractor portal
│   ├── error.tsx                 # Global root error boundary
│   ├── login/page.tsx            # Email/password login form
│   └── page.tsx                  # Landing/redirect page
├── components/
│   ├── auth/
│   │   └── auth-listener.tsx     # Listens for auth state changes, refreshes router
│   ├── dashboard/
│   │   ├── violation-table.tsx   # Sortable table with AI cost column
│   │   ├── stats-panel.tsx       # Summary cards (total, overdue, fines)
│   │   ├── filter-sidebar.tsx    # Status/priority/search filters
│   │   └── alert-banner.tsx      # Urgent deadline alerts
│   ├── parser/
│   │   ├── upload-zone.tsx       # Drag-and-drop PDF upload
│   │   ├── parse-progress.tsx    # Real-time step timeline + progress bar + cost
│   │   ├── parsed-results.tsx    # Post-parse results with evidence photos
│   │   └── evidence-photo.tsx    # PDF page renderer with lightbox zoom
│   ├── contractor/
│   │   ├── photo-upload-slot.tsx  # Photo upload with AI angle verification
│   │   └── assign-work-order-dialog.tsx  # Work order assignment dialog
│   ├── notifications/
│   │   └── notification-bell.tsx  # Bell icon + dropdown with Realtime subscription
│   ├── layout/
│   │   ├── nav.tsx               # Top navigation bar
│   │   └── sidebar.tsx           # Left sidebar navigation
│   └── ui/                       # shadcn/ui primitives (15+ components)
├── inngest/
│   ├── client.ts                 # Inngest client config
│   └── functions/
│       ├── parse-noi.ts          # 7-step parse pipeline (init, ai-parse, check-duplicate, insert, auto-link, analyze-pages, match-photos)
│       ├── deadline-check.ts     # Daily cron: overdue/3-day/10-day deadline alerts → notifications + email
│       └── send-notification-email.ts  # Event-driven: sends transactional emails via Resend
├── lib/
│   ├── ai/
│   │   ├── gemini.ts             # Gemini API wrapper (parse + analyze)
│   │   └── schemas.ts            # Zod schemas, TypeScript types for parse data
│   ├── supabase/
│   │   ├── client.ts             # Browser Supabase client
│   │   ├── server.ts             # Server client + admin client (service_role)
│   │   └── middleware.ts         # Session refresh middleware
│   ├── types.ts                  # All TypeScript interfaces
│   ├── email.ts                  # Resend integration: deadline alerts + submission confirmation templates
│   ├── status-transitions.ts     # Valid status transitions + display helpers
│   ├── address-normalization.ts  # Address normalization + matching (BR-004)
│   ├── parse-logger.ts           # Structured logging for parse pipeline
│   ├── pdf/prepare-images.ts     # PDF page → data URL renderer for photo verification
│   └── utils.ts                  # cn() utility
└── middleware.ts                 # Next.js middleware (Supabase session refresh)
```

---

## 6. What's Working (Tested & Verified)

### Core Features (v1)
- [x] **PDF Upload** — Drag-and-drop on `/parse`, uploads to Supabase Storage `noi-pdfs` bucket
- [x] **AI Parse Pipeline** — Full 7-step Inngest function extracts notice data, detects duplicates, violation items, evidence photos, and auto-links to properties/units
- [x] **Real-time Parse Progress** — Step timeline with status indicators, elapsed timer, token/cost tracking. Uses 3-second polling fallback alongside Supabase Realtime
- [x] **Parsed Results View** — Shows extracted violation data, items list, evidence photos with captions after parse completes
- [x] **Evidence Photo Viewer** — Renders individual PDF pages as photos using react-pdf. Click to open lightbox with full-size view. Cards sized to photo width
- [x] **Dashboard** — Violations list with sorting (priority, deadline, fines), status badges, AI cost column
- [x] **Violation Detail Page** — Tabbed view: Items (with linked evidence photos), Photos (rendered PDF pages grouped by violation item), Activity (audit log)
- [x] **Auth Flow** — Login with email/password, session persistence via middleware, JWT includes org_id + role
- [x] **RLS Working** — All data scoped to organization, verified end-to-end
- [x] **Cost Tracking** — Per-parse token usage and USD cost displayed on progress page and dashboard table
- [x] **Contractor Portal** — Magic link access, photo upload, work order status updates
- [x] **Evidence PDF Generation** — Generate compliance submission PDF with before/after photos
- [x] **Gmail Email Monitoring** — OAuth integration, auto-sync NOI attachments via Inngest cron

### v2 Sprint 1: Navigation Hierarchy & Portfolio Home (Completed 2026-03-11)
- [x] **Units Table** — `006_units_table.sql` migration with RLS, indexes, unique constraints
- [x] **Portfolio Home** — Stats bar + property cards grid with violation rollups, replaces old flat dashboard
- [x] **Property Detail Page** — Breadcrumbs, stats bar (violations/fines/unlinked), unit cards grid
- [x] **Unit Detail Page** — Breadcrumbs, unit info card, violation list placeholder
- [x] **Property/Unit CRUD APIs** — GET/POST/PATCH for properties and units
- [x] **Portfolio API** — `get_portfolio_stats()` and `get_property_detail()` RPCs
- [x] **Address Normalization** — BR-004 compliant: abbreviation expansion, unit extraction, fuzzy matching
- [x] **Auto-Link Parse Step** — Parse pipeline auto-creates/matches properties and units from NOI addresses
- [x] **Sidebar Navigation** — Portfolio Home + All Violations (flat table for power users)
- [x] **Test Suite** — 152 tests across 12 files (status machine, work orders, address normalization, API routes, components, mock data)

### v2 Sprint 2: Notifications + Submission Loop (Completed 2026-03-11)
- [x] **Notification System** — NotificationBell component with Realtime subscription, priority colors (urgent/high/normal/low), mark-read/mark-all-read
- [x] **Deadline Alerts** — Inngest daily cron checks for overdue/3-day/10-day deadlines, creates in-app notifications, sends email via Resend
- [x] **Email Templates** — `deadlineAlertEmail` and `submissionConfirmationEmail` with HTML templates via Resend
- [x] **Submission Tracking** — SubmissionTab on violation detail: record submissions with confirmation numbers, record DOB responses (PENDING/APPROVED/REJECTED/ADDITIONAL_INFO_REQUESTED)
- [x] **Status Auto-Progression** — When all AFTER photos are approved, violation auto-advances to READY_FOR_SUBMISSION
- [x] **Realtime Subscriptions** — Violation detail page subscribes to violations, photos, and work_orders changes

### v2 Sprint 3: Contacts + Users (Completed 2026-03-11)
- [x] **Universal Contacts System** — Contacts with 6 categories (CONTRACTOR, GOVERNMENT, TENANT, INTERNAL, VENDOR, OTHER), interactions, entity links
- [x] **Contacts Pages** — List page with category tabs + search, detail page with Timeline and Linked Entities tabs
- [x] **Contact Interactions** — 5 types (NOTE, PHONE_CALL, EMAIL, MEETING, SYSTEM_EVENT) with direction tracking and auto-updated last_interaction_at
- [x] **Team Management** — Invite members via Resend email, role dropdown (OWNER/ADMIN/PROJECT_MANAGER/CONTRACTOR), last-owner protection
- [x] **Settings Tabs** — Gmail, Team, Notifications tabs with per-user notification preferences
- [x] **Data Migration** — Existing contractors auto-migrated to contacts system with entity links and interaction backfill

### v2 Sprint 4: Polish + Hardening (Completed 2026-03-11)
- [x] **Enhanced Filter Sidebar** — Property dropdown, date range picker, "Needs Attention" quick filter with multi-select statuses
- [x] **Extended Violations API** — 6 new filter params: property_id, unit_id, date_from, date_to, needs_attention, statuses (comma-separated)
- [x] **Duplicate NOI Detection** — Parse pipeline detects existing notice_id, UI shows merge/keep-separate options, merge API merges items+photos
- [x] **Analytics Page** — KPI cards (avg resolution, approval rate, fines, open/closed), 4 Recharts charts (line, donut, 2 bar), property+date filters
- [x] **Mobile Contractor Portal** — Responsive grid (stacked on mobile), 44px min touch targets, camera capture
- [x] **React Error Boundaries** — error.tsx at root, authenticated, and contractor portal levels
- [x] **Test Suite** — Expanded to 166 tests across 15 files

---

## 7. Known Issues & Technical Debt

### Must Fix Before Production

1. **Inngest on Vercel** — Inngest requires either:
   - Install from Vercel Marketplace (recommended): adds `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` automatically
   - Or self-host and configure manually
   - **Without Inngest, the parse pipeline won't work in production**

2. **Supabase Auth Hook** — The `custom_access_token_hook` must be **enabled in the Supabase Dashboard** (Authentication → Hooks → Customize Access Token → select `custom_access_token_hook`). Without it, JWTs won't contain org_id/role and RLS will block everything.

3. **Credential Rotation** — The Supabase service role key was briefly exposed in a public git commit (now purged from history). **Rotate the service role key** in Supabase Dashboard → Settings → API → regenerate. Update `.env.local` and Vercel env vars after.

4. **Environment Variables on Vercel** — Must be set manually:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GEMINI_API_KEY`
   - Inngest keys (if not using Marketplace)

### Nice to Fix

5. **PDF re-download** — The parse pipeline downloads the PDF twice (once for structured extraction, once for page analysis). Could cache the buffer in step state.
6. **Violation code matching** — Photo-to-item matching uses exact string comparison after normalization. Could be fuzzy.
7. ~~**No test suite**~~ — **FIXED in Sprint 1, expanded in Sprint 4**: 166 tests across 15 files covering status transitions, work orders, address normalization, API routes, components, analytics, filters, merge, and mock data.
8. ~~**No error boundary**~~ — **FIXED in Sprint 4**: error.tsx at root, authenticated, and contractor portal levels with "Try Again" buttons.
9. **Package name** — `package.json` still says `"name": "app"` — should be `"dob-abatement-saas"`.

---

## 8. v2 Roadmap (4 Sprints)

See `docs/pm_docs/v2-productionization/Technical_Specification.md` for full spec.

### Sprint 1: Navigation Hierarchy & Portfolio Home ✅ COMPLETE
- [x] Units table migration + RPCs
- [x] Property/Unit CRUD APIs + Portfolio API
- [x] Address normalization + auto-linking in parse pipeline
- [x] Portfolio Home, Property Detail, Unit Detail pages
- [x] Sidebar navigation restructure
- [x] 152 regression tests

### Sprint 2: Notifications + Submission Loop ✅ COMPLETE
- [x] Migration `007_notifications_and_submissions.sql` — `priority` column on notifications, `settings` JSONB on profiles, `generated_pdf_path` on submissions
- [x] Notification API routes (list, mark-read, mark-all-read, count)
- [x] NotificationBell component in top nav with Realtime subscription, priority colors, relative timestamps
- [x] Inngest `deadline-check` cron (daily 8AM ET: 10-day, 3-day, overdue alerts with deduplication)
- [x] Email notification templates via Resend (`deadlineAlertEmail`, `submissionConfirmationEmail`)
- [x] Inngest `send-notification-email` event-driven function for submission confirmation emails
- [x] Submission tracking API routes (GET/POST `/api/submissions`, PATCH `/api/submissions/[id]`)
- [x] SubmissionTab component on violation detail page (record submission, record DOB response)
- [x] Status auto-progression: all AFTER photos approved → READY_FOR_SUBMISSION
- [x] Supabase Realtime subscriptions on violation detail page (violations, photos, work_orders)

### Sprint 3: Contacts + Users ✅ COMPLETE
- [x] Migration `008_contacts.sql` — contacts, contact_interactions, contact_entity_links tables with RLS, enums, triggers, data migration from contractors
- [x] Migration `009_invitations.sql` — invitations table with 7-day expiry, RLS for OWNER/ADMIN
- [x] Contacts CRUD APIs (list with search/category/pagination, detail, create, update, soft delete)
- [x] Contact interactions API (list, create with auto-update last_interaction_at)
- [x] Contact entity linking API (link/unlink to properties, violations, work_orders)
- [x] Contact typeahead search API (min 1 char, limit 10)
- [x] Contacts list page with category tabs, search, avatar initials, add dialog
- [x] Contact detail page with info card, Timeline tab, Linked Entities tab, interaction dialog
- [x] Team API routes (list members + pending invitations, send invite via Resend, change role)
- [x] Settings page with Tabs: Gmail, Team (invite + role management), Notifications (preference toggles)
- [x] Sidebar navigation updated with Contacts nav item
- [x] Contractor → Contact data migration in `008_contacts.sql`

### Sprint 4: Polish + Hardening ✅ COMPLETE
- [x] Enhanced filter sidebar (property dropdown, date range, "Needs Attention" quick filter, multi-status via `statuses` param)
- [x] Extended violations API (property_id, unit_id, date_from, date_to, needs_attention, statuses filters)
- [x] Duplicate NOI detection in parse pipeline + merge API + merge/keep-separate UI on parsed results
- [x] Analytics page with Recharts (KPIs, line chart, donut chart, bar charts for fines/contractors)
- [x] Analytics API route + `get_analytics()` RPC migration (`010_analytics.sql`)
- [x] Mobile-responsive contractor portal (stacked layout on mobile, 44px touch targets, camera capture)
- [x] React error boundaries (error.tsx at root, authenticated, and contractor levels)
- [x] Sidebar: Analytics nav item added
- [x] Test suite expanded to 166 tests across 15 files
- [ ] Inngest on Vercel Marketplace (requires Vercel dashboard — manual step)

---

## 9. Credentials & Access

### Supabase
- **Project ref:** `njewqntaitsdwuzvgftq`
- **URL:** `https://njewqntaitsdwuzvgftq.supabase.co`
- **Dashboard:** https://supabase.com/dashboard/project/njewqntaitsdwuzvgftq
- **Anon key:** In `.env.local`
- **Service role key:** In `.env.local` (**ROTATE THIS** — was briefly leaked)

### Test Account
- **Email:** sam@yokemgmt.com
- **Password:** TestPass123!
- **Org:** Yoke Management (`ecaaac47-5f73-4d13-b00a-6f706ce37bdc`)
- **Role:** OWNER
- **User ID:** `cc275015-e03b-4683-a1b7-fb98991a6f2c`

### External Services
- **Gemini API key:** In `.env.local`
- **GitHub repo:** https://github.com/samuelbarksdale97/dob-abatement-saas
- **Vercel:** Connected to GitHub repo (auto-deploys)

---

## 10. How to Run Locally

```bash
# 1. Clone and install
git clone https://github.com/samuelbarksdale97/dob-abatement-saas.git
cd dob-abatement-saas
npm install

# 2. Environment
cp .env.local.example .env.local
# Fill in Supabase and Gemini credentials

# 3. Run the app
npm run dev              # Next.js on http://localhost:3000

# 4. Run Inngest (separate terminal)
npm run dev:inngest      # Inngest dev server on http://localhost:8288
```

**Required for parse to work locally:** Both the Next.js dev server AND Inngest dev server must be running. Inngest dev server polls `http://localhost:3000/api/inngest` for function registrations.

---

## 11. Key Design Decisions & Lessons Learned

1. **Gemini 2.5 Flash over GPT-4o** — Chosen for native PDF understanding (no OCR needed), structured JSON output, and significantly lower cost (~$0.003 per parse).

2. **Two-pass AI extraction** — First pass extracts structured data (notice ID, items, fines). Second pass analyzes pages for evidence photos. Separating these improved reliability vs. a single combined prompt.

3. **Polling fallback** — Supabase Realtime requires both table enablement AND working RLS policies. A 3-second polling interval ensures the UI always updates even if Realtime has issues.

4. **RLS via JWT claims** — `custom_access_token_hook` injects org_id/role into every JWT at token refresh time. This is the most performant approach (no extra DB queries per request) but requires the hook to be enabled in Supabase Dashboard.

5. **ParseLogger with merge-flush** — Each Inngest step runs in a fresh execution context. The logger reads existing `parse_metadata` from DB, merges new steps/logs, and writes back. This ensures no data loss across step boundaries.

6. **react-pdf for evidence photos** — Renders individual PDF pages client-side rather than extracting/converting images. Simpler pipeline, but requires the PDF to be accessible via signed URL.

7. **Status workflow as state machine** — Explicit valid transitions prevent invalid state changes. The UI and API both validate transitions before applying.

---

## 12. Session Changelog (2026-02-17 → 2026-03-11)

### Session 1: Core Build
- Full Next.js app scaffolding with App Router
- Supabase schema (10 tables, RLS, triggers, functions)
- Gemini AI integration (two-pass parse pipeline)
- Inngest background job pipeline (5 steps)
- Dashboard with stats, filters, sorting
- Login flow with session persistence

### Session 2: UI Polish & Bug Fixes
- **Fixed:** Parse progress not updating (root cause: missing app_metadata in JWT → RLS blocking client reads)
- **Fixed:** Parse results never appearing (same RLS root cause)
- **Added:** Polling fallback for real-time updates
- **Added:** AI cost tracking (per-parse on progress page, per-violation on dashboard)
- **Added:** Evidence photo lightbox with click-to-zoom
- **Fixed:** "Confirm & Create Violation" error (invalid status transition PARSED→NEW)
- **Added:** Photos rendered on violation detail page (Items tab shows linked photos, Photos tab renders actual pages)
- **Fixed:** Photo card sizing (constrained to photo width, caption wraps)
- **Fixed:** Lightbox horizontal scrolling (measures container width via callback ref)
- **Fixed:** Photo loading flash (hide PDF during intermediate render states)

### Session 3: GitHub & Deployment
- Created GitHub repo `samuelbarksdale97/dob-abatement-saas`
- Pushed full codebase
- Purged leaked credentials from git history
- Connected Vercel to GitHub repo
- Created this handoff document

### Session 4: v2 Product Pipeline & Sprint 1 (2026-03-11)
- **Ran Autonomous Product Pipeline** (Phases 0-11) — produced comprehensive v2 Technical Specification at `docs/pm_docs/v2-productionization/Technical_Specification.md`
- **Regression test suite** — 152 tests across 12 files (status machine, work orders, address normalization, API routes, components, mock data) establishing green baseline
- **Units table migration** (`006_units_table.sql`) — units table with RLS, indexes, `get_portfolio_stats()` and `get_property_detail()` RPCs
- **Property/Unit CRUD APIs** — 6 new API routes (properties list/create/get/update, units list/create/update) + portfolio stats endpoint
- **Address normalization** (`address-normalization.ts`) — BR-004 compliant address matching with abbreviation expansion, unit extraction, fuzzy matching
- **Auto-link parse step** — New step in parse pipeline auto-creates/matches properties and units from NOI infraction addresses
- **Portfolio Home** — Replaced flat violations dashboard with property cards grid showing per-property violation rollups
- **Property/Unit Detail pages** — 3-level navigation hierarchy (Portfolio → Property → Unit → Violation)
- **Sidebar navigation** — Added Portfolio Home + All Violations nav items
- **Branch:** `feat/v2-productionization`

### Session 5: v2 Sprint 2 + Sprint 3 (2026-03-11)
- **Sprint 2: Notifications + Submission Loop**
  - Migration `007_notifications_and_submissions.sql` — priority on notifications, settings JSONB on profiles, generated_pdf_path on submissions
  - NotificationBell component with Realtime subscription, priority-based colors, relative timestamps, mark-read
  - Inngest `deadline-check` daily cron (8AM ET) — checks overdue/3-day/10-day deadlines, creates notifications, sends email alerts via Resend
  - Inngest `send-notification-email` — event-driven submission confirmation emails
  - Email service (`lib/email.ts`) with Resend integration and HTML templates (deadline alerts, submission confirmations)
  - Submission tracking APIs (GET/POST/PATCH) with auto-status advancement
  - SubmissionTab component on violation detail page — record submissions + DOB responses
  - Auto-progression: all AFTER photos approved → READY_FOR_SUBMISSION
  - Supabase Realtime subscriptions on violation detail page
- **Sprint 3: Contacts + Users**
  - Migration `008_contacts.sql` — contacts, contact_interactions, contact_entity_links tables with RLS, enums, triggers, contractor data migration
  - Migration `009_invitations.sql` — team invitations with 7-day expiry
  - 8 new contact API routes (CRUD, interactions, entity links, typeahead search)
  - 3 new team API routes (list members, invite, change role)
  - Contacts list page with category tabs, search, avatar initials
  - Contact detail page with Timeline tab, Linked Entities tab, interaction logging
  - Settings page restructured with Tabs: Gmail, Team (invite + role management), Notifications (preference toggles)
  - Sidebar updated with Contacts nav item

### Session 6: v2 Sprint 4 — Polish + Hardening (2026-03-11)
- **Enhanced Filter Sidebar** — property dropdown (fetches from API), date range pickers, "Needs Attention" quick-filter toggle
- **Extended Violations API** — 6 new query params: `property_id`, `unit_id`, `date_from`, `date_to`, `needs_attention`, `statuses` (multi-select)
- **Violations page** updated to wire all enhanced filter props
- **Duplicate NOI Detection** — new `check-duplicate` step in parse pipeline stores `duplicate_detected`/`duplicate_violation_id` in parse_metadata
- **Duplicate Merge UI** — ParsedResults shows orange warning banner with "Merge Into Existing" / "Keep Separate" buttons
- **Merge API** (`POST /api/violations/[id]/merge`) — merges items (deduped by code), moves photos, creates audit log, deletes source
- **Analytics page** (`/analytics`) with Recharts — 4 KPI cards + 4 charts (violations over time, status donut, fines by property, contractor performance)
- **Analytics API** (`GET /api/analytics`) + migration `010_analytics.sql` with `get_analytics()` RPC
- **Sidebar** — added Analytics nav item with BarChart3 icon
- **Mobile Contractor Portal** — responsive grid (1-col < sm), 44px min touch targets, camera capture already in place
- **React Error Boundaries** — `error.tsx` at root, `(authenticated)/error.tsx`, and `contractor/[token]/error.tsx` with "Try Again" buttons
- **Test suite** — expanded to 166 tests across 15 files (added analytics API, violations filters, merge API tests)
