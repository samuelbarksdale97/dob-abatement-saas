# DOB Abatement SaaS — Project Status & Handoff Document

**Last updated:** 2026-02-23
**Author:** Samuel Barksdale + Claude Code (Opus 4.6)
**Repo:** https://github.com/samuelbarksdale97/dob-abatement-saas
**Vercel:** Connected to repo (auto-deploys on push to `main`)

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
| **Background Jobs** | Inngest | 5-step parse pipeline with retries |
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

The core value of the product — 5 deterministic steps:

1. **Init** — Mark violation as `PARSING`
2. **AI Parse** — Download PDF from Supabase Storage, send to Gemini for structured data extraction (notice ID, respondent, address, fines, violation items with codes/descriptions/deadlines)
3. **Insert Records** — Write parsed violation data and items to Supabase
4. **Analyze Pages** — Second Gemini call: identify which PDF pages are evidence photos vs. text, match each to a violation code
5. **Match Photos** — Link evidence photo pages to their violation items by code, insert into `photos` table

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
| `properties` | Managed properties | address, city, state, is_vacant |
| `violations` | NOI records (core entity) | notice_id, respondent, status, priority, parse_metadata, raw_ai_output |
| `violation_items` | Individual violation line items | violation_code, fine, violation_description, task_description |
| `photos` | Evidence photos (from PDF pages) | storage_path, page_number, matched_violation_code, violation_item_id |
| `work_orders` | Repair assignments | assigned_to, status, due_date |
| `submissions` | DOB compliance submissions | confirmation_number, response_status |
| `audit_log` | Auto-logged status changes | old_values, new_values |
| `notifications` | In-app notifications | title, message, type, read |

### Key Database Functions & Triggers

- **`auth_org_id()`** — Reads `org_id` from JWT `app_metadata` for RLS
- **`auth_role()`** — Reads `role` from JWT `app_metadata` for RLS
- **`custom_access_token_hook()`** — Injects org_id and role from `profiles` table into every JWT. **Registered as a Supabase Auth Hook** (must be enabled in Supabase Dashboard → Authentication → Hooks → "Customize Access Token")
- **`sync_profile_to_app_metadata()`** — Trigger on `profiles` table that syncs org_id/role to `auth.users.raw_app_meta_data` (fallback for when JWT hook isn't refreshed yet)
- **`handle_new_user()`** — Auto-creates profile row on user signup if `org_id` is in user metadata
- **`log_violation_status_change()`** — Auto-logs to `audit_log` when violation status changes
- **`get_violation_stats()`** — RPC function for dashboard stats

### Row Level Security (RLS)

Every table has RLS enabled. All policies use `auth_org_id()` to scope data to the current user's organization. Write access is restricted to `OWNER`, `PROJECT_MANAGER`, and `ADMIN` roles. Contractors can only see their assigned work orders and insert photos.

### Supabase Realtime

Granted to: `violations`, `violation_items`, `photos`, `work_orders`, `notifications`

---

## 5. File Structure & Key Files

```
src/
├── app/
│   ├── (authenticated)/          # Auth-protected routes
│   │   ├── layout.tsx            # Auth check + sidebar layout
│   │   ├── dashboard/
│   │   │   ├── page.tsx          # Main dashboard: stats, filters, violation table
│   │   │   └── [id]/page.tsx     # Violation detail: Items tab, Photos tab, Activity tab
│   │   ├── parse/page.tsx        # Upload → Progress → Results state machine
│   │   └── import/page.tsx       # CSV import page (basic)
│   ├── api/
│   │   ├── parse/route.ts        # POST: upload PDF, create violation, send Inngest event
│   │   ├── violations/route.ts   # GET (list+filter) and PATCH (update status/fields)
│   │   ├── stats/route.ts        # GET: calls get_violation_stats() RPC
│   │   ├── import/route.ts       # POST: CSV import
│   │   └── inngest/route.ts      # Inngest webhook handler
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
│   ├── layout/
│   │   ├── nav.tsx               # Top navigation bar
│   │   └── sidebar.tsx           # Left sidebar navigation
│   └── ui/                       # shadcn/ui primitives (15+ components)
├── inngest/
│   ├── client.ts                 # Inngest client config
│   └── functions/parse-noi.ts    # 5-step parse pipeline
├── lib/
│   ├── ai/
│   │   ├── gemini.ts             # Gemini API wrapper (parse + analyze)
│   │   └── schemas.ts            # Zod schemas, TypeScript types for parse data
│   ├── supabase/
│   │   ├── client.ts             # Browser Supabase client
│   │   ├── server.ts             # Server client + admin client (service_role)
│   │   └── middleware.ts         # Session refresh middleware
│   ├── types.ts                  # All TypeScript interfaces
│   ├── status-transitions.ts     # Valid status transitions + display helpers
│   ├── parse-logger.ts           # Structured logging for parse pipeline
│   └── utils.ts                  # cn() utility
└── middleware.ts                 # Next.js middleware (Supabase session refresh)
```

---

## 6. What's Working (Tested & Verified)

- [x] **PDF Upload** — Drag-and-drop on `/parse`, uploads to Supabase Storage `noi-pdfs` bucket
- [x] **AI Parse Pipeline** — Full 5-step Inngest function extracts notice data, violation items, and evidence photos from NOI PDFs
- [x] **Real-time Parse Progress** — Step timeline with status indicators, elapsed timer, token/cost tracking. Uses 3-second polling fallback alongside Supabase Realtime
- [x] **Parsed Results View** — Shows extracted violation data, items list, evidence photos with captions after parse completes
- [x] **Evidence Photo Viewer** — Renders individual PDF pages as photos using react-pdf. Click to open lightbox with full-size view. Cards sized to photo width
- [x] **Dashboard** — Violations list with sorting (priority, deadline, fines), status badges, AI cost column
- [x] **Violation Detail Page** — Tabbed view: Items (with linked evidence photos), Photos (rendered PDF pages grouped by violation item), Activity (audit log)
- [x] **Auth Flow** — Login with email/password, session persistence via middleware, JWT includes org_id + role
- [x] **RLS Working** — All data scoped to organization, verified end-to-end
- [x] **Cost Tracking** — Per-parse token usage and USD cost displayed on progress page and dashboard table

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
7. **No test suite** — Zero tests. Priority additions: parse pipeline unit tests, RLS policy tests, API route tests.
8. **No error boundary** — React error boundaries would improve UX for failed component renders.
9. **Package name** — `package.json` still says `"name": "app"` — should be `"dob-abatement-saas"`.

---

## 8. Projected Next Steps (Feature Roadmap)

### Phase 1: Production Readiness
- [ ] Set up Inngest on Vercel (Marketplace integration)
- [ ] Enable the custom_access_token_hook in Supabase Auth settings
- [ ] Rotate Supabase service role key
- [ ] Set all environment variables on Vercel
- [ ] Verify end-to-end flow in production (upload → parse → dashboard)
- [ ] Add proper error handling/boundaries

### Phase 2: Contractor Workflow
- [ ] **Work order creation** — Assign violation items to contractors from the detail page
- [ ] **Contractor portal** — Contractors log in, see their assigned items, upload before/after photos
- [ ] **Photo upload** — Before/after evidence photo upload with EXIF metadata capture
- [ ] **Photo approval** — PM reviews contractor photos (approve/reject with reason)
- [ ] **Status auto-progression** — When all photos are approved → auto-advance to READY_FOR_SUBMISSION

### Phase 3: Submission & Compliance
- [ ] **Evidence document generation** — Auto-generate compliance submission PDF with before/after photos
- [ ] **DOB submission tracking** — Log confirmation numbers, track response status
- [ ] **Deadline alerts** — Email/SMS notifications for approaching abatement deadlines
- [ ] **Re-inspection tracking** — Handle REJECTED/ADDITIONAL_INFO responses

### Phase 4: Scale & Polish
- [ ] **Multi-property support** — Link violations to properties, property-level dashboard
- [ ] **Bulk import** — CSV import for historical violations (UI exists, needs refinement)
- [ ] **User management** — Invite team members, role assignment
- [ ] **Billing/plans** — Stripe integration, usage-based pricing (per parse)
- [ ] **Audit trail UI** — Full activity timeline with who/what/when
- [ ] **Mobile-responsive** — Contractor-focused mobile experience for on-site photo capture
- [ ] **Analytics** — Violation trends, cost tracking, contractor performance

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

## 12. Session Changelog (2026-02-17 → 2026-02-23)

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
