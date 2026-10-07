TVTMS — READ THIS FIRST (18 September 2026)
==========================================

SOURCE RELEASE CANDIDATE ONLY — NOT DEPLOYABLE DIRECTLY.
This archive contains the latest safe React + PHP + Supabase source and fixes.
The original user-uploaded ZIP and private Supabase data were not changed.

Read FINAL_RELEASE_STATUS_READ_FIRST.md for the exact latest PASS / FAIL /
NOT VERIFIED matrix and FINAL_ENGINEERING_MASTER_PROMPT.md for the one
consolidated implementation and acceptance specification. Historical
completion reports have intentionally been omitted from this handoff.

1. Your Windows local PHP must be PHP 8.1+; PHP 8.0 cannot parse the current
   API's 'never' return types. Confirm Hostinger uses PHP 8.1+ too, with
   required cURL, OpenSSL, fileinfo, and Apache rewrite support.

2. One command from the extracted source root in PowerShell:

   powershell -ExecutionPolicy Bypass -File .\scripts\build-verified-hostinger.ps1

   This checks dependencies, all tests, JSX, PHP, and runs
   npm run build:hostinger for fresh Vite compilation and packaging,
   then verifies required files and secret exclusion. If any step fails, STOP;
   do not upload an older dist/ or deploy/ folder.

3. The successful command creates TVTMS_HOSTINGER_DEPLOY_VALIDATED_BY_WINDOWS_BUILD.zip.
   This ZIP holds only compiled frontend + PHP API + safe public assets. It
   still needs separately approved authenticated functional checks and
   target Hostinger server configuration before production deployment.

4. PRIVATE SERVER CONFIG (NEVER SHARE):
   Keep api/config/config.php as the runtime loader. The included
   api/config/config.local.example.php contains PLACEHOLDERS only. Privately
   copy it to deploy/api/config/config.local.php on the target server, or
   use server environment variables. Set the live Supabase secret, random
   signing secret, correct HTTPS public URL, and development=false. Do not
   include deploy/api/config/config.local.php in a shared ZIP, chat, frontend
   assets or a Git commit. Do not expose private account credentials.

5. DEPLOYMENT requires explicit owner approval. After backing up the exact
   subdomain document root, upload the CONTENTS of deploy/ only, including
   root .htaccess and api/.htaccess. Verify /api/health, React deep-link
   refresh, public no-match lookup, proper Admin/Officer access, and all
   authorized workflows. No FTP upload, Supabase modification, messages or
   cleanup have been performed in this release-candidate session.

See FINAL_RELEASE_STATUS_READ_FIRST.md for blockers and evidence. Do not
claim "production-ready" on source tests or an old deployment report alone.
