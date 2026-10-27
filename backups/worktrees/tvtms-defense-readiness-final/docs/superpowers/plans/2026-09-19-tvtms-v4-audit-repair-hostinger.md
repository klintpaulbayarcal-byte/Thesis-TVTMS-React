# TVTMS v4 Audit, Repair, and Hostinger Package Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce one verified Hostinger upload package for the existing TVTMS v4 application while preserving the approved UI, existing role boundaries, and live Supabase data.

**Architecture:** Keep the current same-origin React/Vite frontend and PHP `/api` backend. The PHP backend remains the only holder of the Supabase server credential, and the existing Supabase schema remains authoritative. Repairs are limited to source-backed defects and release blockers, with regression tests added for each corrected behavior.

**Tech Stack:** React 18, Vite 5, React Router 6, PHP 8.3 CLI compatibility target (PHP 8.1+ minimum), Supabase PostgreSQL REST/RPC, pytest, Apache `.htaccess`, Hostinger shared hosting.

**Spec:** `FINAL_ENGINEERING_MASTER_PROMPT.md` and the user-provided TVTMS v4 master engineering prompt.

## Global Constraints

- Preserve the approved landing-page appearance, assets, typography, layout, and responsive behavior.
- Do not modify, reset, migrate, or write to the live Supabase database without explicit permission.
- Do not expose or package Supabase server keys, signing secrets, account credentials, or local configuration.
- Preserve Officer-only ticket issuance and the existing Administrator/Officer authorization model.
- Do not deploy or push source without explicit permission.
- Treat source checks, isolated handler tests, browser checks, live database checks, and production checks as separate evidence classes.
- Package precompiled React assets plus the complete PHP API; Hostinger must not need Node or npm.

## Review Focus

- Invalid, expired, or forged staff tokens must not reach protected handlers.
- Public ticket and plate lookups must not disclose sensitive driver data.
- Duplicate ticket submission and inconsistent payment totals must fail safely or remain blocked if live verification is unavailable.
- Evidence uploads must enforce authentication, ticket access, MIME/type, size, filename, and storage-path controls.
- SPA rewrites, `/api`, `/uploads`, and deep-link refresh must coexist without route shadowing.

---

### Task 1: Establish the immutable baseline

**Files:**
- Inspect: repository root, `package.json`, `vite.config.js`, `.htaccess`, `api/`, `src/`, `supabase/`, `tests/`, `scripts/`
- Create: `docs/TVTMS_V4_FINAL_AUDIT_REPORT.md`

**Interfaces:**
- Consumes: existing source snapshot and user acceptance specification.
- Produces: inventory, environment facts, initial PASS/FAIL/BLOCKED/NOT TESTED matrix, and exact baseline command output.

- [ ] Record Git status or explicitly record that the source is not a Git repository.
- [ ] Inventory first-party frontend, backend, schema, test, and deployment files while excluding generated dependencies.
- [ ] Run `npm run verify:jsx`, the explicit Python 3.13 pytest command, `npm run build`, `npm audit`, and `npm audit --omit=dev`.
- [ ] Lint every PHP file with `C:\tools\php83\php.exe -l` and record PHP version/extensions.
- [ ] Record actual XAMPP Apache PHP separately from the CLI runtime.

### Task 2: Trace application architecture and authorization

**Files:**
- Inspect: `src/routes/AppRoutes.jsx`, `src/context/AuthContext.jsx`, `src/services/api.js`, all `src/pages/*.jsx`, all `api/src/*.php`, all `api/src/handlers/*.php`
- Update: `docs/TVTMS_V4_FINAL_AUDIT_REPORT.md`

**Interfaces:**
- Consumes: frontend routes/actions and PHP route table.
- Produces: React action -> API route -> handler -> Supabase table/RPC trace, with role requirements and response handling.

- [ ] Enumerate public, Administrator, Officer, and shared routes.
- [ ] Map every API service call to its PHP route and handler.
- [ ] Verify server-side authentication and role checks independently of React route guards.
- [ ] Map authoritative ticket, payment, dispute, report, audit, evidence, notification, and settings records.
- [ ] Mark every workflow without live credentials or an isolated database as BLOCKED rather than PASS.

### Task 3: Complete static security audit and targeted validation

**Files:**
- Inspect: all first-party source, configuration, SQL, upload, authentication, and packaging files.
- Produce: Codex Security canonical artifacts and generated `report.md` in the registered scan directory.
- Update: `docs/TVTMS_V4_FINAL_AUDIT_REPORT.md`

**Interfaces:**
- Consumes: source-backed threat model, independent baseline review, and focused authorization/data-flow checks.
- Produces: validated findings only, with source locations, severity, remediation, and explicit coverage.

- [ ] Trace public input and staff identity from entry point through controls to Supabase or filesystem sinks.
- [ ] Validate each candidate once against source and record counterevidence.
- [ ] Check secret handling, CORS, JWT validation, role enforcement, public response minimization, uploads, rate limits, logging, and deployment configuration.
- [ ] Finalize the registered security scan only after canonical artifacts are complete.

### Task 4: Repair confirmed defects with regression coverage

**Files:**
- Modify: only source files proven defective by Tasks 1-3.
- Test: add focused cases under `tests/` for each corrected behavior.

**Interfaces:**
- Consumes: a reproducible failure or source-validated defect.
- Produces: the smallest compatible correction plus a regression test that fails before and passes after the change.

- [ ] For each defect, capture the root cause and affected workflow in the audit report.
- [ ] Add a focused failing regression test without accessing the live database.
- [ ] Apply the minimum source/configuration correction without redesign or schema changes.
- [ ] Run the focused test, relevant module checks, and the full regression suite.
- [ ] Inspect the resulting changed-file set for unrelated edits and secret material.

### Task 5: Verify landing, staff workflows, and packaging behavior

**Files:**
- Inspect/test: `src/pages/`, `src/components/`, `src/layouts/`, `src/styles/`, `public/images/`, PHP handlers, and release scripts.
- Update: `docs/TVTMS_V4_FINAL_AUDIT_REPORT.md`

**Interfaces:**
- Consumes: repaired source and production build.
- Produces: module-by-module evidence matrix and browser/runtime results where locally executable.

- [ ] Serve the PHP API with PHP 8.3 and the production frontend with local routing support without live writes.
- [ ] Exercise landing navigation, responsive layout, public no-match/error handling, route refresh, missing assets, overflow, and console errors.
- [ ] Exercise authentication and protected routes only if safe disposable credentials/configuration are available; otherwise mark them BLOCKED.
- [ ] Verify source-level role and data consistency for ticket, payment, dispute, report, audit, evidence, and notification flows.
- [ ] Record offline support honestly based on implemented mechanisms.

### Task 6: Build and inspect the Hostinger deployment archive

**Files:**
- Modify if required: `scripts/package-hostinger.cjs`, `scripts/build-verified-hostinger.ps1`, `.htaccess`, `api/.htaccess`, deployment documentation.
- Create: `deploy/`, `TVTMS_V4_FINAL_HOSTINGER_DEPLOY.zip`, and final audit report.

**Interfaces:**
- Consumes: passing source gates and fresh Vite `dist/` output.
- Produces: a self-contained upload archive containing compiled frontend, PHP API, public assets, routing rules, and safe configuration templates.

- [ ] Build `dist/` fresh and assemble `deploy/` from that exact build.
- [ ] Exclude source-only files, dependencies, caches, local secrets, and private configuration.
- [ ] Create `TVTMS_V4_FINAL_HOSTINGER_DEPLOY.zip` only after all package gates pass.
- [ ] Inspect archive entries, scan text for secret patterns, and compute SHA-256.
- [ ] Extract to a new temporary directory and rerun structural, PHP syntax, routing, and supported local smoke checks against the extracted package.
- [ ] Copy the verified archive and final report to the user-facing `outputs` directory without uploading to Hostinger.

### Task 7: Final verification and handoff

**Files:**
- Finalize: `docs/TVTMS_V4_FINAL_AUDIT_REPORT.md`

**Interfaces:**
- Consumes: all test logs, security results, browser observations, package inspection, and unresolved environment dependencies.
- Produces: exact changed-file list, PASS/FAIL/BLOCKED/NOT TESTED matrix, security status, deployment-readiness statement, archive location, checksum, and concise deployment instructions.

- [ ] Re-run all required automated checks after the last source change.
- [ ] Verify the final archive was created after the final passing build.
- [ ] Distinguish verified local behavior from live Supabase and Hostinger behavior.
- [ ] List remaining vulnerabilities and operational prerequisites without overstating readiness.
- [ ] Confirm no production upload, database mutation, Git push, or external message occurred.

