# Ticket History and Payment Display Design

## Purpose

Add immutable plate ticket sequence snapshots while keeping ticket history, payment state, balances, cancellation state, and public lookup results current. The implementation must preserve existing roles and workflows, keep private owner data out of public responses, and remain deployable only through an explicit future production migration.

## Scope and constraints

- Work only in the local review copy. Do not deploy or connect to the live database.
- Do not delete or modify private production configuration. Exclude `api/config/config.local.php`, `.env*`, uploads, generated output, dependencies, caches, and prior archives from the distributable ZIP.
- Preserve current React styling, PHP authentication/authorization, Admin functions, and Apprehending Officer functions.
- Keep every ticket, including paid and cancelled tickets, in history.
- Cancelled tickets contribute zero to current outstanding balances.
- The new ticket penalty and the plate's combined outstanding balance are separate values and are never added together for charging.

## Data model

Add `tickets.plate_ticket_count_at_issue integer` and `tickets.same_violation_offense_count_at_issue integer`. Both values are immutable issuance snapshots after backfill.

Add `plate_ticket_sequences(normalized_plate text primary key, last_number integer, updated_at timestamptz)`. The normalized plate is uppercase with spaces and hyphens removed. The sequence records every issued ticket, including tickets later cancelled, so values are never reused or renumbered.

Backfill existing ticket snapshots with `row_number()` partitioned by normalized plate, ordered by `date_issued`, `time_issued`, `created_at`, and `id`. Backfill the same-violation snapshot with a row number partitioned by normalized plate and violation ID, excluding cancelled tickets from the offense-level sequence in accordance with the existing penalty rule. A cancelled historical ticket retains the value it originally occupied as closely as existing data permits; the migration does not renumber snapshots after deployment.

Initialize each plate sequence to the maximum backfilled plate count. Enable RLS, revoke browser-role access, and grant only the backend `service_role` the minimum table privileges required by the existing PHP API.

## Issuance transaction and concurrency

`tvtms_ticket_create` retains its existing normalized-plate advisory transaction lock. In the same transaction it atomically upserts `plate_ticket_sequences`, incrementing and returning `last_number`. That number is written to `plate_ticket_count_at_issue` on the new ticket.

The same transaction calculates `same_violation_offense_count_at_issue` from non-cancelled tickets matching both normalized plate and violation ID. The penalty rule continues to use this same-plate/same-violation level. The response exposes both fields with distinct names.

The dedicated sequence table is the uniqueness authority. Cancellation, payment, correction, and vehicle updates never decrement it. Transaction rollback also rolls back its increment.

## Dynamic financial and history model

Every ticket row exposes:

- original ticket penalty;
- sum of non-voided payments;
- remaining balance, clamped to zero;
- current ticket status;
- immutable plate ticket count at issuance;
- immutable same-plate/same-violation penalty level.

Plate outstanding balance sums remaining balances only for currently unpaid tickets. Paid tickets stay visible with zero balance. Cancelled tickets stay visible with their original penalty and payment history but contribute zero to amount owed.

Correcting a paid ticket to unpaid preserves payment rows by changing their status to `voided`; it never deletes them. The RPC returns the voided payment IDs and total voided amount. Ticket status history records the correction reason and the PHP audit event records the preserved payment identifiers, count, and amount.

## Staff user interface

The Issue Ticket page loads plate history on lookup and presents a compact table with ticket number, violation, penalty, paid amount, balance, and status. It separately displays:

- `Plate Ticket Count at Issuance` (the next permanent plate sequence);
- `Same-Plate/Same-Violation Penalty Level` (the penalty-rule level, not a driver identity claim);
- `New Ticket Penalty`;
- `Current Plate Outstanding`.

The wording explicitly states that plate history does not prove the same owner or driver. The review modal repeats the separate count, offense level, penalty, and outstanding balance.

Ticket Details displays both immutable snapshot fields alongside the live financial strip. Existing payment, cancellation, correction, evidence, print, and QR actions remain unchanged.

## Public user interface

Landing-page quick plate results display each matching ticket's status and remaining balance. Ticket-number searches continue linking to the individual ticket lookup. Plate searches also provide a `View full plate history` link using `?plate=<normalized plate>`.

The full public lookup accepts ticket or plate URL parameters, auto-loads the appropriate mode, lists every matching ticket with penalty, paid amount, balance, and status, and shows the combined current outstanding balance. It never returns or renders owner name, email, address, driver license, internal IDs, or payment receipt details.

## API contracts

Staff vehicle lookup returns a dynamic `summary` with total historical tickets, non-cancelled ticket count, paid/unpaid/cancelled counts, and outstanding balance. Its history rows include all tickets.

Ticket create/detail/list responses expose the immutable snapshot fields. Public lookup responses remain limited to citation and financial fields. Public summary reports historical ticket count separately from non-cancelled ticket count and uses `total_outstanding_balance` as the unambiguous financial name while preserving the older alias for compatibility.

## Tests and verification

Add contract and executable tests before implementation. Required scenarios:

1. First, second, and third ticket for one plate receive immutable sequence values 1, 2, and 3.
2. Cancelling a ticket preserves all sequence values; the next issue receives 4 and no values are reused.
3. Concurrent issuance for one normalized plate yields distinct consecutive values.
4. Different violation types increment the plate sequence but keep independent same-plate/same-violation penalty levels.
5. Partial payment updates paid amount, balance, and unpaid status.
6. Full payment updates paid amount, zero balance, and paid status.
7. Mark-unpaid correction preserves payment rows as voided and produces status-history and audit evidence.
8. Cancellation contributes zero to combined outstanding while remaining in history.
9. Landing and full public lookup show balances/statuses and exclude private owner fields.
10. Existing authorization, PHP contracts, JSX verification, build, distribution validation, and secret-exclusion checks remain green.

Use a disposable local PostgreSQL database if available. If the environment cannot provide PostgreSQL/Supabase, execute all PHP-level workflow tests and run SQL migration structure/behavior tests with the best available isolated database tooling, reporting the database-runtime limitation precisely rather than implying production verification.

## Deployment artifact

Produce a ZIP from a clean build/package workflow. Include source, compiled frontend, PHP API, safe configuration templates, migration, and deployment instructions. Exclude all private configuration and user data. Instructions must require backup, migration review, staging application, smoke testing, and an explicit separate production authorization.

