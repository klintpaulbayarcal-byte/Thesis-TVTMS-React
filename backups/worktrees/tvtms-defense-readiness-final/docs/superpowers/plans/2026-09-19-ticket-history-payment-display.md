# Ticket History and Payment Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add immutable, concurrency-safe plate ticket sequence snapshots and clearly separated dynamic ticket/payment history across staff and public views.

**Architecture:** A migration adds immutable ticket snapshot columns plus an atomic per-plate sequence table and replaces the affected service-role RPCs. PHP continues as the authorization boundary and normalizes response contracts. React renders immutable issuance metadata separately from live financial totals, and the existing packaging pipeline excludes private runtime configuration.

**Tech Stack:** PostgreSQL/Supabase SQL, PHP 8.3 REST API, React 18, React Router 6, Vite 5, pytest contract/runtime tests.

**Spec:** `docs/superpowers/specs/2026-09-19-ticket-history-payment-display-design.md`

## Global Constraints

- Work only in the local review copy; do not connect to or mutate production.
- Preserve existing authentication, Admin, Apprehending Officer, ticket, payment, cancellation, dispute, evidence, and reporting behavior.
- Never expose owner identity, email, address, license, receipts, credentials, or internal IDs through public lookup.
- Cancelled tickets remain in history and never reduce or reuse immutable plate sequence values.
- Cancelled tickets contribute zero to current outstanding balance.
- Keep the new ticket penalty separate from combined plate outstanding balance.
- Use test-first changes and retain a reproducible red/green record in test output.

## Review Focus

- Plates differing only by spaces, hyphens, or case must share one sequence and history.
- A cancelled ticket issued before a new ticket must not allow reuse of its sequence value.
- Two concurrent issue requests for one plate must receive distinct consecutive values.
- Voided payments must remain listed but contribute zero to paid totals and balances.
- Public payloads and rendered pages must omit every private owner/driver field.

---

### Task 1: Executable feature contracts

**Files:**
- Create: `tests/test_ticket_history_payment_changes.py`
- Modify: `tests/test_functional_contract.py`

**Interfaces:**
- Consumes: existing migration/source file text and PHP helper functions.
- Produces: failing tests for schema, SQL behavior contracts, PHP financial aggregation, staff/public UI labels, public-safe fields, and package exclusions.

- [ ] **Step 1: Write failing tests** asserting the migration contains immutable snapshot columns, atomic plate-sequence upsert, RLS/grants, non-cancelled outstanding filters, and correction audit payloads; assert staff/public JSX contains the approved labels and links.
- [ ] **Step 2: Run `python -m pytest -q tests/test_ticket_history_payment_changes.py tests/test_functional_contract.py`** and confirm failures identify missing feature contracts rather than syntax/import errors.
- [ ] **Step 3: Commit the red tests** with `git commit -m "test: define ticket history and payment display contracts"`.

### Task 2: Database migration and immutable issuance snapshots

**Files:**
- Create: `supabase/migrations/202609190001_ticket_history_payment_display.sql`
- Modify: `supabase/schema/database.postgres.sql`
- Test: `tests/test_ticket_history_payment_changes.py`

**Interfaces:**
- Consumes: `tvtms_ticket_create`, `tvtms_ticket_detail`, catalog/public/payment RPCs and current service-role grant model.
- Produces: `tickets.plate_ticket_count_at_issue`, `tickets.same_violation_offense_count_at_issue`, `plate_ticket_sequences`, updated RPC JSON fields, and correction metadata (`voidedPaymentIds`, `voidedPaymentAmount`).

- [ ] **Step 1: Add migration DDL** for the two ticket columns and `plate_ticket_sequences`, with check constraints, RLS, explicit revokes, service-role grants, and normalized-plate backfill ordered by issuance timestamp and ID.
- [ ] **Step 2: Replace `tvtms_ticket_create`** so its existing advisory lock and an atomic `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING last_number` assign the plate snapshot while the same-violation count continues excluding cancelled tickets.
- [ ] **Step 3: Replace read RPCs** so staff/public history returns immutable counts plus live non-voided paid totals and zero owed for cancelled rows; return historical and non-cancelled counts separately.
- [ ] **Step 4: Replace correction RPC behavior** to retain voided rows and return their IDs/count/amount while adding detailed ticket status history.
- [ ] **Step 5: Mirror final schema objects** in `database.postgres.sql` for clean installations.
- [ ] **Step 6: Run targeted tests** and fix SQL contract failures.
- [ ] **Step 7: Commit** with `git commit -m "feat: add immutable plate ticket issuance snapshots"`.

### Task 3: PHP response contracts and correction audit

**Files:**
- Modify: `api/src/handlers/tickets.php`
- Modify: `api/src/handlers/vehicles.php`
- Modify: `api/src/handlers/public.php`
- Test: `tests/test_ticket_history_payment_changes.py`

**Interfaces:**
- Consumes: updated RPC result properties and existing `ticket_apply_payment_totals`.
- Produces: normalized history/summary fields, cancelled-ticket zero balance, next plate count, separated outstanding total, and richer audit metadata.

- [ ] **Step 1: Extend PHP tests** with real helper invocations showing cancelled balance is zero, non-voided payments update balances, and public summaries map without private fields.
- [ ] **Step 2: Verify red** with the configured PHP executable on PATH.
- [ ] **Step 3: Update ticket enrichment** to force cancelled remaining balance to zero while retaining penalty and payment totals.
- [ ] **Step 4: Update vehicle lookup/stats** to expose dynamic summary plus `next_plate_ticket_count` and keep all history rows.
- [ ] **Step 5: Update public handlers** to map new historical/non-cancelled counts and `total_outstanding_balance` without owner data.
- [ ] **Step 6: Update mark-unpaid audit metadata** with voided IDs/count/amount returned by the RPC.
- [ ] **Step 7: Run targeted tests and commit** with `git commit -m "feat: expose separated plate history financials"`.

### Task 4: Officer issuance and staff ticket detail UI

**Files:**
- Modify: `src/pages/IssueTicket.jsx`
- Modify: `src/pages/TicketDetails.jsx`
- Modify: `src/styles/restored-dashboard.css`
- Test: `tests/test_ticket_history_payment_changes.py`

**Interfaces:**
- Consumes: staff vehicle lookup `vehicle`, `violations`, and `summary`; penalty preview; ticket detail snapshot fields.
- Produces: existing-ticket financial table and separate issuance count, offense level, penalty, and outstanding displays.

- [ ] **Step 1: Add failing UI contract assertions** for all labels, history columns, cancelled rows, and the plate-is-not-driver disclaimer.
- [ ] **Step 2: Verify red**, then update Issue Ticket state to retain summary data and clear stale history when plate text changes.
- [ ] **Step 3: Render existing ticket history** with ticket, violation, penalty, paid, balance, and status using current components/styles.
- [ ] **Step 4: Replace repeat-offender wording** with `Plate Ticket Count at Issuance` and `Same-Plate/Same-Violation Penalty Level`, including identity disclaimer.
- [ ] **Step 5: Repeat separated values in review modal and Ticket Details** without altering action permissions.
- [ ] **Step 6: Add scoped responsive styles, run JSX verification/build/tests, and commit** with `git commit -m "feat: show separated plate and offense history to staff"`.

### Task 5: Landing and full public lookup

**Files:**
- Modify: `src/pages/Landing.jsx`
- Modify: `src/pages/PublicTicketLookup.jsx`
- Modify: `src/styles/restored-landing.css`
- Modify: `src/styles/restored-public-lookup.css`
- Test: `tests/test_ticket_history_payment_changes.py`

**Interfaces:**
- Consumes: public ticket lookup rows and public plate summary.
- Produces: per-ticket landing balance/status, full plate link, `?plate=` auto-load, live combined outstanding, and public-safe ticket cards.

- [ ] **Step 1: Add failing assertions** for landing balances/statuses/full-plate URL and public auto-load/summary labels/private-field exclusion.
- [ ] **Step 2: Verify red**, then render penalty/balance/status per quick result and a dedicated full plate history link for plate mode.
- [ ] **Step 3: Support `?plate=` in Public Ticket Lookup** with mode initialization, automatic lookup, and stale-result protection.
- [ ] **Step 4: Display historical ticket count, non-cancelled ticket count, paid/unpaid/cancelled counts, and combined outstanding distinctly.
- [ ] **Step 5: Preserve public-safe fields and add only scoped responsive CSS.**
- [ ] **Step 6: Run JSX verification/build/tests and commit** with `git commit -m "feat: expand public plate balance lookup"`.

### Task 6: Workflow verification and safe packaging

**Files:**
- Modify: `package.json`
- Modify: `README_FIRST.txt`
- Modify: `DEPLOYMENT_README.txt`
- Modify: `scripts/package-hostinger.cjs`
- Create: `docs/TICKET_HISTORY_PAYMENT_DEPLOYMENT.md`
- Test: `tests/test_ticket_history_payment_changes.py`

**Interfaces:**
- Consumes: complete source, migration, configured local PHP path, build output, and package manifest.
- Produces: portable test command, explicit safe migration instructions, verified secret-free deployment ZIP, and final test evidence.

- [ ] **Step 1: Fix the Windows test script** to discover or configure a real PHP executable without shadow wrapper recursion, preserving cross-platform Python invocation.
- [ ] **Step 2: Add deployment instructions** requiring backup, staging migration, post-migration checks, application upload, smoke tests, and separate production approval.
- [ ] **Step 3: Harden packaging exclusions** for private configs, `.env*`, uploads, caches, dependencies, prior archives, and review metadata.
- [ ] **Step 4: Run the complete pytest suite** with PHP available and classify any remaining failures by defect versus environment.
- [ ] **Step 5: Run `npm.cmd run verify:jsx`, `npm.cmd run build`, and distribution verification.**
- [ ] **Step 6: Exercise issuance/payment/cancellation workflow tests** in the available isolated SQL/PHP harness and record exact coverage/limitations.
- [ ] **Step 7: Build the final ZIP, inspect its file list and scan for secret markers**, then commit with `git commit -m "docs: add verified migration and deployment handoff"`.
- [ ] **Step 8: Run `git status --short` and the final verification suite** before reporting completion.
