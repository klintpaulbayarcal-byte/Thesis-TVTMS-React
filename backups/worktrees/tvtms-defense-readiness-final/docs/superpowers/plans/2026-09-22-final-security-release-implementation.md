# TVTMS Final Security Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove confirmed dependency advisories, make ticket-email recipient selection fail closed in SQL, rerun the complete release gate, and produce an evidence-based deploy/no-deploy decision.

**Architecture:** Preserve the React/PHP/Supabase application and existing UI. Upgrade only the vulnerable routing/build packages, keep declarative routes compatible, add a forward-only non-destructive SQL function replacement, and validate source, package, security boundaries, and public behavior without production writes.

**Tech Stack:** React 18, React Router 7, Vite 8, PHP 8.1+, Supabase PostgreSQL, pytest, GitHub Actions, Hostinger FTPS workflow.

**Spec:** User-supplied `FINAL MASTER ENGINEERING PROMPT` plus `docs/superpowers/specs/2026-09-21-tvtms-defense-readiness-design.md`.

## Global Constraints

- Preserve existing design, roles, workflows, records, ticket/payment/dispute history, and API contracts.
- Never expose or package credentials, runtime uploads, or production data.
- No production database writes, fake production records, force-push, or deployment before every mandatory gate passes.
- Use TDD for behavior changes and forward-only SQL migrations; do not edit prior migrations.
- A build or isolated test is not evidence of authenticated staging or SMTP inbox delivery.

## Review Focus

- Declarative React Router routes, redirects, protected routes, query parameters, and back-button behavior remain compatible after v7.
- Vite 8 builds identical root-relative Hostinger assets and preserves SPA/API routing.
- Ticket-email claim never falls back from immutable issuance email to mutable vehicle email.
- Legacy tickets without a valid issuance snapshot fail closed without sending or deleting records.
- Package and workflow continue to exclude private configuration and uploads.

---

### Task 1: Dependency remediation

**Files:** Modify `package.json`, `package-lock.json`; test existing route/build/security contracts.

- [ ] Record the four current advisories and official compatibility requirements.
- [ ] Upgrade `react-router-dom` to `7.18.4`, `vite` to `8.3.0`, and `@vitejs/plugin-react` to `6.1.1` using npm without `--force`.
- [ ] Run production and full audits; require zero remaining advisories.
- [ ] Run route/import tests, full pytest suite, and production build.
- [ ] Commit the consistent manifest and lockfile.

### Task 2: Database-enforced email recipient snapshot

**Files:** Create `supabase/migrations/202609220001_ticket_email_snapshot_only.sql`; modify `tests/test_email_dispute_migration.py` and email recipient guard tests if required.

- [ ] Add a failing migration contract proving the newest claim definition reads only `tickets.owner_email_at_issue` and contains no `vehicles.owner_email` fallback.
- [ ] Add a forward-only `create or replace function` migration preserving actor/ownership, ledger, idempotency, and service-role grants while using only the immutable ticket snapshot.
- [ ] Run targeted migration and PHP recipient tests, then the full suite.
- [ ] Do not apply the migration to production; document staging/application order and rollback.

### Task 3: Security and release-package review

**Files:** Security scan artifacts outside the repository; update the final release report only.

- [ ] Complete the repository-wide static security scan and validate any source-backed findings.
- [ ] Check PHP authorization guards, uploads, public privacy, payment mutations, dispute verification, SMTP binding, and deployment exclusions.
- [ ] Run credential filename/pattern scans and inspect the exact Hostinger archive inventory.
- [ ] Fix only validated release-impacting findings with RED/GREEN tests.

### Task 4: Complete local release gate

**Files:** Generated `dist/`, `deploy/`, release ZIP; update final release report.

- [ ] Run locked dependency install, 171+ regression tests, PHP lint, JSX/import verification, Vite/Hostinger build, and both npm audits.
- [ ] Test read-only public production homepage/API behavior and local desktop/mobile rendering where the environment permits.
- [ ] Record authenticated staging, database, SMTP, backup, and branch-protection gates as NOT VERIFIED unless direct evidence is obtained.
- [ ] Generate and hash the credential-free Hostinger ZIP from the exact candidate commit.

### Task 5: Release decision

**Files:** Update `docs/superpowers/reviews/2026-09-22-final-release-gate.md`.

- [ ] Record exact commits, commands, counts, scan results, package hash, migration status, CI status, and unresolved gates.
- [ ] If every mandatory gate passes, verify production backup/rollback and deploy through the guarded `sync-v4` workflow; otherwise do not merge or deploy.
- [ ] Return exactly the evidence-supported final status required by the master request.
