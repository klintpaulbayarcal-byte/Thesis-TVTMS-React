TVTMS v4 - Hostinger deployment package
========================================

This archive contains the compiled React frontend, PHP API, public assets,
Apache routing rules, and safe configuration templates. Hostinger does not
need Node.js or npm to run it.

1. Confirm the target subdomain uses PHP 8.1 or newer with curl, OpenSSL,
   fileinfo, and mbstring enabled, plus Apache mod_rewrite and .htaccess
   overrides.
2. Back up the exact Hostinger document root.
3. Upload the CONTENTS of this archive to that document root.
4. Privately copy api/config/config.local.example.php to
   api/config/config.local.php on the server, or configure the equivalent
   environment variables. Set the real server-only Supabase secret, a new
   random TVTMS token secret of at least 32 characters, the HTTPS public URL,
   and development=false. Never place this private file in a shared ZIP or
   public repository.
5. Do not run the bundled Supabase schema or migrations against the populated
   production database without a separately reviewed migration and approval.
6. Verify /api/health, landing-page assets, a React deep-link refresh, public
   lookup, authorized Admin and Officer login, logout, ticket issuance,
   payments, disputes, evidence, reports, notifications, audit logs, and
   settings with controlled test records.

This package is not itself proof that the live Supabase project, Hostinger
runtime, credentials, email transport, QR scanning, printing, or production
workflows have been verified.

Ticket history/payment change:
- Review and stage-test the four forward-only migrations listed in docs/TICKET_HISTORY_PAYMENT_DEPLOYMENT.md, in filename order, before application upload.
- The guarded workflow uses the owner-approved fixed Hostinger IP fallback. TLS encryption, CA verification, the exact IP allowlist, and the expected Hostinger certificate SAN remain enforced; hostname matching is disabled because the plan hostname is unavailable.
- Follow docs/TICKET_HISTORY_PAYMENT_DEPLOYMENT.md from the source review copy.
- Never overwrite an existing private api/config/config.local.php or runtime uploads directory.
