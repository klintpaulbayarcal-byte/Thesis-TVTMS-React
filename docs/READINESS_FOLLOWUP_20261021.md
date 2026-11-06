# Readiness follow-up — 21 October 2026

## Release status

**Production backup verification: BLOCKED. No production deployment is authorized or performed.**

The user confirmed that they do not know whether a current Supabase or Hostinger backup exists and cannot access the adviser's hPanel/private backup files. This is an explicit unresolved gate, not a completed check. Continue local engineering and read-only checks; do not merge, push to production, deploy, modify production data, or perform destructive operations.

The original `sync-v4` remains clean at `7441af1daef3163217aa976bc62a5c20b82a6e68`, with zero local-only commits relative to the fetched production branch. Audit commit `f88111f049de2504e7daa30479146c5d409cd930` is retained in the audit branch's ancestry. All fixes in this follow-up are confined to `.audit-worktrees/readiness`; no ignored private configuration, uploads, existing backups or original source files were changed.

## Confirmed additional payment defect

`payments_record` cast request fields before checking their types. PHP converted `true` and nonempty arrays/objects to numeric `1`, accepted numeric-prefix strings such as `100oops` as `100`, truncated fractional ticket identifiers, and coerced non-text receipt fields into strings. These malformed JSON inputs could reach the payment RPC with a different amount, ticket identifier or receipt than supplied. Existing amount/range/date validation did not prevent this class of coercion.

The local fix checks the original JSON value types before casts, requires a positive integer ticket identifier, a numeric finite amount and a text receipt, and retains the existing precision/range/date/method/role restrictions. No migration or role-policy change is needed. Normal numeric amount strings remain accepted for compatibility.

Evidence:

- New real PHP boundary regressions initially produced **13 failed, 6 passed**, reproducing malformed inputs reaching an RPC double. The double stops at the RPC boundary and never writes a database.
- After the fix, all **19 payment input cases passed**.
- Added nine malformed-input HTTP cases to the existing guarded isolated smoke script; all were rejected with HTTP 400/`VALIDATION_ERROR`, and the fixture ticket still had zero payment records before valid payments were tested.
- All **nine isolated HTTP smoke groups passed**, including valid partial/full payments and public dispute payment restrictions. The launcher verifies disposable loopback fixtures and disables SMTP. No production requests or real payments were used by this test.

Changed files:

- `api/src/handlers/payments.php`
- `scripts/verify-isolated-api.mjs`
- `tests/test_payment_input_runtime.py`
- This follow-up report

## Latest local verification

| Check | Result |
| --- | --- |
| `npm test` | **PASS — 433 passed, 0 failed, 0 skipped**, 78.28 seconds |
| New real PHP payment boundary tests | **PASS — 19 cases**, included in the full suite |
| `node scripts/verify-isolated-api.mjs` | **PASS — nine HTTP smoke groups** |
| PHP syntax | **PASS — all 26 API PHP files** |
| `npm run verify:jsx` | **PASS — 57 JavaScript/JSX files** |
| `npm run build:hostinger` | **PASS — Vite 8.3.4, 108 modules; package assembled** |
| `git diff --check` | **PASS** |

These checks validate the local candidate, not the currently deployed code. The full suite includes different evidence strengths: source contracts, API doubles and migrated transactional database tests.

## Hosted compatibility and security metadata — read only

The connected Supabase project was identified by its existing production reference as `TVTMS Production`, with status `ACTIVE_HEALTHY`. Only system catalogs, migration metadata and advisor results were inspected; no police-record rows were read into this report and no application RPC was executed against production.

- **59 statically named calls** extracted from PHP `supabase_rpc`/`report_rpc_rows` call sites were compared against the hosted `public` function catalog. **Missing: zero. Server execute denied: zero.** This checks function presence/server execution privileges, not every function body or result shape.
- All ten separately checked critical RPCs are present with the expected parameter names/signatures: issuance, ticket detail/mutation, atomic safe deletion, payment, dispute submission/resolution, public lookup, account rank update and catalog deletion.
- All **19 public ordinary tables** have RLS enabled. `FORCE ROW LEVEL SECURITY` is false; PHP uses the server role and still needs its own authorization checks, as exercised locally.
- Across **66 hosted `tvtms_*` functions**, none is executable by `anon` or `authenticated`, and none is `SECURITY DEFINER`.
- The only `tvtms_*` function without service-role execution is the superseded `tvtms_public_dispute(text,text)`. Its revocation is intentional in the existing verification migration. Current PHP calls `tvtms_public_dispute_submit`, which is present and executable. No grant change is warranted.
- The migration ledger contains the revised flat-penalty, final staff report, safe cancelled/failed-email deletion and trusted server archive-grant entries. Hosted migration versions/names differ from some local migration filenames, so filename equality is not treated as a reliable schema comparison.
- The security advisor returned **19 informational `rls_enabled_no_policy` findings** and no warning/error category in that response. With this PHP-only server access pattern, do not add broad browser policies to clear informational notices. [Supabase's finding description](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) explains the absence of policies; actual access must be considered with grants and server behavior.

**Compatibility status: PASS for inspected presence/signatures/server grants; NOT TESTED for complete schema/function-body equivalence, hosted PostgREST behavior, and live end-to-end writes.** No migration was applied.

## Remaining acceptance limits

| Gate | Result and concrete blocker |
| --- | --- |
| Recoverable current production backups | **BLOCKED** — explicitly unknown; adviser controls Hostinger/private backup access |
| Browser acceptance | **BLOCKED** — an Edge browser connector was detected, but inventory/open-tab calls failed with `Unable to load browser request-header policy`; no workaround bypassed this protection |
| Real email receipt/delivery | **NOT TESTED** — local tests use offline fixtures/disabled SMTP; no message sent to others |
| Device GPS/camera, physical QR scan and printing | **NOT TESTED** — requires a functioning browser/device and acceptance session |
| Production deployment | **BLOCKED** — no merge, push or release performed |

The existing final audit's feature matrix remains the detailed inventory of coverage and limits. This follow-up supersedes its previous “hosted compatibility not tested” entry only for the metadata checks described above. It does not close browser, backup or release gates. The existing safe-release procedure remains preparation guidance; no verified backup, restore rehearsal or release approval is implied.
