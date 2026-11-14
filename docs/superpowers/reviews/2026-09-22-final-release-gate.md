# TVTMS — final release gate and exact blockers

**Date:** September 22, 2026. **Status: BLOCKED — DO NOT DEPLOY.** The user's permission to deploy is conditional on verification and safety; those conditions are not yet established. This report supplements the prior `2026-09-21-tvtms-release-readiness.md` (its older 169-test count and older SHA are superseded by this report). No deployment to Hostinger, production SQL change, production record edit, real mail/SMS, PR merge, or push to `sync-v4` was performed.

## Exact release-candidate provenance

- Repository: `klintpaulbayarcal-byte/Thesis-TVTMS-React`.
- Implementation branch: `feature/tvtms-defense-readiness`.
- Latest application/test commit before this documentation commit: `a3cf2c168f4e471c52e9371422f545d67bf82040`.
- Exact-commit no-deploy GitHub Actions: https://github.com/klintpaulbayarcal-byte/Thesis-TVTMS-React/actions/runs/35727165090 — **PASS**, including locked `npm ci`, all regression tests, PHP lint, JSX/import verification, Hostinger build/packaging, tracked-file credential-name gate and one-day source/static artifacts. `npm audit` remains intentionally informational in this workflow: green workflow status does **not** mean zero vulnerabilities.
- Baseline and unchanged production deployment branch `sync-v4`: `16780da4c90be56d9bf6541dcee58611d5de15e4`, rechecked via exact GitHub comparison.

## Confirmed bugs fixed in this pass

1. **Ticket filter reset uses stale request state.** Prior `setTimeout(load,0)` executed the old-render closure, occasionally refetching the previous search or status after fields cleared. Reproduced with `tests/test_ticket_filter_reset.py` (RED); replaced with an explicit cleared-filter request and status-change effect. GREEN.
2. **Combining search and status silently drops status.** The list previously switched to `API.searchTickets(search)`, a separate backend path with no status parameter. Existing `tickets_list` already accepts both `search` and `status`; changed the list to use `API.tickets(nextFilters)` in every case, no schema or role change. Reproduced with `tests/test_ticket_combined_filters.py` (RED); GREEN.

Earlier feature-branch fixes remain: stale penalty/history responses, explicit email-recipient confirmation with PHP snapshot/claim guards, coordinate labels, dashboard failure/loading states, partial-payment labels, navigation offset, notification spacing, administrator/Officer issue-button separation and CSV status. No production fines, payments, tickets or DB schema changed.

## Verification matrix

| Scope | Result | Evidence/limits |
| --- | --- | --- |
| Targeted filter tests | **PASS** | Two new tests were each RED before fixes, GREEN afterward. |
| Full regression suite | **PASS: 171 tests** | Local `TVTMS_PHP=... TVTMS_PYTHON=... npm test`: 171 passed; exact-commit GitHub workflow regression step passed. Tests include isolated PHP/JS fakes and source contracts, not a full authenticated staging run. |
| PHP lint | **PASS** | All `api/**/*.php` via exact-commit GitHub Actions. |
| JSX/import verification | **PASS** | 51 files, local and CI. |
| Hostinger production-style build, package and secret exclusions | **PASS** | Exact-commit GitHub Actions assembled `deploy/`, confirmed required entrypoints and absence of `config.local.php`, uploads and specified `.env` paths; not deployed. Pattern-based scans cannot prove absence of every secret format. |
| Live DB read-only schema/privilege inspection | **PASS for specifically queried facts** | Required email claim/finalize functions and ticket email snapshot column exist; current SQL claim still has mutable vehicle-email fallback; `anon`/`authenticated` cannot execute that claim directly, `service_role` can. No DB writes. |
| Actual browser navigation | **NOT VERIFIED** | Local Chromium `page.goto` returned `ERR_BLOCKED_BY_ADMINISTRATOR` for data, file and localhost; `page.set_content` works for injected static markup but does not establish real React routing/role/device behavior. Prior isolated CSS probes are not an authenticated app pass. |
| End-to-end ticket, same-violation escalation, payment ledger, disputes, OTP, SMTP inbox and GPS | **NOT VERIFIED** | No safe integrated staging credentials and complete staging environment; isolated tests do not validate real workflows or inbox delivery. There are zero active fine-escalation rules in the dated read-only query, so no fine escalation should be invented. |
| External independent review | **NOT VERIFIED** | Implementing assistant self-reviewed; no independent second-person reviewer available. |
| Zero-advisory `npm audit` | **FAIL** | 4 package findings (3 moderate, 1 high); production-only 2 moderate, 0 high. No version or lockfile changes. |

## Exact deployment blockers (not vague future tasks)

**B1 — Dependency security risk decision unresolved.** `react-router` and `react-router-dom` remain two moderate *production* audit package findings, linked to open-redirect and SSR advisory reports. `vite` (high) and `esbuild` (moderate) are development/build packages. npm's proposed fixed versions (`react-router-dom@7.18.4`, `vite@8.3.0`) are major changes, previously forbidden without separate authorization. Either approve an isolated upgrade with compatibility testing or obtain a documented informed acceptance of any verified residual risk; do not pretend the audit is clean. No automatic `npm audit fix --force`.

**B2 — Critical integrated workflows unverified.** A separately isolated staging environment with working test Admin/Officer sessions, non-production Supabase fixtures, fake or expressly approved test transports and an actual browser is required to run end-to-end ticket issuance, repeat-offender amounts, partial/full payments, disputes/OTP, role isolation, and mobile responsive/GPS/network cases. Passwords must never be pasted into chat; production records must not be used as throwaway fixtures. The execution environment's Chromium navigation policy prevented these checks here.

**B3 — Email legacy fallback and independent review.** Current production SQL `tvtms_ticket_email_claim` still falls back to mutable vehicle email, though current PHP compares the immutable per-ticket email snapshot and exact claim before SMTP; `anon`/`authenticated` cannot directly execute this RPC. Independent review of this PHP↔SQL authorization/recipient path and whether a migration is necessary has not occurred. A DB-enforced fallback removal requires separately authorized migration; never claim DB-wide fail-closed guarantees on isolated PHP tests alone.

**B4 — Production backup and rollback are not verified.** A restorable Hostinger files snapshot and Supabase database backup, verified workflow destination/secrets (without disclosure), migration parity and a restore rehearsal/check are required before release. The production deploy workflow automatically publishes on `sync-v4` push and removes one specifically obsolete legacy landing HTML file; do not trigger it without a verified restore plan.

**B5 — Post-deployment checks cannot yet be performed.** After B1–B4 pass, deploy only the exact tested candidate via the reviewed `sync-v4` integration, confirm workflow result, homepage, `/api/health`, public lookup and authorized test accounts. Real SMTP/SMS and production ticket/payment writes require their own explicit scoped permission. If new defects arise, fix/test them before deployment, never declare readiness from 171 tests alone.

## Decision

**Do not push `sync-v4` or upload to Hostinger now.** Conditional deployment permission has not matured because B1–B4 remain open. Keep all verified feature-branch changes, production data, uploads and existing settings intact. The only release-blocking user decisions are the separately scoped major dependency upgrade/risk disposition, staging-test access that does not disclose passwords, and authorization of any proposed SQL migration or real-notification test if review proves one necessary. Do not request repetitive approvals for ordinary non-production bug fixes.
