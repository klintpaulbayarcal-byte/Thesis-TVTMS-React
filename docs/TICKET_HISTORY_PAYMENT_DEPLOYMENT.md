# Ticket History and Payment Display Deployment

This package does not deploy itself and does not contain production credentials.

## Before production

1. Back up the production database and application files using the hosting provider's supported backup tools.
2. Review `supabase/migrations/202609190001_ticket_history_payment_display.sql` with the database administrator.
3. Apply that migration to an isolated staging Supabase/PostgreSQL project first. Do not run it against production as an exploratory query.
4. In staging, issue three tickets for one normalized plate and confirm plate counts 1, 2, and 3. Issue different violation types and confirm their same-plate/same-violation penalty levels are independent.
5. Record partial and full payments, correct a paid ticket to unpaid, and confirm payment rows remain present as voided with ticket status history and an audit event.
6. Cancel a ticket, confirm its immutable plate count remains unchanged, and confirm it contributes zero to combined outstanding balance.
7. Verify the landing lookup and full `?plate=` lookup show ticket status and balance without owner identity, email, address, driver license, receipt, or internal ID.
8. Run database security/performance advisors and review every result before production approval.

## Application configuration

- Keep `api/config/config.php` as the runtime loader.
- Privately copy `api/config/config.local.example.php` to `api/config/config.local.php` on the target server, or use server environment variables.
- Set the server-only Supabase secret, a random token secret of at least 32 characters, the HTTPS public URL, and `development=false`.
- Never place `config.local.php`, `.env*`, service-role keys, SMTP passwords, database passwords, or user uploads in a shared ZIP or public web asset.

## Deployment order after separate approval

1. Enable maintenance controls appropriate for the site and take a fresh backup.
2. Apply the reviewed migration once through the approved Supabase migration workflow.
3. Verify the migration is present in migration history and the new columns/table/functions exist.
4. Upload the contents of the validated deployment ZIP without overwriting the server's private `api/config/config.local.php` or runtime `uploads/` directory.
5. Run the staging smoke scenarios above against the deployed application.
6. If any check fails, stop and restore using the pre-deployment backup; do not edit production records to force a passing result.

Production deployment requires explicit authorization separate from this review package.
