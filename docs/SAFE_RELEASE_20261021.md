# Safe release preparation — 21 October 2026

**PREPARATION ONLY. No production release is authorized or performed.**

The current `.github/workflows/deploy-hostinger-v4.yml` deploys on every push to `sync-v4`, writes private server configuration and application files, and removes specific obsolete files. It has no declared GitHub production environment approval gate. A merge to that branch is therefore a deployment action. The local backup branch protects source only; it cannot restore database records, server configuration or uploads.

## 1. Make the candidate reviewable without deploying

Review PR #27 and the additional commit on `audit/data-gathering-readiness-20261021`. Keep the original `sync-v4` untouched. Reviewable local source is sufficient until the owner chooses to publish the branch. If publishing later, push only the named audit branch and open a draft; do not push `sync-v4`. A stacked PR can target PR #27's branch, or a combined draft can target `sync-v4` while clearly identifying that it includes PR #27. Do not merge either automatically.

This follow-up adds `sync-v4` to the existing **verification-only** package workflow's pull-request filter. It runs syntax, full tests, production-style packaging and private-file exclusion checks without FTP/database credentials. GitHub-hosted execution remains unverified until that branch is published. Require its successful check before an approved production merge.

## 2. Verify recovery before approving any production action

The adviser or another authorized Hostinger/database operator must privately collect:

- A current complete logical database export (schema, data, roles/grants, RLS, functions, indexes, constraints, sequences, private schema and migration ledger). Preserve evidence bytea data if stored in the database. Inspect excluded managed schemas/resources. Use the current official backup/restore instructions and discover CLI flags with `--help` on the operator's machine.
- A complete snapshot of the verified live subdomain document root, including hidden Apache files, deployed assets/API, private configuration and runtime uploads. Obtain it through the adviser's hPanel or an authorized read-only FTPS download. Do not guess the root or overwrite anything while collecting it.
- Separate object-storage copies if Supabase Storage or other external storage is used; database backups do not contain Storage object contents.
- Protected off-site copies, capture time/timezone, sizes, SHA-256 hashes, the actual live source/artifact identifier, and the responsible operator. Keep private backups and credentials outside the repository and Actions artifacts.
- A successful restore rehearsal in an isolated destination, checking schema/RPCs/grants, row counts, sequences, sample evidence byte integrity and application startup. Record aggregate results without exposing personal records. No paid database resource should be created without separate cost approval.

A downloaded ZIP or a service-role API key alone is not proof of database recoverability. Do not reset credentials to obtain a backup. Do not restore into populated production as a rehearsal. See `MANUAL_RELEASE_BACKUPS.md` for the existing operator handoff, treating older observations as historical rather than current verified facts.

## 3. Prepare a controlled Actions release

Before the eventual release, have the repository owner prevent an accidental `sync-v4` push from uploading while gates are being prepared. This is an operator action to schedule after backups/acceptance are concrete, not a change made during this audit.

The proposed replacement release workflow should use manual dispatch for a reviewed immutable commit, verify that the candidate contains the approved production baseline, rebuild/test that exact SHA, and reference a `production` GitHub environment with a required adviser reviewer and restricted branches. Keep FTP/database/SMTP secrets in that protected environment, restrict workflow permissions, and serialize production runs. GitHub environment protection only applies if the workflow job actually references it and repository/account features support the configured rules; verify it with a no-write rehearsal before relying on it.

Require an operator's private backup/restore evidence manifest and exact artifact digest. A typed `backup_verified=true` or arbitrary path string cannot establish recoverability. Record only non-sensitive evidence identifiers and hashes in release notes. No secrets, full database dumps or police records belong in logs/artifacts.

The workflow preparation must be reviewed independently of running a deployment. Leave deployment disabled until recoverable backups, browser acceptance, hosted schema compatibility and explicit release approval are all established. Preserve the existing PHP token secret and server configuration deliberately; do not rotate credentials or assume the original local private config equals current live configuration.

## 4. Approved release and rollback sequence

1. Capture the final candidate SHA and verified build digest; repeat the exact required checks only if the candidate changes.
2. Confirm browser/device/SMTP acceptance and actual hosted RPC/grant compatibility. This follow-up and PR #27 add no schema migration. Investigate any existing production migration mismatch before release.
3. Arrange a short maintenance/write pause and a fresh consistent backup close to the release point. Confirm who can restore the exact subdomain, application configuration and database if necessary.
4. Only after the owner approves the concrete backed-up release, execute the protected workflow. Preserve existing runtime uploads. Upload immutable assets before switching entrypoints; retain prior assets so existing pages remain usable. Avoid wildcard or mirror deletion and unsolicited private configuration replacement.
5. Verify deployed SHA/digest, homepage, API health, public catalog and read-only authorized pages. Run controlled acceptance writes only in an explicitly approved test environment; never create fake official payments or mutate genuine production disputes/citations for testing.
6. If application checks fail, pause writes, restore the known previous application/config files, and recheck health. A database restore is a separately approved recovery operation; preserve/reconcile records written after the snapshot rather than discarding them. Reopen collection only after recovery checks pass.

## Current gate status

| Gate | Status |
| --- | --- |
| Local reviewed candidate, tests/build/package | PASS; see final audit report |
| Production homepage/API read-only health | PASS at observation time |
| Verified complete live backups and restore rehearsal | BLOCKED |
| Browser/mobile/physical QR/printing acceptance | BLOCKED |
| Hosted migration/RPC/grant comparison | NOT TESTED |
| Real SMTP delivery to approved test mailbox | NOT TESTED |
| Protected workflow no-write rehearsal | NOT TESTED; proposal only |
| Production release | BLOCKED; no merge or deployment performed |

References checked during this audit:

- [Supabase database backup scope and off-site export guidance](https://supabase.com/docs/guides/platform/backups).
- [Supabase CLI backup/restore procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
- [GitHub deployment environments and required reviewers](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).
