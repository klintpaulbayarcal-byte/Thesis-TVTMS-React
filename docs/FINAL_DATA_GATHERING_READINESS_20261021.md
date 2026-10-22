# TVTMS data-gathering engineering audit — 21 October 2026

## Decision

**Local engineering checks PASS. Production data-gathering readiness remains BLOCKED.**
No merge, production deployment, migration, production business-record mutation, email delivery, credential change, or production deletion was performed. Full browser/device acceptance and recoverable production backups have not been established. Passing isolated tests does not establish that every live feature works.

## Repository synchronization and preservation

- Repository root: `C:/xampp/htdocs/TVTMS-REACT-UI-RESTORED-SOURCE-v4`.
- Remote: `https://github.com/klintpaulbayarcal-byte/Thesis-TVTMS-React.git`. This is a real Git checkout of the intended repository, not an unversioned extracted ZIP.
- Original branch/HEAD: `sync-v4` at `3101b64`. Initial tracked and untracked status was clean. No local-only commits relative to production.
- Fresh `git fetch origin` succeeded. `git rev-list --left-right --count HEAD...origin/sync-v4` returned `0 101`. The incoming indicator represents commits, not 101 conflicting file edits.
- Production branch observed on GitHub: `7441af1daef3163217aa976bc62a5c20b82a6e68`. This is a Git branch observation, not proof that the server serves this exact commit.
- Original HEAD preserved by `backup/pre-readiness-audit-20261021`. Original branch, files, and local configuration were not updated.
- Ignored files already present include private `api/config/config.local.php`, source/style `.bak` files, built `dist/`, `deploy/`, archives, test state, artifacts, and `node_modules/`. Existing uploads and backup folders were retained. Restricted old cache subdirectories were not opened or removed. Secrets were not read into this report or copied into the audit worktree.
- Audit worktree: `.audit-worktrees/readiness`, branch `audit/data-gathering-readiness-20261021`, based directly on PR #27 HEAD `e57d6ac39ec45b19219854bbc8279fad1f7cf47d`.
- PR #27 was verified through GitHub as OPEN, DRAFT, not merged, based on `sync-v4`, with one commit and 12 changed files. Its fixes are included by ancestry in the audit branch. No cherry-pick or merge into the original working branch was needed.
- No pull, reset, clean, force push, branch switch in the original folder, or automatic PR merge occurred.

## Confirmed defects and changes

| Defect | Root cause and correction | Evidence |
| --- | --- | --- |
| Historical catalog penalties overwritten during metadata edits | PR #27 retains a nonselectable legacy entry's stored penalty instead of replacing it with the flat citation amount | Real PHP handler tests retain a 5,000 fixture penalty; official/new entries retain 150 |
| Invalid demerits and concurrent duplicate catalog codes | PR #27 validates whole-number demerits and translates the insert uniqueness race into 409 | Real PHP fixtures reject fractions/booleans/structures and simulate uniqueness conflict |
| Hidden dispute/payment errors and misleading failed-refresh outcomes | PR #27 puts errors inside dialogs, guards overlapping saves with refs, and distinguishes committed mutations from subsequent read failures | Actual component handler tests with controlled promises |
| Receipt history shown under the wrong selected ticket | Payments accepted late history responses without checking the active selection and retained old rows during loading | New test failed with `QA-A-OR` under ticket B before the fix; now passes with a selection version guard and cleared history |
| Ticket selection changed during payment confirmation | Payment row handler did not respect the synchronous posting lock | New test failed with modal title `QA-B` during posting for `QA-ONLY`; now passes |
| User account submissions overlap and errors are obscured | User Management relied on a later rerender to disable Save and displayed API errors behind the modal | New test observed two writes before the fix; synchronous ref now limits it to one and the modal displays the rejection |
| Saved account reported as failed after list-refresh failure | The refresh catch replaced the successful mutation notice | New regression now verifies a saved-result informational notice |
| Windows full suite fails to decode source/currency | Python inherited Windows cp1252 instead of the repository's UTF-8 encoding | First run: 409 passed, 5 failed with Unicode decoding/currency assertions. Test launcher now explicitly supplies `PYTHONUTF8=1`; subsequent full run: 414 passed |
| Production-bound PR omitted from package CI | `verify-hostinger-package.yml` filtered PRs to `main` while production uses `sync-v4` | Added `sync-v4` to the PR trigger and a regression assertion. This workflow validates/packages only |

## Files changed after PR #27

- `src/pages/Payments.jsx`: selection request version, history/form reset, posting selection lock.
- `src/pages/ManageUsers.jsx`: synchronous save lock, modal errors, explicit saved-versus-refresh feedback.
- `scripts/run-tests.cjs`: consistent UTF-8 Python behavior on Windows.
- `.github/workflows/verify-hostinger-package.yml`: verify PRs targeting `sync-v4`.
- `tests/admin-dialog-runtime.mjs`: four additional runtime scenarios, for 11 total subtests.
- `tests/test_pr1_review_regressions.py`: production PR trigger regression assertion.
- This report and `docs/SAFE_RELEASE_20261021.md`.

PR #27's complete inherited changes can be reviewed with `git diff 7441af1..e57d6ac`. This branch's additional changes can be reviewed with `git diff e57d6ac..HEAD`. Neither comparison changes files.

## Verification results

| Check | Result | Evidence and limits |
| --- | --- | --- |
| Locked dependency install | PASS | `npm ci --ignore-scripts --no-audit --no-fund` in the separate worktree; 71 packages installed. Original dependency folder untouched |
| Full automated suite | PASS | `npm test`: **414 passed, 0 failed, 0 skipped**. Includes runtime PHP, migrated PGlite transactions, offline SMTP fixtures, and source contracts; these have different evidence strengths |
| Administrator handler regressions | PASS | `node --test tests/admin-dialog-runtime.mjs`: **11 passed**. Executes actual handlers with hook/API doubles; no DOM/browser rendering |
| JavaScript/import validation | PASS | `npm run verify:jsx`: **57 files passed** |
| PHP syntax | PASS | PHP 8.3.33 `-l`: **26 API files passed** |
| Build and package | PASS | `npm run build:hostinger`: Vite 8.3.4; **108 modules transformed**; package assembled with private configuration/uploads excluded |
| Dependency vulnerability query | PASS | `npm audit --json`: **0 known vulnerabilities**, 96 dependencies in registry summary; time-specific result |
| Isolated HTTP integration | PASS | `node scripts/verify-isolated-api.mjs`: **8 smoke groups passed** using real PHP over HTTP and migrated loopback PGlite REST adapter; SMTP disabled |
| Production homepage | PASS (read only) | HTTPS GET returned **200**, compiled asset references present |
| Production API health | PASS (read only) | `/api/health`: **200**, `success: true`, `database: connected` |
| Production public catalog | PASS (read only) | `/api/public/violations`: **200**, **18 entries** |
| Browser inspection | BLOCKED | Browser automation inventory returned `apps: []`, `browsers: []`; in-app browser unavailable. No new visual screenshots or authenticated browser acceptance evidence |
| Hosted Supabase/PostgREST staging | NOT TESTED | PGlite adapter exercises SQL and PHP but implements only a subset of PostgREST behavior. No hosted staging project/branch was created |
| Production schema/grants match | NOT TESTED | Health establishes connectivity, not completeness of RPCs, migrations, RLS, or deployed role grants |
| Backup recoverability | BLOCKED | No current verified database export, complete live Hostinger files/config/uploads backup, or restore evidence available in this session |

## Feature evidence matrix

All local PASS entries describe the stated evidence only; browser acceptance for every row remains BLOCKED.

| Feature | Local result and evidence | Production acceptance |
| --- | --- | --- |
| Citation/plate lookup and privacy | PASS: isolated HTTP lookup for issued fixtures; sensitive identity/email/ID fields absent; public minimization regressions | NOT TESTED against real citation records |
| QR lookup/generation | PASS: QR generation/email regressions and URL auto-load source contracts | NOT TESTED: physical scan, camera permissions, printed QR readability |
| Public dispute validation, duplicate prevention, eligibility | PASS: HTTP creation/duplicate rejection and PHP/database regressions for dates/payments | NOT TESTED: no production dispute submitted |
| Public error/navigation states | PASS: source/runtime contracts | BLOCKED: visual, keyboard and mobile acceptance |
| Officer authentication, dashboard and access | PASS: isolated logins, dashboard/query regressions, real PHP authorization tests | NOT TESTED: actual Officer authenticated browser session |
| Citation driver/owner/vehicle details and confirmation | PASS: isolated HTTP and migrated citation tests, optional license checks and rank requirements | BLOCKED: UI review/confirmation flow |
| Multiple violations | PASS: two selections total 300; three total 450; duplicate issuance rejected; exact official catalog protected | NOT TESTED live |
| GPS and place | PASS: isolated issuance stores place and numeric coordinates; input contracts | NOT TESTED: device location acquisition/permission behavior |
| Photo/evidence upload and access | PASS: existing automated evidence contracts; handler inspection confirms ticket scope, type/signature, size/quota, authenticated file reads | NOT TESTED: real browser multipart upload/download or device photo capture |
| Citation email and printing | PASS: offline SMTP/recipient snapshot/QR regressions; isolated issuance reports failed delivery with SMTP intentionally disabled | NOT TESTED: delivery to a real mailbox, adviser-approved recipient and physical printing |
| Admin dashboard/reports | PASS: selected report/analytics HTTP routes and SQL totals regressions | NOT TESTED: visual dashboards, production export inspection |
| Ticket view/edit/cancel | PASS: actual PHP handlers traced to `tvtms_ticket_detail`/`tvtms_ticket_mutate`; existing transactional regressions | NOT TESTED live; no genuine citation changed |
| Eligible permanent deletion and protected records | PASS: migrated atomic deletion test executes as `service_role`, checks archived audit record; rejects protected/disputed/unauthorized cases; no weak RPC fallback | NOT TESTED live; never delete genuine citations for acceptance |
| Violation CRUD safeguards | PASS: all 18 official identities/selection behaviors protected by HTTP; legacy metadata/invalid demerits/duplicate conflict fixtures; deletion DB restrictions | Read-only live public catalog count PASS; live Admin CRUD NOT TESTED |
| Payments/receipts/partial balances | PASS: HTTP 100 then 200 settles a 300 fixture; invalid dates rejected; dialog/selection regressions | NOT TESTED live; no fake official payment created |
| Dispute review/resolution | PASS: PHP/database/runtime regression suite and HTTP queue read | NOT TESTED live; no production decision changed |
| User Management | PASS: API role restrictions and existing account fixtures; actual component handlers tested for overlap, visible errors and refresh failure | NOT TESTED live; no real account changed |
| Audit logs/settings/notifications | PASS: HTTP audit/notification reads, PHP authorization, settings/email preference and transactional regressions | NOT TESTED live; no production settings changed |

## Cross-layer traces inspected

- Payments: `Payments.jsx` → `API.recordPayment`/`paymentsForTicket` → PHP router → `payments_record`/`payments_by_ticket` → `tvtms_payment_record`/ticket detail → returned balance/history. Database validates official payment totals; frontend now keeps display state tied to the selected citation.
- Disputes: public/admin pages → API service → PHP public/dispute handlers → public submission or resolve RPCs → status/eligibility response. HTTP smoke uses fresh disposable records; runtime dialog tests control mutation and refresh failures separately.
- Catalog: `ManageViolations.jsx` → service → PHP CRUD/guards → table writes/catalog delete RPC. PR #27 retains historical penalties; official choices remain protected.
- Officer issuance: `IssueTicket.jsx` → service → Officer-only `tickets_create` → transactional creation RPC → notification attempt after commit. Isolated HTTP validates driver snapshot, location/GPS, rank, totals and duplicate protection.
- Accounts: `ManageUsers.jsx` → service → Administrator-only handlers → user insert/account update RPC. Client locking/feedback changes do not alter roles or server authorization.
- Deletion: `TicketDetails.jsx` confirmation → Administrator-only PHP handler → `tvtms_ticket_admin_safe_delete` with exact citation/reason → atomic archival/deletion; absence of the RPC fails closed.

Role tests use forged Admin claims attached to an Officer fixture and confirm the stored active user role wins. They also reject inactive users, Administrator issuance and cross-Officer ticket details, and scope Officer lists to the verified account. These tests do not replace a production grants/RLS audit.

## Remaining release blockers

1. Adviser/authorized operator must verify recoverable database and complete live-server backups outside Git, with hashes, timestamp, private storage location and isolated restore evidence.
2. Connect a browser and perform authenticated acceptance in an isolated environment. Cover Officer issuance/confirmation, public QR lookup/disputes, photo/GPS, Admin ticket/payment/dispute/account flows and report exports; include mobile and physical print checks.
3. Verify actual hosted schema/RPC grants and source version against the approved candidate. No new migration is introduced by PR #27 or this follow-up, but the original local source is much older than production.
4. Verify approved SMTP delivery with a controlled non-production recipient and examine the received QR. Offline SMTP tests alone are insufficient.
5. Follow the separate safe-release procedure. Existing `sync-v4` push-to-deploy remains active and has not been altered remotely. Do not use VS Code Sync or merge either review branch as a shortcut.

Open the audit worktree as its own VS Code folder to inspect the candidate. Opening the original folder still shows the preserved older `sync-v4` source. Use `npm run dev:isolated` in the audit worktree for disposable QA; normal `npm run dev` may use the existing configured hosted database and is unsuitable for destructive acceptance tests.
