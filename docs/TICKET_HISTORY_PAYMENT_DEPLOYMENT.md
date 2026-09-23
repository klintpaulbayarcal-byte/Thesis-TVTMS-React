# Ticket History and Payment Display Deployment

This package does not deploy itself and does not contain production credentials.

## Before production

1. Back up the production database and application files using the hosting provider's supported backup tools.
2. Review the forward-only migrations with the database administrator and apply them in filename order: `202609190001_ticket_history_payment_display.sql`, `202609190002_plate_lookup_consistency.sql`, `202609200001_ticket_email_dispute_verification.sql`, then `202609220001_ticket_email_snapshot_only.sql`.
3. Apply those migrations to an isolated staging Supabase/PostgreSQL project first. Do not run them against production as exploratory queries. The final migration replaces RPC definitions but does not rewrite or delete tickets, payments, disputes, or vehicles; legacy tickets without an issuance email snapshot intentionally fail closed for outbound ticket-related email.
4. In staging, issue three tickets for one normalized plate and confirm plate counts 1, 2, and 3. Issue different violation types and confirm their same-plate/same-violation penalty levels are independent.
5. Record partial and full payments, correct a paid ticket to unpaid, and confirm payment rows remain present as voided with ticket status history and an audit event.
6. Cancel a ticket, confirm its immutable plate count remains unchanged, and confirm it contributes zero to combined outstanding balance.
7. Verify the landing lookup and full `?plate=` lookup show ticket status and balance without owner identity, email, address, driver license, receipt, or internal ID.
8. Run database security/performance advisors and review every result before production approval.
9. Confirm direct `anon` and `authenticated` execution remains revoked for every replaced RPC, while `service_role` retains only the documented execute grants.

## Application configuration

- Keep `api/config/config.php` as the runtime loader.
- Privately copy `api/config/config.local.example.php` to `api/config/config.local.php` on the target server, or use server environment variables.
- Set the server-only Supabase secret, a random token secret of at least 32 characters, the HTTPS public URL, and `development=false`.
- Never place `config.local.php`, `.env*`, service-role keys, SMTP passwords, database passwords, or user uploads in a shared ZIP or public web asset.
- The guarded GitHub deployment currently uses the owner-approved fixed-IP fallback because the Hostinger plan hostname is unavailable. Keep `FTP_SERVER` pinned to the separately approved IP. TLS encryption, CA verification, and the expected Hostinger `*.hstgr.io` certificate SAN remain mandatory, while hostname matching is disabled for this explicit fallback.

## Deployment order after separate approval

1. Enable maintenance controls appropriate for the site and take a fresh backup.
2. Apply each reviewed migration once, in the filename order above, through the approved Supabase migration workflow.
3. Verify all four migration versions are present in migration history; verify the snapshot columns/sequence table and replacement functions exist with the intended grants.
4. Upload the contents of the validated deployment ZIP without overwriting the server's private `api/config/config.local.php` or runtime `uploads/` directory.
5. Run the staging smoke scenarios above against the deployed application.
6. If any check fails, stop and restore using the pre-deployment backup; do not edit production records to force a passing result.

Production deployment requires explicit authorization separate from this review package.
