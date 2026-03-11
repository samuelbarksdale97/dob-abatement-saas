# DOB Abatement SaaS v2 — Technical Specification

**Version:** 2.0
**Date:** 2026-03-11
**Author:** Samuel Barksdale (NexArc) + Claude (Product Pipeline)
**Status:** Draft
**Repo:** https://github.com/samuelbarksdale97/dob-abatement-saas

---

## Table of Contents

1. [Context & Background](#1-context--background)
2. [Feature Areas with User Stories & Acceptance Criteria](#2-feature-areas)
3. [Business Rules & Logic](#3-business-rules--logic)
4. [Data Model](#4-data-model)
5. [API Contracts](#5-api-contracts)
6. [UI Specification](#6-ui-specification)
7. [Edge Cases & Error Handling](#7-edge-cases--error-handling)
8. [Implementation Sequencing & Dependencies](#8-implementation-sequencing--dependencies)
9. [Definition of Done & Developer Handoff](#9-definition-of-done--developer-handoff)

---

## 1. Context & Background

### 1.1 Product Vision

The DOB Abatement SaaS automates the full lifecycle of DC Department of Buildings (DOB) Notice of Infraction (NOI) processing for property managers. Upload an NOI PDF, AI extracts all violation data and evidence photos, a dashboard tracks violations through abatement, contractors are assigned and upload repair photos, evidence documents are generated, and submissions to DOB are tracked through closure.

**Target market:** DC property management companies (starting with Yoke Management) that receive NOIs and need to track abatement deadlines, assign contractors, document repairs, and submit compliance evidence.

**Product scope:** Yoke-first, SaaS-ready. Multi-tenant architecture is already built (RLS by org_id). Self-serve onboarding and billing are deferred to v3.

### 1.2 What Exists Today (v1)

The following is fully built and functional:

| Capability | Status |
|-----------|--------|
| PDF Upload + AI Parse Pipeline (Gemini 2.5 Flash, 5-step Inngest) | Done |
| Dashboard with violations table, sorting, stats panel | Done |
| Violation Detail page (Items, Photos, Activity tabs) | Done |
| Auth (Supabase, email/password, JWT with org_id/role claims) | Done |
| Multi-tenant RLS on all tables | Done |
| Contractor Portal (magic links, photo upload, status updates) | Done |
| AI Photo Angle Verification (Gemini Vision) | Done |
| Evidence PDF Document Generation | Done |
| Gmail Email Monitoring (OAuth, auto-sync, Inngest cron) | Done |
| CSV Import | Done |
| Cost Tracking (per-parse token usage and USD) | Done |
| 13-state violation lifecycle with enforced transitions | Done |

**Database:** 12 tables (organizations, profiles, properties, violations, violation_items, photos, work_orders, contractor_tokens, contractors, submissions, audit_log, notifications) + email_connections, email_sync_log

**Tech stack:** Next.js 16 (App Router), Supabase (Auth/DB/Storage), Inngest (background jobs), Gemini 2.5 Flash (AI), Tailwind CSS + shadcn/ui, Vercel deployment

### 1.3 What v2 Adds

v2 transforms the product from a functional prototype into a production-ready tool optimized for the Project Manager's daily workflow:

1. **Portfolio-first navigation** — Org → Properties → Units → Violations (replacing flat table)
2. **Universal Contacts/Rolodex** — Track every person in the abatement process with auto-logged interactions
3. **Deadline alerts & notifications** — Email + in-app alerts so nothing slips
4. **Closed submission loop** — Generate evidence PDF → track submission → handle DOB response → close
5. **User management** — Invite team, assign roles
6. **Enhanced filters, duplicate detection, analytics** — Production polish
7. **Mobile-responsive contractor portal** — On-site photo capture

### 1.4 Key Stakeholders

| Person | Role | Primary Need |
|--------|------|-------------|
| Nikita Gray | Project Manager (Primary User) | Operational efficiency — triage violations daily, assign contractors, review photos, submit to DOB |
| Chris Grant | Property Owner/CEO | Visibility — portfolio-level status, financial impact, team performance |
| Alex | Contractor | Simplicity — see assignment, upload photos, leave. Mobile-first. |
| Sam Barksdale | Developer/Architect | Clean spec to hand off to dev team |

### 1.5 Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Average time to submission | 45 days | 14 days |
| First-time approval rate | 72% | 90% |
| Missed deadlines per quarter | Unknown | 0 |
| Manual hours per violation | ~3 hours | <30 minutes |
| Open violations tracked | Excel spreadsheet | Real-time dashboard |

---

## 2. Feature Areas

Features are organized into 7 areas, prioritized using MoSCoW, and sized by relative complexity.

### Feature Area A: Navigation Hierarchy & Portfolio Home

**Priority:** MUST | **Complexity:** XL | **Sprint:** 1

#### User Stories

**US-A.1:** As Nikita (PM), I want to see a portfolio overview when I log in so I can immediately identify which properties need attention.

**Acceptance Criteria:**
- AC-A.1.1: Given an authenticated PM, when they navigate to `/dashboard`, then the page displays an org-wide stats bar showing: Total Open Violations, Overdue Count, Due Within 10 Days, P1 Count, Total Fines, Pending Photos.
- AC-A.1.2: Given properties exist for the org, when the portfolio home loads, then property cards are displayed in a responsive grid (3 columns desktop, 1 column mobile), each showing: address, violation count with status color dots, total fines, next deadline, urgency badge.
- AC-A.1.3: Given properties with overdue or P1 violations, when the portfolio home loads, then those properties sort to the top of the grid.
- AC-A.1.4: Given no properties exist for the org, when the portfolio home loads, then an empty state is shown with "Add Your First Property" CTA.

**US-A.2:** As Nikita, I want to click a property and see its units with violation counts so I can drill into problem areas.

**Acceptance Criteria:**
- AC-A.2.1: Given a property card is clicked, when the property detail page loads at `/properties/[id]`, then a header shows the property address, total violations, and total fines.
- AC-A.2.2: Given units exist for the property, when the property detail page loads, then unit cards are displayed showing: unit number, vacant/occupied badge, violation count by status (color-coded), worst status indicator, occupant name (if occupied).
- AC-A.2.3: Given a unit card is clicked, when the unit detail page loads at `/properties/[id]/units/[unitId]`, then a violations table is shown (reusing the existing `violation-table.tsx` component with unit filter pre-applied).
- AC-A.2.4: Given the unit detail page, when the user views the header, then breadcrumb navigation shows: Portfolio Home > [Property Address] > Unit [Number].

**US-A.3:** As Nikita, I want to add and edit properties and units so the system reflects our actual portfolio.

**Acceptance Criteria:**
- AC-A.3.1: Given the portfolio home page, when the user clicks "Add Property", then a modal opens with fields: address, city (default: Washington), state (default: DC), zip code.
- AC-A.3.2: Given a property detail page, when the user clicks "Add Unit", then a modal opens with fields: unit number, is_vacant toggle, occupant name, occupant phone, notes.
- AC-A.3.3: Given an existing property or unit, when the user clicks "Edit", then the same modal opens pre-populated with current data.
- AC-A.3.4: Given a unit is marked as vacant, when displayed anywhere in the app, then it shows a distinct gray "Vacant" badge.

**US-A.4:** As the system, when a NOI is parsed, I want to auto-match the infraction address to an existing property/unit so violations are automatically organized.

**Acceptance Criteria:**
- AC-A.4.1: Given a NOI parse completes with an infraction address, when the normalized address exactly matches an existing property's normalized address (see BR-004 for normalization rules), then the violation is automatically linked to that property.
- AC-A.4.2: Given a parsed address includes a unit number (e.g., "Unit:103"), when a matching unit exists, then the violation is linked to that unit.
- AC-A.4.3: Given no property match is found, when the parse results page loads, then the user is prompted to select an existing property or create a new one.

**US-A.5:** As Chris (Owner), I want org-wide stats at a glance so I know where we stand overall.

**Acceptance Criteria:**
- AC-A.5.1: Given the portfolio home, when stats load, then they reflect real-time data across all properties in the org.
- AC-A.5.2: Given stats are displayed, when a stat card is clicked (e.g., "Overdue"), then the user is navigated to the All Violations page with that filter pre-applied.

---

### Feature Area B: Universal Contacts / Rolodex

**Priority:** MUST | **Complexity:** L | **Sprint:** 3

#### User Stories

**US-B.1:** As Nikita, I want a contacts directory so I can quickly find inspector phone numbers, contractor emails, and tenant info without digging through emails.

**Acceptance Criteria:**
- AC-B.1.1: Given the contacts page at `/contacts`, when it loads, then all contacts for the org are displayed in a searchable, filterable table.
- AC-B.1.2: Given contacts exist, when displayed in the table, then each row shows: name + company, category badge (color-coded: Government=blue, Contractor=orange, Tenant=green, Internal=purple), email, phone, tags as pills, last touchpoint (relative time), linked entity count.
- AC-B.1.3: Given the contacts page, when the user selects a category tab (All, Government, Contractor, Tenant, Internal), then the table filters to that category.
- AC-B.1.4: Given the search bar, when the user types a query, then results filter by name, email, or company (debounced 300ms).

**US-B.2:** As Nikita, I want to see auto-logged interactions so I have context before reaching out to a contact.

**Acceptance Criteria:**
- AC-B.2.1: Given a contact detail page at `/contacts/[id]`, when the Timeline tab loads, then all interactions are displayed in reverse chronological order with: icon (by type), subject, body (truncated, expandable), linked entity chips, timestamp, who logged it.
- AC-B.2.2: Given a contractor is assigned to a work order, when the assignment is saved, then a SYSTEM_EVENT interaction is auto-created on that contractor's contact with subject "Assigned to work order for [address]" and links to the violation and work order.
- AC-B.2.3: Given a contractor uploads photos via the portal, when the upload completes, then a SYSTEM_EVENT interaction is auto-created with subject "Uploaded [count] [type] photos for [NOI#]".
- AC-B.2.4: Given a work order status changes, when the status update is saved, then a SYSTEM_EVENT interaction is auto-created with subject "Work order status: [old] → [new]".
- AC-B.2.5: Given a violation status changes for a violation linked to a contact, when the status update is saved, then a SYSTEM_EVENT interaction is auto-created with subject "Violation [NOI#] status: [old] → [new]".

**US-B.3:** As Nikita, I want to add manual notes to a contact so I remember important details across interactions.

**Acceptance Criteria:**
- AC-B.3.1: Given a contact detail page, when the user clicks "Log Interaction", then a modal opens with fields: Type (Phone Call, Email, Meeting, Note), Subject (required), Details (optional textarea), Direction (Inbound/Outbound, hidden for Note type), When (datetime, defaults to now), Link to (optional: violation picker, property picker, work order picker).
- AC-B.3.2: Given a manual interaction is saved, when the contact timeline reloads, then the new interaction appears at the correct chronological position.
- AC-B.3.3: Given a contact has interactions, when the contact card appears in any list view, then "Last touchpoint" shows the most recent interaction's relative time.

**US-B.4:** As Nikita, I want to select contacts from a picker when assigning work orders so I don't have to re-enter contractor details.

**Acceptance Criteria:**
- AC-B.4.1: Given the Assign Work Order dialog, when the contractor field is focused, then a typeahead combobox searches contacts with `category = CONTRACTOR`.
- AC-B.4.2: Given the combobox results, when a contact is selected, then name, email, and phone auto-populate from the contact record.
- AC-B.4.3: Given no matching contact exists, when the user types a new name, then a "Create New Contact" option appears at the bottom of the dropdown.

---

### Feature Area C: Deadline Alerts & Notification System

**Priority:** MUST | **Complexity:** L | **Sprint:** 2

#### User Stories

**US-C.1:** As Nikita, I want to be alerted when a violation deadline is approaching so nothing slips.

**Acceptance Criteria:**
- AC-C.1.1: Given violations with `abatement_deadline` in 10 days AND status not in (APPROVED, CLOSED), when the daily deadline-check cron runs (8:00 AM Eastern), then a notification is created with type "deadline_warning" and priority "normal".
- AC-C.1.2: Given violations with `abatement_deadline` in 3 days AND status not in (APPROVED, CLOSED), when the cron runs, then a notification is created with type "deadline_urgent" and priority "urgent".
- AC-C.1.3: Given violations with `abatement_deadline` past due AND status not in (APPROVED, CLOSED), when the cron runs, then a notification is created with type "deadline_overdue" and priority "urgent".
- AC-C.1.4: Given a P1 violation is created (priority = 1), when the parse completes, then an immediate urgent notification is created with type "p1_alert".
- AC-C.1.5: Given a notification with email delivery flag, when the notification is created, then a transactional email is sent via Resend to the user's email address within 2 minutes.

**US-C.2:** As Nikita, I want a notification bell in the nav bar so I can check alerts without leaving my current page.

**Acceptance Criteria:**
- AC-C.2.1: Given the top navigation bar, when it renders, then a bell icon is displayed with an unread count badge (red circle with number).
- AC-C.2.2: Given the bell icon is clicked, when the dropdown opens, then up to 20 recent notifications are displayed in reverse chronological order with: icon (by type), title, time (relative), unread indicator (bold text / dot).
- AC-C.2.3: Given a notification is clicked in the dropdown, when the user navigates to the linked entity, then the notification is marked as read.
- AC-C.2.4: Given the dropdown footer, when "Mark All Read" is clicked, then all unread notifications for the user are marked as read and the badge count resets to 0.
- AC-C.2.5: Given a new notification is created in the database, when Supabase Realtime delivers the event, then the badge count increments in real-time without page refresh.
- AC-C.2.6: Given the Portfolio Home page is open, when a violation's status changes in the database, then the property card's violation counts and status dots update within 5 seconds via Supabase Realtime subscription on the `violations` table.
- AC-C.2.7: Given the All Violations table is open, when a new violation is created or a status changes, then the table row updates in real-time via Supabase Realtime.

**US-C.3:** As Chris, I want daily email digests so I stay informed without logging in every day.

**Acceptance Criteria:**
- AC-C.3.1: Given user notification preferences in `profiles.settings`, when set to "daily_digest", then a single email is sent at 8:00 AM containing all notifications from the previous 24 hours.
- AC-C.3.2: Given user notification preferences, when set to "instant", then each notification triggers an individual email.
- AC-C.3.3: Given user notification preferences, when set to "off", then no emails are sent (in-app only).

---

### Feature Area D: Workflow Completion (Submission Loop)

**Priority:** MUST | **Complexity:** L | **Sprint:** 2

#### User Stories

**US-D.1:** As the system, I want to auto-advance violations to READY_FOR_SUBMISSION when all photos are approved.

**Acceptance Criteria:**
- AC-D.1.1: Given a violation in PHOTOS_UPLOADED status, when every photo linked to the violation has `status = 'APPROVED'`, then the violation status automatically transitions to READY_FOR_SUBMISSION.
- AC-D.1.2: Given a PM approves the last pending photo for a violation, when the approval is saved, then the auto-progression fires within the same request.
- AC-D.1.3: Given a violation has no photos at all, when the status is manually set to PHOTOS_UPLOADED, then auto-progression does NOT fire (requires at least 1 approved photo per violation item).

**US-D.2:** As Nikita, I want to generate an evidence PDF with before/after photos and submit it to DOB, then track the response.

**Acceptance Criteria:**
- AC-D.2.1: Given a violation in READY_FOR_SUBMISSION status, when the user clicks "Generate Evidence PDF" on the violation detail page, then a PDF is generated within 10 seconds containing: cover page (NOI number, property address, date), per-item sections with before/after photo pairs, remediation description, contractor info, date of repair.
- AC-D.2.2: Given the PDF is generated, when the user clicks "Download", then the PDF downloads to the user's device.
- AC-D.2.3: Given the PDF is generated, when the user clicks "Record Submission", then a modal opens with fields: Confirmation Number (text), Submitted Date (date, defaults to today), Notes (optional).
- AC-D.2.4: Given a submission is recorded, when saved, then: a `submissions` record is created, the violation status advances to SUBMITTED, and a notification is created for the org owner.
- AC-D.2.5: Given a violation in SUBMITTED status, when the PM receives a DOB response, then they can update the submission with: Response Status (APPROVED, REJECTED, ADDITIONAL_INFO_REQUESTED), Response Notes, Responded Date.
- AC-D.2.6: Given a submission response of APPROVED, when saved, then the violation status advances to APPROVED and a "Celebration" notification is sent to the team.
- AC-D.2.7: Given a submission response of REJECTED, when saved, then the violation status moves to REJECTED → IN_PROGRESS and a notification is sent with the rejection reason.

**US-D.3:** As Nikita, I want submission documents archived to Google Drive so I can find them later.

**Acceptance Criteria:**
- AC-D.3.1: Given a submission is recorded, when an Inngest function is triggered, then the generated PDF is uploaded to a Google Drive folder with naming: `[NOI_NUMBER]_[ADDRESS]_[DATE].pdf`.
- AC-D.3.2: Given the Google Drive upload succeeds, when the function completes, then the `submissions.document_storage_path` is updated with the Drive file URL.
- AC-D.3.3: Given the Google Drive API is unavailable, when the upload fails after 3 retries, then the submission record is flagged and a notification is sent to retry manually.

---

### Feature Area E: User Management & Roles

**Priority:** SHOULD | **Complexity:** M | **Sprint:** 3

#### User Stories

**US-E.1:** As Chris (Owner), I want to invite team members with specific roles so they can access the system with appropriate permissions.

**Acceptance Criteria:**
- AC-E.1.1: Given the Settings > Team page, when the user clicks "Invite Member", then a modal opens with fields: Email (required), Role (dropdown: Project Manager, Contractor, Admin).
- AC-E.1.2: Given an invitation is sent, when the invitee clicks the email link, then they are directed to a signup page that auto-associates them with the org and assigns the specified role.
- AC-E.1.3: Given an invitation is pending, when displayed on the Team page, then it shows as "Pending" with the invited email and a "Resend" / "Revoke" option.
- AC-E.1.4: Given invitations, when the invitation expires after 7 days, then it is marked as expired and cannot be used.

**US-E.2:** As Chris, I want to see my team and manage their roles.

**Acceptance Criteria:**
- AC-E.2.1: Given the Team page, when it loads, then all org members are listed with: name, email, role badge, last active date.
- AC-E.2.2: Given an org member, when the Owner changes their role via dropdown, then the role updates immediately and the user's next JWT refresh includes the new role.
- AC-E.2.3: Given the last Owner in the org, when someone attempts to change their role, then the action is blocked with the message "At least one Owner is required."
- AC-E.2.4: Given an org member, when the Owner clicks "Remove", then the member is removed from the org (profile.org_id set to null) and they can no longer access org data.

---

### Feature Area F: Enhanced Filters, Duplicates, Email & Photo Validation

**Priority:** SHOULD | **Complexity:** M | **Sprint:** 4

#### User Stories

**US-F.1:** As Nikita, I want richer filters so I can quickly find the violations I need to work on.

**Acceptance Criteria:**
- AC-F.1.1: Given the All Violations page (and unit detail violations table), when the filter sidebar is displayed, then it includes: multi-select status checkboxes, priority radio buttons, property dropdown (populated from properties table), date range picker (for abatement_deadline), vacant/occupied toggle.
- AC-F.1.2: Given the filter sidebar, when the user selects filters, then results update within 1 second without page reload.
- AC-F.1.3: Given any active filters, when the user clicks "Clear Filters", then all filters reset and the full list is shown.
- AC-F.1.4: Given the filter sidebar, when a "Needs Attention" quick filter button is clicked, then it applies: status in (NEW, PARSED, AWAITING_PHOTOS) OR overdue OR priority = P1.

**US-F.2:** As the system, I want to detect duplicate NOIs and merge them rather than creating duplicates.

**Acceptance Criteria:**
- AC-F.2.1: Given a NOI is parsed, when the `notice_id` already exists in the database for the same org, then the parse results page shows a "Duplicate Detected" warning banner.
- AC-F.2.2: Given a duplicate is detected, when the user reviews the banner, then they can choose: "Merge" (add new items to existing violation, append new photos) or "Create Anyway" (force create as separate record).
- AC-F.2.3: Given merge is selected, when the merge executes, then: new violation_items are inserted (not duplicated if same code), new photos are appended, existing items are NOT overwritten, and an audit_log entry records the merge.

**US-F.3:** As the system, I want email monitoring to automatically detect and import NOI emails.

**Acceptance Criteria:**
- AC-F.3.1: Given a Gmail account is connected (via Settings > Gmail), when auto-sync is enabled, then the Inngest cron polls the inbox every 5 minutes.
- AC-F.3.2: Given a new email from `@dc.gov` with subject matching NOI patterns (contains "NOI", "Notice of Infraction", or "housing violation") and a PDF attachment, when the sync runs, then: the PDF is extracted, uploaded to `noi-pdfs` bucket, a violation is created with `source: 'email'`, and the parse pipeline is triggered.
- AC-F.3.3: Given an email has already been processed, when the sync runs again, then it is skipped (tracked by `email_sync_log.gmail_message_id` uniqueness).
- AC-F.3.4: Given the Gmail refresh token expires, when the sync fails, then the `email_connections.status` is set to 'expired' and a "Reconnect Gmail" banner is shown in Settings.

**US-F.4:** As Nikita, I want AI to verify contractor photos match the required angle before I review them.

**Acceptance Criteria:**
- AC-F.4.1: Given a contractor uploads an AFTER photo paired with an INSPECTOR photo, when the upload completes, then Gemini Vision is called to compare the two images.
- AC-F.4.2: Given Gemini returns a confidence score >= 80%, when the verification completes, then the photo status is set to APPROVED and a green badge with the score is displayed.
- AC-F.4.3: Given Gemini returns a confidence score < 80%, when the verification completes, then the photo status stays PENDING_REVIEW with the rejection reasoning displayed, and the PM is notified to review.
- AC-F.4.4: Given Gemini is unavailable, when the verification fails, then the photo stays PENDING_REVIEW and a toast says "Photo uploaded. Verification unavailable." The PM can manually approve.
- AC-F.4.5: Given a photo in PENDING_REVIEW, when the PM clicks "Approve Override" on the violation detail page, then the photo status changes to APPROVED regardless of AI score.

---

### Feature Area G: Analytics, Mobile & Production Hardening

**Priority:** SHOULD (Analytics, Mobile) / MUST (Production) | **Complexity:** L | **Sprint:** 4

#### User Stories

**US-G.1:** As Chris, I want to see violation trends, resolution times, and contractor performance so I can make data-driven decisions.

**Acceptance Criteria:**
- AC-G.1.1: Given the Analytics page at `/analytics`, when it loads, then it displays a date range picker and property filter dropdown at the top.
- AC-G.1.2: Given analytics data, when the page renders, then KPI cards show: Average Days to Resolution, First-Time Approval Rate (%), Total Fines This Period, Violations Opened vs Closed.
- AC-G.1.3: Given analytics data, when charts render, then the page shows: Line chart (violations opened/closed over time), Donut chart (status distribution), Bar chart (fines by property), Bar chart (contractor on-time completion %).
- AC-G.1.4: Given the property filter is changed, when the selection updates, then all KPIs and charts refresh to reflect the selected property only.

**US-G.2:** As Alex (Contractor), I want a mobile-friendly interface for uploading photos on-site.

**Acceptance Criteria:**
- AC-G.2.1: Given the contractor portal at `/contractor/[token]`, when viewed on a mobile device (< 768px), then the layout is fully responsive: single column, large touch targets (min 44x44px), no horizontal scroll.
- AC-G.2.2: Given the photo upload area on mobile, when the user taps "Take Photo", then the device camera opens directly (using `capture="environment"` on the file input).
- AC-G.2.3: Given a photo is being uploaded, when progress is visible, then a progress bar or spinner is displayed with percentage.

**US-G.3:** As a developer, I want the system production-hardened with error boundaries, tests, and reliable background jobs.

**Acceptance Criteria:**
- AC-G.3.1: Given any page in the app, when a React component throws an error, then an error boundary catches it and displays "Something went wrong" with a "Try Again" button (not a white screen).
- AC-G.3.2: Given the test suite, when `npm run test` is executed, then tests pass for: parse pipeline (mock Gemini, test data extraction), RLS policies (test org isolation), critical API routes (test auth, validation, response shapes).
- AC-G.3.3: Given Vercel deployment, when Inngest is installed from the Vercel Marketplace, then all background jobs (parse pipeline, deadline check, email sync) run reliably in production with `retries: 2`.

---

## 3. Business Rules & Logic

### BR-001: Violation Status Lifecycle

**Category:** Workflow
**Description:** Violations follow a 13-state lifecycle with enforced transitions.

```
Valid transitions:
  NEW → [PARSING, ASSIGNED, CLOSED]
  PARSING → [PARSED, NEW]
  PARSED → [ASSIGNED, CLOSED]
  ASSIGNED → [IN_PROGRESS, CLOSED]
  IN_PROGRESS → [AWAITING_PHOTOS, CLOSED]
  AWAITING_PHOTOS → [PHOTOS_UPLOADED, IN_PROGRESS]
  PHOTOS_UPLOADED → [READY_FOR_SUBMISSION, AWAITING_PHOTOS]
  READY_FOR_SUBMISSION → [SUBMITTED, AWAITING_PHOTOS]
  SUBMITTED → [APPROVED, REJECTED, ADDITIONAL_INFO_REQUESTED]
  APPROVED → [CLOSED]
  REJECTED → [IN_PROGRESS]
  ADDITIONAL_INFO_REQUESTED → [AWAITING_PHOTOS, IN_PROGRESS]
  CLOSED → [] (terminal)
```

**Source:** `src/lib/status-transitions.ts` (existing)
**Edge case:** Any attempt to transition to an invalid state must return a 400 error with the message "Invalid status transition from [current] to [target]."

### BR-002: Status Auto-Progression

**Category:** Workflow
**Description:** When all photos for a violation are approved, the violation auto-advances.

```
Logic:
  ON photo.status change to APPROVED:
    count_pending = SELECT COUNT(*) FROM photos
      WHERE violation_id = photo.violation_id
      AND status != 'APPROVED'
      AND photo_type IN ('AFTER')
    IF count_pending == 0 AND violation.status == 'PHOTOS_UPLOADED':
      UPDATE violation SET status = 'READY_FOR_SUBMISSION'
```

**Edge case:** If violation has zero AFTER photos, auto-progression does NOT fire.
**Edge case:** If a photo is later rejected (status changed back), the violation does NOT auto-revert.

### BR-003: Priority & Urgency Calculation

**Category:** Calculation
**Description:** Violations are prioritized by a combination of priority level and deadline proximity.

```
Priority levels:
  P1 (priority = 1) — Critical, 24-hour response required
  P2 (priority = 2) — High, 30-60 day deadline
  P3 (priority = 3) — Normal

Urgency calculation (from abatement_deadline):
  Overdue:     abatement_deadline < today → RED, bold text
  ≤10 days:    abatement_deadline ≤ today + 10 → ORANGE, semibold
  ≤30 days:    abatement_deadline ≤ today + 30 → YELLOW
  >30 days:    abatement_deadline > today + 30 → GREEN

Sort order (default): P1 first, then by urgency (overdue first), then by deadline ascending.
```

### BR-004: Address Normalization & Auto-Matching

**Category:** Calculation
**Description:** When a NOI is parsed, the system attempts to match the infraction address to an existing property and unit.

```
Normalization steps:
  1. Uppercase the full address
  2. Replace common abbreviations: "ST" → "STREET", "AVE" → "AVENUE", "NW" → "NW", etc.
     Actually: normalize TO abbreviations for consistency:
     "STREET" → "ST", "AVENUE" → "AVE", "BOULEVARD" → "BLVD", "DRIVE" → "DR"
  3. Remove extra whitespace, commas, periods
  4. Extract unit number from patterns: "Unit:103", "APT 103", "#103", "Unit 103"

Matching logic:
  normalized_address = normalize(parsed_address_without_unit)
  FOR each property in org:
    IF normalize(property.address) == normalized_address:
      match property
      IF unit_number extracted:
        FOR each unit in property:
          IF unit.unit_number == unit_number:
            match unit
            BREAK
      BREAK

If no property match: prompt user to select or create.
If property matches but no unit match: prompt user to create unit or select existing.
```

**Example:** NOI address `"557 LEBAUM ST SE, Unit:103"` → normalized `"557 LEBAUM ST SE"` + unit `"103"` → matches property `"557 Lebaum Street SE"` (after normalization: `"557 LEBAUM ST SE"`) + unit `"103"`.

### BR-005: Duplicate NOI Detection

**Category:** Validation
**Description:** The system prevents creating duplicate violations for the same NOI.

```
Logic:
  ON parse completion:
    existing = SELECT * FROM violations
      WHERE org_id = current_org
      AND notice_id = parsed_notice_id
    IF existing:
      SHOW duplicate warning to user
      Options:
        MERGE: Insert only NEW violation_items (by code),
               append new photos, DO NOT overwrite existing items.
               Log merge in audit_log.
        CREATE ANYWAY: Insert as new violation (different ID, same notice_id)
```

### BR-006: Deadline Alert Schedule

**Category:** Workflow
**Description:** The system sends notifications based on deadline proximity.

```
Logic (runs daily at 08:00 Eastern via Inngest cron):
  FOR each violation WHERE status NOT IN ('APPROVED', 'CLOSED', 'NEW'):
    days_remaining = abatement_deadline - today

    IF days_remaining == 10 AND NOT already_notified('10_day', violation_id):
      CREATE notification (type: 'deadline_warning', priority: 'normal')
    ELSE IF days_remaining == 3 AND NOT already_notified('3_day', violation_id):
      CREATE notification (type: 'deadline_urgent', priority: 'urgent')
    ELSE IF days_remaining < 0 AND NOT already_notified('overdue', violation_id):
      CREATE notification (type: 'deadline_overdue', priority: 'urgent')

  Notification dedup: Check notifications table for existing notification
  with same type + violation_id created in last 24 hours.
```

### BR-007: Contact Interaction Auto-Logging

**Category:** Integration
**Description:** System events automatically create interaction records on linked contacts.

```
Events that auto-log:
  1. Work order created → Interaction on contractor contact
     Subject: "Assigned to work order for [address]"
     Source: work_orders / [work_order_id]
  2. Work order status changed → Interaction on contractor contact
     Subject: "Work order status: [old] → [new]"
  3. Photos uploaded via contractor portal → Interaction on contractor contact
     Subject: "Uploaded [count] [BEFORE/AFTER] photos for [NOI#]"
  4. Magic link email sent → Interaction on contractor contact
     Subject: "Magic link email sent for [NOI#]"
  5. Violation status changed → Interaction on ALL contacts linked to that violation
     Subject: "Violation [NOI#] status: [old] → [new]"

Implementation: Application-level inserts in API routes (not DB triggers),
except work order status changes which use a DB trigger.
```

### BR-008: Notification Email Delivery

**Category:** Integration
**Description:** Notifications can be delivered via email based on user preferences.

```
Logic:
  ON notification created:
    user_prefs = profiles.settings.notification_preferences

    IF user_prefs.email == 'instant':
      SEND email via Resend immediately
    ELSE IF user_prefs.email == 'daily_digest':
      SKIP (digest cron handles this at 08:00)
    ELSE IF user_prefs.email == 'off':
      SKIP

  Digest cron (08:00 Eastern):
    FOR each user with email == 'daily_digest':
      notifications = SELECT * FROM notifications
        WHERE user_id = user.id
        AND created_at > now() - interval '24 hours'
      IF notifications.length > 0:
        SEND digest email via Resend
```

### BR-009: Photo Verification Scoring

**Category:** Calculation
**Description:** AI photo verification uses a confidence threshold to auto-approve or flag for review.

```
Logic:
  ON contractor photo upload with paired INSPECTOR photo:
    result = Gemini Vision comparison (before_image, after_image)
    Returns: { isMatch: boolean, confidence: 0-100, reasoning: string }

    IF result.confidence >= 80:
      photo.status = 'APPROVED'
    ELSE:
      photo.status = 'PENDING_REVIEW'
      photo.rejection_reason = result.reasoning

    photo.metadata.verification = {
      isMatch, confidence, reasoning,
      verified_at, model, cost_usd
    }

Advisory, not blocking: Contractor can still mark work complete regardless.
PM has final override capability.
```

### BR-010: Role-Based Access Control

**Category:** Authorization
**Description:** Roles determine what actions users can perform.

```
OWNER:
  - Full access to everything
  - Can invite/remove team members
  - Can change roles
  - Can delete properties
  - Can access billing (v3)

ADMIN:
  - Same as OWNER except cannot manage other Owners
  - Cannot access billing

PROJECT_MANAGER:
  - Can view all violations, properties, contacts
  - Can create/assign work orders
  - Can approve/reject photos
  - Can generate submissions
  - Can add contacts and log interactions
  - Cannot invite team members
  - Cannot delete properties

CONTRACTOR:
  - Can only see assigned work orders (via magic link portal)
  - Can upload photos
  - Can update work order status
  - Cannot access dashboard, settings, or contacts
```

### BR-011: Contractor Token Lifecycle

**Category:** Workflow
**Description:** Magic link tokens for contractor portal access.

```
Logic:
  ON work order creation:
    token = generate UUID
    expires_at = now() + 30 days
    INSERT contractor_token

  ON contractor portal access:
    IF token.revoked_at IS NOT NULL: 403 "Token revoked"
    IF token.expires_at < now(): 403 "Token expired"
    UPDATE token.last_accessed_at = now()

  ON work order cancellation:
    UPDATE token.revoked_at = now()
```

### BR-012: Evidence PDF Structure

**Category:** Calculation
**Description:** The evidence PDF follows DOB submission requirements.

```
PDF Structure:
  Page 1: Cover page
    - NOI Number
    - Property address + unit
    - Respondent name
    - Date of service
    - Date of remediation (most recent photo upload date)
    - Total violation items
    - Contractor name and contact

  Pages 2+: One section per violation item
    - Item number + violation code
    - Violation description
    - Remediation description (task_description)
    - Before photo (INSPECTOR type, rendered from PDF page)
    - After photo (AFTER type, from contractor upload)
    - Photo captions with dates

  Final page: Certification
    - "All violations have been remediated as described above"
    - Date
    - Contractor signature line (placeholder)
```

---

## 4. Data Model

### 4.1 New Tables

#### `units`

```sql
-- Migration: 006_units_table.sql

CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_number TEXT NOT NULL,
  is_vacant BOOLEAN DEFAULT false,
  occupant_name TEXT,
  occupant_phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(property_id, unit_number)
);

CREATE INDEX idx_units_property ON units(property_id);
CREATE INDEX idx_units_org ON units(org_id);

ALTER TABLE units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read units" ON units
  FOR SELECT USING (org_id = auth_org_id());

CREATE POLICY "PM/Owner can manage units" ON units
  FOR ALL USING (org_id = auth_org_id() AND auth_role() IN ('OWNER', 'PROJECT_MANAGER', 'ADMIN'));
```

#### `contacts`

```sql
-- Migration: 007_contacts.sql

CREATE TYPE contact_category AS ENUM (
  'CONTRACTOR', 'GOVERNMENT', 'TENANT', 'INTERNAL', 'VENDOR', 'OTHER'
);

CREATE TYPE interaction_type AS ENUM (
  'NOTE', 'PHONE_CALL', 'EMAIL', 'MEETING', 'SYSTEM_EVENT'
);

CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  title TEXT,
  category contact_category NOT NULL DEFAULT 'OTHER',
  tags TEXT[] DEFAULT '{}',
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  legacy_contractor_id UUID,
  active BOOLEAN DEFAULT true,
  avatar_url TEXT,
  notes TEXT,
  last_interaction_at TIMESTAMPTZ,
  total_interactions INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (org_id, email)
);

CREATE INDEX idx_contacts_org ON contacts(org_id);
CREATE INDEX idx_contacts_category ON contacts(org_id, category);
CREATE INDEX idx_contacts_active ON contacts(org_id, active) WHERE active = true;
CREATE INDEX idx_contacts_last_interaction ON contacts(org_id, last_interaction_at DESC NULLS LAST);
CREATE INDEX idx_contacts_profile ON contacts(profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX idx_contacts_tags ON contacts USING gin (tags);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read contacts" ON contacts
  FOR SELECT USING (org_id = auth_org_id());
CREATE POLICY "PM/Owner can manage contacts" ON contacts
  FOR ALL USING (org_id = auth_org_id() AND auth_role() IN ('OWNER', 'PROJECT_MANAGER', 'ADMIN'));
```

#### `contact_interactions`

```sql
CREATE TABLE contact_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  interaction_type interaction_type NOT NULL DEFAULT 'NOTE',
  subject TEXT,
  body TEXT,
  direction TEXT,  -- 'inbound', 'outbound', NULL
  source_table TEXT,
  source_record_id UUID,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  violation_id UUID REFERENCES violations(id) ON DELETE SET NULL,
  work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_interactions_contact ON contact_interactions(contact_id, occurred_at DESC);
CREATE INDEX idx_interactions_org ON contact_interactions(org_id);
CREATE INDEX idx_interactions_violation ON contact_interactions(violation_id) WHERE violation_id IS NOT NULL;

ALTER TABLE contact_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read interactions" ON contact_interactions
  FOR SELECT USING (org_id = auth_org_id());
CREATE POLICY "PM/Owner can manage interactions" ON contact_interactions
  FOR ALL USING (org_id = auth_org_id() AND auth_role() IN ('OWNER', 'PROJECT_MANAGER', 'ADMIN'));

-- Trigger to update contact's last_interaction_at
CREATE OR REPLACE FUNCTION update_contact_last_interaction()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE contacts
  SET last_interaction_at = NEW.occurred_at,
      total_interactions = total_interactions + 1
  WHERE id = NEW.contact_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_contact_last_interaction
  AFTER INSERT ON contact_interactions
  FOR EACH ROW EXECUTE FUNCTION update_contact_last_interaction();
```

#### `contact_entity_links`

```sql
CREATE TABLE contact_entity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,  -- 'property', 'violation', 'work_order'
  entity_id UUID NOT NULL,
  role TEXT,  -- 'assigned_contractor', 'inspector', 'tenant', 'point_of_contact'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(contact_id, entity_type, entity_id)
);

CREATE INDEX idx_contact_links_contact ON contact_entity_links(contact_id);
CREATE INDEX idx_contact_links_entity ON contact_entity_links(entity_type, entity_id);

ALTER TABLE contact_entity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read links" ON contact_entity_links
  FOR SELECT USING (org_id = auth_org_id());
CREATE POLICY "PM/Owner can manage links" ON contact_entity_links
  FOR ALL USING (org_id = auth_org_id() AND auth_role() IN ('OWNER', 'PROJECT_MANAGER', 'ADMIN'));
```

#### `invitations`

```sql
-- Migration: 008_invitations.sql

CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'PROJECT_MANAGER',
  token TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org owners can manage invitations" ON invitations
  FOR ALL USING (org_id = auth_org_id() AND auth_role() IN ('OWNER', 'ADMIN'));
```

### 4.2 Modified Tables

#### `violations` — Add `unit_id`

```sql
-- In migration 006_units_table.sql

ALTER TABLE violations ADD COLUMN unit_id UUID REFERENCES units(id) ON DELETE SET NULL;
CREATE INDEX idx_violations_unit ON violations(unit_id) WHERE unit_id IS NOT NULL;
```

#### `properties` — Remove unit-level fields

```sql
-- In migration 006_units_table.sql
-- AFTER migrating data to units table

-- Migrate existing property unit data to units table
INSERT INTO units (org_id, property_id, unit_number, is_vacant, occupant_name, occupant_phone)
SELECT org_id, id, COALESCE(unit, 'Main'), is_vacant, occupant_name, occupant_phone
FROM properties
WHERE unit IS NOT NULL AND unit != '';

-- Then drop old columns
ALTER TABLE properties DROP COLUMN IF EXISTS unit;
ALTER TABLE properties DROP COLUMN IF EXISTS is_vacant;
ALTER TABLE properties DROP COLUMN IF EXISTS occupant_name;
ALTER TABLE properties DROP COLUMN IF EXISTS occupant_phone;
```

#### `photos` — Add AI validation columns

```sql
-- Migration: 009_photo_validation.sql

ALTER TABLE photos ADD COLUMN ai_validation_score NUMERIC(5,2);
ALTER TABLE photos ADD COLUMN ai_validation_notes TEXT;
```

#### `submissions` — Add generated PDF path

```sql
-- In migration 009 or separate

ALTER TABLE submissions ADD COLUMN generated_pdf_path TEXT;
```

#### `profiles` — Add settings JSONB

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
-- Settings shape: { notification_preferences: { email: 'instant' | 'daily_digest' | 'off' } }
```

#### `notifications` — Add priority

```sql
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';
-- Values: 'normal', 'urgent'
```

### 4.3 New RPC Functions

#### `get_portfolio_stats()`

```sql
-- Migration: 010_analytics_rpcs.sql

CREATE OR REPLACE FUNCTION get_portfolio_stats()
RETURNS TABLE (
  property_id UUID,
  property_address TEXT,
  total_violations BIGINT,
  overdue_count BIGINT,
  p1_count BIGINT,
  total_fines NUMERIC,
  next_deadline DATE,
  status_counts JSONB,
  unit_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS property_id,
    p.address AS property_address,
    COUNT(v.id) AS total_violations,
    COUNT(v.id) FILTER (WHERE v.abatement_deadline < CURRENT_DATE AND v.status NOT IN ('APPROVED', 'CLOSED')) AS overdue_count,
    COUNT(v.id) FILTER (WHERE v.priority = 1) AS p1_count,
    COALESCE(SUM(v.total_fines), 0) AS total_fines,
    MIN(v.abatement_deadline) FILTER (WHERE v.status NOT IN ('APPROVED', 'CLOSED')) AS next_deadline,
    COALESCE(
      (SELECT jsonb_object_agg(vs.status, vs.cnt)
       FROM (
         SELECT v2.status, COUNT(*) AS cnt
         FROM violations v2
         WHERE v2.property_id = p.id AND v2.status NOT IN ('CLOSED')
         GROUP BY v2.status
       ) vs),
      '{}'::jsonb
    ) AS status_counts,
    (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id) AS unit_count
  FROM properties p
  LEFT JOIN violations v ON v.property_id = p.id AND v.status NOT IN ('CLOSED')
  WHERE p.org_id = auth_org_id()
  GROUP BY p.id, p.address;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### `get_property_detail(property_id UUID)`

```sql
CREATE OR REPLACE FUNCTION get_property_detail(p_property_id UUID)
RETURNS TABLE (
  unit_id UUID,
  unit_number TEXT,
  is_vacant BOOLEAN,
  occupant_name TEXT,
  violation_count BIGINT,
  worst_status TEXT,
  overdue BOOLEAN,
  total_fines NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id AS unit_id,
    u.unit_number,
    u.is_vacant,
    u.occupant_name,
    COUNT(v.id) AS violation_count,
    (ARRAY_AGG(v.status ORDER BY
      CASE v.status
        WHEN 'NEW' THEN 1
        WHEN 'PARSING' THEN 2
        WHEN 'PARSED' THEN 3
        WHEN 'ASSIGNED' THEN 4
        WHEN 'IN_PROGRESS' THEN 5
        WHEN 'AWAITING_PHOTOS' THEN 6
        WHEN 'PHOTOS_UPLOADED' THEN 7
        ELSE 8
      END
    ))[1] AS worst_status,
    BOOL_OR(v.abatement_deadline < CURRENT_DATE AND v.status NOT IN ('APPROVED', 'CLOSED')) AS overdue,
    COALESCE(SUM(v.total_fines), 0) AS total_fines
  FROM units u
  LEFT JOIN violations v ON v.unit_id = u.id AND v.status NOT IN ('CLOSED')
  WHERE u.property_id = p_property_id AND u.org_id = auth_org_id()
  GROUP BY u.id, u.unit_number, u.is_vacant, u.occupant_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### `get_analytics()`

```sql
CREATE OR REPLACE FUNCTION get_analytics(
  p_property_id UUID DEFAULT NULL,
  p_date_from DATE DEFAULT CURRENT_DATE - interval '90 days',
  p_date_to DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'avg_resolution_days', (
      SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400)
      FROM violations
      WHERE org_id = auth_org_id()
        AND status IN ('APPROVED', 'CLOSED')
        AND updated_at BETWEEN p_date_from AND p_date_to
        AND (p_property_id IS NULL OR property_id = p_property_id)
    ),
    'approval_rate', (
      SELECT ROUND(
        COUNT(*) FILTER (WHERE response_status = 'APPROVED')::numeric /
        NULLIF(COUNT(*), 0) * 100, 1
      )
      FROM submissions
      WHERE org_id = auth_org_id()
        AND submitted_at BETWEEN p_date_from AND p_date_to
    ),
    'total_fines', (
      SELECT COALESCE(SUM(total_fines), 0)
      FROM violations
      WHERE org_id = auth_org_id()
        AND created_at BETWEEN p_date_from AND p_date_to
        AND (p_property_id IS NULL OR property_id = p_property_id)
    ),
    'opened_vs_closed', (
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT
          date_trunc('week', created_at)::date AS week,
          COUNT(*) FILTER (WHERE true) AS opened,
          COUNT(*) FILTER (WHERE status IN ('APPROVED', 'CLOSED')) AS closed
        FROM violations
        WHERE org_id = auth_org_id()
          AND created_at BETWEEN p_date_from AND p_date_to
          AND (p_property_id IS NULL OR property_id = p_property_id)
        GROUP BY week ORDER BY week
      ) t
    ),
    'status_distribution', (
      SELECT jsonb_object_agg(status, cnt)
      FROM (
        SELECT status, COUNT(*) AS cnt
        FROM violations
        WHERE org_id = auth_org_id()
          AND (p_property_id IS NULL OR property_id = p_property_id)
          AND status NOT IN ('CLOSED')
        GROUP BY status
      ) t
    ),
    'fines_by_property', (
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT p.address, COALESCE(SUM(v.total_fines), 0) AS fines
        FROM properties p
        LEFT JOIN violations v ON v.property_id = p.id
          AND v.created_at BETWEEN p_date_from AND p_date_to
        WHERE p.org_id = auth_org_id()
        GROUP BY p.address ORDER BY fines DESC LIMIT 10
      ) t
    ),
    'contractor_performance', (
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT
          wo.contractor_name,
          COUNT(*) AS total_assignments,
          COUNT(*) FILTER (WHERE wo.status = 'COMPLETED') AS completed,
          COUNT(*) FILTER (WHERE wo.completed_at <= wo.due_date) AS on_time
        FROM work_orders wo
        WHERE wo.org_id = auth_org_id()
          AND wo.created_at BETWEEN p_date_from AND p_date_to
        GROUP BY wo.contractor_name ORDER BY total_assignments DESC LIMIT 10
      ) t
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 4.4 Migration: Contractors → Contacts

```sql
-- In migration 007_contacts.sql (after creating contacts table)

-- Copy contractors into contacts
INSERT INTO contacts (org_id, full_name, email, phone, category, active, notes, legacy_contractor_id, last_interaction_at, total_interactions, created_at, updated_at)
SELECT org_id, name, email, phone, 'CONTRACTOR', active, notes, id, last_assigned_at, total_assignments, created_at, updated_at
FROM contractors
ON CONFLICT (org_id, email) DO NOTHING;

-- Create entity links from work order history
INSERT INTO contact_entity_links (org_id, contact_id, entity_type, entity_id, role)
SELECT DISTINCT c.org_id, ct.id, 'work_order', wo.id, 'assigned_contractor'
FROM contacts ct
JOIN contractors c ON ct.legacy_contractor_id = c.id
JOIN work_orders wo ON wo.contractor_email = c.email AND wo.org_id = c.org_id
ON CONFLICT DO NOTHING;

-- Backfill interactions from work order assignments
INSERT INTO contact_interactions (org_id, contact_id, interaction_type, subject, source_table, source_record_id, work_order_id, violation_id, occurred_at)
SELECT c.org_id, ct.id, 'SYSTEM_EVENT', 'Assigned to work order', 'work_orders', wo.id, wo.id, wo.violation_id, wo.created_at
FROM contacts ct
JOIN contractors c ON ct.legacy_contractor_id = c.id
JOIN work_orders wo ON wo.contractor_email = c.email AND wo.org_id = c.org_id;

-- Migrate tenant data from properties
INSERT INTO contacts (org_id, full_name, phone, category, active, notes)
SELECT org_id, occupant_name, occupant_phone, 'TENANT', true, 'Migrated from property: ' || address
FROM properties
WHERE occupant_name IS NOT NULL AND occupant_name != ''
ON CONFLICT (org_id, email) DO NOTHING;
```

---

## 5. API Contracts

### 5.1 Properties & Units

#### `GET /api/properties`

List properties with portfolio stats.

**Auth:** Session-based (any authenticated org member)

**Response 200:**
```json
{
  "properties": [
    {
      "id": "uuid",
      "address": "557 Lebaum St SE",
      "city": "Washington",
      "state": "DC",
      "zip": "20032",
      "unit_count": 8,
      "total_violations": 12,
      "overdue_count": 3,
      "p1_count": 1,
      "total_fines": 4800.00,
      "next_deadline": "2026-03-22",
      "status_counts": { "IN_PROGRESS": 4, "PARSED": 3, "ASSIGNED": 5 }
    }
  ]
}
```

#### `POST /api/properties`

Create a property.

**Auth:** PM, Admin, Owner

**Request:**
```json
{
  "address": "1401 W St NW",
  "city": "Washington",
  "state": "DC",
  "zip": "20009"
}
```

**Response 201:**
```json
{ "property": { "id": "uuid", "address": "1401 W St NW", ... } }
```

#### `PATCH /api/properties/[id]`

Update a property.

**Auth:** PM, Admin, Owner

**Request:** Partial property fields.

**Response 200:** Updated property.

#### `GET /api/properties/[id]/units`

List units for a property with violation rollups.

**Auth:** Any org member

**Response 200:**
```json
{
  "units": [
    {
      "id": "uuid",
      "unit_number": "204",
      "is_vacant": false,
      "occupant_name": "John Smith",
      "violation_count": 3,
      "worst_status": "IN_PROGRESS",
      "overdue": true,
      "total_fines": 1200.00
    }
  ]
}
```

#### `POST /api/properties/[id]/units`

Create a unit.

**Auth:** PM, Admin, Owner

**Request:**
```json
{
  "unit_number": "103",
  "is_vacant": false,
  "occupant_name": "Jane Doe",
  "occupant_phone": "202-555-0123"
}
```

#### `PATCH /api/properties/[id]/units/[unitId]`

Update a unit.

**Auth:** PM, Admin, Owner

**Request:** Partial unit fields.

#### `DELETE /api/properties/[id]`

Delete a property and cascade to its units. Violations linked to this property have `property_id` set to NULL (become "Unlinked").

**Auth:** Owner, Admin only

**Response 200:** `{ "deleted": true }`

**Error 400:** "Cannot delete property with active work orders" if any linked violation has a work order in ASSIGNED or IN_PROGRESS status.

#### `DELETE /api/properties/[id]/units/[unitId]`

Delete a unit. Violations linked to this unit have `unit_id` set to NULL.

**Auth:** Owner, Admin, PM

**Response 200:** `{ "deleted": true }`

---

### 5.2 Contacts

#### `GET /api/contacts`

List contacts with search and filters.

**Auth:** Any org member

**Query params:**
- `search` (string) — fuzzy match on name, email, company
- `category` (contact_category) — filter
- `tags` (comma-separated) — filter with AND logic
- `property_id` (UUID) — contacts linked to a property
- `active` (boolean, default true)
- `sortBy` (`full_name` | `last_interaction_at` | `total_interactions`, default `last_interaction_at`)
- `sortDir` (`asc` | `desc`, default `desc`)
- `page`, `limit` (default 25)

**Response 200:**
```json
{
  "contacts": [
    {
      "id": "uuid",
      "full_name": "Mike Thompson",
      "email": "mike@plumbing.com",
      "phone": "202-555-1234",
      "company": "Thompson Plumbing",
      "title": "Owner",
      "category": "CONTRACTOR",
      "tags": ["plumber", "licensed"],
      "active": true,
      "last_interaction_at": "2026-03-10T14:30:00Z",
      "total_interactions": 12,
      "linked_properties": 3,
      "linked_violations": 5
    }
  ],
  "total": 47,
  "page": 1
}
```

#### `GET /api/contacts/search`

Lightweight typeahead for contact picker.

**Auth:** Any org member

**Query params:** `q` (search string), `category` (optional)

**Response 200:**
```json
{
  "results": [
    { "id": "uuid", "full_name": "Mike Thompson", "email": "mike@plumbing.com", "category": "CONTRACTOR" }
  ]
}
```

#### `POST /api/contacts`

Create a contact.

**Auth:** PM, Admin, Owner

**Request:**
```json
{
  "full_name": "Mike Thompson",
  "email": "mike@plumbing.com",
  "phone": "202-555-1234",
  "company": "Thompson Plumbing",
  "title": "Owner",
  "category": "CONTRACTOR",
  "tags": ["plumber", "licensed"],
  "notes": "Reliable, responds fast"
}
```

#### `GET /api/contacts/[id]`

Contact detail with recent interactions.

**Auth:** Any org member

**Response 200:**
```json
{
  "contact": { /* full contact object */ },
  "interactions": [
    {
      "id": "uuid",
      "interaction_type": "PHONE_CALL",
      "subject": "Discussed Unit 103 timeline",
      "body": "Mike confirmed he can start Tuesday...",
      "direction": "outbound",
      "occurred_at": "2026-03-10T14:30:00Z",
      "violation": { "id": "uuid", "notice_id": "25NOIR-INS-07709" },
      "created_by_name": "Nikita"
    }
  ],
  "entity_links": [
    { "entity_type": "property", "entity_id": "uuid", "role": "assigned_contractor", "entity_label": "557 Lebaum St SE" }
  ]
}
```

#### `PATCH /api/contacts/[id]`

Update contact. Partial body.

#### `DELETE /api/contacts/[id]`

Soft delete (sets `active = false`). Does not delete interactions.

#### `POST /api/contacts/[id]/interactions`

Log a manual interaction.

**Auth:** PM, Admin, Owner

**Request:**
```json
{
  "interaction_type": "PHONE_CALL",
  "subject": "Discussed Unit 103 timeline",
  "body": "Mike confirmed he can start Tuesday. Needs boiler room access.",
  "direction": "outbound",
  "occurred_at": "2026-03-10T14:30:00Z",
  "violation_id": "uuid-optional",
  "property_id": "uuid-optional"
}
```

#### `POST /api/contacts/[id]/link`

Link contact to entity.

**Request:** `{ "entity_type": "property", "entity_id": "uuid", "role": "tenant" }`

#### `DELETE /api/contacts/[id]/link`

Unlink contact from entity. Same body shape.

---

### 5.3 Notifications

#### `GET /api/notifications`

List notifications for current user.

**Auth:** Any authenticated user

**Query params:** `page`, `limit` (default 20)

**Response 200:**
```json
{
  "notifications": [
    {
      "id": "uuid",
      "title": "Deadline in 3 days: 25NOIR-INS-07709",
      "message": "Violation at 557 Lebaum St SE due Mar 14",
      "type": "deadline_urgent",
      "priority": "urgent",
      "read": false,
      "link": "/dashboard/uuid",
      "created_at": "2026-03-11T13:00:00Z"
    }
  ],
  "total": 45,
  "page": 1
}
```

#### `GET /api/notifications/count`

**Response 200:** `{ "unread": 5 }`

#### `PATCH /api/notifications/[id]`

Mark as read. **Request:** `{ "read": true }`

#### `PATCH /api/notifications/mark-all-read`

Mark all unread as read for current user.

---

### 5.4 Submissions

#### `POST /api/submissions`

Record a DOB submission.

**Auth:** PM, Admin, Owner

**Request:**
```json
{
  "violation_id": "uuid",
  "confirmation_number": "DOB-2026-12345",
  "submitted_at": "2026-03-11",
  "notes": "Submitted via online portal",
  "generated_pdf_path": "submissions/uuid/evidence.pdf"
}
```

**Side effects:** Violation status → SUBMITTED. Notification to org owner.

#### `PATCH /api/submissions/[id]`

Record DOB response.

**Request:**
```json
{
  "response_status": "APPROVED",
  "response_notes": "All violations cleared",
  "responded_at": "2026-03-15"
}
```

**Side effects:**
- APPROVED → Violation status → APPROVED. Celebration notification.
- REJECTED → Violation status → REJECTED → IN_PROGRESS. Notification with reason.
- ADDITIONAL_INFO_REQUESTED → Violation status → ADDITIONAL_INFO_REQUESTED. Notification.

#### `POST /api/violations/[id]/generate-evidence-pdf`

Generate evidence PDF for a violation. This is called BEFORE creating a submission record. The returned `storage_path` is then passed to `POST /api/submissions` when recording the submission.

**Auth:** PM, Admin, Owner

**Precondition:** Violation must be in READY_FOR_SUBMISSION, SUBMITTED, or PHOTOS_UPLOADED status.

**Flow:** Generate PDF → Download/preview → Record submission (separate step)

**Response 200:**
```json
{
  "pdf_url": "signed-url-to-generated-pdf",
  "storage_path": "submissions/uuid/evidence.pdf"
}
```

**Error 400:** "Violation must have approved photos before generating evidence PDF."
**Error 504:** If PDF generation exceeds 30 seconds, return timeout error with retry suggestion.

---

### 5.5 Team Management

#### `GET /api/team`

List org members.

**Auth:** Owner, Admin

**Response 200:**
```json
{
  "members": [
    { "id": "uuid", "full_name": "Sam Barksdale", "email": "sam@yokemgmt.com", "role": "OWNER", "last_sign_in_at": "2026-03-11T10:00:00Z" }
  ],
  "invitations": [
    { "id": "uuid", "email": "nikita@yokemgmt.com", "role": "PROJECT_MANAGER", "status": "pending", "expires_at": "2026-03-18" }
  ]
}
```

#### `POST /api/team/invite`

Send invitation.

**Auth:** Owner, Admin

**Request:** `{ "email": "nikita@yokemgmt.com", "role": "PROJECT_MANAGER" }`

**Side effects:** Send invitation email via Resend with signup link containing org_id and role.

#### `PATCH /api/team/[userId]/role`

Change member role.

**Auth:** Owner only

**Request:** `{ "role": "ADMIN" }`

**Error 400:** "At least one Owner is required" if downgrading last Owner.

---

### 5.6 Analytics

#### `GET /api/analytics`

Aggregated analytics data.

**Auth:** Any org member

**Query params:**
- `property_id` (UUID, optional)
- `date_from` (date, default: 90 days ago)
- `date_to` (date, default: today)

**Response 200:**
```json
{
  "avg_resolution_days": 18.5,
  "approval_rate": 87.5,
  "total_fines": 23400.00,
  "opened_vs_closed": [
    { "week": "2026-02-24", "opened": 5, "closed": 3 }
  ],
  "status_distribution": { "IN_PROGRESS": 12, "PARSED": 8, "SUBMITTED": 3 },
  "fines_by_property": [
    { "address": "557 Lebaum St SE", "fines": 8400.00 }
  ],
  "contractor_performance": [
    { "contractor_name": "Mike Thompson", "total_assignments": 15, "completed": 12, "on_time": 10 }
  ]
}
```

### 5.7 Modified: Violations

#### `GET /api/violations` — Extended Filters

**New query params:**
- `unit_id` (UUID) — filter by unit
- `statuses` (comma-separated) — multi-select status filter (e.g., `statuses=NEW,PARSED,ASSIGNED`)
- `date_from`, `date_to` (date) — abatement_deadline range
- `is_vacant` (boolean) — filter by unit vacancy
- `needs_attention` (boolean) — shortcut for: overdue OR P1 OR status in (NEW, PARSED, AWAITING_PHOTOS)
- `property_id` (UUID) — filter by property

All existing params remain unchanged.

---

## 6. UI Specification

### 6.1 Navigation (Sidebar)

**File:** `src/components/layout/sidebar.tsx`

```
Navigation Items:
─────────────────────────────
  🏠  Portfolio Home     /dashboard
  📋  All Violations     /violations
  👥  Contacts           /contacts
  📊  Analytics          /analytics
  📤  Parse NOI          /parse
  ─────────────────────
  ⚙️   Settings          /settings
```

The existing `/dashboard` route is repurposed as Portfolio Home. A new `/violations` route provides the original flat violations table for power users who want a complete list.

### 6.2 Portfolio Home (`/dashboard`)

**Components needed:**
- `PortfolioStatsBar` — 6 stat cards in a row
- `PropertyCard` — Reusable card component
- `PropertyGrid` — Responsive grid layout

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ Portfolio Home                            [Upload NOI ▶] │
├─────────────────────────────────────────────────────────┤
│ [Total: 47] [Overdue: 12] [Due<10d: 8] [P1: 3]        │
│ [Fines: $23K] [Photos Pending: 15]                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────┐ │
│  │ 557 Lebaum St SE │ │ 1401 W St NW     │ │ 3200     │ │
│  │ 8 units          │ │ 14 units         │ │ Georgia  │ │
│  │ ●●●●○○ 12 open   │ │ ●●○○○○ 6 open    │ │ Ave NW   │ │
│  │ $4,800 fines     │ │ $2,100 fines     │ │ ...      │ │
│  │ ⏰ Mar 22 (11d)   │ │ ⏰ Apr 01 (21d)   │ │          │ │
│  │ 🔴 3 overdue     │ │ 🟢 on track      │ │          │ │
│  └──────────────────┘ └──────────────────┘ └──────────┘ │
│                                                          │
│  [Empty state: "Add Your First Property" CTA]            │
└─────────────────────────────────────────────────────────┘
```

**Property card details:**
- Address (bold, large)
- Unit count
- Status dots (colored circles: red/orange/yellow/green representing violation statuses)
- Total open violations count
- Total fines
- Next deadline with days remaining (urgency color-coded)
- Overdue badge (red) if any violations overdue

**Sorting:** Properties with overdue violations first, then by P1 count, then alphabetical.

**Clicking a stat card** navigates to `/violations` with corresponding filter pre-applied.

### 6.3 Property Detail (`/properties/[id]`)

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ ← Portfolio Home  >  557 Lebaum St SE                    │
├─────────────────────────────────────────────────────────┤
│ 557 Lebaum St SE, Washington DC 20032                    │
│ [12 violations] [3 overdue] [$4,800 fines]  [Edit] [Add Unit] │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│  │ Unit 103     │ │ Unit 204     │ │ Unit 512     │     │
│  │ 🟢 Occupied  │ │ ⬜ Vacant    │ │ 🟢 Occupied  │     │
│  │ John Smith   │ │              │ │ Jane Doe     │     │
│  │ 3 violations │ │ 1 violation  │ │ 2 violations │     │
│  │ 🔴 1 overdue │ │ 🟢 on track  │ │ 🟡 due soon  │     │
│  │ $1,200       │ │ $400         │ │ $800         │     │
│  └──────────────┘ └──────────────┘ └──────────────┘     │
└─────────────────────────────────────────────────────────┘
```

### 6.4 Unit Detail (`/properties/[id]/units/[unitId]`)

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ ← 557 Lebaum St SE  >  Unit 103                         │
├─────────────────────────────────────────────────────────┤
│ Unit 103  •  Occupied  •  John Smith (202-555-0123)      │
│                                            [Edit Unit]   │
├─────────────────────────────────────────────────────────┤
│ [Violations Table — reuses violation-table.tsx]           │
│                                                          │
│ NOI#      │ Items │ Status      │ Deadline │ Fines       │
│ 25N-077   │ 4     │ IN_PROGRESS │ Mar 22   │ $800        │
│ 25N-081   │ 2     │ PARSED      │ Apr 01   │ $400        │
└─────────────────────────────────────────────────────────┘
```

### 6.5 Violation Detail (Enhanced — existing `/dashboard/[id]`)

**Changes from v1:**
- Add breadcrumb: Portfolio Home > 557 Lebaum St SE > Unit 103 > 25NOIR-INS-07709
- Add **4th tab: Submission**
- Show linked contact for assigned contractor (clickable to `/contacts/[id]`)
- Add AI validation score badges on Photos tab

**Submission Tab:**
```
┌─────────────────────────────────────────────────────────┐
│ Submission History                                       │
├─────────────────────────────────────────────────────────┤
│ [No submissions yet]                                     │
│                                                          │
│ [Generate Evidence PDF]  [Record Submission]              │
├─────────────────────────────────────────────────────────┤
│ OR (if submissions exist):                               │
│                                                          │
│ #1  Submitted: Mar 11, 2026                              │
│     Confirmation: DOB-2026-12345                         │
│     Status: ⏳ Pending Response        [Update Response] │
│     PDF: [Download] [View in Drive]                      │
└─────────────────────────────────────────────────────────┘
```

### 6.6 Contacts List (`/contacts`)

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ Contacts                                 [Add Contact ▶] │
├─────────────────────────────────────────────────────────┤
│ [All] [Government] [Contractor] [Tenant] [Internal]      │
│ [🔍 Search contacts...]                                  │
├─────────────────────────────────────────────────────────┤
│ Name / Company        │ Category │ Contact  │ Last Touch │
│──────────────────────│──────────│──────────│────────────│
│ Mike Thompson         │ 🟠 CONTR │ mike@... │ 2 hrs ago  │
│ Thompson Plumbing     │          │ 202-555  │            │
│──────────────────────│──────────│──────────│────────────│
│ Inspector Davis       │ 🔵 GOVT  │ davis@dc │ 3 days ago │
│ DC DOB                │          │ 202-442  │            │
│──────────────────────│──────────│──────────│────────────│
│ John Smith            │ 🟢 TENANT│ john@... │ 1 week ago │
│ Unit 103, 557 Lebaum  │          │ 202-555  │            │
└─────────────────────────────────────────────────────────┘
```

### 6.7 Contact Detail (`/contacts/[id]`)

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ ← Contacts  >  Mike Thompson                    [Edit]   │
├─────────────────────────────────────────────────────────┤
│ Mike Thompson  •  🟠 Contractor                          │
│ Thompson Plumbing  •  Owner                              │
│ mike@plumbing.com  •  202-555-1234                       │
│ Tags: [plumber] [licensed] [emergency]                   │
│ Notes: Reliable, responds fast. Handles NW properties.   │
│                                                          │
│ [Log Interaction]  [Link to Property]  [Link to Violation]│
├─────────────────────────────────────────────────────────┤
│ [Timeline]  [Linked Entities]  [System Activity]         │
├─────────────────────────────────────────────────────────┤
│ Timeline:                                                │
│                                                          │
│ 📞 Discussed Unit 103 timeline           2 hours ago     │
│    Mike confirmed Tuesday start. Needs boiler access.    │
│    🔗 25NOIR-INS-07709  •  by Nikita                     │
│                                                          │
│ ⚡ Assigned to work order for 557 Lebaum  3 days ago     │
│    System event  •  🔗 Work Order #WO-123                │
│                                                          │
│ ⚡ Uploaded 4 AFTER photos               5 days ago      │
│    System event  •  🔗 25NOIR-INS-07709                  │
└─────────────────────────────────────────────────────────┘
```

### 6.8 Notification Bell (Component in Top Nav)

**Location:** `src/components/layout/nav.tsx`

```
┌──────────────────────────────────────────┐
│ DOB Abatement    [🔍]  [🔔 5]  [Avatar] │
│                         ┌────────────────┤
│                         │ Notifications  │
│                         │────────────────│
│                         │ 🔴 3-day deadline│
│                         │ 25N-077 at 557 │
│                         │ Lebaum - Mar 14│
│                         │           2h ago│
│                         │────────────────│
│                         │ 📸 Photos upload│
│                         │ Mike uploaded 4 │
│                         │ photos for 25N │
│                         │           1d ago│
│                         │────────────────│
│                         │ [Mark All Read] │
│                         │ [View All →]    │
│                         └────────────────┘
└──────────────────────────────────────────┘
```

### 6.9 Analytics (`/analytics`)

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ Analytics                                                │
│ [Property: All ▼]  [From: Jan 1 ▼]  [To: Mar 11 ▼]     │
├─────────────────────────────────────────────────────────┤
│ [Avg Resolution] [Approval Rate] [Total Fines] [Open/Close]│
│ [  18.5 days  ]  [   87.5%     ] [  $23.4K  ] [ +5 / -3 ] │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────┐ ┌─────────────────────┐        │
│ │ Violations Over Time│ │ Status Distribution │        │
│ │ (Line Chart)        │ │ (Donut Chart)       │        │
│ │    /\  /\           │ │   ██ IN_PROGRESS 34%│        │
│ │   /  \/  \          │ │   ██ PARSED 22%     │        │
│ │  /        \__       │ │   ██ ASSIGNED 18%   │        │
│ └─────────────────────┘ └─────────────────────┘        │
│ ┌─────────────────────┐ ┌─────────────────────┐        │
│ │ Fines by Property   │ │ Contractor Perf.    │        │
│ │ (Bar Chart)         │ │ (Bar Chart)         │        │
│ │ ████████ 557 Lebaum │ │ ████████ Mike 83%   │        │
│ │ █████    1401 W St  │ │ ██████   Alex 67%   │        │
│ │ ███      3200 GA    │ │ █████    Jose 60%   │        │
│ └─────────────────────┘ └─────────────────────┘        │
└─────────────────────────────────────────────────────────┘
```

### 6.10 Settings (Enhanced)

**Add tabs:** General | Gmail | Team | Notifications

**Team tab:**
```
┌─────────────────────────────────────────────────────────┐
│ Team Members                              [Invite ▶]     │
├─────────────────────────────────────────────────────────┤
│ Sam Barksdale  •  sam@yokemgmt.com  •  [OWNER ▼]        │
│ Last active: Today                                       │
│──────────────────────────────────────────────────────────│
│ Nikita Gray  •  nikita@yokemgmt.com  •  [PM ▼]  [Remove]│
│ Last active: Yesterday                                   │
├─────────────────────────────────────────────────────────┤
│ Pending Invitations                                      │
│ alex@contractor.com  •  CONTRACTOR  •  Expires Mar 18    │
│                                         [Resend] [Revoke]│
└─────────────────────────────────────────────────────────┘
```

**Notifications tab:**
```
┌─────────────────────────────────────────────────────────┐
│ Notification Preferences                                 │
├─────────────────────────────────────────────────────────┤
│ Email Delivery:  ( ) Instant  (●) Daily Digest  ( ) Off  │
│                                                          │
│ Alert Types:                           In-App    Email   │
│ Deadline warnings (10 days)             [✓]      [✓]    │
│ Deadline urgent (3 days)                [✓]      [✓]    │
│ Overdue violations                      [✓]      [✓]    │
│ P1 urgent alerts                        [✓]      [✓]    │
│ Photo uploads                           [✓]      [ ]    │
│ Submission responses                    [✓]      [✓]    │
│ Work order status changes               [✓]      [ ]    │
└─────────────────────────────────────────────────────────┘
```

### 6.11 Parse NOI (Enhanced)

**After parse completes, add:**
```
┌─────────────────────────────────────────────────────────┐
│ Link to Property                                         │
├─────────────────────────────────────────────────────────┤
│ Parsed address: 557 LEBAUM ST SE, Unit:103               │
│                                                          │
│ ✅ Matched: 557 Lebaum St SE → Unit 103                  │
│ [Confirm & Link]  [Choose Different Property ▼]          │
│                                                          │
│ OR if no match:                                          │
│ ⚠️  No matching property found                           │
│ [Create New Property]  [Select Existing ▼]               │
├─────────────────────────────────────────────────────────┤
│ ⚠️  Duplicate Warning (if applicable)                    │
│ NOI 25NOIR-INS-07709 already exists with 4 items.        │
│ This parse found 2 new items.                            │
│ [Merge Into Existing]  [Create Separate Violation]       │
└─────────────────────────────────────────────────────────┘
```

---

## 7. Edge Cases & Error Handling

### 7.1 Address Matching

| Scenario | Expected Behavior |
|----------|------------------|
| NOI address is `"557 LEBAUM ST SE, Unit:103"` | Normalize to `"557 LEBAUM ST SE"` + unit `"103"`. Match property + unit. |
| NOI address has no unit number | Match property only. Don't create unit — prompt user. |
| NOI address matches multiple properties (ambiguous) | Show all matches, let user select. |
| NOI address matches no property | Show "No match" with Create New / Select Existing options. |
| Address normalization differs (e.g., "St" vs "Street") | Normalization handles common abbreviations; match should succeed. |

### 7.2 Orphaned Violations

| Scenario | Expected Behavior |
|----------|------------------|
| Existing violations have no `property_id` | Display as "Unlinked" in a special section on Portfolio Home. |
| User clicks an unlinked violation | Violation detail shows "Link to Property" banner at top. |
| Bulk linking needed | Settings page or Portfolio Home has "Link Unlinked Violations" utility. |

### 7.3 Duplicate NOI

| Scenario | Expected Behavior |
|----------|------------------|
| Same `notice_id` uploaded twice with identical items | Merge detects 0 new items. Shows "No new data found" and links to existing violation. |
| Same `notice_id` with new items (re-inspection) | Merge adds new items, keeps existing. Audit log records merge. |
| User clicks "Create Anyway" | New violation created with same `notice_id`. Both visible in dashboard. |

### 7.4 Gmail Integration

| Scenario | Expected Behavior |
|----------|------------------|
| Refresh token expires | `email_connections.status` → `'expired'`. Banner in Settings: "Reconnect Gmail". |
| Gmail API rate limit | Inngest retry with exponential backoff. Max 3 retries. |
| Email has no PDF attachment | Log to `email_sync_log` with `status = 'skipped'` and reason. |
| Email has multiple PDFs | Process each PDF as a separate violation. |
| Email already processed | Skip (uniqueness on `gmail_message_id`). |

### 7.5 Background Jobs (Inngest)

| Scenario | Expected Behavior |
|----------|------------------|
| Inngest step fails | Retry up to 2 times. All steps must be idempotent. |
| Deadline check finds already-notified violation | Skip (dedup: check for existing notification with same type in last 24h). |
| Google Drive upload fails | Flag submission, notify PM, allow manual retry. |
| Email sync finds 20+ NOIs at once | Process sequentially to avoid rate limits. Log each to sync log. |

### 7.6 Role & Team Management

| Scenario | Expected Behavior |
|----------|------------------|
| Last Owner tries to change own role | Block with "At least one Owner is required." |
| Invitation link clicked after expiry (7 days) | Show "Invitation expired. Contact your administrator." |
| Same email invited twice | Return error "This email has already been invited." |
| Removed member tries to access app | RLS blocks all queries (org_id no longer matches). Redirect to "No access" page. |

### 7.7 Empty States

| Page | Empty State |
|------|-------------|
| Portfolio Home (no properties) | Illustration + "Add Your First Property" button |
| Property Detail (no units) | "Add your first unit to start tracking violations" |
| Unit Detail (no violations) | "No violations for this unit. Upload a NOI to get started." |
| Contacts (no contacts) | "Add your first contact to build your Rolodex" |
| Analytics (no data) | "Not enough data yet. Analytics will appear once violations are processed." |
| Notifications (none) | "All clear! No notifications." |

---

## 8. Implementation Sequencing & Dependencies

### Sprint 1 (2 weeks): Navigation Hierarchy — Feature Area A

**Goal:** Replace flat dashboard with portfolio-first navigation.

| Task | Files | Depends On |
|------|-------|-----------|
| Create migration `006_units_table.sql` | `supabase/migrations/006_units_table.sql` | — |
| Add `Unit` type to types.ts | `src/lib/types.ts` | — |
| Create `get_portfolio_stats()` and `get_property_detail()` RPCs | `supabase/migrations/006_units_table.sql` | Migration |
| Build `GET/POST /api/properties` route | `src/app/api/properties/route.ts` | Migration |
| Build `PATCH /api/properties/[id]` route | `src/app/api/properties/[id]/route.ts` | Properties API |
| Build `GET/POST /api/properties/[id]/units` route | `src/app/api/properties/[id]/units/route.ts` | Migration |
| Build `PATCH /api/properties/[id]/units/[unitId]` route | `src/app/api/properties/[id]/units/[unitId]/route.ts` | Units API |
| Build Portfolio Home page | `src/app/(authenticated)/dashboard/page.tsx` | Properties API |
| Build PortfolioStatsBar component | `src/components/dashboard/portfolio-stats-bar.tsx` | — |
| Build PropertyCard component | `src/components/dashboard/property-card.tsx` | — |
| Build Property Detail page | `src/app/(authenticated)/properties/[id]/page.tsx` | Units API |
| Build Unit Detail page | `src/app/(authenticated)/properties/[id]/units/[unitId]/page.tsx` | Violations API |
| Build Add/Edit Property modal | `src/components/properties/property-dialog.tsx` | Properties API |
| Build Add/Edit Unit modal | `src/components/properties/unit-dialog.tsx` | Units API |
| Update sidebar navigation | `src/components/layout/sidebar.tsx` | — |
| Create `/violations` route (All Violations flat table) | `src/app/(authenticated)/violations/page.tsx` | — |
| Build address normalization utility | `src/lib/address-utils.ts` | — |
| Add address auto-matching to parse pipeline | `src/inngest/functions/parse-noi.ts` | Address utils |
| Add `property_id` filter to violations API | `src/app/api/violations/route.ts` | — |
| Add breadcrumbs to violation detail | `src/app/(authenticated)/dashboard/[id]/page.tsx` | Properties API |

### Sprint 2 (2 weeks): Notifications + Submission Loop — Areas C + D

**Goal:** Close the notification and submission workflows.

| Task | Files | Depends On |
|------|-------|-----------|
| Add `priority` to notifications table | Migration or ALTER | — |
| Add `settings` JSONB to profiles | Migration or ALTER | — |
| Build `GET /api/notifications` route | `src/app/api/notifications/route.ts` | — |
| Build `GET /api/notifications/count` route | `src/app/api/notifications/count/route.ts` | — |
| Build `PATCH /api/notifications/[id]` route | `src/app/api/notifications/[id]/route.ts` | — |
| Build `PATCH /api/notifications/mark-all-read` route | `src/app/api/notifications/mark-all-read/route.ts` | — |
| Build NotificationBell component | `src/components/layout/notification-bell.tsx` | Notifications API |
| Add bell to nav | `src/components/layout/nav.tsx` | NotificationBell |
| Build Inngest `deadline-check` cron | `src/inngest/functions/deadline-check.ts` | Notifications API |
| Set up Resend for transactional email | `src/lib/email.ts` | — |
| Build notification email templates | `src/lib/email-templates.ts` | Resend |
| Build Inngest `send-notification-email` function | `src/inngest/functions/send-notification-email.ts` | Resend |
| Register new Inngest functions | `src/app/api/inngest/route.ts` | Functions |
| Implement status auto-progression logic | `src/app/api/contractor/[token]/photos/route.ts` or DB trigger | — |
| Build `POST /api/submissions` route | `src/app/api/submissions/route.ts` | — |
| Build `PATCH /api/submissions/[id]` route | `src/app/api/submissions/[id]/route.ts` | — |
| Build `POST /api/violations/[id]/generate-evidence-pdf` route | `src/app/api/violations/[id]/generate-evidence-pdf/route.ts` | — |
| Build evidence PDF generator | `src/lib/pdf/generate-evidence-pdf.ts` | `@react-pdf/renderer` |
| Build Submission tab on violation detail | `src/components/dashboard/submission-tab.tsx` | Submissions API |
| Add Supabase Realtime subscriptions | `src/app/(authenticated)/dashboard/page.tsx` | — |
| Build Inngest `archive-to-drive` function | `src/inngest/functions/archive-to-drive.ts` | Google Drive OAuth |
| Add notification preferences to Settings | `src/app/(authenticated)/settings/page.tsx` | — |

### Sprint 3 (2 weeks): Contacts + Users — Areas B + E

**Goal:** Build the contacts system and team management.

| Task | Files | Depends On |
|------|-------|-----------|
| Create migration `007_contacts.sql` (tables + contractor migration) | `supabase/migrations/007_contacts.sql` | — |
| Create migration `008_invitations.sql` | `supabase/migrations/008_invitations.sql` | — |
| Add Contact, ContactInteraction types | `src/lib/types.ts` | — |
| Build contacts CRUD API routes | `src/app/api/contacts/**` | Migration |
| Build contact interactions API | `src/app/api/contacts/[id]/interactions/route.ts` | Migration |
| Build contact link/unlink API | `src/app/api/contacts/[id]/link/route.ts` | Migration |
| Build contact search API (typeahead) | `src/app/api/contacts/search/route.ts` | Migration |
| Build ContactPicker component | `src/components/contacts/contact-picker.tsx` | Search API |
| Build Contacts List page | `src/app/(authenticated)/contacts/page.tsx` | Contacts API |
| Build Contact Detail page | `src/app/(authenticated)/contacts/[id]/page.tsx` | Interactions API |
| Build AddInteractionDialog | `src/components/contacts/add-interaction-dialog.tsx` | Interactions API |
| Build AddContactDialog | `src/components/contacts/add-contact-dialog.tsx` | Contacts API |
| Update AssignWorkOrderDialog to use ContactPicker | `src/components/contractor/assign-work-order-dialog.tsx` | ContactPicker |
| Add auto-log hooks to work orders route | `src/app/api/work-orders/route.ts` | Contacts migration |
| Add auto-log hooks to photos route | `src/app/api/contractor/[token]/photos/route.ts` | Contacts migration |
| Add auto-log trigger for work order status | `supabase/migrations/007_contacts.sql` | — |
| Build `GET /api/team` route | `src/app/api/team/route.ts` | — |
| Build `POST /api/team/invite` route | `src/app/api/team/invite/route.ts` | Resend (Sprint 2) |
| Build `PATCH /api/team/[userId]/role` route | `src/app/api/team/[userId]/role/route.ts` | — |
| Build Team tab in Settings | `src/app/(authenticated)/settings/page.tsx` | Team API |
| Add Contacts to sidebar | `src/components/layout/sidebar.tsx` | — |
| Show linked contact on violation detail | `src/app/(authenticated)/dashboard/[id]/page.tsx` | Contact links |

### Sprint 4 (2 weeks): Polish + Hardening — Areas F + G

**Goal:** Enhanced filters, duplicate detection, analytics, mobile, production.

| Task | Files | Depends On |
|------|-------|-----------|
| Refactor FilterSidebar with enhanced filters | `src/components/dashboard/filter-sidebar.tsx` | Properties API |
| Add extended filter params to violations API | `src/app/api/violations/route.ts` | — |
| Implement duplicate NOI detection in parse pipeline | `src/inngest/functions/parse-noi.ts` | — |
| Build duplicate merge UI on parse results | `src/components/parser/duplicate-warning.tsx` | — |
| Build `POST /api/violations/[id]/merge` route | `src/app/api/violations/[id]/merge/route.ts` | — |
| Complete email monitoring (finish Gmail cron) | `src/inngest/functions/email-sync.ts` | — |
| Add PM photo override button on violation detail | `src/app/(authenticated)/dashboard/[id]/page.tsx` | — |
| Build Analytics page | `src/app/(authenticated)/analytics/page.tsx` | Analytics RPC |
| Install and configure Recharts | `package.json` | — |
| Build chart components | `src/components/analytics/*.tsx` | Recharts |
| Build `GET /api/analytics` route | `src/app/api/analytics/route.ts` | Analytics RPC |
| Mobile-optimize contractor portal | `src/app/contractor/[token]/page.tsx` | — |
| Add camera capture to photo upload | `src/components/contractor/photo-upload-slot.tsx` | — |
| Add React error boundaries | `src/components/error-boundary.tsx` | — |
| Wrap all pages with error boundary | All page.tsx files | Error boundary |
| Set up Inngest on Vercel Marketplace | Vercel dashboard | — |
| Write parse pipeline tests | `src/__tests__/parse-pipeline.test.ts` | Vitest |
| Write RLS policy tests | `src/__tests__/rls-policies.test.ts` | Vitest |
| Write API route tests | `src/__tests__/api-routes.test.ts` | Vitest |
| Set all env vars on Vercel | Vercel dashboard | — |

### External Dependencies to Set Up

| Dependency | When Needed | What to Do |
|-----------|-------------|-----------|
| **Resend** | Sprint 2 | Sign up, get API key, add `RESEND_API_KEY` to `.env.local` and Vercel |
| **Google Drive API** | Sprint 2 | Create OAuth credentials in Google Cloud Console, add client ID/secret |
| **Recharts** | Sprint 4 | `npm install recharts` |
| **Inngest (Vercel)** | Sprint 4 | Install from Vercel Marketplace, sets env vars automatically |
| **@react-pdf/renderer** | Sprint 2 | `npm install @react-pdf/renderer` (if not using existing approach) |
| **Vitest** | Sprint 4 | Already configured (`vitest.config.ts` exists). `npm install -D vitest @testing-library/react` |

---

## 9. Definition of Done & Developer Handoff

### 9.1 Definition of Done (v2 Launch)

**Functionality:**
- [ ] All MUST HAVE user stories pass their acceptance criteria
- [ ] All SHOULD HAVE stories either pass or are explicitly deferred with stakeholder sign-off
- [ ] Portfolio → Property → Unit → Violation navigation works end-to-end
- [ ] Contacts system tracks all interaction types with auto-logging working
- [ ] Deadline notifications delivered via email and in-app within 2 minutes
- [ ] Submission loop closed: generate PDF → record submission → track DOB response → close violation
- [ ] Email monitoring auto-imports NOI PDFs from connected Gmail
- [ ] Photo AI verification scores displayed on contractor portal and violation detail

**Quality:**
- [ ] No P0 (crash) or P1 (feature broken) bugs open
- [ ] Test suite passes: parse pipeline, RLS, API routes
- [ ] React error boundaries on all pages (no white screens)
- [ ] All pages load in < 2 seconds

**Security:**
- [ ] All new tables have RLS policies using `auth_org_id()`
- [ ] All new API routes validate auth and enforce role-based access
- [ ] Gmail/Drive OAuth tokens encrypted at rest
- [ ] No secrets in client-side code or git history
- [ ] Supabase service role key rotated (was previously leaked)

**Operations:**
- [ ] Inngest running on Vercel (production)
- [ ] All environment variables set on Vercel
- [ ] Supabase Auth Hook (`custom_access_token_hook`) enabled in Dashboard
- [ ] Transactional email (Resend) configured and verified

**Data:**
- [ ] Migration scripts run cleanly against production Supabase
- [ ] Contractor → Contact migration completes without data loss
- [ ] Existing violations remain accessible (orphaned = "Unlinked" state)

### 9.2 Developer Handoff Prompts

These are parallelizable work units. Each can be assigned to a developer independently after Sprint 1 (navigation hierarchy) is complete, as it's the foundation.

#### Prompt 1: Portfolio Navigation (Sprint 1 — Foundation)

> Build the portfolio-first navigation hierarchy for the DOB Abatement SaaS. Create the `units` table (migration 006), property/unit CRUD APIs, Portfolio Home page with property cards, Property Detail page with unit cards, Unit Detail page with violations table. Update the sidebar nav. Build address normalization utility and auto-matching in the parse pipeline. Reference: Section 2 Feature Area A, Section 4.1 `units` table, Section 5.1 Properties & Units APIs, Section 6.2-6.4 UI specs.

#### Prompt 2: Notification System (Sprint 2)

> Build the notification system for the DOB Abatement SaaS. Add `priority` column to notifications table. Build notification API routes (list, count, mark read, mark all read). Build NotificationBell component in top nav with Supabase Realtime for live badge updates. Build Inngest `deadline-check` cron that runs daily at 8 AM ET and creates notifications for 10-day, 3-day, and overdue violations. Set up Resend for transactional email delivery. Build notification preferences in Settings. Reference: Section 2 Feature Area C, Section 3 BR-006 and BR-008, Section 5.3 Notifications API, Section 6.8 UI spec.

#### Prompt 3: Submission & Evidence PDF (Sprint 2)

> Build the submission tracking system. Implement status auto-progression (BR-002: when all AFTER photos approved, advance to READY_FOR_SUBMISSION). Build evidence PDF generator using @react-pdf/renderer following the structure in BR-012. Build submission API routes (create, update response, generate PDF). Build Submission tab on violation detail page. Build Inngest function to archive PDFs to Google Drive. Reference: Section 2 Feature Area D, Section 3 BR-002 and BR-012, Section 5.4 Submissions API, Section 6.5 UI spec.

#### Prompt 4: Universal Contacts (Sprint 3)

> Build the universal contacts/Rolodex system. Create migration 007 (contacts, contact_interactions, contact_entity_links tables) including migration of existing contractors data. Build all contacts API routes (CRUD, interactions, search, link/unlink). Build ContactPicker combobox component. Build Contacts List page and Contact Detail page with interaction timeline. Add auto-logging hooks to work orders and photos API routes. Update AssignWorkOrderDialog to use ContactPicker. Reference: Section 2 Feature Area B, Section 3 BR-007, Section 4.1 contacts tables, Section 5.2 Contacts API, Section 6.6-6.7 UI specs.

#### Prompt 5: User Management (Sprint 3)

> Build team management. Create migration 008 (invitations table). Build team API routes (list members, invite, change role). Build Team tab in Settings with member list, invite modal, role dropdowns. Enforce "at least one Owner" rule. Send invitation emails via Resend with signup link containing org_id. Reference: Section 2 Feature Area E, Section 3 BR-010, Section 5.5 Team API, Section 6.10 UI spec.

#### Prompt 6: Enhanced Filters & Duplicate Detection (Sprint 4)

> Enhance the violations filter sidebar with: multi-select status checkboxes, priority radio buttons, property dropdown, date range picker, vacant/occupied toggle, "Needs Attention" quick filter. Add extended filter params to violations API. Implement duplicate NOI detection in parse pipeline — check notice_id on parse completion, show merge dialog with options to merge or create separate. Build merge API route. Reference: Section 2 Feature Area F (US-F.1, US-F.2), Section 3 BR-005, Section 5.7 extended violations API.

#### Prompt 7: Analytics Dashboard (Sprint 4)

> Build the analytics page. Create `get_analytics()` RPC function in Supabase. Build GET /api/analytics route. Build analytics page with Recharts: KPI cards (avg resolution, approval rate, fines, opened vs closed), line chart (over time), donut (status distribution), bar charts (fines by property, contractor performance). Add date range picker and property filter. Reference: Section 2 Feature Area G (US-G.1), Section 4.3 `get_analytics()`, Section 5.6 Analytics API, Section 6.9 UI spec.

#### Prompt 8: Mobile + Production Hardening (Sprint 4)

> Mobile-optimize the contractor portal: responsive layout (single column < 768px), large touch targets (44x44px min), camera capture integration (`capture="environment"` on file inputs), upload progress indicators. Add React error boundary component that wraps all pages. Set up Inngest on Vercel Marketplace. Write test suite with Vitest: parse pipeline unit tests (mock Gemini), RLS policy tests (org isolation), API route tests (auth, validation). Reference: Section 2 Feature Area G (US-G.2, US-G.3).

---

## Glossary

| Term | Definition |
|------|-----------|
| NOI | Notice of Infraction — official document from DC DOB citing building violations |
| DOB | Department of Buildings (Washington, DC) |
| Abatement | The process of fixing/resolving a building violation |
| P1 / P2 / P3 | Priority levels: P1 = 24-hour critical, P2 = 30-60 day, P3 = normal |
| RLS | Row Level Security — Supabase/PostgreSQL feature that restricts data access per-row |
| Inngest | Background job orchestration platform (event-driven functions with retries) |
| Magic Link | Tokenized URL that grants temporary access without authentication (for contractors) |
| Org | Organization — the multi-tenant boundary; each property management company is an org |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 2.0 | 2026-03-11 | Sam Barksdale + Claude | Initial v2 spec — full productionization |
