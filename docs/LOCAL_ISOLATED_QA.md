# Safe local TVTMS development

For the normal workflow, run `npm run dev` (PowerShell: `npm.cmd run dev`). It starts the existing `dev:api` and `dev:web` scripts, loads the existing private `api/config/config.local.php` / configured server environment, and uses the real existing accounts through unchanged authentication. The launcher clears inherited isolated-QA flags and routes the frontend through the local PHP server. Its explicit process-only configured-development marker permits the database you already configured, including your existing hosted database; it does not change private configuration, credentials, account roles, permissions or the stored development flag. Startup performs no account seeding, login, record creation or migrations. Normal user actions use that configured database.

Normal startup does not apply pending migrations. If the configured database lacks schema required by the revised source, the affected features still need that schema through a separately authorized migration; the launcher does not work around it by changing accounts or weakening citation validation.

`npm run dev:isolated` is optional QA only. It continues to use disposable TEST-ONLY fixtures and cannot route to an external/production API or database. The configured-development marker is ignored in isolated mode. A bare PHP development server without the normal launcher's marker retains the production-access guard described below.

Run `npm run dev:isolated` (PowerShell: `npm.cmd run dev:isolated`). This starts the existing React/Vite UI on loopback port 5173, PHP on 8000, and the reused PGlite REST adapter on 54321. All three ports must be free. `TVTMS_PHP` may select an existing PHP 8.1+ executable; Windows defaults to the existing PHP 8.3 installation.

The isolated launcher rejects an unsafe inherited `VITE_PHP_API_ORIGIN` before starting any service. An unset/empty value or `http://127.0.0.1:8000` / `http://localhost:8000` (optional trailing slash) is allowed and canonicalized to `http://127.0.0.1:8000` in the child processes. Other hosts, ports, schemes, paths, userinfo, queries and fragments are rejected without echoing the supplied value. Vite rechecks this restriction in isolated mode and binds to `127.0.0.1:5173` with a strict port; both API and uploads proxies use the fixed isolated PHP origin. Ordinary development configuration is unchanged.

Each start creates a fresh migrated database under ignored `.test-tmp/isolated-dev-*` and inserts two **TEST-ONLY local QA fixtures**:

| Display name | Local email | Existing application role value |
| --- | --- | --- |
| TEST-ONLY Administrator (Local QA) | `admin@local.test` | `admin` |
| TEST-ONLY Apprehending Officer (Local QA) | `officer@local.test` | `apprehending_officer` |

Their disposable password is `LocalTestPass123!`; `TEST ONLY RANK` is fixture data. These accounts are never replacements for the real Administrator or Apprehending Officer. The harness does not import, rename, update, or reset any real account. It uses the source's existing roles, authentication and permission checks without defining new application roles. Never copy fixture accounts, credentials, rank data, or their database to production. No real identities, roles, permissions, or credentials are changed by this QA setup.

Each start also uses a separate ignored `.test-tmp/isolated-runtime-*` directory for rate-limit files and temporary state. Production-style rate limits remain enabled; run the smoke script once per fresh startup. Stop with Ctrl+C. Test records are never deployed. Old disposable directories can be removed after their processes stop.

The isolated PHP mode bypasses `api/config/config.local.php`, uses fixed loopback database/signing fixtures only within the QA process, and disables SMTP. It does not edit private configuration or change real database, signing, or account credentials. The adapter binds only to 127.0.0.1 and requires its fixture key. It implements the existing test adapter's subset of REST semantics; this is not real hosted PostgREST staging. Without the explicit normal `npm run dev` marker, the PHP built-in development server rejects a known production project URL, production public URL, production JWT project reference, production environment marker, or anything other than an explicit boolean development flag before any database request. The optional isolated launcher never enables configured hosted-database access.

Run `node scripts/verify-isolated-api.mjs` in a second terminal for HTTP smoke tests. The script refuses to mutate unless `/api/health` confirms isolated mode and disabled SMTP and both logins return the expected TEST-ONLY names, emails and existing role values. Before testing the rank guard, it also verifies the target is the same TEST-ONLY Officer fixture. It checks Officer login/rank, exact catalog, all 18 normal Admin API protections, optional license classification, required vehicle selection, Others description, 300/450 totals, duplicate rejection, timestamp/deadline, readable place/supporting GPS, public privacy, disputes, partial/full payments, reports/analytics/audit, and notification tracking. It creates disposable records only. Run `npm test` for the independent transactional database and PHP bootstrap regressions.

Manual browser QA at `http://localhost:5173` remains a separate requirement: inspect blank classifications/types, all 18 choices, Others validation, 300/450 previews, final review, issuance, public citation/plate lookup, protected Admin catalog controls, payments/disputes/reports/audit, and mobile public catalog presentation. HTTP tests are not a substitute for this browser evidence.

Production configuration continues to be supplied explicitly by `scripts/render-production-config.php` in the guarded workflow. Local private config and release markers stay ignored/untracked; the package copier excludes them before reading/copying, and its existing credential scan still rejects other hardcoded server keys. Deployment contains no isolated launcher, adapter, test database, test accounts, or test scripts.

Real isolated hosted Supabase/PostgREST staging was not performed because the optional paid development branch was declined.
