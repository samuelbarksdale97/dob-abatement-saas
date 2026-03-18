# DOB Abatement SaaS — Comprehensive QA Testing Plan

## Context

The DOB Abatement SaaS is a multi-tenant violation management platform for DC housing code enforcement. It handles the full lifecycle: NOI PDF parsing → property/unit auto-linking → contractor assignment → photo upload/verification → submission PDF generation → DOB response tracking.

**This QA plan** is designed as a handoff document for a QA developer (or another Claude instance) to execute systematically. It covers every user flow, API endpoint, database constraint, edge case, and integration point. Quality over speed — every case must be tested and bugs catalogued.

**Test credentials:** `sam@yokemgmt.com` / `TestPass123!`
**Dev server:** `PORT=3006 npm run dev` + `npx inngest-cli@latest dev -u http://localhost:3006/api/inngest`
**Supabase:** `https://njewqntaitsdwuzvgftq.supabase.co`
**Sample NOIs:** `docs/sample-nois/25NOIR-INS-07709_Owner_Email_45007.pdf` and `25NOIE-INS-05478_Owner_Email_43781.pdf`

---

## Pre-requisites: Implementation Before Testing

### Feature: Photo Verification Admin Toggle

Before running QA, implement an admin toggle that enables/disables AI angle verification for contractor photo uploads. This allows testing the full contractor flow without requiring real matching photos.

**Implementation plan:**

1. **Add `skip_photo_verification` to `organizations.settings` JSONB**
   - Default: `false` (verification enabled)
   - File: `supabase/migrations/011_photo_verification_toggle.sql`
   ```sql
   -- No schema change needed; organizations.settings is already JSONB
   -- Just document the key: settings.skip_photo_verification (boolean)
   ```

2. **Add Settings UI toggle**
   - File: [settings/page.tsx](src/app/(authenticated)/settings/page.tsx)
   - Add a new "QA / Testing" section or tab
   - Toggle switch: "Skip Photo Angle Verification"
   - Warning text: "When enabled, all contractor photo uploads are auto-approved without AI verification. Use only for testing."
   - API call: `PATCH /api/settings` with `{ skip_photo_verification: true/false }`

3. **Create settings API endpoint**
   - File: `src/app/api/settings/route.ts` (new)
   - `GET /api/settings` → returns org settings
   - `PATCH /api/settings` → updates org settings (OWNER/ADMIN only)
   - Reads/writes `organizations.settings` JSONB

4. **Modify photo verification to check toggle**
   - File: [contractor/[token]/photos/verify/route.ts](src/app/api/contractor/[token]/photos/verify/route.ts)
   - Before calling Gemini Vision, check org's `skip_photo_verification` setting
   - If `true`: auto-approve with `metadata.verification = { isMatch: true, confidence: 100, reasoning: "QA mode: verification skipped", details: "Photo auto-approved via admin toggle", skipped: true }`
   - Set photo status to `APPROVED`
   - Still trigger auto-progression logic (if all AFTER photos approved → READY_FOR_SUBMISSION)

5. **Modify contractor portal to still trigger verify endpoint**
   - File: [photo-upload-slot.tsx](src/components/contractor/photo-upload-slot.tsx)
   - No changes needed — the upload flow already calls verify. The toggle is server-side only.

**Critical files:**
- `src/app/api/contractor/[token]/photos/verify/route.ts` — Add toggle check before Gemini call
- `src/app/(authenticated)/settings/page.tsx` — Add toggle UI
- `src/app/api/settings/route.ts` — New endpoint for org settings CRUD
- `src/lib/ai/gemini.ts` — No changes (toggle is in the route, not the AI lib)

---

## Part 1: Test Environment Setup

### 1.1 Local Environment Checklist

| Step | Command / Action | Expected Result |
|------|-----------------|-----------------|
| Clone & install | `cd dob-abatement-saas && npm install` | No errors |
| Env vars | Verify `.env.local` has: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `NEXT_PUBLIC_APP_URL` | All present |
| Start Next.js | `PORT=3006 npm run dev` | Server on `http://localhost:3006` |
| Start Inngest | `npx inngest-cli@latest dev -u http://localhost:3006/api/inngest` | Inngest dashboard at `http://localhost:8288` |
| Login | Navigate to `/login`, use `sam@yokemgmt.com` / `TestPass123!` | Redirect to `/dashboard` |
| Supabase access | Verify service role key works: `curl -s "https://njewqntaitsdwuzvgftq.supabase.co/rest/v1/violations?select=id&limit=1" -H 'apikey: <ANON_KEY>' -H 'Authorization: Bearer <ANON_KEY>'` | Returns JSON array |

### 1.2 Test Data Baseline

Before each test run, document the current state:

```sql
-- Run via Supabase SQL Editor or REST API
SELECT COUNT(*) as total_violations FROM violations;
SELECT COUNT(*) as total_items FROM violation_items;
SELECT COUNT(*) as total_photos FROM photos;
SELECT COUNT(*) as total_work_orders FROM work_orders;
SELECT COUNT(*) as total_properties FROM properties;
SELECT COUNT(*) as total_units FROM units;
SELECT COUNT(*) as total_contacts FROM contacts;
```

### 1.3 Bug Report Template

For every bug found, log in this format:

```markdown
### BUG-[NNN]: [Short title]
- **Severity:** P0 (crash) / P1 (broken feature) / P2 (degraded) / P3 (cosmetic)
- **Area:** [Parse Pipeline | Contractor Portal | Dashboard | API | DB | UI]
- **Steps to Reproduce:**
  1. ...
  2. ...
  3. ...
- **Expected:** ...
- **Actual:** ...
- **Screenshot/Log:** [paste or attach]
- **File:** [file path:line number]
- **Notes:** ...
```

---

## Part 2: NOI Parse Pipeline (End-to-End)

This is the most critical flow. A single NOI PDF triggers a 7-step Inngest pipeline that creates all downstream data.

### Test 2.1: Upload & Parse Valid NOI PDF

**Precondition:** Logged in as `sam@yokemgmt.com`

| Step | Action | Expected | Verify |
|------|--------|----------|--------|
| 1 | Navigate to `/parse` | Upload zone displayed | Page loads without errors |
| 2 | Drag `25NOIR-INS-07709_Owner_Email_45007.pdf` onto upload zone | File accepted, upload starts | No console errors |
| 3 | Wait for upload to complete | Progress indicator appears | Inngest dashboard shows `noi/parse.requested` event |
| 4 | Watch parse progress | Steps show: init → ai-parse → insert-records → auto-link → analyze-pages → match-photos → mark-complete | Each step transitions from pending → running → completed |
| 5 | Parse completes | Results page shows extracted data | Status badge shows "Parsed" |

**Data Verification (after parse completes):**

```sql
-- 1. Violation created with correct notice-level data
SELECT id, notice_id, respondent, infraction_address, date_of_service,
       total_fines, status, priority, abatement_deadline, property_id, unit_id,
       parse_status, source
FROM violations
WHERE notice_id = '25NOIR-INS-07709';
-- Expected: status='PARSED', parse_status='completed', source='parser'
-- Expected: property_id IS NOT NULL (auto-linked)
-- Expected: unit_id IS NOT NULL (if address contains unit number)

-- 2. Violation items created
SELECT id, item_number, violation_code, priority, fine,
       violation_description, specific_location, floor_number,
       task_description
FROM violation_items
WHERE violation_id = '<id from above>'
ORDER BY item_number;
-- Expected: Multiple items with codes like "12-G DCMR § 309.1"
-- Expected: Each has violation_description, specific_location
-- Expected: task_description populated (from Notes section)

-- 3. Photos (INSPECTOR) extracted from PDF
SELECT id, photo_type, page_number, matched_violation_code, status
FROM photos
WHERE violation_id = '<id>' AND photo_type = 'INSPECTOR'
ORDER BY page_number;
-- Expected: status='APPROVED' (inspector photos auto-approved)
-- Expected: matched_violation_code populated for evidence pages

-- 4. Property auto-linked or created
SELECT id, address, city, state FROM properties WHERE id = '<property_id>';
-- Expected: Address matches NOI infraction_address (normalized)

-- 5. Unit auto-linked or created (if applicable)
SELECT id, unit_number, property_id FROM units WHERE id = '<unit_id>';
-- Expected: unit_number extracted from address (e.g., "103")

-- 6. Parse metadata has cost tracking
SELECT parse_metadata->'costs' as costs,
       parse_metadata->'gemini_meta'->'work_order_count' as item_count,
       parse_metadata->'gemini_meta'->'validation' as validation
FROM violations WHERE notice_id = '25NOIR-INS-07709';
-- Expected: costs.total_usd > 0
-- Expected: validation shows all checks = true
```

**Inngest Dashboard Verification:**
- Open `http://localhost:8288`
- Find the `noi/parse.requested` event
- Click into the function run
- Verify all steps completed successfully
- Check step durations (AI steps should be <30s each)
- Check for any warnings in step outputs

### Test 2.2: Upload Second NOI (Different Property)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Upload `25NOIE-INS-05478_Owner_Email_43781.pdf` | Parse starts |
| 2 | Wait for completion | New violation created |
| 3 | Check property linking | Either matches existing property or creates new one |
| 4 | Navigate to `/dashboard` | Both properties visible with correct violation counts |

### Test 2.3: Duplicate NOI Detection

| Step | Action | Expected |
|------|--------|----------|
| 1 | Re-upload `25NOIR-INS-07709_Owner_Email_45007.pdf` | Parse starts |
| 2 | Check parse_metadata after completion | `duplicate_detected: true`, `duplicate_violation_id` populated |
| 3 | Verify original violation unchanged | Original items/photos not modified |
| 4 | Verify new violation created | Separate violation record with same notice_id |

### Test 2.4: Parse Pipeline Idempotency

| Step | Action | Expected |
|------|--------|----------|
| 1 | Note violation_items count for a violation | e.g., 5 items |
| 2 | Manually re-trigger Inngest event (via dashboard) | Pipeline runs again |
| 3 | Check violation_items count after | Still 5 items (not 10) — old deleted, new inserted |
| 4 | Check INSPECTOR photos count | Same count — old deleted, new inserted |

### Test 2.5: Parse Pipeline Failure Handling

| Step | Action | Expected |
|------|--------|----------|
| 1 | Upload a non-PDF file (rename .txt to .pdf) | Parse should fail gracefully |
| 2 | Check violation status | `parse_status = 'failed'`, status reverted to `NEW` |
| 3 | Check parse_metadata | Error message logged with step that failed |
| 4 | Check Inngest dashboard | Function shows as failed with error details |

### Test 2.6: Parse Metadata & Cost Tracking

| Step | Action | Expected |
|------|--------|----------|
| 1 | After any successful parse, query parse_metadata | Full metadata present |
| 2 | Check `costs.ai_parse` | `prompt_tokens > 0`, `output_tokens > 0`, `cost_usd > 0` |
| 3 | Check `costs.analyze_pages` | Same structure with costs |
| 4 | Check `costs.total_usd` | Sum of ai_parse + analyze_pages costs |
| 5 | Check `gemini_meta.validation` | All validation flags should be `true` for valid PDFs |

### Test 2.7: Address Normalization & Auto-Linking

| Step | Action | Expected |
|------|--------|----------|
| 1 | Parse NOI with address "557 LEBAUM ST SE, Unit:103" | Property created/matched |
| 2 | Check property address | Normalized: "557 LEBAUM ST SE" (without unit) |
| 3 | Check unit | Created with unit_number "103" |
| 4 | Parse another NOI for same address but "Unit:300" | Same property, new unit created |
| 5 | Both violations linked to same property | `property_id` matches |
| 6 | Different `unit_id` values | Each linked to respective unit |

---

## Part 3: Navigation Hierarchy (Portfolio → Property → Unit → Violation)

### Test 3.1: Portfolio Home (`/dashboard`)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to `/dashboard` | Portfolio home loads |
| 2 | Stats bar | Shows: Total Open, Overdue count, Due in 10 Days, P1 count, Total Fines |
| 3 | Property cards | Each card shows: address, violation count, total fines, urgency badge |
| 4 | Sort order | Properties with overdue/P1 violations appear first |
| 5 | Click property card | Navigates to `/properties/[id]` |
| 6 | Real-time update | Open second tab, change a violation status → first tab updates within 2s |
| 7 | Empty state (new org) | Shows "Add Your First Property" CTA |

### Test 3.2: Property Detail (`/properties/[id]`)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to property | Page loads with breadcrumb: Portfolio > [Address] |
| 2 | Stats cards | Total Violations count matches actual, Total Fines matches sum, Unlinked count correct |
| 3 | Units grid | Each unit card shows: unit#, vacant/occupied badge, violation count, worst status |
| 4 | Unit violation counts | Match actual violations linked to each unit |
| 5 | Worst status badge | Shows the "earliest" (most urgent) status among unit's violations |
| 6 | Click unit card | Navigates to `/properties/[id]/units/[unitId]` |
| 7 | "Add Unit" button | Visible (test that it works if implemented) |

### Test 3.3: Unit Detail (`/properties/[id]/units/[unitId]`)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to unit | Page loads with breadcrumb: Portfolio > Property > Unit |
| 2 | Health bar | Shows 4-phase colored bar (Intake/Active/Submission/Resolution) |
| 3 | Violations grouped | "Needs Your Action" section shows actionable violations |
| 4 | "In Progress" section | Shows ASSIGNED, IN_PROGRESS violations |
| 5 | "Not Started / Resolved" | Collapsed if > 3 items |
| 6 | Overdue banner | Red attention banner if any violation is past deadline |
| 7 | Click violation | Navigates to `/dashboard/[violationId]` |
| 8 | Empty unit | Shows appropriate empty state message |

### Test 3.4: Violation Detail (`/dashboard/[id]`)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to violation | Page loads with header: Notice ID, address, status badge, priority |
| 2 | Metric cards | Total Fines, Deadline (with urgency color), Item count, Photo count |
| 3 | Items tab | Lists all violation items with: number, code, priority, description, location |
| 4 | Photos tab | Groups photos by violation item; shows INSPECTOR + AFTER pairs |
| 5 | Activity tab | Shows audit log entries for this violation |
| 6 | Status action buttons | Shows valid next statuses based on current state |
| 7 | Work order section | If assigned: shows contractor info, status, progress bar |
| 8 | Real-time updates | Change status in another tab → page updates within 1s |

### Test 3.5: Cross-Navigation Consistency

| Step | Action | Expected |
|------|--------|----------|
| 1 | Portfolio shows "5 violations" for a property | Property detail shows same 5 |
| 2 | Property shows "3 violations" for Unit 103 | Unit detail shows same 3 |
| 3 | Change violation status from NEW to ASSIGNED | Portfolio card updates, unit card updates, violation detail updates |
| 4 | Parse new NOI for existing property | Portfolio violation count increments, property unit list may add new unit |

---

## Part 4: Contractor Assignment & Portal

### Test 4.1: Assign Work Order

**Precondition:** At least one violation in `PARSED` status

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open violation detail (`/dashboard/[id]`) | Status is PARSED |
| 2 | Click "Assign Contractor" button | Dialog opens |
| 3 | Fill contractor details (name, email, phone) | Fields accept input |
| 4 | Set due date | Date picker works |
| 5 | Add notes | Free text field |
| 6 | Submit | Dialog closes, violation status → ASSIGNED |

**Data Verification:**

```sql
-- Work order created
SELECT id, violation_id, contractor_name, contractor_email, status, due_date, notes
FROM work_orders WHERE violation_id = '<id>';
-- Expected: status='ASSIGNED'

-- Contractor token created
SELECT id, token, contractor_name, contractor_email, expires_at, revoked_at
FROM contractor_tokens WHERE work_order_id = '<work_order_id>';
-- Expected: revoked_at IS NULL, expires_at > now()

-- Contractor registry updated
SELECT name, email, total_assignments, last_assigned_at
FROM contractors WHERE email = '<contractor_email>';
-- Expected: total_assignments incremented
```

### Test 4.2: Contractor Portal — Token Validation

| Step | Action | Expected |
|------|--------|----------|
| 1 | Copy magic link URL from work order | Format: `/contractor/[token]` |
| 2 | Open in incognito browser (no auth) | Work order page loads |
| 3 | Verify work order data displayed | Violation details, items, inspector photos visible |
| 4 | Open with invalid token | Error: "Invalid or expired access link" |
| 5 | Revoke token (via Supabase), then access | Error: "Invalid or expired access link" |
| 6 | Set token `expires_at` to past | Error: "Invalid or expired access link" |

### Test 4.3: Contractor Portal — Photo Upload Flow

**Precondition:** Valid contractor token, work order status ASSIGNED or IN_PROGRESS

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open contractor portal | See all violation items listed |
| 2 | Click "Start Work" (if status is ASSIGNED) | Status changes to IN_PROGRESS |
| 3 | For first item: see inspector photo (BEFORE) | PDF-rendered image visible |
| 4 | Click "Upload After Photo" slot | File picker opens |
| 5 | Select JPEG < 10MB | Upload starts, progress shown |
| 6 | Upload completes | Photo thumbnail appears, verification triggers |
| 7 | Verification result | Confidence badge shown (green if ≥80%, orange if <80%) |
| 8 | Repeat for all items | Photo count updates (e.g., "3/5 Photos Uploaded") |

### Test 4.4: Photo Upload Validation

| Step | Action | Expected |
|------|--------|----------|
| 1 | Upload file > 10MB | Error: file too large |
| 2 | Upload .txt file | Error: invalid file type |
| 3 | Upload .gif file | Error: invalid file type |
| 4 | Upload valid JPEG | Success |
| 5 | Upload valid PNG | Success |
| 6 | Upload valid WebP | Success |
| 7 | Upload valid HEIC | Success |
| 8 | Upload to wrong violation_item_id | Error: item doesn't belong to work order |

### Test 4.5: Photo Verification (AI Angle Matching)

**Note:** These tests require the verification toggle feature. Run with toggle OFF first, then ON.

**Toggle OFF (Verification Enabled):**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Upload AFTER photo from similar angle | Gemini returns confidence ≥ 80%, status → APPROVED |
| 2 | Upload AFTER photo from very different angle | Confidence < 80%, status → PENDING_REVIEW |
| 3 | Upload random unrelated photo | Confidence very low, status → PENDING_REVIEW |
| 4 | Check photo metadata | `metadata.verification` contains: isMatch, confidence, reasoning, details, verified_at, model, cost_usd |
| 5 | Check rejection_reason | Present for rejected photos: "AI angle verification: XX% confidence — [reasoning]" |

**Toggle ON (Verification Skipped):**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Upload ANY photo | Status immediately → APPROVED |
| 2 | Check metadata | `metadata.verification.skipped = true`, confidence = 100 |
| 3 | No Gemini API call made | No cost logged for this verification |
| 4 | Auto-progression still works | When all AFTER photos approved → violation → READY_FOR_SUBMISSION |

### Test 4.6: Auto-Progression (All Photos Approved)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Violation has 3 items, each needing AFTER photo | Status: AWAITING_PHOTOS |
| 2 | Upload + approve AFTER for item 1 | Status remains AWAITING_PHOTOS |
| 3 | Upload + approve AFTER for item 2 | Status remains AWAITING_PHOTOS |
| 4 | Upload + approve AFTER for item 3 | Status auto-advances to READY_FOR_SUBMISSION |
| 5 | Check violation status in dashboard | Shows READY_FOR_SUBMISSION |

### Test 4.7: Contractor Portal — Mark Complete

| Step | Action | Expected |
|------|--------|----------|
| 1 | All AFTER photos uploaded for all items | "Mark Complete" button becomes enabled |
| 2 | Click "Mark Complete" | Work order status → COMPLETED |
| 3 | Button disabled after click | Cannot double-submit |
| 4 | Page shows completion state | Thank you / confirmation message |

### Test 4.8: Work Order Status Transitions

| Step | Action | Expected |
|------|--------|----------|
| 1 | New work order | Status: ASSIGNED |
| 2 | Contractor clicks "Start Work" | Status: IN_PROGRESS |
| 3 | Contractor uploads all photos + marks complete | Status: COMPLETED |
| 4 | Cancel work order (from PM side) | Status: CANCELLED, violation reverts to PARSED |

---

## Part 5: Violation Status Workflow (Full Lifecycle)

### Test 5.1: Complete Happy Path

Walk through the entire lifecycle for a single violation:

| Step | Status Transition | Action | Verify |
|------|------------------|--------|--------|
| 1 | → NEW | Upload NOI PDF | Violation created with status NEW |
| 2 | NEW → PARSING | Inngest pipeline starts | Status changes to PARSING |
| 3 | PARSING → PARSED | Pipeline completes | Items, photos, property linked |
| 4 | PARSED → ASSIGNED | Assign contractor | Work order + token created |
| 5 | ASSIGNED → IN_PROGRESS | Contractor starts work | Work order IN_PROGRESS |
| 6 | IN_PROGRESS → AWAITING_PHOTOS | (auto or manual) | Ready for photo evidence |
| 7 | AWAITING_PHOTOS → PHOTOS_UPLOADED | All AFTER photos uploaded | Via contractor portal |
| 8 | PHOTOS_UPLOADED → READY_FOR_SUBMISSION | All photos approved | Auto or manual |
| 9 | READY_FOR_SUBMISSION → SUBMITTED | PM generates + submits PDF | Submission record created |
| 10 | SUBMITTED → APPROVED | DOB accepts | Record DOB response |
| 11 | APPROVED → CLOSED | PM closes case | Terminal state |

### Test 5.2: Invalid Status Transitions

For each pair, attempt the transition and verify it's blocked:

| From | Invalid To | Expected |
|------|-----------|----------|
| NEW | IN_PROGRESS | Blocked (must go through ASSIGNED) |
| NEW | SUBMITTED | Blocked |
| PARSED | IN_PROGRESS | Blocked (must assign first) |
| ASSIGNED | AWAITING_PHOTOS | Blocked (must be IN_PROGRESS first) |
| SUBMITTED | IN_PROGRESS | Blocked (must go through REJECTED) |
| CLOSED | anything | Blocked (terminal) |
| APPROVED | IN_PROGRESS | Blocked (must close) |

**Verify using:** `canTransition()` from `src/lib/status-transitions.ts` and API behavior.

### Test 5.3: Rejection & Re-work Flow

| Step | Action | Expected |
|------|--------|----------|
| 1 | Violation at SUBMITTED | Status is SUBMITTED |
| 2 | DOB rejects | Status → REJECTED |
| 3 | PM re-assigns work | Status → IN_PROGRESS |
| 4 | Contractor re-does photos | Flow continues from step 6 of happy path |
| 5 | Re-submit | Status → SUBMITTED again |

### Test 5.4: Additional Info Requested Flow

| Step | Action | Expected |
|------|--------|----------|
| 1 | Violation at SUBMITTED | Status is SUBMITTED |
| 2 | DOB requests more info | Status → ADDITIONAL_INFO_REQUESTED |
| 3 | PM sends to AWAITING_PHOTOS | Status → AWAITING_PHOTOS |
| 4 | OR PM sends to IN_PROGRESS | Status → IN_PROGRESS |
| 5 | Contractor provides new evidence | Flow continues |

---

## Part 6: Dashboard & Violations List

### Test 6.1: Violations List Page (`/violations`)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to `/violations` | Table loads with all violations |
| 2 | Filter by status (e.g., PARSED) | Only PARSED violations shown |
| 3 | Filter by priority (P1) | Only P1 violations shown |
| 4 | Search by notice_id | Matching violations shown |
| 5 | Search by address | Matching violations shown |
| 6 | Search by respondent | Matching violations shown |
| 7 | Sort by deadline ascending | Earliest deadlines first |
| 8 | Sort by fines descending | Highest fines first |
| 9 | Pagination | Navigate pages, counts correct |
| 10 | "Needs attention" filter | Shows: overdue OR P1 OR early-stage |
| 11 | Combined filters | Status + priority + search all work together |
| 12 | Clear all filters | Full list returns |

### Test 6.2: Stats Panel

| Step | Action | Expected |
|------|--------|----------|
| 1 | Check total count | Matches `SELECT COUNT(*) FROM violations WHERE org_id = ...` |
| 2 | Check by-status counts | Each status count matches DB |
| 3 | Check P1/P2/P3 counts | Match DB priority distribution |
| 4 | Check overdue count | Violations with `abatement_deadline < today` and not CLOSED/APPROVED |
| 5 | Check total fines | Sum matches `SELECT SUM(total_fines) FROM violations` |

### Test 6.3: Real-time Updates

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `/violations` in tab A | Table displayed |
| 2 | In tab B, change a violation status | Tab A updates within 2 seconds |
| 3 | In tab B, parse new NOI | Tab A shows new violation within 2 seconds |
| 4 | Rapid changes (5 in 1 second) | Tab A does NOT fire 5 API calls (debounced to 1) |

---

## Part 7: Submission & PDF Generation

### Test 7.1: Generate Submission PDF

**Precondition:** Violation at READY_FOR_SUBMISSION with all photos approved

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open violation detail | "Generate Submission PDF" button visible |
| 2 | Click generate | PDF generation starts |
| 3 | PDF created | Download link appears |
| 4 | Open PDF | Contains: violation details, before/after photo pairs, item descriptions |
| 5 | Check submission record | `submissions` table has new row with `document_storage_path` |

### Test 7.2: Submit to DOB

| Step | Action | Expected |
|------|--------|----------|
| 1 | After PDF generated | "Submit" button available |
| 2 | Click submit | Violation status → SUBMITTED |
| 3 | Enter confirmation number | Stored in `submissions.confirmation_number` |
| 4 | Record DOB response (Approved) | Violation → APPROVED, submission → APPROVED |
| 5 | Record DOB response (Rejected) | Violation → REJECTED, submission → REJECTED |

### Test 7.3: Submission History

| Step | Action | Expected |
|------|--------|----------|
| 1 | Submit violation, get rejected, re-submit | Two submission records |
| 2 | Check submissions tab | Both submissions visible with statuses |
| 3 | Each has PDF link | Both PDFs downloadable |

---

## Part 8: Contacts System

### Test 8.1: Contact CRUD

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to `/contacts` | Contact list page loads |
| 2 | Click "Add Contact" | Dialog opens |
| 3 | Fill: name, email, phone, company, category=CONTRACTOR | All fields accept input |
| 4 | Submit | Contact created, appears in list |
| 5 | Click contact | Detail page loads at `/contacts/[id]` |
| 6 | Edit contact (change phone) | Updates saved |
| 7 | Delete contact | Removed from list |

### Test 8.2: Contact Categories & Search

| Step | Action | Expected |
|------|--------|----------|
| 1 | Create contacts in different categories | CONTRACTOR, GOVERNMENT, TENANT |
| 2 | Filter by CONTRACTOR | Only contractors shown |
| 3 | Search by name | Matching contacts returned |
| 4 | Search by email | Matching contacts returned |
| 5 | Clear filters | All contacts visible |

### Test 8.3: Contact Interactions

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open contact detail | Timeline tab visible |
| 2 | Click "Log Interaction" | Modal opens |
| 3 | Fill: type=PHONE_CALL, subject, details | Fields accept input |
| 4 | Submit | Interaction appears in timeline |
| 5 | Check contact record | `last_interaction_at` updated, `total_interactions` incremented |

### Test 8.4: Contact Entity Linking

| Step | Action | Expected |
|------|--------|----------|
| 1 | Link contact to a property | Link created |
| 2 | Link contact to a violation | Link created |
| 3 | Check contact detail | "Linked Entities" tab shows both |
| 4 | Unlink entity | Link removed |

---

## Part 9: Settings & Configuration

### Test 9.1: Gmail Integration

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to `/settings` | Gmail tab visible |
| 2 | Click "Connect Gmail" | Redirects to Google OAuth |
| 3 | Complete OAuth | Returns to settings with "Connected" status |
| 4 | Toggle auto-sync ON | Setting saved |
| 5 | Click "Sync Now" | Manual sync runs, shows results |
| 6 | Disconnect | Connection removed, status shows disconnected |

### Test 9.2: Team Management

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to Settings > Team tab | Member list visible |
| 2 | Current user shown as OWNER | Correct role displayed |
| 3 | Click "Invite Member" | Dialog opens |
| 4 | Enter email + select role | Invitation created |
| 5 | Check invitations table | New row with token, expires_at |
| 6 | Change member role | Role updated in profiles table |

### Test 9.3: Notification Preferences

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to Settings > Notifications tab | Toggle switches visible |
| 2 | Toggle "Deadline Alerts" OFF | Setting saved to `profiles.settings` JSONB |
| 3 | Toggle back ON | Setting updated |
| 4 | Check DB | `profiles.settings.email_deadline_alerts = true` |

### Test 9.4: Photo Verification Toggle (New Feature)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to Settings > QA/Testing section | Toggle visible |
| 2 | Default state | Toggle OFF (verification enabled) |
| 3 | Turn toggle ON | Warning text shown, setting saved |
| 4 | Check DB | `organizations.settings.skip_photo_verification = true` |
| 5 | Upload contractor photo | Auto-approved without Gemini call |
| 6 | Turn toggle OFF | Verification re-enabled |
| 7 | Upload contractor photo | Gemini verification runs |

---

## Part 10: API Endpoint Testing

### Test 10.1: Authentication & Authorization

| Endpoint | No Auth | Wrong Org | Contractor Role | PM Role | Owner Role |
|----------|---------|-----------|-----------------|---------|------------|
| GET /api/violations | 401 | Empty [] | Own assigned | All org | All org |
| PATCH /api/violations | 401 | 403 | 403 | 200 | 200 |
| POST /api/work-orders | 401 | 403 | 403 | 200 | 200 |
| GET /api/properties | 401 | Empty [] | All org | All org | All org |
| POST /api/properties | 401 | 403 | 403 | 200 | 200 |
| GET /api/contacts | 401 | Empty [] | All org | All org | All org |
| POST /api/contacts | 401 | 403 | 403 | 200 | 200 |
| GET /api/team | 401 | Empty [] | 403 | 200 | 200 |
| POST /api/team/invite | 401 | 403 | 403 | 403 | 200 |
| PATCH /api/settings | 401 | 403 | 403 | 403 | 200 |

### Test 10.2: Contractor Token Routes

| Endpoint | Invalid Token | Expired Token | Revoked Token | Valid Token |
|----------|--------------|---------------|---------------|-------------|
| GET /api/contractor/[token] | 401 | 401 | 401 | 200 |
| PATCH /api/contractor/[token]/status | 401 | 401 | 401 | 200 |
| POST /api/contractor/[token]/photos | 401 | 401 | 401 | 200 |
| POST /api/contractor/[token]/photos/verify | 401 | 401 | 401 | 200 |

### Test 10.3: Property & Unit CRUD

| Test | Request | Expected |
|------|---------|----------|
| Create property | POST /api/properties `{ address, city, state }` | 201, property returned |
| Create property (no address) | POST /api/properties `{ city, state }` | 400, "address required" |
| Create unit | POST /api/properties/[id]/units `{ unit_number }` | 201, unit returned |
| Create duplicate unit | POST same unit_number | 409, "already exists" |
| Update property | PATCH /api/properties/[id] `{ notes: "test" }` | 200, updated |
| Get property with stats | GET /api/properties/[id] | Has total_violations, total_fines, unlinked_violations |
| Get units with enrichment | GET /api/properties/[id]/units | Each unit has violation_count, worst_status |

### Test 10.4: Violations API Filtering

| Filter | Query | Expected |
|--------|-------|----------|
| Single status | `?status=PARSED` | Only PARSED |
| Multi-status | `?statuses=PARSED,ASSIGNED` | Both statuses |
| Priority | `?priority=1` | Only P1 |
| Property | `?property_id=uuid` | Only that property |
| Unit | `?unit_id=uuid` | Only that unit |
| Date range | `?date_from=2026-01-01&date_to=2026-12-31` | Within range |
| Search | `?search=LEBAUM` | Address match |
| Needs attention | `?needs_attention=true` | Overdue + P1 + early-stage |
| Pagination | `?page=2&pageSize=5` | Correct offset, total pages |
| Sort | `?sortBy=total_fines&sortDir=desc` | Highest fines first |

---

## Part 11: Database Integrity

### Test 11.1: RLS Policy Verification

| Test | Action | Expected |
|------|--------|----------|
| 1 | Query violations with User A's token | Only org A violations returned |
| 2 | Query violations with User B's token | Only org B violations returned |
| 3 | Try to INSERT violation with wrong org_id | RLS blocks (permission denied) |
| 4 | Try to UPDATE violation from another org | RLS blocks |
| 5 | Service role key bypasses RLS | Full access (for admin tasks only) |

### Test 11.2: Foreign Key Constraints

| Test | Action | Expected |
|------|--------|----------|
| 1 | Insert violation_item with invalid violation_id | FK error |
| 2 | Insert photo with invalid violation_id | FK error |
| 3 | Insert work_order with invalid violation_id | FK error |
| 4 | Insert unit with invalid property_id | FK error |
| 5 | Delete property with units | Depends on CASCADE setting |

### Test 11.3: Unique Constraints

| Test | Action | Expected |
|------|--------|----------|
| 1 | Create two units with same property_id + unit_number | 23505 unique violation |
| 2 | Create two contractors with same org_id + email | 23505 unique violation |
| 3 | Create two contacts with same org_id + email | 23505 unique violation |
| 4 | Create two contractor_tokens with same token value | Unique violation |

### Test 11.4: Triggers & Auto-Updates

| Test | Action | Expected |
|------|--------|----------|
| 1 | Update any record | `updated_at` auto-updated |
| 2 | Change violation status | Audit log entry created with old/new values |
| 3 | Insert AFTER photo (all items covered) | `auto_progress_photo_status()` fires |
| 4 | Add contact interaction | Contact's `last_interaction_at` and `total_interactions` updated |

---

## Part 12: Edge Cases & Error Scenarios

### Test 12.1: Empty States

| Page | Condition | Expected |
|------|-----------|----------|
| `/dashboard` | No properties | "Add Your First Property" CTA |
| `/properties/[id]` | Property with no units | "No units yet" message |
| `/properties/[id]/units/[id]` | Unit with no violations | "No violations found" message |
| `/violations` | No violations match filter | "No violations match your filters" |
| `/contacts` | No contacts | "Add your first contact" CTA |
| `/dashboard/[id]` Items tab | No violation items | "No items parsed" message |
| `/dashboard/[id]` Photos tab | No photos | "No photos yet" message |

### Test 12.2: Concurrent Operations

| Test | Action | Expected |
|------|--------|----------|
| 1 | Two users update same violation simultaneously | Last write wins (no crash) |
| 2 | Parse same PDF in two browser tabs | Two violations created (duplicate detection flags it) |
| 3 | Two contractors upload photos at same time | Both succeed, no data corruption |

### Test 12.3: Large Data Sets

| Test | Action | Expected |
|------|--------|----------|
| 1 | Property with 50+ violations | Page loads without timeout |
| 2 | Violation with 20+ items | All items displayed, scrollable |
| 3 | 100+ contacts list | Pagination works |
| 4 | Search across 1000+ violations | Returns within 2 seconds |

### Test 12.4: Network & Error Handling

| Test | Action | Expected |
|------|--------|----------|
| 1 | API returns 500 | User sees error message (not blank page) |
| 2 | Supabase connection drops | Graceful degradation |
| 3 | Inngest function fails | Retries up to 2x, then marks as failed |
| 4 | Gemini API rate limit | Parse fails gracefully with error in parse_metadata |
| 5 | Storage upload fails | Photo upload shows error, can retry |
| 6 | Expired Supabase session | Redirects to login |

### Test 12.5: Data Validation

| Test | Input | Expected |
|------|-------|----------|
| 1 | Violation with $0 fines | Accepted, displays correctly |
| 2 | Violation with no deadline | Accepted, urgency shows "N/A" |
| 3 | Unit number with special chars ("1A", "PH-1") | Accepted |
| 4 | Very long address (200+ chars) | Accepted, truncated in UI if needed |
| 5 | Email with unicode | Rejected or sanitized |
| 6 | Phone number in various formats | Accepted |
| 7 | XSS in text fields (`<script>alert(1)</script>`) | Escaped, not executed |
| 8 | SQL injection in search (`'; DROP TABLE violations;--`) | Sanitized, no effect |

---

## Part 13: CSV Import

### Test 13.1: Valid CSV Import

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to `/import` | Upload zone displayed |
| 2 | Upload CSV with correct columns | Preview table shown |
| 3 | Verify column mapping | Columns auto-detected |
| 4 | Click Import | Violations created |
| 5 | Check violations list | New violations with source='csv_import' |

### Test 13.2: CSV Edge Cases

| Test | Input | Expected |
|------|-------|----------|
| 1 | CSV with missing required columns | Error: "notice_id required" |
| 2 | CSV with extra columns | Ignored, import succeeds |
| 3 | CSV with empty rows | Skipped |
| 4 | CSV with duplicate notice_ids | All imported (duplicates flagged) |
| 5 | CSV with 500+ rows | Bulk import succeeds |
| 6 | CSV with alternate column names ("noi_number") | Auto-mapped to notice_id |

---

## Part 14: Analytics

### Test 14.1: Analytics Page (`/analytics`)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to `/analytics` | Charts load |
| 2 | Check KPI cards | Avg resolution time, approval rate, total fines, opened vs closed |
| 3 | Change date range | Charts update |
| 4 | Filter by property | Data scoped to property |
| 5 | Verify counts match violations page | Total fines consistent |

---

## Part 15: Mobile Responsiveness

### Test 15.1: Responsive Layout

Test each page at these breakpoints: 375px (mobile), 768px (tablet), 1024px (desktop), 1440px (wide)

| Page | Mobile | Tablet | Desktop |
|------|--------|--------|---------|
| `/dashboard` | Cards stack 1-col | Cards 2-col | Cards 3-col |
| `/violations` | Table scrolls horizontally | Table fits | Table fits |
| `/dashboard/[id]` | Tabs stack | Side-by-side | Full layout |
| `/contractor/[token]` | Photo slots stack | 2-col grid | Full layout |
| Sidebar | Collapsed/hamburger | Collapsed | Expanded |

---

## Part 16: Notification System

### Test 16.1: Notification Bell

| Step | Action | Expected |
|------|--------|----------|
| 1 | Check notification bell in top nav | Shows unread count badge |
| 2 | Click bell | Dropdown with notification list |
| 3 | Click notification | Navigates to linked page |
| 4 | Click "Mark All Read" | All notifications marked read, badge clears |
| 5 | New status change triggers notification | Count increments |

### Test 16.2: Deadline Notifications

| Step | Action | Expected |
|------|--------|----------|
| 1 | Violation with deadline in 3 days | "Urgent" notification created |
| 2 | Violation with deadline in 10 days | "Warning" notification created |
| 3 | Violation past deadline | "Overdue" notification created |
| 4 | Notification preferences OFF | No notification created |

---

## Part 17: Audit Trail

### Test 17.1: Status Change Logging

| Step | Action | Expected |
|------|--------|----------|
| 1 | Change violation from PARSED → ASSIGNED | Audit log entry created |
| 2 | Check audit_log | `table_name='violations'`, `action='STATUS_CHANGE'` |
| 3 | Check old_values | Contains previous status |
| 4 | Check new_values | Contains new status |
| 5 | Check changed_by | User ID of person who made change |
| 6 | Activity tab in violation detail | Shows human-readable log |

---

## Part 18: Security Testing

### Test 18.1: Authentication

| Test | Action | Expected |
|------|--------|----------|
| 1 | Access `/dashboard` without login | Redirect to `/login` |
| 2 | Access `/api/violations` without auth header | 401 |
| 3 | Access with expired JWT | 401, redirect to login |
| 4 | Access contractor portal with valid token | 200 (no Supabase auth needed) |
| 5 | Contractor token cannot access admin routes | 401 |

### Test 18.2: Input Sanitization

| Test | Input | Expected |
|------|-------|----------|
| 1 | XSS in violation notes | Rendered as text, not HTML |
| 2 | SQL injection in search params | Parameterized query, no injection |
| 3 | Path traversal in file upload name | Sanitized filename |
| 4 | Oversized request body (100MB) | Rejected by server |

### Test 18.3: Multi-Tenant Isolation

| Test | Action | Expected |
|------|--------|----------|
| 1 | User A queries User B's violation by ID | Empty result (RLS blocks) |
| 2 | User A uses User B's contractor token | Token validation includes org check |
| 3 | User A accesses User B's property detail | 404 or empty |
| 4 | API doesn't leak org_id in error messages | Generic error messages |

---

## Execution Sequence

Run tests in this order for maximum efficiency:

1. **Environment Setup** (Part 1) — 15 min
2. **Parse Pipeline** (Part 2) — Creates test data for everything else — 30 min
3. **Navigation Hierarchy** (Part 3) — Uses parsed data — 20 min
4. **Contractor Assignment & Portal** (Part 4) — Needs parsed violations — 45 min
5. **Violation Lifecycle** (Part 5) — End-to-end status flow — 30 min
6. **Dashboard & Violations List** (Part 6) — With existing data — 20 min
7. **Submission & PDF** (Part 7) — Needs READY_FOR_SUBMISSION violation — 20 min
8. **Contacts** (Part 8) — Independent — 15 min
9. **Settings** (Part 9) — Independent — 15 min
10. **API Testing** (Part 10) — Systematic endpoint sweep — 30 min
11. **Database Integrity** (Part 11) — SQL-level checks — 20 min
12. **Edge Cases** (Part 12) — Stress testing — 20 min
13. **CSV Import** (Part 13) — Independent — 10 min
14. **Analytics** (Part 14) — Needs historical data — 10 min
15. **Mobile** (Part 15) — All pages — 15 min
16. **Notifications** (Part 16) — Needs status changes — 10 min
17. **Audit Trail** (Part 17) — Verify logging — 10 min
18. **Security** (Part 18) — Final sweep — 20 min

---

## Critical Files Reference

| Purpose | File Path |
|---------|-----------|
| Parse pipeline | `src/inngest/functions/parse-noi.ts` |
| Gemini AI integration | `src/lib/ai/gemini.ts` |
| Photo upload (contractor) | `src/app/api/contractor/[token]/photos/route.ts` |
| Photo verification | `src/app/api/contractor/[token]/photos/verify/route.ts` |
| Contractor portal UI | `src/app/contractor/[token]/page.tsx` |
| Photo upload component | `src/components/contractor/photo-upload-slot.tsx` |
| Violation detail | `src/app/(authenticated)/dashboard/[id]/page.tsx` |
| Dashboard / Portfolio | `src/app/(authenticated)/dashboard/page.tsx` |
| Violations list | `src/app/(authenticated)/violations/page.tsx` |
| Property detail | `src/app/(authenticated)/properties/[id]/page.tsx` |
| Unit detail | `src/app/(authenticated)/properties/[id]/units/[unitId]/page.tsx` |
| Settings | `src/app/(authenticated)/settings/page.tsx` |
| Status transitions | `src/lib/status-transitions.ts` |
| Type definitions | `src/lib/types.ts` |
| Work order API | `src/app/api/work-orders/route.ts` |
| Violations API | `src/app/api/violations/route.ts` |
| Properties API | `src/app/api/properties/[id]/route.ts` |
| Units API | `src/app/api/properties/[id]/units/route.ts` |
| Portfolio API | `src/app/api/portfolio/route.ts` |
| Stats API | `src/app/api/stats/route.ts` |
| Parse API | `src/app/api/parse/route.ts` |
| Contacts API | `src/app/api/contacts/route.ts` |
| DB schema | `supabase/migrations/001_initial_schema.sql` |
| Contractor portal schema | `supabase/migrations/002_contractor_portal.sql` |
| Units schema | `supabase/migrations/006_units_table.sql` |
| Contacts schema | `supabase/migrations/008_universal_contacts.sql` |
| Mock data | `src/test/helpers/mock-data.ts` |
| Sample NOIs | `docs/sample-nois/` |

---

## Verification: Definition of Done

All QA passes when:

- [ ] All 18 test parts executed with no P0 or P1 bugs remaining
- [ ] Full happy path (parse → navigate → assign → upload → verify → submit → close) works end-to-end
- [ ] Photo verification toggle works (both ON and OFF modes)
- [ ] Auto-progression triggers correctly (all photos approved → READY_FOR_SUBMISSION)
- [ ] All invalid status transitions are blocked
- [ ] RLS prevents cross-org data access
- [ ] Contractor portal works with magic link (no auth required)
- [ ] All API endpoints return correct status codes for auth/validation errors
- [ ] No XSS or SQL injection vulnerabilities
- [ ] Real-time updates work with debouncing (no server overload)
- [ ] Bug report generated with severity ratings for all issues found
