# Manual backup prerequisites for the revised citation release

No passwords or keys should be posted in chat, Git, screenshots, reports, or command transcripts. No release authorization should be requested until the exports, live-server backup, browser QA, and maintenance checks are verified. The following is preparation guidance, not authorization to change production.

1. In the Supabase dashboard, select **TVTMS Production** and verify project ref `cwrhxvrmnfmzuxotsjrw`. Open **Database → Backups** to check available exports. The earlier dashboard observation was “No backups”; dashboard access could not be rechecked in this session. A CSV/table export is not a complete database backup. Free projects should use an off-site logical export, as described in the [official backup guidance](https://supabase.com/docs/guides/platform/backups).
2. Open **Connect → Session pooler** and privately obtain the connection details. An authorized database operator must use an existing database credential through a trusted secret store or private prompt. A service-role API key cannot authenticate `pg_dump`. If the existing database credential cannot be retrieved, stop here. Do not reset it during preparation: that would be an unapproved production credential change. No paid branch/project is needed.
3. On a trusted workstation with the official Supabase CLI and Docker, create a protected directory outside this repository. Discover current `supabase db dump --help` flags first. Use the [official five-file procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), with the connection URL supplied privately in an operator-only environment variable. Do not echo it or use `supabase link` to create/change production connection roles during this preparation.

```powershell
# TVTMS_BACKUP_DB_URL is supplied privately by the authorized operator.
# Run inside the protected backup directory, never inside this repository.
supabase db dump --db-url $env:TVTMS_BACKUP_DB_URL -f roles.sql --role-only
supabase db dump --db-url $env:TVTMS_BACKUP_DB_URL -f schema.sql
supabase db dump --db-url $env:TVTMS_BACKUP_DB_URL -f data.sql --use-copy --data-only -x storage.buckets_vectors -x storage.vector_indexes
supabase db dump --db-url $env:TVTMS_BACKUP_DB_URL -f history_schema.sql --schema supabase_migrations
supabase db dump --db-url $env:TVTMS_BACKUP_DB_URL -f history_data.sql --schema supabase_migrations --use-copy --data-only
Get-Item roles.sql,schema.sql,data.sql,history_schema.sql,history_data.sql | Select-Object Name,Length,LastWriteTimeUtc
Get-FileHash roles.sql,schema.sql,data.sql,history_schema.sql,history_data.sql -Algorithm SHA256 | Select-Object Path,Hash
```

Record the scope, timestamp, sizes/hashes, and protected off-site copy. Inspect privately for all application tables, evidence DB data, sequences, functions/RPCs, indexes, constraints, grants, RLS/policies, and the migration ledger. Include the application's private schema. Record managed schemas/resources excluded by the dump; separately protect external storage resources if used. Do not display personal rows. Validate restore ordering, extensions and existing managed roles against the official guide; a full paid hosted restore rehearsal is not required, but an unchecked download is insufficient. Never blindly restore these files into populated production. A coordinated recovery must keep writes paused and preserve any records created after the snapshot.

4. In Hostinger hPanel, go to **Websites → the TVTMS site's Dashboard → Backups → Restore and download → Files backups**. Select the latest suitable date, click **Download files**, wait for preparation, then **Download** the `.tar.gz` archive. These are the [documented Hostinger steps](https://www.hostinger.com/support/5981435-how-to-download-backups-at-hostinger/). Download only; do not click Restore.
5. Check the archive timestamp against current live files. If the available backup predates the current deployed state, use **Files → File Manager** and download the complete, verified `trafficviolation.dcsbisu.com` document root, including hidden files, or have an authorized operator perform a read-only FTPS mirror of that exact root. Do not infer the folder from the domain name alone. Include `index.html`, `assets/`, deployed `api/`, every `.htaccess`, private `api/config/config.local.php`, and all uploads/runtime files. Keep the archive outside Git; it contains secrets and possibly personal data. Store an off-site copy. Hash it and verify archive integrity/sample files privately. Restoring the exact subdomain tree from this verified copy is the application rollback method; do not restore unrelated websites.
6. Supply only the protected artifact locations and metadata for subsequent verification. This does not require sharing credentials. The verified Git rollback archive is useful source recovery, but it does not replace this live-server copy.

The release remains blocked if no credible logical export or trustworthy live Hostinger backup is available. The source fixes and read-only aggregate checks can be completed while these gates remain open.

Real isolated hosted Supabase/PostgREST staging was not performed because the optional paid development branch was declined.
