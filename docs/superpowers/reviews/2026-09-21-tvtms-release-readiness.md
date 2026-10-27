# TVTMS defense-readiness — consolidated engineering and release report

**Date:** 2026-09-22. **Status: BLOCKED — DO NOT DEPLOY.** Development tasks within existing authorization were carried out; production deployment, real-system end-to-end verification and acceptance of unresolved dependencies are NOT authorized or proven.

**Repository:** `klintpaulbayarcal-byte/Thesis-TVTMS-React`. **Feature branch:** `feature/tvtms-defense-readiness`. **Production baseline:** `sync-v4` commit `16780da4c90be56d9bf6541dcee58611d5de15e4` (verified earlier on 2026-09-22). **Last tested branch code/workflow commit before this documentation update:** `5fcd353bb5714d3654268e6f64b447e081cecdc8`. **CI:** https://github.com/klintpaulbayarcal-byte/Thesis-TVTMS-React/actions/runs/35718058955 . **Full change inventory:** https://github.com/klintpaulbayarcal-byte/Thesis-TVTMS-React/compare/16780da4c90be56d9bf6541dcee58611d5de15e4...feature/tvtms-defense-readiness . Documentation commit on top of this tested source requires final CI confirmation against the resulting HEAD; do not substitute an earlier run.

## A. Implemented fixes and root causes

1. Ticket penalty preview/history: independent request-generation gates reject responses from an old plate or violation after a new choice. The preview is explicitly an estimate; PHP/Supabase issuance still determines the stored penalty. There are no invented escalation rules and no historical corrections.
2. Email security: ticket creation preserves ticket issuance when email is declined. The Officer explicitly confirms a recipient at the API send boundary; retries require fresh address entry and confirmation. PHP reads `tickets.owner_email_at_issue` for the exact ticket, validates the confirmed email, and independently checks the SQL claim's ticket ID/recipient before SMTP. Missing/mismatched/old vehicle emails fail closed; unknown finalization disables automatic retries. `tvtms_ticket_email_claim` still contains a legacy SQL fallback to mutable vehicle email; the protected PHP sender refuses this mismatch. Removing the SQL fallback at database level requires a separately approved migration. Mail-server acceptance is not inbox delivery.
3. GPS/reporting: raw coordinate-only locations are labeled as coordinates; area/count labels no longer invent mapped places or inferred geographic risk. No SQL migration or historical record rewrite.
4. Dashboards/payments: loading, empty, failed and partial-response states no longer masquerade as trustworthy zeros. `Payments.jsx` shows backend-derived `partially_paid` when appropriate, without changing the ticket's persisted lifecycle or any payment row.
5. UI: notification date/message-link spacing improved; a reproduced Ticket Lookup anchor clipping under sticky navigation fixed using scoped scroll margin. The Contact anchor and hero background were not changed without a reproduced defect. Prior desktop/mobile checks were isolated CSS/markup probes, not real authenticated React workflows.
6. Follow-up defects on 2026-09-22: `ViewTickets.jsx` previously displayed an Officer-only `Issue New Ticket` link to administrators, who would then be rejected by role-protected routing; fixed by showing this action only to `apprehending_officer`. Ticket list, CSV export and authenticated plate-history table used raw `row.status='unpaid'` even for partial payments; both screens now use `row.payment_status??row.status` for presentation/export without touching payment logic. New `tests/test_ticket_list_role_and_payment_labels.py` exhibited **2 expected failures before implementation, then 2 passes**; full suite rose from 167 to 169.
7. CI testing provenance: `.github/workflows/verify-defense-readiness.yml` is feature-branch-only with `contents: read`, no FTP, SQL, migration or deploy operations. Added temporary one-day artifacts of tracked source (`git archive` plus tracked-credential filename guard) and compiled static UI to permit exact-source offline inspection. Static UI was retrieved and checked locally; the environment blocks all Chromium page navigations, even localhost and file/data URLs, with `ERR_BLOCKED_BY_ADMINISTRATOR`. Thus real React desktop/mobile interactions are **NOT VERIFIED**, not PASS. No account tokens, runtime uploads or private server configuration were included in the tracked-source or compiled-UI artifacts; CI packaging checks independently exclude secret overrides and uploads.

## B. Exact automated verification for tested commit `5fcd353bb5714d3654268e6f64b447e081cecdc8`

| Check | Result and evidence |
|---|---|
| GitHub Actions non-deploy workflow | **PASS:** run `35718058955` completed successfully, associated with exact tested commit above. |
| Automated regression | **PASS: 169 passed** in CI. Includes isolated/contract tests for ticket creation and recipient confirmation, retry guards, payment display, reporting/location, roles, disputes and related existing functionality. Test count is not an end-to-end coverage guarantee. |
| PHP lint | **PASS:** every `api/**/*.php` in CI; no PHP parse errors. |
| JSX/relative imports | **PASS:** 51 React/JS files. |
| Hostinger package | **PASS:** Vite build (158 modules) and packaging; `deploy/index.html` and `deploy/api/index.php` present. `config.local.php`, uploads and tested `.env` locations absent; packager searches for its defined secret/JWT patterns, not every conceivable secret. Package was not uploaded to production. |
| `npm audit` clean | **FAIL:** four advisories, three moderate and one high; production-only audit two moderate. Dependency versions unchanged. |
| Actual authenticated browser/mobile suite | **NOT VERIFIED:** this environment blocked navigation before any React app could load; source-level checks and old isolated CSS probes do not count as successful browser E2E. |
| Real ticket, payment, dispute, OTP, SMTP inbox, role session, mobile GPS, network drop | **NOT VERIFIED** against an isolated authenticated staging stack; no real email or production data writes were authorized. |
| Independent second-person code review | **NOT VERIFIED:** implementing assistant did a source/diff review; no independent reviewer available. |

**Test-history transparency:** the new role/payment tests were RED (two failures) before fixes, GREEN after fixes. Earlier runs also exposed email sender and PHP syntax regressions and were repaired before green CI. A local `npm ci` on this container could not retrieve a missing cached package (offline); the network-enabled, exact-commit GitHub runner's `npm ci` succeeded. A local package build using uploaded Windows `node_modules` lacked the Linux Rollup binary; this is not a CI build failure. The green CI is the build evidence.

## C. Dependency audit — blockers requiring an authorized decision

| Package | Severity | Reachability/issue | npm proposed fix |
|---|---|---|---|
| `esbuild@0.21.5` | moderate | Development/build dependency; dev-server cross-origin response exposure. Do not expose Vite dev server to untrusted networks. | Vite `8.3.0` major |
| `vite@5.4.21` | high | Development/build dependency; sourcemap traversal and Windows dev-server filesystem/UNC issues; not a production PHP service. The current `dev:web` binds `0.0.0.0`, so limit testing to trusted networks. | Vite `8.3.0` major |
| `react-router@6.30.6` | moderate | Client runtime; backslash-based open redirect in navigation and SSR hydration injection advisory. Client-only SPA makes SSR issue less directly applicable but does not prove all router risk absent. | `react-router-dom@7.18.4` major |
| `react-router-dom@6.30.6` | moderate | Direct client runtime dependency inheriting react-router issues. | `react-router-dom@7.18.4` major |

`npm audit`: **4 total** (3 moderate/1 high). `npm audit --omit=dev`: **2 moderate/0 high**. The proposed fixes are breaking major upgrades; user expressly forbade these without separate approval. No `npm audit fix --force`, package version change, lockfile modification or exception hiding. Zero-advisory acceptance FAIL, notwithstanding CI test/build success.

## D. Exact changed files versus production baseline

**Code/config:** `.github/workflows/verify-defense-readiness.yml`; `api/src/handlers/tickets.php`; `api/src/ticket_email.php`; `src/main.jsx`; `src/pages/AdminDashboard.jsx`; `src/pages/AnalyticsDashboard.jsx`; `src/pages/IssueTicket.jsx`; `src/pages/LicensePlateLookup.jsx`; `src/pages/OfficerDashboard.jsx`; `src/pages/Payments.jsx`; `src/pages/ViewTickets.jsx`; `src/services/api.js`; `src/styles/defense-readiness-polish.css`; `src/styles/landing-anchor-offset.css`; `src/utils/locationLabel.js`; `src/utils/requestGate.js`.

**Tests:** `tests/test_dashboard_async_states.py`; `tests/test_defense_readiness_polish.py`; `tests/test_issue_ticket_request_race.py`; `tests/test_location_labels.py`; `tests/test_payment_status_display.py`; `tests/test_ticket_email_recipient_guards.py`; `tests/test_ticket_email_workflow.py`; `tests/test_ticket_list_role_and_payment_labels.py`; `tests/test_ticket_lookup_anchor.py`; `tests/test_ticket_recipient_ui_confirmation.py`; `tests/test_ui_restoration_contract.py`.

**Documentation:** `docs/superpowers/specs/2026-09-21-tvtms-defense-readiness-design.md`; `docs/superpowers/plans/2026-09-21-tvtms-defense-readiness-implementation.md`; `docs/superpowers/reviews/2026-09-21-tvtms-baseline.md`; this report. No DB migrations or secrets changed.

**Selected implementation/test commits:** `51cf19305b5553179969cc8a7976e608ff543b3b` dashboard/analytics; `58fe8583d88a85d51dc7a0ab16993c542597b044` email sender; `270b66742a630f12ab64dee4a5b39fc6ff231e72` confirmation at API boundary; `324706e8ff2194402e18b989632749496365a8ed` notification spacing; `4527b173a93d49dd811ccbb84790b9103f994719` anchor; `a239ac06f2ca832dac0d41639b696b3ee9512d00` two RED tests; `ec30dad8095bc501895c25b5c891045233d14b9f` admin/CSV fix; `411c6d3c9b019804a910f477f8c6e2a566e9c885` plate history; `5fcd353bb5714d3654268e6f64b447e081cecdc8` test artifact provenance. The compare link above contains all commits and filenames.

## E. Release gate, needed decisions and rollback

**BLOCKED — DO NOT DEPLOY** until the two client-runtime dependency advisories are safely remediated and re-tested, or their residual risk is explicitly reviewed and accepted; authenticated non-production E2E/browser/mobile tests verify critical ticket/payment/dispute/email flows; a knowledgeable independent reviewer inspects email/SQL fallback/role and package security; and a reviewed production backup/restore plan exists. Browser-nav restrictions on this execution platform and missing staging credentials are documented limitations, not reasons to label tests as passed.

**Future deployment requires separate express approval:** verify release-branch tip and full diff, confirm production backups (Hostinger files + Supabase), audit deployment workflow destination and server configuration without displaying secrets, verify SQL migrations already applied, choose reviewed integration from feature into `sync-v4`, run CI on exact deploy SHA, and then deploy only with authorization. After release, smoke-test `/api/health`, public lookup, both roles, payment and dispute using specifically authorized safe records; real mail test only with separate consent. Roll back by reviewed revert commit and guarded deploy, or restore secured files/database backups when required; never force-push or delete production tickets as a quick rollback.

No merge, `sync-v4` push, Hostinger upload, production migration/write/deletion, QA cleanup, credential change or real SMTP/SMS send was performed. This report does not authorize any of them.
