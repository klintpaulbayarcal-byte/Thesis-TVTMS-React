# TVTMS revised citation release preparation

**Status on 2026-10-01: NOT READY. This is a future runbook, not authorization to release.** No production SQL, records, migration history, Hostinger files, or GitHub branches were changed during this preparation.

> Real isolated Supabase/PostgREST staging compatibility was not performed because the optional paid development branch was declined.

## Verified baseline

- Production Supabase project: `cwrhxvrmnfmzuxotsjrw` (TVTMS Production, Free plan). The owner's dashboard reports **Last Backup: No backups**. No restorable production database export has been verified.
- Remote `sync-v4`: `f1c05fdb8dd1f42ab6b585c7311f44105cc2fcc9`. The latest successful [guarded Hostinger workflow](https://github.com/klintpaulbayarcal-byte/Thesis-TVTMS-React/actions/runs/36365343720) deployed that SHA and passed its homepage/API-health step. It is the best available application rollback SHA; the server files themselves do not expose a verified commit marker.
- Current feature tip before this preparation: `cb8731cfe02d16c85a5ebe904eb8e0772c5be95a`; revised-citation commits are `cc5f150`, `018a3dd`, `213ae8c`, and `cb8731c`. Local release-preparation edits remain uncommitted. Nothing was pushed.
- A source-only archive of the known-good `sync-v4` commit is at `artifacts/release-prep-20261001/sync-v4-source-f1c05fdb.zip` (SHA-256 `634CFB0BD263C6D01AA78295414618088D9D7AFA8AEAB3E0818F876320CE313E`). It excludes untracked Hostinger configuration, runtime files, and uploads, so it is **not** a server-files backup.
- Read-only production counts: 14 tickets, 6 payments, 1 dispute, 2 evidence records, 32 notifications, 1 ticket-email notification, and 34 ticket-status-history records. There are zero null historical penalty snapshots, zero case-insensitive ticket-number collision groups, zero `TC001`–`TC018` code conflicts, and zero normalized violation-name duplicate groups. The pending backfill should create 14 historical `ticket_violations` rows.
- Existing catalog: 15 active, zero inactive. The migration maps `V002` No License, `V004` Overspeeding, `V005` Reckless Driving, `V008` Illegal Parking, `V012` Disregarding Traffic Signs, and `V015` Defective Lights to six approved choices. It adds the other 12. The other nine legacy catalog rows remain available for historical/Admin use but are excluded from Officer selection. No inactive-equivalent conflict was found.
- One Apprehending Officer exists. Production has no `users.officer_rank` or `tickets.officer_rank_at_issue` column yet; the migration adds both. The existing officer's new rank will be null until an Administrator supplies the official rank.

## Database export and recovery prerequisite

Supabase [does not provide automatic daily backups for Free projects and recommends regular off-site `supabase db dump` exports](https://supabase.com/docs/guides/platform/backups). The current dashboard reports no backup. Before a migration, a trusted operator needs Supabase project access, the production Postgres password, the Dashboard **Connect** string (direct IPv6 or session pooler on IPv4), current Supabase CLI, Docker, and `psql` for a restore rehearsal. A service-role API key is not a database-backup credential. Obtain credentials through the Dashboard or a secret manager; never put them in Git, tickets, terminal transcripts, or the release report. [Supabase's CLI backup/restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) is the reference procedure.

On a trusted workstation, create a restricted directory **outside this repository** and link the CLI to the existing project. Confirm that `supabase link` targets `cwrhxvrmnfmzuxotsjrw`. The link/login process should prompt for credentials privately. These commands are read-only against production:

```text
supabase link --project-ref cwrhxvrmnfmzuxotsjrw
supabase db dump --linked -f <SECURE_DIR>/roles.sql --role-only
supabase db dump --linked -f <SECURE_DIR>/schema.sql
supabase db dump --linked -f <SECURE_DIR>/data.sql --use-copy --data-only -x storage.buckets_vectors -x storage.vector_indexes
supabase db dump --linked --schema supabase_migrations -f <SECURE_DIR>/history_schema.sql
supabase db dump --linked --schema supabase_migrations --use-copy --data-only -f <SECURE_DIR>/history_data.sql
```

Expected outputs are five non-empty SQL files: `roles.sql`, `schema.sql`, `data.sql`, `history_schema.sql`, and `history_data.sql`, plus an operator-created SHA-256 manifest and protected off-site copy. `schema.sql` should contain the application's public/private tables, functions, policies, and grants; `data.sql` should contain public application rows, including `public.users`, tickets, payments, disputes, settings, catalog, history, notifications, and `public.evidence.file_data`. The separate history files preserve the Supabase migration ledger. CLI dumps exclude Supabase-managed `auth` and `storage` schemas by default; Storage objects and any Hostinger runtime files need separate protection. Check the actual dump contents before accepting the backup. Do not print data or store these files in the repository.

**Verification gate:** record file sizes/hashes, inspect the dump manifest without displaying personal rows, and restore the export to an isolated disposable environment. The restored database must contain the expected counts and required RPCs, policies, and grants. A downloaded file alone is **not** a verified restorable backup. This workspace currently lacks the CLI/Docker/Postgres runtime and the private database password, so the export and restore rehearsal were not performed here.

**Recovery procedure:** [Supabase's supported logical restore sequence](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) uses a clean target Supabase project. Configure required extensions/webhooks first. With the target's `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`, and `PGPASSWORD` supplied privately through the operator's environment, run from the protected backup directory:

```text
psql --single-transaction --set ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command "SET session_replication_role = replica" --file data.sql
psql --single-transaction --set ON_ERROR_STOP=1 --file history_schema.sql --file history_data.sql
```

Check table counts, evidence bytes, RPC definitions, policies, grants, and application login before configuring the application to point at the restored project. **No target project is being created now.** Restoring those files directly into the populated production project is not a rehearsed or safe in-place rollback; stop writes and use a separately reviewed recovery procedure if that is required. A full database restore can overwrite records created after the export, so keep writes paused until the go/no-go decision.

## Hostinger application-files backup

The GitHub SHA and source archive preserve tracked code only. Before release, use Hostinger **Websites → Dashboard → Backups → Restore and download → Files backups** to download and verify a backup containing the TVTMS subdomain root. [Hostinger's backup instructions](https://www.hostinger.com/support/5981435-how-to-download-backups-at-hostinger/) describe the file archive and retention. If the available automated backup predates the cutover, use an account-supported manual backup or a read-only FTPS/File Manager download of the exact subdomain root. Confirm that the copy contains `index.html`, `assets/`, `api/`, all `.htaccess` files, the private server config, and any runtime uploads. Protect the private config and personal data; store the copy outside Git, record its hash, and verify a sample file/readback. Do not restore the entire hosting account if that would affect unrelated sites. No Hostinger file snapshot or restore access has been verified in this preparation.

## Migration-history reconciliation

Production history lists the base migrations through `20260921032110 ticket_email_dispute_verification`; local migration filenames use different versions for several already-applied migrations. **Never run `supabase db push`, `migration up --include-all`, or `db reset` against production from this folder.** [Supabase documents that `migration repair` changes the tracking table only](https://supabase.com/docs/guides/deployment/database-migrations).

| Local migration | Production finding | Future release handling |
| --- | --- | --- |
| `202609200001_ticket_email_dispute_verification.sql` and earlier base files | Equivalent named migrations are recorded under different production timestamps. | No SQL reapplication. Preserve the existing ledger; map versions by name/body before any broader history repair. |
| `202609220001_ticket_email_snapshot_only.sql` | Its production RPC bodies match the local file byte-for-byte for the six functions that remain current. Its public-lookup body was later superseded. | **Skip SQL.** After the backup and full object/grant review, mark the local version applied only if CLI history alignment is required. |
| `202609270001_public_dispute_without_otp.sql` | Production submit and lookup RPC bodies match the local migration after whitespace normalization; service role can execute submit, anon cannot. | **Skip SQL.** After backup and grant review, mark the local version applied for tracking only if needed. Never replace the live functions with the older OTP flow. |
| `20260930071455_revised_traffic_citation_flat_penalty.sql` | Its new table, rank columns, and flat-penalty setting are absent. | Apply this SQL **once**, in the reviewed maintenance window after backup verification. After success and schema checks, record its version as applied. |

Do not alter migration history during preparation. A tracking repair is a production write and must be reviewed alongside the release. Keep a copy of the original ledger before any repair.

## Revised migration review

The migration is transactional with a 5-second lock timeout and 120-second statement timeout. It locks tickets and violations during backfill, so a busy write may make it abort cleanly. At 14 tickets and 15 catalog rows, data volume is small; schedule a write-free window rather than increasing the timeouts. It does not delete historical tickets/payments/disputes. It freezes only null historical penalties (currently zero), then backfills one `ticket_violations` row per old ticket using the stored historical amount. Old citation penalty snapshots remain unchanged while the Administrator catalog prices become ₱150.

The new Officer checklist is exactly: Not carrying driver's license; Driving with delinquent or invalid driver's license; Driving without license; Defective lighting accessory; Overspeeding; Reckless Driving; Hitching; Driving under the influence of liquor or drugs; Obstruction to traffic; Illegal stopping & parking; Disregarding traffic signs & signals; Abandon/unattended vehicles or trailers on highways; Obstruction loading/unloading in prohibited zone; Overloading; Motor vehicle racing; Refusal to convey passenger; Operating without permit/franchise; Others. It uses `is_citation_selectable` to exclude legacy choices and requires an Others description.

The authoritative RPC computes ₱150 × selected violations, stores separate immutable snapshots, checks the manual citation number with a transaction advisory lock and normalized duplicate lookup, records Manila time and a seven-day appearance date, and now rejects a blank Officer rank before insertion. Citation-level payment/dispute/public lookup/report RPCs are replaced to consume the citation total and violation snapshots. The new table has a ticket/violation uniqueness constraint, foreign keys, an index for violation lookups, RLS, and service-role-only table/RPC access. Local PostgreSQL runtime cases passed; real hosted PostgREST compatibility remains the acknowledged staging limitation.

## Future 30–45 minute release window

**Before starting:** obtain a verified restorable database export, a verified Hostinger files backup, a confirmed write-free/maintenance control on the TVTMS subdomain, the official Officer rank, and explicit release approval. The current source has no built-in maintenance-mode switch; staff instructions alone cannot stop public writes. Confirm the hosting control actually rejects citation, payment, dispute, and Admin mutations for normal users while allowing only named release operators to perform the later rank update and approved smoke tests. If this cannot be enforced, postpone the migration.

1. **T−15 to T0:** Announce a low-use window. Record live counts and the remote `sync-v4` SHA. Finish and verify the database export and Hostinger snapshot. Keep private credentials out of logs.
2. **T0:** Activate the tested maintenance/write-free control. Confirm write routes are unavailable to normal users. No citations, payments, disputes, or Admin edits during the database/application version gap.
3. **T+5:** Review the original migration ledger. If tracking repair is needed, mark September 22 and September 27 as already applied **without running their SQL**. Do not bulk-apply local migrations whose versions differ from production. Apply the revised September 30 SQL once, using its transaction and timeouts. Record execution result and checksum.
4. **T+10:** With writes still paused, verify DB health, the new rank/catalog/ticket_violations objects, 18 selectable choices, ₱150 setting, 14 expected historical rows, unchanged historical ticket/payment/dispute counts and penalty snapshots, RPC permissions, and PostgREST schema cache. If any check fails, stop.
5. **T+15:** Review and merge the verified feature branch into `sync-v4`, then push the approved merge. The guarded Hostinger workflow runs tests, builds, uploads, and checks homepage/API health. **The new Administrator rank form is only available after this deployment.**
6. **T+25:** While normal writes remain paused, allow the named release operators to use the new Administrator UI to set the existing Officer's official rank. Verify it through the authenticated account view. The database RPC and Officer page both block revised issuance until rank is present.
7. **T+30:** Perform controlled smoke checks: homepage and `/api/health`; Officer access, exact 18 choices, ₱150/₱300/₱450 preview, required Others description and citation-number duplicate rejection; ticket/plate public lookup and privacy; Admin payment/dispute/report views; email notification ledger/status without sending real mail; audit records. Any **production write** test needs separately approved safe records and must not affect unrelated tickets. A read-only check cannot establish write-path success.
8. **T+40:** Decide go/no-go while writes are still paused. Resume normal use only after the migration, guarded workflow, rank configuration, permitted smoke tests, and privacy/audit checks pass. Record the new deployed SHA and the exact time writes resumed.

**Rollback decision before writes resume:** If SQL fails, its transaction should roll back; inspect the error and leave the old application in place. If deployment fails after SQL succeeds, keep writes paused. The old application may be incompatible with the new RPC, so reverting files alone is insufficient. Restore the pre-release database and Hostinger files through the rehearsed procedure, or repair forward after review. If runtime checks fail, keep writes paused and make the same go/no-go decision. If new real records have been accepted, a full database restore could lose them; preserve and reconcile those records before any restore. Never force-push `sync-v4`, silently reset production data, or send a duplicate citation/email to test recovery.

## Current verification and open gates

- Local: `npm test` **244 passed**; direct isolated PostgreSQL runtime **25/25 passed**; JSX/import verification **55 files passed**; PHP lint **25/25 files passed**; Vite production build and Hostinger package build passed.
- Production: all checks in this document were read-only. No revised migration, rank update, history repair, push, merge, email, or deployment occurred.
- Open gates resolvable without a paid branch: create and rehearse a restorable production database export; capture and verify current Hostinger files; establish a tested maintenance/write-free control. The declined paid staging branch is an acknowledged limitation, not a request to create one.
