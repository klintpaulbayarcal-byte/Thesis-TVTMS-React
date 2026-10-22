# TVTMS React + PHP + Supabase Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the existing TVTMS static frontend to React while preserving the public/admin/officer workflows and replace the temporary PHP/MySQL data layer with a PHP-to-Supabase backend that remains deployable through Hostinger FTP.

**Architecture:** React/Vite compiles to static assets served from Hostinger. Same-origin `/api` requests are handled by PHP. PHP keeps JWT/role enforcement and uses server-only Supabase REST/RPC calls with the existing PostgreSQL schema and migrations from `vehicle-violation-system-FINAL(2).zip`.

**Tech Stack:** React 18, Vite 5, React Router 6, PHP 8+, Supabase PostgREST/RPC, Apache `.htaccess`.

**Spec:** Approved master prompt in the conversation; feature/UI reference is `vehicle-violation-system-FINAL(2).zip`.

## Global Constraints

- Production must not require Node.js, Express, Vite dev server, PM2, or `npm start`.
- Supabase is the only production database.
- Supabase secret keys must remain server-side in PHP configuration.
- Preserve same-origin `/api/...` contracts where practical.
- Preserve Administrator, Apprehending Officer, and public workflows.
- Do not overwrite the user's original ZIPs.

---

### Task 1: Contract tests and inventory
**Files:** Create `tests/verify_react_contract.py`, `tests/verify_php_supabase_contract.py`, `tests/verify_distribution.py`.
**Interfaces:** Tests define required routes, pages, server-only secret rules, and deployable package shape.
- [ ] Write failing tests for React route/page inventory and PHP Supabase client/router.
- [ ] Run tests and confirm failures are caused by missing migration files.

### Task 2: React/Vite foundation
**Files:** Create `package.json`, `vite.config.js`, `src/main.jsx`, `src/App.jsx`, shared layouts/components/services/context/styles.
**Interfaces:** `apiRequest(endpoint, options)`, `AuthProvider`, protected routes, same-origin production API.
- [ ] Implement the minimal foundation to satisfy route and service tests.
- [ ] Run route contract tests and build.

### Task 3: React page migration
**Files:** Create page modules for public, Admin, Officer, tickets, payments, disputes, reports, analytics, audit logs, notifications, profile, settings, lookups.
**Interfaces:** Pages use shared API service and reusable `DataTable`, `PageHeader`, `Modal`, form/status components.
- [ ] Migrate page-by-page behavior using the reference ZIP and existing API contracts.
- [ ] Verify every required route resolves to a real page module and no production page uses hard-coded operational records.

### Task 4: PHP Supabase foundation
**Files:** Replace DB configuration/helpers with `api/config/config.php`, `config.example.php`, `api/src/supabase.php`; preserve router/auth helpers.
**Interfaces:** `supabase_request`, `supabase_select`, `supabase_insert`, `supabase_update`, `supabase_delete`, `supabase_rpc`.
- [ ] Implement REST/RPC client with secret kept server-side.
- [ ] Replace MySQL health check with Supabase health check.
- [ ] Verify PHP syntax and secret rules.

### Task 5: PHP feature handlers
**Files:** Rewrite auth/users/violations/tickets/payments/disputes/evidence/notifications/reports/settings/vehicles/public handlers to Supabase REST/RPC.
**Interfaces:** Preserve existing HTTP routes and JSON response envelopes used by React/static reference.
- [ ] Port authentication/roles and account operations.
- [ ] Port catalog/vehicle/repeat-offender operations.
- [ ] Port transactional ticket/payment/dispute flows using existing Supabase RPC functions.
- [ ] Port evidence, notifications, settings, public lookup/contact, and reports.
- [ ] Run all PHP contract/lint tests.

### Task 6: Supabase schema/migrations and Hostinger deployment
**Files:** Add `supabase/schema/database.postgres.sql`, `supabase/migrations/*.sql`, `.htaccess`, deployment docs, production build script.
**Interfaces:** `npm run build` produces static `dist`; packaging copies `dist` + `api` + `uploads` to deploy root.
- [ ] Copy audited schema/migrations from the reference ZIP.
- [ ] Configure Apache SPA fallback while excluding `/api` and `/uploads`.
- [ ] Document local and FTP deployment without real secrets.

### Task 7: Final verification and packaging
**Files:** Create `REACT_MIGRATION_CHANGES.md`, `HOSTINGER_REACT_SUPABASE_DEPLOYMENT.md`, final ZIP.
**Interfaces:** Final ZIP includes React source, production static build, PHP API, Supabase SQL/migrations, uploads structure, docs.
- [ ] Run React tests/build, PHP lint, route inventories, secret scan, and deployment-structure checks.
- [ ] Package `/mnt/data/TVTMS-REACT-PHP-SUPABASE-HOSTINGER-FINAL.zip`.
