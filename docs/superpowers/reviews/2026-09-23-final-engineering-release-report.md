# TVTMS Final Engineering and Release Gate

**Date:** 2026-09-23 (Asia/Manila)  
**Candidate branch:** `feature/tvtms-defense-readiness`  
**Candidate source commit:** `63c0acdc7105579bd5f3764b08e1203044c95464`  
**Production branch baseline:** `origin/sync-v4` at `16780da4c90be56d9bf6541dcee58611d5de15e4`  
**Status:** **BLOCKED — DO NOT DEPLOY**

No production database change, real ticket/payment/dispute mutation, SMTP/SMS send, merge to `sync-v4`, or Hostinger upload was performed.

## Implemented

- Upgraded `react-router-dom` to 7.18.4, Vite to 8.3.0, and `@vitejs/plugin-react` to 6.1.1. Both complete and production-only npm audits report zero known vulnerabilities.
- Added forward-only migration `202609220001_ticket_email_snapshot_only.sql`. Ticket, payment, public-dispute, and dispute-resolution notification recipients now use immutable ticket issuance snapshots and fail closed when no snapshot exists. The migration preserves records and service-role-only grants; it has not been applied to any database.
- Minimized public lookup to the approved ticket, violation, date, status, penalty, paid, balance, and dispute-availability fields. PHP rebuilds an explicit response allowlist, so unexpected owner/internal fields from the RPC are not returned.
- Preserved partial/full/cancelled payment display semantics and the existing 100-record public plate-history capacity. Cancelled ticket balances are zero; combined outstanding remains separately calculated.
- Hardened production FTPS source configuration. The workflow now requires a Hostinger `*.hstgr.io` hostname, verifies it resolves to the approved IP, validates the certificate hostname, and uses `ssl:check-hostname yes` for every session. `FTP_SERVER_NAME` must be configured privately before any deployment.
- Independent code review found no Critical issue. Four review regressions were fixed in commit `7993245`, and the reviewer found no remaining Critical or Important issue in those areas.

## Verification evidence

| Gate | Result | Evidence |
|---|---|---|
| Automated suite | PASS | `npm test`: 180 passed, 0 failed. |
| JSX/import verification | PASS | 51 source files verified. |
| PHP syntax | PASS | Every PHP file under `api/` passed PHP 8 lint. |
| Hostinger build/package | PASS | Vite 8 production build and package assembly succeeded. |
| Linux no-deploy CI | PASS | GitHub Actions run `35812269186` passed all steps on the exact candidate commit, including the 180-test suite and production-style build. |
| Dependency audits | PASS | `npm audit --audit-level=low` and `npm audit --omit=dev --audit-level=low`: 0 vulnerabilities. |
| Static security review | PASS with residual product risk | Baseline scan found four medium issues. Mutable email and FTPS findings are remediated in the candidate; public fields are minimized. Plate/ticket identifiers remain public lookup keys because public plate history is an explicit product requirement. |
| Secret/upload/dependency exclusion | PASS locally | Final Hostinger and source-review archives were inventoried and checked for private configuration, credentials, uploads, and dependency trees. |
| Read-only live smoke | PASS, limited | Existing live homepage returned compiled assets; `/api/health` reported production/database connected; a synthetic unknown plate returned zero tickets. This does not test the candidate because it is not deployed. |
| Desktop/mobile browser smoke | NOT VERIFIED | No browser surface was available in the execution environment. |
| Authenticated staging workflows | NOT VERIFIED | No safe staging URL/database or dedicated Admin/Officer test accounts were available. |
| Migration execution/compatibility | NOT VERIFIED | No isolated PostgreSQL/Supabase runtime or read-only production schema access was available. SQL was structurally tested only. |
| Production backup/restore | NOT VERIFIED | No Hostinger/Supabase backup console or restore rehearsal access was available. |

## Migration order after staging approval

Apply only through the approved migration workflow, first in an isolated staging project, in filename order:

1. `202609190001_ticket_history_payment_display.sql`
2. `202609190002_plate_lookup_consistency.sql`
3. `202609200001_ticket_email_dispute_verification.sql`
4. `202609220001_ticket_email_snapshot_only.sql`

Take and verify a restorable database backup first. Confirm migration history, columns, plate-sequence state, RPC definitions, and grants. Then execute the first/second/third ticket, different-violation, partial/full/correction, cancellation, public lookup, dispute verification, and notification-recipient scenarios using synthetic staging records. Do not apply these files speculatively to the populated production database.

## Release blockers

1. Provide a safe staging environment plus dedicated Admin and Apprehending Officer test accounts through the platform's secure secret mechanism. Run the mandatory authenticated issuance, cancellation, payment/correction, dispute, evidence, report, and role-boundary journeys there.
2. Apply the four migrations to staging and verify them against a production-compatible schema. Separately perform a read-only production migration/grant parity check; do not paste credentials into chat.
3. Verify current restorable Hostinger file and Supabase database backups and document a recovery rehearsal that preserves records created after release.
4. Configure the private `FTP_SERVER_NAME` GitHub secret with the Hostinger-provided certificate-matching hostname and verify protected-branch/environment approval controls.
5. Complete desktop/mobile browser smoke tests on the exact candidate. Final no-deploy CI has passed on the exact release commit.

Until all five items pass, do not merge or push to `sync-v4` and do not deploy.
