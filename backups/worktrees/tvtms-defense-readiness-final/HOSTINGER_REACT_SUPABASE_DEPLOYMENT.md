# TVTMS React + PHP + Supabase — Hostinger FTP Deployment

## Final architecture

- **Browser UI:** React/Vite production build (static HTML/JS/CSS)
- **Server API:** PHP under `/api`
- **Database:** Supabase PostgreSQL
- **Production hosting:** conventional Hostinger/Apache hosting uploaded over FTP
- **No production Node server is required.** Node/Vite is used only to build the React frontend locally.

## 1. Supabase preparation

The `supabase/` folder contains the schema and API migrations taken from the full TVTMS reference implementation.

- `supabase/schema/database.postgres.sql` — baseline schema
- `supabase/migrations/202609120001_api_access.sql` through `202609120005_reports.sql` — server API access, atomic ticket/payment/dispute/catalog/report RPCs

**Existing Supabase project:** the connected `TVTMS Production` database has already been inspected and currently contains the required TVTMS tables and RPC functions. Do **not** import or re-run the bundled baseline schema/migrations against this populated project unless a future reviewed migration explicitly requires it.

The PHP API is designed to use a **server-side Supabase secret/service key**, never a browser key.

## 2. Local PHP configuration

Do **not** overwrite `api/config/config.php`. That file is the runtime loader.

Copy:

```text
api/config/config.local.example.php
```

to:

```text
api/config/config.local.php
```

and fill only the server-side values there:

```php
return [
    'supabase_secret_key' => 'YOUR_SERVER_SIDE_SUPABASE_SECRET',
    'token_secret' => 'A_NEW_RANDOM_SECRET_AT_LEAST_32_CHARACTERS',
    'app_public_url' => 'http://localhost/TVTMS-REACT-PHP-SUPABASE',
    'development' => true,
];
```

`config.local.php` is git-ignored and HTTP access to `api/config/` is denied by `.htaccess`. Never place `supabase_secret_key`, `token_secret`, or SMTP passwords in React/Vite variables.

## 3. Local React development

Requirements:

- Node.js 20+ recommended
- PHP 8.1+ with cURL, `fileinfo`, and OpenSSL
- Apache/XAMPP serving the PHP API

From the project root:

```bash
npm install
npm run dev
```

The Vite development server proxies `/api` and `/uploads` to the PHP server configured by `VITE_PHP_API_ORIGIN`.

Example `.env.local` (browser-safe public origin only):

```text
VITE_PHP_API_ORIGIN=http://localhost/TVTMS-HOSTINGER-FTP-PHP-SUPABASE
```

Never put a Supabase secret in a `VITE_` variable.

## 4. Test the PHP API first

Open the PHP site's health endpoint, for example:

```text
http://localhost/TVTMS-HOSTINGER-FTP-PHP-SUPABASE/api/health
```

A configured system should report:

- `status: healthy`
- `database: connected`
- `databaseClient: supabase-postgresql`
- `runtime: php`

If it is unhealthy, check PHP cURL and the server-side Supabase credentials before debugging React.

## 5. Build the React frontend

Run:

```bash
npm run build
```

Vite generates static files in `dist/`.

The final package includes a `deploy/` folder assembled as:

```text
deploy/
├── index.html
├── assets/
├── images/
├── api/
├── uploads/
└── .htaccess
```

Only the **contents of `deploy/`** are intended for the Hostinger subdomain document root.

## 6. Hostinger FTP deployment

Upload the contents of `deploy/` to the web root for:

```text
https://trafficviolation.dcsbisu.com
```

Do not upload `node_modules`.

The production server does not run `npm start`, `npm run dev`, or `node server.js`. Apache serves the compiled React files and PHP handles `/api`.

## 7. Production PHP configuration

`npm run build:hostinger` intentionally **does not copy** `api/config/config.local.php` into `deploy/`, so a ZIP or shared build cannot accidentally contain your live server secret.

After the build succeeds, create this file locally **inside the deployment folder**:

```text
deploy/api/config/config.local.php
```

Use `deploy/api/config/config.local.example.php` as the template and set:

```php
return [
    'supabase_secret_key' => 'YOUR_REAL_SERVER_SIDE_SUPABASE_SECRET',
    'token_secret' => 'YOUR_NEW_RANDOM_TOKEN_SECRET_AT_LEAST_32_CHARACTERS',
    'app_public_url' => 'https://trafficviolation.dcsbisu.com',
    'development' => false,
];
```

Then upload that server-only file through FTP together with the rest of `deploy/`. Do **not** commit it, send it in chat, or include it in any ZIP you plan to share.

Alternatively, if your Hostinger plan lets you define server environment variables, use `SUPABASE_SECRET_KEY`, `TVTMS_TOKEN_SECRET`, `TVTMS_PUBLIC_URL`, and `TVTMS_DEVELOPMENT` instead and leave `config.local.php` absent.

## 8. React Router and PHP API

The root `.htaccess` deliberately excludes `/api`, `/uploads`, real files, and real directories from the React history fallback. All other frontend routes are sent to `index.html` so refreshes on routes such as `/admin/reports` still work.

## 9. Production smoke test

After FTP upload, test in this order:

1. `/api/health`
2. Public landing page
3. Public ticket/plate lookup
4. Administrator login
5. Apprehending Officer login
6. Admin dashboard and analytics
7. Ticket issue/view/detail workflow
8. Repeat-offender/license/plate lookup
9. Payment recording
10. Dispute submission/review
11. Evidence upload/view
12. Notifications
13. PDF report download
14. Audit logs and settings
15. Logout and protected-route behavior

## 10. Fresh verification snapshot (2026-09-16)

- `npm install`: PASS.
- `npm test`: PASS, 36 tests passed.
- `npm run verify:jsx`: PASS, 47 files verified.
- `npm run build:hostinger`: PASS, producing `dist/` and `deploy/`.
- PHP lint: PASS, 40 source/deploy PHP files checked with zero errors.
- Deploy secret scan: PASS; `config.local.php` is excluded.
- Live login and write workflows: NOT VERIFIED until server configuration, valid staff credentials, and a controlled deployment are available.

## 11. Security checklist

- Keep the Supabase secret key in PHP only.
- Generate a fresh production `token_secret`.
- Do not commit `api/config/config.php` with real credentials.
- Keep `development` disabled in production.
- Use HTTPS in production.
- Do **not** re-apply the bundled Supabase schema/RPC migrations to the populated `TVTMS Production` project; the required functions were already verified as present.

## 12. Live database target

## 13. Local XAMPP verification

The local Vite proxy defaults to the actual project folder under XAMPP:

```text
http://localhost/TVTMS-REACT-PHP-SUPABASE-HOSTINGER-FINAL-CANDIDATE-v2
```

With `api/config/config.local.php` configured locally, `/api/health` returned HTTP 200 with a healthy Supabase PostgreSQL connection. Public stats and violations also returned successfully through the Vite proxy. Successful Admin and Officer login remain dependent on the current account passwords and were not guessed or changed.

This build is aligned to the existing **TVTMS Production** Supabase project (`cwrhxvrmnfmzuxotsjrw`). The project URL is already set in the PHP config template. Before deployment, set only the server-side Supabase secret and a new long random TVTMS token secret. Never place either secret in React/Vite source.

Do **not** import the bundled schema/migrations into the populated production project unless a future reviewed migration explicitly requires it. The live database already contains the TVTMS tables and RPC functions used by this backend.
