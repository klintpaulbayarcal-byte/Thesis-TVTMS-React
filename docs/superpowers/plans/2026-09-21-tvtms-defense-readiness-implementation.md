# TVTMS Defense-Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve evidenced ticket-preview, location-reporting and UI presentation defects, verify TVTMS workflows, and prepare a controlled release without changing the production website or production data.

**Architecture:** Work on existing `feature/tvtms-defense-readiness`, based on production `sync-v4` commit `16780da4c90be56d9bf6541dcee58611d5de15e4`. Keep ticket request identity, location labeling, dashboards, and payment presentation as independently reviewed units. React remains the interface, PHP/Supabase the authoritative record and penalty source. Preserve the existing schema and historical tickets; all tests use isolated fixtures/mocks unless a read-only production verification is explicitly marked.

**Tech Stack:** React 18, Vite 5, JavaScript ES modules, PHP 8.1+, Supabase PostgreSQL, Python 3 + pytest, Node 22/24, GitHub Actions, Hostinger FTPS.

**Spec:** `docs/superpowers/specs/2026-09-21-tvtms-defense-readiness-design.md`

## Global Constraints

- Preserve the existing UI/UX, authorized roles, ticket and payment history, production records, official fines, secrets, and existing email/OTP flow.
- No new packages; no Supabase schema change, production write, real email, PR merge, push to `sync-v4`, or Hostinger deploy without separate user approval.
- Do not create duplicate local checkout/worktree; do not overwrite the untracked `docs/superpowers/specs/2026-09-19-ticket-history-payment-display-design.md` or other local work.
- No geocoding or guessed barangays; a coordinate is not a confirmed area, a prior plate is not proof of the same person, and a displayed preview is not a saved fine.
- Tests must distinguish `PASS`, `FAIL`, `NOT VERIFIED`, and `NOT APPLICABLE`; SMTP accepted is not inbox delivered.
- One independently testable commit per behavioral task, with targeted red/green testing and exact-path staging. Stop and re-design if a schema change, policy change, or new subsystem becomes necessary.

## Review Focus

1. Rapidly switch a plate and violation while HTTP calls finish out of order: the new selection must not show old preview/history or permit a misleading amount (Task 2).
2. Historical plate has an old owner's email, officer edits/clears it: no email to an unconfirmed stale address, while ticket persistence is still authoritative (Task 3).
3. GPS is denied or an older coordinate-only ticket is reported: clear fallback and explicit coordinate labels; never invent an area (Task 4).
4. A single dashboard endpoint fails while others succeed: retain successful sections and display a partial error, not fake zero totals (Task 5).
5. Ticket has ₱1 remaining after partial payment: display `Partially Paid` while retaining stored `unpaid` lifecycle and all payment records (Task 6).

---

### Task 1: Baseline and reproduction dossier

**Files:** Create `docs/superpowers/reviews/2026-09-21-tvtms-baseline.md`; inspect `src/pages/IssueTicket.jsx`, `src/pages/OfficerDashboard.jsx`, `src/pages/AdminDashboard.jsx`, `src/pages/AnalyticsDashboard.jsx`, `src/pages/Payments.jsx`, `api/src/handlers/violations.php`, `api/src/handlers/tickets.php`, `api/src/handlers/reports.php`, `supabase/migrations/202609120002_tickets.sql`, `supabase/migrations/202609120005_reports.sql`.

**Interfaces:** Produces a reproduction matrix and baseline commit ID for all following tasks; no production changes.

- [ ] **Step 1: Verify baseline and working directory without overwriting local work.** Run `git status --short --branch && git rev-parse HEAD && git fetch origin && git rev-parse origin/sync-v4`. If not on `feature/tvtms-defense-readiness`, stop rather than changing branches over untracked files. Check feature ancestry with `git merge-base --is-ancestor origin/sync-v4 HEAD` and record the result. For connector-only execution, use GitHub branch/compare APIs to establish the same facts.
- [ ] **Step 2: Record observed-versus-proven facts.** Create the dossier table with columns `Video/time | Reproduction | Expected | Observed | Confidence | Code/data evidence | Test | Status`; include penalty level, GPS chart, transient zeros, partial payment, heading, notifications, and QA records. Note zero active escalation rules and zero Defective Lights tickets only as a dated read-only snapshot, not immutable truth. Mask owner/violator information.
- [ ] **Step 3: Run an unmodified baseline where a runtime exists.** `TVTMS_PHP="$(command -v php)" TVTMS_PYTHON="$(command -v python3)" npm test`; then `npm run verify:jsx`, `find api -name '*.php' -type f -print0 | xargs -0 -n1 php -l`, `npm run build:hostinger`, and `git diff --check`. Use `npm ci` first only if node modules are absent and lockfile matches. On Windows use explicit `TVTMS_PHP`/`TVTMS_PYTHON` paths instead of Bash substitutions. Capture exact outputs, not guessed pass counts. If execution environment unavailable, mark baseline `NOT VERIFIED` and use the existing CI result as distinct historical evidence.
- [ ] **Step 4: Commit dossier only.** `git add docs/superpowers/reviews/2026-09-21-tvtms-baseline.md && git commit -m "docs(review): record TVTMS reproduction baseline"`. Check the staged filename before commit.

### Task 2: Reject stale ticket penalty and plate lookup responses

**Files:** Create `src/utils/requestGate.js`; modify `src/pages/IssueTicket.jsx`; create `tests/test_issue_ticket_request_race.py` (Python runs Node ESM with `subprocess`, following existing `tests/test_public_contact_client.py`).

**Interfaces:** `createRequestGate(): {begin():number, isCurrent(token:number):boolean, invalidate():number}`. Backend `API.penaltyPreview(id, plate)` and `API.vehicleLookup(plate)` remain unchanged. Form displays preview only for the same selected `violation_id` and normalized plate.

- [ ] **Step 1: Write a failing deterministic gate test.** In `tests/test_issue_ticket_request_race.py`, invoke Node with `import { createRequestGate } from './src/utils/requestGate.js'`; assert `const gate=createRequestGate(); const first=gate.begin(); const second=gate.begin(); if(gate.isCurrent(first)||!gate.isCurrent(second))process.exit(1); gate.invalidate(); if(gate.isCurrent(second))process.exit(2);`. Add source-level test asserting the form invalidates both gates on plate edit and the preview gate on violation edit, plus a simulated first-response-after-second-response check.
- [ ] **Step 2: Verify RED.** `python -m pytest -q tests/test_issue_ticket_request_race.py` must fail against the original missing helper / stale code.
- [ ] **Step 3: Implement minimal gate module.** `export function createRequestGate(){let current=0;return {begin:()=>++current,isCurrent:token=>token===current,invalidate:()=>++current};}`. In `IssueTicket.jsx`, import `useRef` and the gate, instantiate independent preview/lookup gates once via `useRef(null)` initializers; invalidate both synchronously in `plateChanged`, clear `preview` and `history`, and invalidate preview + clear it synchronously when selecting another violation. In the preview effect, start a token before calling the API, compare token and selected plate/violation to the response before `setPreview`, ignore stale rejects, and invalidate on cleanup. In `lookup`, capture normalized plate and token; only apply returned vehicle, history, or error when token and plate still match. Keep stale errors from wiping a newer result.
- [ ] **Step 4: Make preview informative, not authoritative.** While loading/current preview unavailable show `Penalty preview pending; final amount is calculated when the ticket is issued`, not a confident old value. Label the confirmed review value as an estimate until backend success. After create, use `ticket.penalty_amount_at_issue` to display the saved amount on the destination ticket detail. Never change SQL fines, historical-count rules, or `penalty_amount_at_issue`.
- [ ] **Step 5: Verify GREEN and commit.** Run targeted tests, `npm run verify:jsx`, `git diff --check`, and `git diff -- src/pages/IssueTicket.jsx src/utils/requestGate.js`. Commit only those files and test as `fix(tickets): reject stale preview and plate lookup responses`.

### Task 3: Confirm historical email recipient before ticket notification

**Files:** Modify `src/pages/IssueTicket.jsx`, `api/src/handlers/tickets.php`; inspect `api/src/ticket_email.php`; create `tests/test_ticket_recipient_confirmation.py`. Keep the existing ticket RPC and ledger unchanged.

**Interfaces:** API `createTicket` JSON gains optional boolean `recipient_email_confirmed`; the server uses it only to control outbound notification, never to alter penalty, ticket persistence, or access checks. If user elects no email, backend must not call `ticket_notification_attempt` for an unconfirmed fallback email. Response `notification` retains a truthful status/message recognizable by `IssueTicket.jsx`.

- [ ] **Step 1: Write RED tests.** PHP-isolated tests should stub `json_input`, `supabase_rpc`, audit and `ticket_notification_attempt`: with an existing canonical email returned in the ticket but `recipient_email_confirmed=false`, assert ticket creates once and email sender is never called; with `true` and matching validated normalized `owner_email`, assert one sender call; with an edited/cleared email or invalid type, assert no stale recipient is contacted and ticket result still distinguishes saved from email status. Assert no full email leaks via public lookup.
- [ ] **Step 2: Verify RED.** `python -m pytest -q tests/test_ticket_recipient_confirmation.py` must identify the unguarded sender call in current `tickets_create`.
- [ ] **Step 3: Implement explicit UI consent at issuance.** Show the full recipient email in Officer-only review modal, flag email auto-filled by `lookup`, require an officer-checked checkbox confirming the intended recipient before enabling email notice; changing plate, name or email clears this confirmation. No email is required to issue a ticket. Send `recipient_email_confirmed` as a boolean. If a historical email was cleared, PHP must not use the SQL fallback snapshot for notification; return `no_confirmed_recipient` in `notification`. Do not disable unrelated private ticket history or modify database owner data.
- [ ] **Step 4: Add backend guard before the side effect.** After the RPC returns `$ticket`, compare `normalize_email($ticket['owner_email_at_issue'] ?? $ticket['owner_email'] ?? '')` to validated submitted `$email` and require `($b['recipient_email_confirmed'] ?? null) === true` before calling `ticket_notification_attempt`. Otherwise construct a distinct no-notice response such as `['status'=>'no_confirmed_recipient','message'=>'Ticket saved; email recipient not confirmed.']`. Keep audit and `201` ticket creation. Review the actual detail-field name and avoid sending when it is absent or mismatched.
- [ ] **Step 5: Run targeted tests plus existing email/privacy tests.** `python -m pytest -q tests/test_ticket_recipient_confirmation.py tests/test_ticket_email_workflow.py tests/test_ticket_notification_ui.py tests/test_public_email_privacy.py`; run PHP lint and JSX verification. Commit only task files as `fix(tickets): confirm recipient before automatic notice`. If existing notification retry can bypass confirmation, stop and extend the guard/test before committing; do not weaken existing admin/officer authorization.

### Task 4: Honest GPS/location classification and dashboard labels (no schema change)

**Files:** Create `src/utils/locationLabel.js`, `tests/test_location_labels.py`; modify `src/pages/IssueTicket.jsx`, `src/pages/AdminDashboard.jsx`; inspect (do not modify unless contract evidence demands it) `api/src/handlers/reports.php` and `supabase/migrations/202609120005_reports.sql`.

**Interfaces:** `displayLocation(raw:string):string` returns `Unspecified` for blank, `Coordinates: <lat>, <lon>` for two decimal coordinates in [-90,90] and [-180,180], otherwise the original trimmed place name; `isCoordinateLocation(raw:string):boolean` shares the parser. No text-to-barangay mapping and no coordinate schema change.

- [ ] **Step 1: Write RED cases.** Node subprocess tests assert `displayLocation('9.650001, 123.987654') === 'Coordinates: 9.650001, 123.987654'`, `displayLocation('Calape, Bohol') === 'Calape, Bohol'`, `displayLocation('') === 'Unspecified'`, `isCoordinateLocation('95, 123')===false`, and malformed coordinates remain plain text. Add source assertions that both admin hotspot list and chart use the formatter and no `risk` inference is shown as statistical fact.
- [ ] **Step 2: Verify RED.** `python -m pytest -q tests/test_location_labels.py` fails before the helper exists.
- [ ] **Step 3: Add a tiny pure parser/formatter.** A single regex `^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$` plus numeric bounds; preserve original coordinate precision and manual names, never reverse geocode or modify stored `tickets.location`. In `IssueTicket.jsx`, GPS success text explicitly says coordinates were captured and asks Officer to replace them with a named location when known; a coordinate-only ticket remains allowed under current rules and labeled as such.
- [ ] **Step 4: Fix report presentation only.** In `AdminDashboard.jsx`, map `r.location`/`r.barangay` through `displayLocation` for visible chart/list/ribbon labels. Rename `Recorded Citations by Area` to `Recorded Citations by Location`, and change `high/medium/low risk` explanation to relative **recorded counts**. Keep existing exact-string aggregate and counts; never merge unlike coordinate points or relabel them as a barangay. If authoritative mapping or separate coordinate persistence is required, stop for a separately approved schema design.
- [ ] **Step 5: Verify and commit.** Targeted test + `npm run verify:jsx`; independently compare read-only aggregate counts to displayed fixture counts; `git diff --check`, then commit only this task's files as `fix(reports): label coordinate locations without geographic inference`.

### Task 5: Loading/error/empty states and honest dashboard numbers

**Files:** Modify `src/pages/AdminDashboard.jsx`, `src/pages/OfficerDashboard.jsx`, `src/pages/AnalyticsDashboard.jsx`; create `tests/test_dashboard_async_states.py`; modify `src/styles/restored-dashboard.css` only for targeted loading text layout.

**Interfaces:** Each page maintains `loading` and `loaded` separately from returned values; `error` indicates failed source(s). Successful response shape from existing `API.ticketStats()`, `API.tickets()`, and `API.report(...)` does not change.

- [ ] **Step 1: Write RED cases.** Add focused tests for initial state `Loading…` instead of `0`, last-successful-data retention during refresh, all-rejected error, one-rejected-with-successful-sibling partial error, and legitimate empty successful response showing `No records` or actual zero. Follow existing Python+Node tests or a minimal source-contract test when no DOM harness exists; mark interactive browser behavior separately as `NOT VERIFIED` until visually checked.
- [ ] **Step 2: Verify RED.** `python -m pytest -q tests/test_dashboard_async_states.py` should fail against current initial-zero/partial-failure handling.
- [ ] **Step 3: Implement narrowly.** `useState(true)` for first `loading`, `useState(false)` for `loaded`; do not render numeric KPIs until loaded. On `Promise.allSettled` admin results, use `results.filter(r=>r.status==='rejected')` for partial errors, apply successful values individually and never replace previously successful data with empty objects on failure. Officer should use all-settled or maintain explicit all-failed error; Analytics refresh should keep existing data and show `Refreshing…`, while initial fetch shows `Loading analytics…`. Set updated time only after successful response(s), never on failure.
- [ ] **Step 4: Verify and commit.** Run targeted tests, JSX verification, check loading and failed/empty states in desktop/mobile browsers if available, record any inaccessible manual checks, commit three pages/test and only necessary CSS as `fix(dashboards): distinguish loading, empty and partial failures`.

### Task 6: Partial payment clarity without changing lifecycle

**Files:** Modify `src/pages/Payments.jsx`; create `tests/test_payment_status_display.py`; inspect `src/components/StatusBadge.jsx`, `api/src/handlers/tickets.php`.

**Interfaces:** `ticket.payment_status` derived in PHP is the display state; `ticket.status` remains authoritative for server action eligibility, and non-voided recorded payments determine `total_paid` and `remaining_balance`.

- [ ] **Step 1: Write RED tests.** Check partial fixture `{status:'unpaid',payment_status:'partially_paid',total_paid:1999,remaining_balance:1}` renders `partially_paid`, normal unpaid renders unpaid, paid renders paid, cancelled renders cancelled, and no payment action is derived from display-only badge. Assert the payment API action remains `API.recordPayment` and server validation remains intact.
- [ ] **Step 2: Verify RED.** `python -m pytest -q tests/test_payment_status_display.py` must fail against current `<StatusBadge value={row.status}/>` in `Payments.jsx`.
- [ ] **Step 3: Implement one-line status presentation fix.** Change Payments ticket column renderer to `row=><StatusBadge value={row.payment_status??row.status}/>` and, if status badge lacks a user-friendly label, add only the `partially_paid` mapping there. Do not mutate the stored ticket status or payment rows. Keep `selected.remaining_balance > 0` as the existing action guard, supplemented by backend authorization.
- [ ] **Step 4: Verify and commit.** Run targeted tests plus existing payment regression tests and `npm run verify:jsx`; commit only the touched files as `fix(payments): display derived partial payment state`.

### Task 7: Targeted notification and landing polish

**Files:** Inspect/modify `src/pages/Notifications.jsx`, `src/styles/restored-dashboard.css`, `src/styles/landing-anchor-offset.css`, `src/styles/restored-landing.css`; create `tests/test_defense_readiness_polish.py` only if a reproducible failing case exists.

**Interfaces:** No contact handler/API changes; no change to notification data, deletions, navigation URLs, colors, or police-station asset.

- [ ] **Step 1: Reproduce on desktop and 375px mobile.** Navigate using FAQ/Contact anchors and manual scrolling separately; test Notification `View Message` with narrow width; compare hero readability with current overlay. Capture viewport and exact failing behavior. If unavailable, document `NOT VERIFIED`, do not create speculative CSS.
- [ ] **Step 2: Write a failing case for each confirmed UI defect.** For cramped notification metadata, use expected `.notification-meta` flex/wrap/gap contract or a browser screenshot assertion, with a new wrapper around date and `View Message` if needed. For Contact anchor, assert actual section top is below sticky nav following anchor click (manual or browser automation). For hero, apply overlay changes only after before/after readability comparison.
- [ ] **Step 3: Make minimal fixes and verify.** For notification metadata use `<div className="notification-meta"><small>…</small><button …>View Message</button></div>` with `.notification-meta{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px}` scoped to Notifications; do not change click/stopPropagation behavior. Adjust anchor offset only for a reproduced anchor failure, not normal manual-scroll clipping. Run corresponding targeted test, JSX verification and mobile/desktop manual inspection.
- [ ] **Step 4: Commit only confirmed repairs.** `git diff --check`; commit precise files as `fix(ui): improve verified landing and notification readability`, or document `NO CHANGE` with reason if defects cannot be reproduced.

### Task 8: Cross-module regression, security, and controlled release report

**Files:** Create `docs/superpowers/reviews/2026-09-21-tvtms-release-readiness.md`; inspect `.github/workflows/deploy-hostinger-v4.yml`, `scripts/package-hostinger.cjs`, `tests/` and changed branch diff. No workflow, production, or database edits.

**Interfaces:** Produces auditable report only, no deployment action.

- [ ] **Step 1: Execute full reproducible gates.** `npm ci && npm run verify:jsx && find api -name '*.php' -type f -print0 | xargs -0 -n1 php -l && npm run build:hostinger && npm test && git diff --check`. Verify deploy folder contains `index.html`, `api/index.php`, `.htaccess`, `api/.htaccess`, and excludes `uploads`, `.env*`, and `api/config/config.local.php`. Scan **branch diff only** for credential patterns; distinguish harmless example fixtures. Record command, exit code, environment, and exact counts.
- [ ] **Step 2: Exercise isolated end-to-end matrix.** Public lookup privacy and Contact accepted/failure; Officer ticket issue/plate history/penalty snapshot and rejected inputs; Admin partial/full payment + overpayment/duplicate official receipt, disputes/OTP timing and replay, notifications, reports, audit, user-role boundaries, settings; evidence/QR/export and poor-network behavior. Never create a real production ticket, payment, dispute or email without separate authorization. For each manual-only or inaccessible case write `NOT VERIFIED`, not `PASS`.
- [ ] **Step 3: Validate independently without exposing identities.** Read-only SQL compare `tvtms_report_hotspots` counts with `COUNT(*) GROUP BY TRIM(location)` for same date filter; check stored `penalty_amount_at_issue` against existing rule behavior without changing any record. Verify no altered SQL migration, official fine, SMTP secret, production data, or permission boundary in the diff.
- [ ] **Step 4: Produce report and rollback.** Include base/head SHA, exact `git diff --name-status origin/sync-v4...HEAD`, tests table `PASS/FAIL/NOT VERIFIED/NOT APPLICABLE`, remaining defects, desktop/mobile screenshots if available, migration requirement (`none` unless design escalated), backup recommendation, and rollback instructions `git revert <release-only commits>` on a reviewed branch followed by guarded workflow (never force-push `sync-v4`). Keep PR #1 untouched.
- [ ] **Step 5: Commit report only and STOP at release gate.** `git add docs/superpowers/reviews/2026-09-21-tvtms-release-readiness.md && git commit -m "docs(release): document TVTMS readiness and rollback"`; if user wants remote review push **only** `feature/tvtms-defense-readiness`. Ask separately before altering `sync-v4`, applying a database migration, sending real mail, changing production data, merging a PR, or deploying.

## Plan review checklist

- Every spec section maps to at least one task: baseline (1), ticket/recipients (2-3), GPS/reporting (4), async/payment/polish (5-7), regression/release (8).
- No new dependencies, SQL migrations, guessed enforcement fines, guessed locations, or changes to payment history.
- Each task has a RED-GREEN test gate, exact files, and an independent commit (except investigation/release docs and unconfirmed polish).
- Five Review Focus cases are pinned to Tasks 2-6. For blocked browser/email integration, report `NOT VERIFIED` rather than manufacturing evidence.
- Execution method requested by user: ChatGPT-native, not Codex. User must review this written plan before implementation; separate approval remains required for production release.
