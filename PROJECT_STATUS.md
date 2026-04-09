# DOB Abatement SaaS — Complete Project Documentation

**Last updated:** 2026-03-24
**Author:** Samuel Barksdale + Claude Code (Opus 4.6)
**Repo:** https://github.com/samuelbarksdale97/dob-abatement-saas
**Production:** https://yoke.nexark.ai (custom domain) / https://dob-abatement-saas.vercel.app
**Vercel:** Connected to repo (auto-deploys on push to `main`)

---

## Table of Contents

1. [What This Is](#1-what-this-is)
2. [Tech Stack](#2-tech-stack)
3. [Architecture Overview](#3-architecture-overview)
4. [Database Schema](#4-database-schema)
5. [Pages & Routes](#5-pages--routes)
6. [API Endpoints](#6-api-endpoints)
7. [Inngest Pipeline](#7-inngest-pipeline)
8. [Core Libraries](#8-core-libraries)
9. [Components](#9-components)
10. [AI Integration](#10-ai-integration)
11. [Email System](#11-email-system)
12. [Auth Flow](#12-auth-flow)
13. [Status State Machine](#13-status-state-machine)
14. [Deployment & Infrastructure](#14-deployment--infrastructure)
15. [Test Coverage](#15-test-coverage)
16. [Known Issues & Limitations](#16-known-issues--limitations)
17. [Development Workflow](#17-development-workflow)
18. [Supporting Documents](#18-supporting-documents)
19. [Credentials & Access](#19-credentials--access)
20. [Session Changelog](#20-session-changelog)

---

## 1. What This Is

A SaaS platform that automates **DC Department of Buildings (DOB) Notice of Infraction (NOI)** processing for property managers. Upload an NOI PDF → AI extracts all violation data, evidence photos, and remediation tasks → dashboard tracks violations through the full abatement lifecycle → assign contractors → collect repair photos → generate submission PDFs.

**Brand:** Yoke Management Partners
**Target user:** Yoke Management Partners (DC property management) and similar companies that receive NOIs and need to track abatement deadlines, assign contractors, and submit evidence of compliance.

**Client accounts:**
- `cgrant@yokepartners.com` — Owner (Christopher Grant)
- `ngray@yokepartners.com` — Project Manager (Nikita Gray)

**Test account:**
- `sam@yokemgmt.com` / `TestPass123!` — Owner (development)

---

## 2. Tech Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| **Framework** | Next.js | 16.1.6 | App Router, React 19, Turbopack dev server |
| **Language** | TypeScript | 5 | Strict mode |
| **Styling** | Tailwind CSS 4 + shadcn/ui | — | 15+ UI components, slate color palette |
| **Auth** | Supabase Auth (SSR) | — | Email/password, JWT with custom claims hook |
| **Database** | Supabase PostgreSQL | — | RLS-secured, multi-tenant by org_id |
| **Storage** | Supabase Storage | — | `noi-pdfs` + `contractor-photos` buckets |
| **AI** | Google Gemini 2.5 Flash | — | Two-pass: structured extraction + page analysis |
| **Background Jobs** | Inngest | 3.52.0 | Parse pipeline, deadline cron, email notifications |
| **PDF Rendering** | react-pdf | 10.3 | Client-side rendering of PDF pages as evidence photos |
| **PDF Generation** | jsPDF + jspdf-autotable | 4.2.0 | Server-side evidence submission documents |
| **Email** | Resend | 6.9.2 | Transactional emails from `noreply@nexark.ai` |
| **Charts** | Recharts | 3.8.0 | Analytics dashboards |
| **Testing** | Vitest | 4.0.18 | + React Testing Library, 191 tests |
| **Deployment** | Vercel | — | Auto-deploy on push to `main` |

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
                     └───────┬───────┘
                             │
                     ┌───────▼───────┐
                     │   Resend      │
                     │  (Email)      │
                     └───────────────┘
```

### Data Flow

1. **Upload:** User uploads NOI PDF → stored in Supabase Storage → violation record created in DB
2. **Parse:** Inngest event triggers 7-step pipeline → Gemini extracts data → records inserted → property auto-linked
3. **Manage:** Dashboard shows violations with stats → user assigns contractor → magic link generated
4. **Repair:** Contractor uploads before/after photos via portal → AI verifies photo angles
5. **Submit:** User generates evidence PDF → marks as submitted → records DOB response
6. **Monitor:** Daily cron checks deadlines → sends email alerts → creates in-app notifications

---

## 4. Database Schema

**Supabase project:** `njewqntaitsdwuzvgftq`
**Migrations:** `supabase/migrations/001_initial_schema.sql` through `013_fix_analytics_ghost_filter.sql`

### Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `organizations` | Multi-tenant workspaces | `name`, `slug` (unique), `plan`, `settings` (JSONB) |
| `profiles` | User accounts (extends auth.users) | `org_id`, `full_name`, `email`, `role` (enum) |
| `properties` | Managed buildings | `org_id`, `address`, `city`, `state`, `zip`, `notes` |
| `units` | Individual units within properties | `property_id`, `unit_number`, `is_vacant`, `occupant_name`, `occupant_phone` |
| `violations` | NOI records (core entity) | `notice_id`, `respondent`, `infraction_address`, `date_of_service`, `total_fines`, `status`, `priority`, `abatement_deadline`, `pdf_storage_path`, `parse_status`, `parse_metadata` (JSONB), `raw_ai_output` (JSONB) |
| `violation_items` | Individual violation line items | `violation_id`, `item_number`, `violation_code`, `priority`, `fine`, `violation_description`, `task_description`, `specific_location`, `floor_number`, `date_of_infraction`, `time_of_infraction` |
| `photos` | Evidence photos | `violation_id`, `violation_item_id`, `photo_type` (INSPECTOR/BEFORE/AFTER), `storage_path`, `page_number`, `matched_violation_code`, `status`, `mime_type` |
| `work_orders` | Contractor repair assignments | `violation_id`, `contractor_name`, `contractor_email`, `contractor_phone`, `status`, `due_date` |
| `contractor_tokens` | Magic link tokens for contractor portal | `work_order_id`, `token`, `expires_at` (30 days), `revoked_at` |
| `contractors` | Contractor registry (for dropdown/recency) | `name`, `email`, `phone`, `total_assignments`, `last_assigned_at` |
| `submissions` | DOB compliance submissions | `violation_id`, `submitted_by`, `confirmation_number`, `document_storage_path`, `generated_pdf_path`, `response_status` |
| `audit_log` | Auto-logged status changes | `table_name`, `record_id`, `action`, `old_values`, `new_values` |
| `notifications` | In-app alerts | `user_id`, `title`, `message`, `type`, `link`, `read` |
| `contacts` | CRM contact management | `name`, `email`, `phone`, `category` (6 types), `notes` |
| `contact_interactions` | Interaction log | `contact_id`, `interaction_type`, `date_time`, `notes` |
| `team_invitations` | Pending team member signups | `email`, `role`, `token`, `expires_at` (7 days) |
| `email_connections` | Gmail OAuth state | `connected_email`, `status`, `auto_poll_enabled` |

### Enums

- **`user_role`:** OWNER, PROJECT_MANAGER, CONTRACTOR, ADMIN
- **`violation_status`:** NEW, PARSING, PARSED, ASSIGNED, IN_PROGRESS, AWAITING_PHOTOS, PHOTOS_UPLOADED, READY_FOR_SUBMISSION, SUBMITTED, APPROVED, REJECTED, ADDITIONAL_INFO_REQUESTED, CLOSED
- **`work_order_status`:** ASSIGNED, IN_PROGRESS, COMPLETED, CANCELLED
- **`photo_type`:** BEFORE, AFTER, INSPECTOR, REFERENCE
- **`photo_status`:** PENDING_REVIEW, APPROVED, REJECTED

### Database Functions (RPC)

| Function | Purpose |
|----------|---------|
| `auth_org_id()` | Returns current user's org_id from JWT for RLS |
| `auth_role()` | Returns current user's role from JWT for RLS |
| `custom_access_token_hook()` | Injects org_id/role from profiles into every JWT (**must be enabled in Supabase Dashboard → Auth → Hooks**) |
| `get_violation_stats()` | Dashboard stats — excludes ghost/duplicate violations |
| `get_portfolio_stats()` | Per-property violation rollups for Portfolio Home |
| `get_property_detail(p_property_id)` | Per-unit violation rollups within a property |
| `get_analytics(p_date_from, p_date_to, p_property_id)` | Aggregated analytics — resolution time, approval rate, fines, status distribution, contractor performance |

### Row Level Security (RLS)

Every table has RLS enabled. All policies use `auth_org_id()` to scope data to the current user's organization. Write access is restricted to `OWNER`, `PROJECT_MANAGER`, and `ADMIN` roles. Contractors can only see their assigned work orders and insert photos.

### Supabase Realtime

Enabled on: `violations`, `violation_items`, `photos`, `work_orders`, `notifications`, `contacts`, `contact_interactions`

---

## 5. Pages & Routes

### Public Pages

| Route | File | Purpose |
|-------|------|---------|
| `/login` | `src/app/login/page.tsx` | Email/password login with "Forgot password?" link |
| `/signup` | `src/app/signup/page.tsx` | Team member signup via invitation token (wrapped in Suspense) |
| `/forgot-password` | `src/app/forgot-password/page.tsx` | Request password reset email |
| `/reset-password` | `src/app/reset-password/page.tsx` | Set new password from reset link |
| `/contractor/[token]` | `src/app/contractor/[token]/page.tsx` | Contractor portal — work order details, violation items, photo upload, status updates |

### Authenticated Pages (`src/app/(authenticated)/`)

| Route | File | Purpose |
|-------|------|---------|
| `/dashboard` | `dashboard/page.tsx` | **Portfolio Home** — stats panel, property cards grid with violation counts/fines, Upload NOI button |
| `/dashboard/[id]` | `dashboard/[id]/page.tsx` | **Violation Detail** — overview, key metrics, tabs (Items, Photos, Submissions, Activity), assign contractor, generate PDF, delete |
| `/violations` | `violations/page.tsx` | **All Infractions** — filterable table with search, status/priority/property filters, sorting, pagination, delete. Excludes ghost violations |
| `/parse` | `parse/page.tsx` | **Upload NOI** — three-state workflow: upload → processing (with duplicate detection prompt) → results |
| `/properties/[id]` | `properties/[id]/page.tsx` | **Property Detail** — address, stats, units list, delete |
| `/properties/[id]/units/[unitId]` | `properties/[id]/units/[unitId]/page.tsx` | **Unit Detail** — occupant info, tabbed violation view (Needs Action, In Progress, Submitted, Resolved), edit details, delete |
| `/contacts` | `contacts/page.tsx` | **Contacts** — search, category filter, add contact dialog |
| `/contacts/[id]` | `contacts/[id]/page.tsx` | **Contact Detail** — info, interactions log, add interaction |
| `/analytics` | `analytics/page.tsx` | **Analytics** — KPI cards, Recharts charts (violations over time, status donut, fines by property, contractor performance) |
| `/settings` | `settings/page.tsx` | **Settings** — Gmail (Coming Soon), Team (invite/role management with resend), Testing (skip photo verification toggle) |

### Hidden/Removed Pages
- `/import` — CSV import (hidden from sidebar, kept in codebase)
- Notification bell — removed from nav bar (feature not fully fleshed out)
- Notification preferences — removed from settings

---

## 6. API Endpoints

### Parse Pipeline

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/parse` | Upload PDF, create violation record, trigger Inngest parse event |
| POST | `/api/parse/duplicate` | Resolve duplicate detection — `{ violationId, action: 'overwrite' | 'cancel' }` |

### Violations

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/violations` | List violations with filters (status, priority, search, property_id, unit_id, date range, needs_attention, statuses). Pagination + sorting. Excludes ghosts |
| PATCH | `/api/violations` | Update violation status and fields |
| DELETE | `/api/violations/[id]` | Delete violation + cascading data (items, photos, work orders, tokens, audit log) |
| POST | `/api/violations/[id]/merge` | Merge duplicate violations (items + photos) |

### Stats & Analytics

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/stats` | Dashboard stats via `get_violation_stats()` RPC |
| GET | `/api/portfolio` | Portfolio home stats via `get_portfolio_stats()` RPC |
| GET | `/api/analytics` | Analytics data via `get_analytics()` RPC with date range + property filters |

### Properties & Units

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/properties` | List all properties with units |
| POST | `/api/properties` | Create new property |
| GET | `/api/properties/[id]` | Property detail with violations and units |
| DELETE | `/api/properties/[id]` | Delete property + cascade (units, violations) |
| GET/POST | `/api/properties/[id]/units` | List/create units |
| PATCH | `/api/properties/[id]/units/[unitId]` | Update unit metadata |

### Contractor Portal (public — no auth required)

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/contractor/[token]` | Validate magic link, return work order + violation + items + photos + PDF URL |
| PATCH | `/api/contractor/[token]/status` | Update work order status (ASSIGNED → IN_PROGRESS → COMPLETED) |
| POST | `/api/contractor/[token]/photos` | Upload BEFORE/AFTER photos (JPEG/PNG/HEIC/WebP, max 10MB) |
| POST | `/api/contractor/[token]/photos/verify` | AI photo angle verification (can be skipped via settings) |

### Work Orders

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/work-orders` | Create work order + magic link token (30-day expiry) + send email notification |

### Team & Auth

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/team` | List team members and pending invitations |
| POST | `/api/team/invite` | Send invitation email (7-day expiry) |
| POST | `/api/team/invite/resend` | Resend pending invitation |
| PATCH | `/api/team/[userId]/role` | Change user role |
| POST | `/api/signup` | Complete team invitation signup |

### Contacts

| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/contacts` | List (search/filter) or create contacts |
| GET/PATCH/DELETE | `/api/contacts/[id]` | Contact CRUD |
| GET/POST | `/api/contacts/[id]/interactions` | Interaction history |
| POST | `/api/contacts/[id]/link` | Link contact to entity |
| GET | `/api/contacts/search` | Typeahead search |

### Submissions

| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/submissions` | List or create submissions with PDF generation |
| PATCH | `/api/submissions/[id]` | Update submission status (DOB response) |

### Notifications

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/notifications` | List notifications |
| GET | `/api/notifications/count` | Unread count |
| PATCH | `/api/notifications/[id]` | Mark as read |
| POST | `/api/notifications/mark-all-read` | Mark all as read |

### Settings

| Method | Route | Purpose |
|--------|-------|---------|
| GET/PATCH | `/api/settings` | Org settings (skip_photo_verification toggle) |

### Inngest

| Method | Route | Purpose |
|--------|-------|---------|
| POST/GET | `/api/inngest` | Inngest function event receiver |

---

## 7. Inngest Pipeline

### `parse-noi` — Main Parse Pipeline

**Trigger:** `noi/parse.requested` event
**Retries:** 2
**File:** `src/inngest/functions/parse-noi.ts`

7 deterministic steps with real-time progress logging via `ParseLogger`:

| Step | Name | What It Does |
|------|------|-------------|
| 0 | **init** | Mark violation as `PARSING`, set up metadata |
| 1 | **ai-parse** | Download PDF from Supabase Storage, send to Gemini for structured extraction. Extracts: notice_id, respondent, address, date, fines, violation items (code, description, priority, deadline, fine, location, floor, date/time, task) |
| 1.5 | **check-duplicate** | Query for existing completed violation with same notice_id. If found → set `parse_status: 'duplicate_pending'`, wait up to 5 min for user decision via `waitForEvent('noi/duplicate.resolved')`. Overwrite = delete old + continue. Cancel/timeout = halt |
| 2 | **insert-records** | Write violation data + items to DB (idempotent — deletes existing before insert) |
| 3 | **auto-link-property** | Normalize address (strip abbreviations, unit, city/state/zip), match/create property and unit |
| 4 | **analyze-pages** | Second Gemini call: identify which pages are evidence photos, match each to violation code |
| 5 | **match-photos** | Link evidence pages to violation items by code, insert INSPECTOR photo records (idempotent) |
| 6 | **complete** | Mark `parse_status: 'completed'`, final validation |

Each step updates `violations.parse_metadata` (JSONB) enabling real-time UI polling at 3-second intervals.

### `deadline-check` — Daily Deadline Cron

**Schedule:** Daily at 8:00 AM ET (13:00 UTC)
**File:** `src/inngest/functions/deadline-check.ts`

Checks for violations with deadlines approaching (within 10 days) or overdue. Creates in-app notifications and sends email alerts to OWNER/PM/ADMIN team members via Resend.

### `send-notification-email` — Transactional Emails

**Trigger:** Event-driven
**File:** `src/inngest/functions/send-notification-email.ts`

Sends transactional emails (deadline alerts, submission confirmations) via Resend.

### `email-sync` — Gmail Integration

**File:** `src/inngest/functions/email-sync.ts`

Gmail OAuth integration for auto-syncing NOI attachments. Currently marked as "Coming Soon" in the UI.

---

## 8. Core Libraries

### `src/lib/ai/`

| File | Purpose |
|------|---------|
| `gemini.ts` | Gemini 2.5 Flash API wrapper — `parseNOIPdf()` for structured extraction, `analyzePdfPages()` for page-level analysis, `verifyPhotoAngle()` for before/after comparison. Includes token usage tracking and cost calculation |
| `schemas.ts` | Zod schemas for AI responses (`NOIParseResultSchema`, `GeminiPageAnalysisSchema`). TypeScript types: `ParseMetadata`, `ParseStepStatus`, `ParseStepName`, `ParseCosts`, `GeminiUsage` |

### `src/lib/supabase/`

| File | Purpose |
|------|---------|
| `client.ts` | Browser-side Supabase client using `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `server.ts` | `createClient()` — server-side with user session via cookies. `createAdminClient()` — service role key for Inngest/webhooks (bypasses RLS) |
| `middleware.ts` | Session refresh on every request. Redirects unauthenticated users to `/login` (excludes API routes, `/signup`, `/contractor`) |

### `src/lib/`

| File | Purpose |
|------|---------|
| `types.ts` | All TypeScript interfaces: Organization, Profile, Property, Unit, Violation, ViolationItem, Photo, WorkOrder, ContractorToken, Contractor, Submission, Contact, AuditLogEntry. Type aliases for enums |
| `status-transitions.ts` | Valid state transitions (enforced), status labels/colors, priority colors/labels, urgency calculation (days remaining, color coding). Functions: `canTransition()`, `getNextStatuses()`, `getDaysRemaining()` |
| `address-normalization.ts` | Normalize NOI addresses: lowercase, expand abbreviations (st→street, nw→northwest), extract unit numbers, strip city/state/zip. Functions: `normalizeAddress()`, `addressesMatch()` |
| `email.ts` | Resend integration. FROM_EMAIL: `Yoke Management Partners <noreply@nexark.ai>`. Templates: `invitationEmail()`, `deadlineAlertEmail()`, `submissionConfirmationEmail()`. Branded HTML wrapper with Yoke Management styling |
| `parse-logger.ts` | Structured logging for parse pipeline. Flushes step progress to `violations.parse_metadata` JSONB after each step transition. Tracks timing, errors, validation |
| `utils.ts` | `cn()` utility for className merging |

### `src/lib/pdf/`

| File | Purpose |
|------|---------|
| `generate-submission.ts` | Generate evidence submission PDF via jsPDF. Includes violation details, items table, reference photos, contractor photos. Sender name: Christopher Grant |
| `render-page-server.ts` | Server-side PDF page rendering using `pdf-to-img` with `getPage()` for direct page access (not used in current pipeline — kept for future use) |

---

## 9. Components

### Layout
- **`layout/sidebar.tsx`** — Left sidebar with Yoke Management Partners branding (red/black text). Menu: Dashboard, Infractions, Parse, Contacts, Analytics, Settings
- **`layout/nav.tsx`** — Top navigation bar with page title

### Parser
- **`parser/upload-zone.tsx`** — Drag-and-drop PDF upload, calls `/api/parse`
- **`parser/parse-progress.tsx`** — Real-time step timeline with progress bar, elapsed timer, cost cards. Handles `duplicate_pending` state with overwrite/cancel prompt
- **`parser/parsed-results.tsx`** — Post-parse results with evidence photos
- **`parser/evidence-photo.tsx`** — PDF page renderer using react-pdf with lightbox zoom

### Dashboard
- **`dashboard/stats-panel.tsx`** — Violation stats overview cards
- **`dashboard/property-card.tsx`** — Property summary card with fines, violation counts, overdue indicator
- **`dashboard/violation-table.tsx`** — Sortable violations table with pagination and delete
- **`dashboard/filter-sidebar.tsx`** — Advanced filters (search, status, priority, property, date range, needs attention)
- **`dashboard/submission-tab.tsx`** — Submission history for violation detail

### Contractor
- **`contractor/photo-upload-slot.tsx`** — Photo upload widget with camera roll access. Labels: "Upload Repair Photo". Supports JPEG/PNG/HEIC/WebP up to 10MB
- **`contractor/assign-work-order-dialog.tsx`** — Modal to assign contractor. Defaults to "Add New" tab. Search existing contractors dropdown

### Contacts
- **`contacts/add-contact-dialog.tsx`** — Add/edit contact form with category selector
- **`contacts/add-interaction-dialog.tsx`** — Log contact interaction

### UI Components (shadcn/ui)
Button, Input, Label, Card, Badge, Tabs, Dialog, Separator, Dropdown Menu, Select, Textarea, Table, Progress, Switch, Command, Avatar, Checkbox, Sheet, Sonner (toast)

---

## 10. AI Integration

**Model:** Google Gemini 2.5 Flash (`@google/genai` SDK)
**File:** `src/lib/ai/gemini.ts`

### Functions

| Function | Input | Output | Cost |
|----------|-------|--------|------|
| `parseNOIPdf()` | PDF buffer (base64) | Notice-level data + violation items array | ~$0.002-0.004 |
| `analyzePdfPages()` | PDF buffer (base64) | Per-page: violation_code, description, is_evidence_photo | ~$0.002-0.004 |
| `verifyPhotoAngle()` | Two base64 images | Match confidence, reasoning, spatial analysis | — |

### Pricing (per million tokens)
- Input: $0.15
- Output: $0.60
- Thoughts: $0.60

### Extraction Schema (Zod)

```typescript
NOIParseResultSchema = {
  notice_level_data: { notice_id, respondent, infraction_address, date_of_service, total_fines },
  work_orders: [{
    item_number, violation_code, priority, abatement_deadline, fine,
    violation_description, specific_location, floor_number,
    date_of_infraction, time_of_infraction, task_description
  }]
}
```

### Known Issue: Fine Parsing
Gemini occasionally returns fines with comma-as-decimal (e.g., `$2,358,00` instead of `$2,358.00`). The `parseFine` function strips commas, which turns `$2,358,00` into `235800`. This needs a smarter fine parser that detects and handles this pattern.

---

## 11. Email System

**Provider:** Resend
**Sender:** `Yoke Management Partners <noreply@nexark.ai>`
**Domain:** `nexark.ai` (DNS verified in Resend)
**File:** `src/lib/email.ts`

### Templates

| Template | When Sent | Content |
|----------|-----------|---------|
| `invitationEmail()` | Team member invited | Signup link with 7-day expiry |
| `deadlineAlertEmail()` | Daily deadline check | Overdue/approaching deadline with urgency colors |
| `submissionConfirmationEmail()` | After submission | Confirmation with submission details |
| Contractor assignment | Work order created | Magic link to contractor portal |

All templates use branded HTML wrapper with "Yoke Management" header and footer.

**Supabase Auth Emails:** Custom SMTP configured via Resend SMTP bridge for password reset, email verification, etc.

---

## 12. Auth Flow

### Login
1. User enters email/password at `/login`
2. Supabase Auth validates credentials, returns JWT
3. JWT contains `org_id` and `role` via `custom_access_token_hook()`
4. Middleware refreshes session on every request

### Signup (Invitation-Based)
1. Admin sends invite via Settings → Team → Invite
2. Email sent with signup link: `https://yoke.nexark.ai/signup?token=xxx`
3. User creates account, profile auto-created with org_id from invitation

### Password Reset
1. User clicks "Forgot password?" on login page
2. Email sent via Supabase Auth (custom SMTP through Resend)
3. User clicks link → `/reset-password` page → sets new password

### Contractor Portal (No Auth)
1. Work order created → magic link token generated (30-day expiry)
2. Contractor clicks link → `/contractor/[token]`
3. Token validated against `contractor_tokens` table (checks expiry, revocation)
4. All operations use admin Supabase client scoped to the work order

### Middleware (`src/lib/supabase/middleware.ts`)
- Refreshes session on every request
- Redirects unauthenticated users to `/login`
- Excludes: API routes, `/signup`, `/contractor/*`, `/forgot-password`, `/reset-password`

---

## 13. Status State Machine

### Violation Status Lifecycle

```
NEW → PARSING → PARSED → ASSIGNED → IN_PROGRESS → AWAITING_PHOTOS
→ PHOTOS_UPLOADED → READY_FOR_SUBMISSION → SUBMITTED → APPROVED → CLOSED
                                                      → REJECTED → IN_PROGRESS
```

### Valid Transitions (enforced in `src/lib/status-transitions.ts`)

| From | Valid Targets |
|------|-------------|
| NEW | PARSING, ASSIGNED, CLOSED |
| PARSING | PARSED, NEW |
| PARSED | ASSIGNED, CLOSED |
| ASSIGNED | IN_PROGRESS, CLOSED |
| IN_PROGRESS | AWAITING_PHOTOS, CLOSED |
| AWAITING_PHOTOS | PHOTOS_UPLOADED, IN_PROGRESS |
| PHOTOS_UPLOADED | READY_FOR_SUBMISSION, AWAITING_PHOTOS |
| READY_FOR_SUBMISSION | SUBMITTED, AWAITING_PHOTOS |
| SUBMITTED | APPROVED, REJECTED, CLOSED |
| APPROVED | CLOSED |
| REJECTED | IN_PROGRESS |
| CLOSED | (terminal) |

### Parse Status Values
- `pending` — uploaded, not yet parsed
- `processing` — Inngest pipeline running
- `duplicate_pending` — waiting for user overwrite/cancel decision
- `completed` — successfully parsed
- `failed` — parse error
- `duplicate` — user cancelled duplicate upload

### UI Tab Grouping (Unit Detail Page)

| Tab | Statuses |
|-----|----------|
| Needs Action | NEW, PARSING, PARSED |
| In Progress | ASSIGNED, IN_PROGRESS, AWAITING_PHOTOS, PHOTOS_UPLOADED, READY_FOR_SUBMISSION |
| Submitted | SUBMITTED |
| Resolved | APPROVED, REJECTED, CLOSED |

---

## 14. Deployment & Infrastructure

### Vercel
- **Project:** `dob-abatement-saas`
- **Production URL:** `https://yoke.nexark.ai` (custom domain via Dynadot CNAME → `cname.vercel-dns.com`)
- **Fallback URL:** `https://dob-abatement-saas.vercel.app`
- **Auto-deploy:** On push to `main` branch
- **Build:** Next.js 16.1.6 with Turbopack

### Environment Variables (Vercel)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin key (bypasses RLS) |
| `GEMINI_API_KEY` | Google Gemini API key |
| `RESEND_API_KEY` | Resend email API key |
| `INNGEST_EVENT_KEY` | Inngest event key (set by Vercel integration) |
| `INNGEST_SIGNING_KEY` | Inngest signing key (set by Vercel integration) |
| `NEXT_PUBLIC_APP_URL` | `https://yoke.nexark.ai` |

### Supabase
- **Project:** `njewqntaitsdwuzvgftq`
- **URL:** `https://njewqntaitsdwuzvgftq.supabase.co`
- **Storage buckets:** `noi-pdfs` (PDFs), `contractor-photos` (repair photos)
- **Auth hook:** `custom_access_token_hook` must be enabled in Dashboard → Auth → Hooks

### Inngest
- **Connected via:** Vercel Marketplace integration (auto-manages keys)
- **Dashboard:** [app.inngest.com](https://app.inngest.com)
- **Functions registered:** parse-noi, deadline-check, send-notification-email, email-sync

### DNS (Dynadot)
- **Domain:** `nexark.ai`
- **Record:** CNAME `yoke` → `cname.vercel-dns.com`
- **Email:** MX/TXT records for Resend verification

---

## 15. Test Coverage

**Framework:** Vitest 4.0.18 + React Testing Library
**Total:** 191 tests across 18 files — all passing

### Test Files

| File | Tests | What It Covers |
|------|-------|----------------|
| `src/lib/__tests__/status-transitions.test.ts` | 55 | State machine transitions, priority/urgency colors, labels, days remaining |
| `src/lib/__tests__/address-normalization.test.ts` | 14 | Address parsing, abbreviation expansion, unit extraction, matching |
| `src/lib/__tests__/work-order-transitions.test.ts` | 5 | Work order status workflows |
| `src/inngest/__tests__/auto-link-property.test.ts` | 10 | Property auto-linking, address matching scenarios |
| `src/inngest/__tests__/duplicate-detection.test.ts` | 10 | Duplicate detection logic, cascade delete order, state machine, metadata |
| `src/app/api/parse/duplicate/__tests__/route.test.ts` | 8 | Duplicate resolution API: auth, validation, Inngest events |
| `src/app/api/analytics/__tests__/route.test.ts` | 5 | Analytics API: auth, RPC params, filters |
| `src/app/api/violations/__tests__/route.test.ts` | 6 | Violations API: auth, filters, sorting |
| `src/app/api/violations/[id]/merge/__tests__/route.test.ts` | 3 | Merge API: auth, validation |
| `src/app/api/work-orders/__tests__/route.test.ts` | 15 | Work order creation, contractor registry, email |
| `src/app/api/contractor/[token]/photos/__tests__/route.test.ts` | 14 | Photo upload: validation, storage, duplicates |
| `src/app/api/contractor/[token]/status/__tests__/route.test.ts` | 4 | Status transitions: valid/invalid |
| `src/components/parser/__tests__/parse-progress-duplicate.test.tsx` | 7 | Duplicate prompt UI: rendering, button actions, error handling |
| `src/components/contractor/__tests__/photo-upload-slot.test.tsx` | 14 | Photo upload widget: file validation, preview |
| `src/components/contractor/__tests__/assign-work-order-dialog.test.tsx` | 5 | Work order dialog: form, submission |
| `src/test/__tests__/mock-data.test.ts` | 16 | Mock data factory validation |

### Running Tests

```bash
npm test              # Run all tests
npm run test:ui       # Interactive UI mode
npm run test:coverage # Generate coverage reports
```

---

## 16. Known Issues & Limitations

### Active Issues

1. **Fine parsing** — Gemini sometimes returns fines with comma-as-decimal (`$2,358,00`). The parser strips all commas, producing `235800` instead of `2358.00`. Needs a smarter parser.

2. **PDF re-download** — Parse pipeline downloads the PDF twice (once for structured extraction, once for page analysis). Could cache the buffer.

3. **`canvas` on Vercel** — `@napi-rs/canvas` is included for server-side PDF rendering but the render step was removed from the pipeline. The dependency can be cleaned up.

4. **Package name** — `package.json` says `"name": "app"` — should be `"dob-abatement-saas"`.

### Features Not Yet Fully Implemented

5. **Gmail inbox auto-sync** — OAuth integration exists but UI shows "Coming Soon"
6. **Notification preferences** — Backend exists but UI tab was removed pending UX design
7. **Notification bell** — Component exists but removed from nav bar pending UX design
8. **CSV import** — Basic page exists but hidden from sidebar

### Resolved Issues (for context)

- **DOMMatrix error on Vercel** — Resolved by adding `@napi-rs/canvas` for Linux compatibility, then removing the render step entirely
- **Duplicate properties** — Addresses with city/state/zip suffix created duplicates. Fixed with improved address normalization stripping
- **Analytics ghost violations** — Migration 013 added ghost/duplicate filters to `get_analytics()`
- **Signup build error** — `useSearchParams()` needed Suspense boundary for Next.js prerendering
- **Failed parses blocking re-uploads** — Duplicate detection now only matches `parse_status='completed'` violations

---

## 17. Development Workflow

### Branch Strategy
- **Never commit directly to `main`**
- Create feature/fix branches: `feat/...`, `fix/...`, `ui/...`, `docs/...`
- Push to remote, create PR via `gh pr create`
- Merge after review

### Testing Requirements
- **Every change must be tested before committing**
- Run `npx tsc --noEmit` for type checking
- Run `npm test` for test suite (191 tests must pass)
- For API changes: test with actual requests
- For UI changes: verify in browser

### Local Development

```bash
# Terminal 1: Next.js dev server
cd dob-abatement-saas
PORT=3006 npm run dev    # port 3000 often occupied

# Terminal 2: Inngest dev server (must match Next.js port)
npx inngest-cli@latest dev -u http://localhost:3006/api/inngest
```

### Deploy to Production

```bash
# Option A: Push to main (auto-deploys)
git push origin main

# Option B: Manual deploy
npx vercel --prod
```

---

## 18. Supporting Documents

All reference material is in `docs/`:

| File | What It Is |
|------|-----------|
| `docs/pm_docs/v2-productionization/Technical_Specification.md` | Full v2 tech spec — requirements, data models, acceptance criteria |
| `docs/meeting-transcript-2026-01-12-kickoff.md` | Kickoff meeting — Chris Grant, Nikita Gray, Andy Parker, Sam Barksdale |
| `docs/meeting-transcript-2026-01-15-process-walkthrough.md` | Process walkthrough with Nikita — manual submission template, DOB portal |
| `docs/DOB_Abatement_Flowchart.html` | Visual flowchart of abatement lifecycle |
| `docs/pm_docs/QA_Testing_Plan.md` | QA testing plan |
| `docs/sample-nois/` | Two real NOI PDFs for testing (25NOIE-INS-05478, 25NOIR-INS-07709) |

---

## 19. Credentials & Access

### Supabase
- **Project ref:** `njewqntaitsdwuzvgftq`
- **URL:** `https://njewqntaitsdwuzvgftq.supabase.co`
- **Dashboard:** https://supabase.com/dashboard/project/njewqntaitsdwuzvgftq
- **Keys:** In `.env.local`

### Accounts

| Email | Role | Purpose |
|-------|------|---------|
| `sam@yokemgmt.com` | OWNER | Development/testing |
| `cgrant@yokepartners.com` | OWNER | Client (Christopher Grant) |
| `ngray@yokepartners.com` | PROJECT_MANAGER | Client (Nikita Gray) |

### External Services
- **Gemini API:** Key in `.env.local`
- **Resend:** Key in `.env.local`, domain `nexark.ai`
- **Inngest:** Connected via Vercel Marketplace integration
- **GitHub:** https://github.com/samuelbarksdale97/dob-abatement-saas
- **Vercel:** Auto-deploys from GitHub
- **Domain:** `nexark.ai` on Dynadot, `yoke` CNAME → Vercel

---

## 20. Session Changelog

### PRs #1-6: Core Build & Bug Fixes (2026-02-16 → 2026-03-11)
- Full Next.js app scaffolding, Supabase schema, Gemini AI integration
- 7-step Inngest parse pipeline with real-time progress
- Dashboard, violation detail, contractor portal
- v2 sprints 1-4: portfolio home, units, notifications, contacts, analytics
- 166 tests across 15 files

### PRs #7-8: UI Tabbed Views & Cleanup (2026-03-23)
- Unit violations page: tabbed card grid (Needs Action, In Progress, Submitted, Resolved)
- Edit unit details, delete properties/units/violations
- Removed AI cost column from All Infractions, renamed Violations → Infractions

### PR #9: Contractor Fixes & Tab Grouping (2026-03-23)
- Fixed contractor modal: defaults to "Add New", overflow fix, email sender
- Fixed tab status grouping (intake → Needs Action, photos → In Progress)

### PR #10: Delete from All Infractions (2026-03-23)
- Trash icon on each row with confirmation modal

### PR #11: Contractor Photo Upload Fix (2026-03-23)
- Removed `capture="environment"` so mobile users can choose camera OR photo library
- Renamed "After Photo" → "Repair Photo"

### PR #12: PDF Wrapping, Time Spacing, Submitted Tab (2026-03-23)
- Fixed text wrapping in submission PDF
- Fixed time of infraction overlapping
- Added "Submitted" as fourth tab category

### PR #13: Client Onboarding & Cleanup (2026-03-23)
- Provisioned client accounts (cgrant, ngray)
- Password reset flow (forgot-password, reset-password pages)
- Hidden CSV import, Gmail "Coming Soon", removed notifications UI

### PRs #14-15: Logo & Branding (2026-03-23)
- Replaced logo with styled text: "Yoke" (red) "Management" (black) "Partners" (red)

### PRs #16-17: Photo Rendering & Analytics Fix (2026-03-23)
- Removed render-evidence-images step (was causing serverless timeouts)
- Contractor portal uses same EvidencePhoto component as main app
- Fixed duplicate properties via address normalization (strips city/state/zip)
- Migration 013: fixed analytics ghost/duplicate filter

### PR #18: Duplicate Detection Fix (2026-03-24)
- Duplicate check only matches `parse_status='completed'` (failed parses no longer block re-uploads)

### PR #19: Duplicate Overwrite Prompt + Tests (2026-03-24)
- Pipeline pauses on duplicate detection, shows UI prompt (Overwrite/Cancel)
- Uses Inngest `waitForEvent` for clean pause/resume (5-min timeout)
- 25 new tests for duplicate flow (API, UI, pipeline logic)
- Fixed pre-existing status-transitions test failures (gray→slate, yellow→amber, green→emerald)
- Total: 191 tests, 18 files, zero failures
