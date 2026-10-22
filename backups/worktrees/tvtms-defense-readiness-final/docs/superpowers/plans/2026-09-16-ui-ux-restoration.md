# TVTMS Finalized UI/UX Restoration Implementation Plan

> **For agentic workers:** Execute task-by-task with verification after each visual layer.

**Goal:** Restore the finalized pre-React TVTMS visual language in the current React application without changing the React + PHP + Supabase architecture or breaking existing workflows.

**Architecture:** Keep current React routes, state, API services, PHP REST handlers, and Supabase contracts. Replace/extend the presentation layer with reusable legacy-compatible layout/components and a React landing page modeled on the previous finalized static system and supplied recordings.

**Tech Stack:** React 18, Vite 5, React Router 6, CSS, PHP REST API, Supabase PostgreSQL.

**Spec:** User-approved master prompt in project conversation plus previous `vehicle-violation-system-FINAL(2)` UI and uploaded screen recordings.

## Global Constraints
- Current React ZIP is the functional source of truth.
- Previous finalized TVTMS is the visual source of truth.
- Preserve React + Vite -> PHP REST API -> Supabase PostgreSQL.
- Do not reintroduce Node/Express production runtime or MySQL.
- Do not make destructive Supabase changes.
- Do not package `config.local.php`, secrets, or `node_modules` in the final deliverable.
- Preserve current API contracts, routes, RBAC, and tested functional workflows.

---

### Task 1: Add visual regression contract tests
**Files:**
- Create: `tests/test_ui_restoration_contract.py`

- [ ] Add static assertions for finalized fonts, landing hero/search/ticker, grouped Admin/Officer navigation, premium dashboard banners, map/risk panel, and legacy table/card classes.
- [ ] Run focused test and confirm it fails against the simplified React UI.

### Task 2: Restore shared dashboard shell
**Files:**
- Create: `src/components/Icon.jsx`
- Modify: `src/components/Sidebar.jsx`
- Modify: `src/components/Topbar.jsx`
- Modify: `src/components/AppLogo.jsx`
- Modify: `src/layouts/AppLayout.jsx`
- Modify: `src/components/PageHeader.jsx`
- Modify: `src/components/StatCard.jsx`
- Modify: `src/components/DataTable.jsx`
- Create: `src/styles/restored-dashboard.css`
- Modify: `src/main.jsx`

- [ ] Restore sectioned side navigation and role-specific menu groups.
- [ ] Restore logo/user/footer treatment, topbar, typography, card, table, form, button, modal, and mobile sidebar styling.
- [ ] Keep current routes/handlers intact.

### Task 3: Restore public landing page
**Files:**
- Modify: `src/layouts/PublicLayout.jsx`
- Modify: `src/pages/Landing.jsx`
- Create: `src/styles/restored-landing.css`

- [ ] Recreate old navy editorial landing shell, navigation, hero, public lookup, ticker, live stats, process comparison, workflow, roles/features, violation cards, About/FAQ/contact/footer.
- [ ] Keep current live public stats, violations, contact API and route links.
- [ ] Add responsive behavior matching recordings.

### Task 4: Restore Admin and Officer dashboards
**Files:**
- Modify: `src/pages/AdminDashboard.jsx`
- Modify: `src/pages/OfficerDashboard.jsx`

- [ ] Admin: restore Calape Risk by Area operations panel, premium welcome banner, four primary stats, executive/action areas, recent tickets, hotspot/quick actions/system panels.
- [ ] Officer: restore welcome banner, issue/search CTAs, four stats, recent tickets, quick actions.
- [ ] Keep current API data contracts.

### Task 5: Harmonize remaining pages
**Files:**
- Existing `src/pages/*.jsx` and shared components/styles.

- [ ] Apply restored shared visual system to tickets, details, users, violations, payments, disputes, analytics, reports, audit, settings, notifications, profile, lookup, and issue-ticket pages through common classes rather than logic rewrites.
- [ ] Preserve page-specific workflows and tests.

### Task 6: Verify and package
**Files:**
- Modify: `FINAL_VERIFICATION_REPORT.md`
- Modify: `REACT_MIGRATION_CHANGES.md`

- [ ] Run `npm test`.
- [ ] Run `npm run verify:jsx`.
- [ ] Run PHP lint over deployable PHP files.
- [ ] Run `npm run build:hostinger`.
- [ ] Verify deploy package contains no real secret/config.local.php.
- [ ] Build final restored ZIP excluding `node_modules`, caches, real secrets, and transient artifacts.
