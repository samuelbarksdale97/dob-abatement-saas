# Gemini Agent Instructions — DOB Abatement SaaS

> This file is the Gemini-specific instruction set for working on the DOB Abatement SaaS project. It mirrors the core operating principles from CLAUDE.md but is tailored for Gemini's capabilities and your current mission: **design improvements**.

---

## Your Current Mission: Design Improvements

You are picking up where Claude (Opus 4.6) left off. Claude built the full v2 feature set (4 sprints, 72 files, 166 tests, QA-verified). The app is **functionally complete** — every feature works end-to-end. Your job is to make it **look and feel professional**.

The current UI is clean but minimal — white backgrounds, basic shadcn/ui components, no visual polish. Think of it as a wireframe that works. You need to turn it into something a property manager at Yoke Management would be proud to use daily.

---

## Project Context

**Active Codebase:** `/dob-abatement-saas/` (GitHub: https://github.com/samuelbarksdale97/dob-abatement-saas)
**Branch:** `feat/v2-productionization` (all v2 work is here — merge to `main` pending)
**Tech Stack:** Next.js 16.1.6 (App Router), React 19, Tailwind CSS 4, shadcn/ui, Supabase, Inngest, Recharts
**Design System:** shadcn/ui primitives (15+ components in `src/components/ui/`)

**DO THIS:**
- Start dev server: `cd dob-abatement-saas && PORT=3007 npm run dev`
- Reference `PROJECT_STATUS.md` for full architecture context
- Use test credentials: `sam@yokemgmt.com` / `TestPass123!`
- Work within the existing Tailwind + shadcn/ui system
- Read files before modifying them

**DO NOT DO THIS:**
- Never reference `dob-abatement-package-LEGACY/` — it's dead code
- Never install new CSS frameworks (no Material UI, Chakra, Ant Design, etc.)
- Never change the data model, API routes, or business logic — only touch presentation
- Never break existing functionality for aesthetics
- Never remove working features

---

## Current Design State

### Layout Structure
- **Sidebar** (`src/components/layout/sidebar.tsx`): 264px fixed, white bg, blue-600 accent, Lucide icons
- **Top Nav** (`src/components/layout/nav.tsx`): 64px fixed header with title + notification bell
- **Main Content**: `bg-gray-50`, scrollable
- **No dark mode**, no theme switching

### Color Palette (current)
- Primary: `blue-600` / `blue-700` (sidebar active, buttons)
- Background: `white` (cards, sidebar) / `gray-50` (content area)
- Text: `gray-900` (headings) / `gray-600` (secondary) / `gray-500` (muted)
- Status badges: hardcoded colors per status in `violation-table.tsx`
- Priority: red for urgent, orange for high, yellow for medium

### Typography
- Default Tailwind (system fonts)
- No custom fonts loaded
- Sizes: `text-sm` (most UI), `text-xl` (page titles), `text-lg` (sidebar brand)

### Component Inventory (what you're working with)
```
src/components/
├── ui/                              # shadcn/ui primitives (DO NOT modify internals)
│   ├── button.tsx, card.tsx, dialog.tsx, input.tsx, label.tsx
│   ├── select.tsx, tabs.tsx, badge.tsx, progress.tsx
│   ├── dropdown-menu.tsx, separator.tsx, textarea.tsx
│   └── alert-dialog.tsx, checkbox.tsx, switch.tsx
├── layout/
│   ├── sidebar.tsx                  # Left nav — 7 items + sign out
│   ├── nav.tsx                      # Top bar — title + notification bell
│   └── notification-bell.tsx        # Bell icon + dropdown
├── dashboard/
│   ├── violation-table.tsx          # Sortable table
│   ├── stats-panel.tsx              # Summary cards
│   ├── filter-sidebar.tsx           # Filters (status, priority, property, dates, needs-attention)
│   ├── property-card.tsx            # Portfolio home cards
│   ├── submission-tab.tsx           # DOB submission tracking
│   └── alert-banner.tsx             # Deadline alerts
├── parser/
│   ├── upload-zone.tsx              # Drag-and-drop PDF upload
│   ├── parse-progress.tsx           # Step timeline + progress
│   ├── parsed-results.tsx           # Post-parse results + duplicate detection
│   └── evidence-photo.tsx           # PDF page renderer + lightbox
├── contacts/
│   ├── add-contact-dialog.tsx       # Create contact form
│   └── add-interaction-dialog.tsx   # Log interaction form
└── contractor/
    ├── photo-upload-slot.tsx        # Photo upload with AI verification
    └── assign-work-order-dialog.tsx # Work order assignment
```

### Pages to improve
| Page | Route | Current State |
|------|-------|--------------|
| Login | `/login` | Basic form, no branding |
| Portfolio Home | `/dashboard` | Stats bar + property cards grid — functional but plain |
| Property Detail | `/properties/[id]` | Breadcrumbs + stats + unit cards — needs visual hierarchy |
| Unit Detail | `/properties/[id]/units/[unitId]` | Info card + violations list |
| All Violations | `/violations` | Filter sidebar + sortable table — dense, could be more scannable |
| Violation Detail | `/dashboard/[id]` | Tabs (Items, Photos, Activity, Submissions) — lots of content, needs better organization |
| Parse NOI | `/parse` | Upload → Progress → Results state machine — progress timeline could be more polished |
| Contacts List | `/contacts` | Category tabs + search + cards — functional |
| Contact Detail | `/contacts/[id]` | Info card + Timeline + Linked Entities tabs |
| Analytics | `/analytics` | 4 KPI cards + 4 Recharts charts — charts need better spacing/colors |
| Settings | `/settings` | 3 tabs (Gmail, Team, Notifications) |
| Contractor Portal | `/contractor/[token]` | Mobile-responsive, stacked layout — minimal styling |

---

## Design Improvement Priorities

### P0: Visual Identity
1. **Consistent color system** — Define a proper palette beyond just blue/gray. Consider warm neutrals or a secondary accent color.
2. **Typography** — Consider loading a clean sans-serif (Inter, Plus Jakarta Sans) via `next/font`. Improve heading hierarchy.
3. **Spacing and rhythm** — Standardize padding/margins across pages. Current spacing is inconsistent.

### P1: Key Page Polish
4. **Login page** — Add branding, maybe a split layout with product illustration or gradient.
5. **Portfolio Home** — Property cards need better visual treatment (shadows, hover states, violation count badges).
6. **Violation table** — Status badges need consistent, accessible colors. Table density should be configurable.
7. **Dashboard stats bar** — KPI cards should feel more important (bigger numbers, trend indicators, better card design).

### P2: Interaction Design
8. **Transitions and animations** — Subtle fade-ins on page load, skeleton loaders for data fetching states.
9. **Empty states** — Most pages show nothing when there's no data. Add illustrations or helpful CTAs.
10. **Loading states** — Replace "Loading..." text with proper skeleton components.
11. **Hover/focus states** — Many clickable elements lack clear affordance.

### P3: Detail Polish
12. **Sidebar** — Active state could be more prominent. Consider collapsible sidebar.
13. **Notification dropdown** — Needs visual hierarchy between read/unread, priority indicators.
14. **Charts (Recharts)** — Better color palette, consistent styling, responsive sizing.
15. **Mobile responsiveness** — Sidebar should collapse to hamburger menu on small screens.

---

## Self-Annealing Process

This is the core operating principle. When something breaks or doesn't work:

### The Loop
1. **Read the error** — Stack trace, console output, build error. Understand what failed.
2. **Fix the code** — Make the minimal change to resolve the issue.
3. **Test it** — Run `npm run dev` and verify in browser. Run `npm test` if you changed logic.
4. **Update this file** — Add what you learned to the "Hard Rejections" section below.
5. **System is now stronger** — Future sessions start with your accumulated knowledge.

### Rules for Self-Annealing
- If a fix uses paid API credits (Gemini, Resend, etc.), ask Sam before running it
- If you're unsure whether a change is safe, read the file first, understand the existing code, then make your change
- If the dev server crashes, read the error — don't restart blindly
- If a Tailwind class doesn't work, check if it's Tailwind v4 syntax (v4 changed some utilities)
- If shadcn/ui component doesn't behave as expected, read its source in `src/components/ui/` — don't fight the abstraction

### Hard Rejections Log

> When Sam rejects a design choice, add it here so you never repeat the mistake. Format:
> `[DATE] REJECTED: <what was rejected> — REASON: <why> — DO INSTEAD: <correct approach>`

_No rejections recorded yet. This section will grow as you work._

---

## Technical Constraints

1. **Tailwind CSS v4** — Some utility names changed from v3. Check docs if something doesn't apply.
2. **shadcn/ui** — Components are copied into `src/components/ui/`. You CAN modify them, but understand the Radix UI primitives underneath.
3. **Next.js App Router** — Pages are `page.tsx`, layouts are `layout.tsx`. Client components need `'use client'` directive.
4. **React 19** — Supports `use()` hook, Server Components by default. Most interactive components are already client components.
5. **Recharts** — Chart library used on analytics page. Responsive containers already set up.
6. **Lucide React** — Icon library. All icons imported from `lucide-react`.
7. **`cn()` utility** — Tailwind class merger at `src/lib/utils.ts`. Always use `cn()` for conditional classes.

---

## File Organization

- `.tmp/` — Intermediate files, QA screenshots. Never commit.
- `src/components/ui/` — shadcn/ui primitives. Modify carefully.
- `src/components/layout/` — Sidebar, nav, notification bell. Core layout.
- `src/components/dashboard/` — Dashboard-specific components.
- `src/app/(authenticated)/` — All auth-protected pages.
- `src/app/login/` — Login page (not auth-protected).
- `src/app/contractor/` — Public contractor portal (token-based auth).
- `docs/pm_docs/v2-productionization/Technical_Specification.md` — Full tech spec with UI/UX section.
- `PROJECT_STATUS.md` — Complete architecture reference.

---

## How to Run

```bash
cd /Users/unique_vzn/dev/dob-project/dob-abatement-saas

# Dev server
PORT=3007 npm run dev

# Tests (if you change any logic)
npm test

# Inngest (only needed if testing parse/notifications)
npx inngest-cli@latest dev -u http://localhost:3007/api/inngest
```

**Login:** `sam@yokemgmt.com` / `TestPass123!`

---

## Communication Protocol

You are one agent in a multi-agent system:
- **Claude (Opus 4.6)** built the features and business logic. Ask Sam to relay questions if you need architectural context.
- **Genesis** runs QA via Chrome DevTools MCP. After your design changes, Sam may send Genesis to verify nothing broke.
- **You (Gemini)** own design improvements. Focus on visual quality, interaction design, and polish.

When you make changes, keep a running log of what you modified so Claude or Genesis can verify. Write your session notes to `.tmp/gemini_design_session.md`.
