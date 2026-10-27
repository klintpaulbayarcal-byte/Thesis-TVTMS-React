# TVTMS read-only baseline and reproduction dossier

Date: 2026-09-21. Source: GitHub `sync-v4` commit `16780da4c90be56d9bf6541dcee58611d5de15e4`, feature branch based on that SHA. GitHub Actions deployment run `35592777880` completed successfully, including build/package, upload and production website/API health checks. This is not evidence of full user-journey completion.

## Evidence matrix

| Video/time | Reproduction | Expected | Observed | Confidence | Code/data evidence | Target test | Status |
|---|---|---|---|---|---|---|---|
| 2 / ~00:45 | Select Defective Lights after showing Counterflow history | Preview counts only identical violation and current plate; old requests never replace new selection | Penalty level 2 visible while previous Counterflow present | Confirmed UI race possibility, NOT verified penalty error | `IssueTicket.jsx` debounce has no response gate; `violations.php` and `tvtms_ticket_create` count exact selected violation/normalized plate. Read-only snapshot: zero active escalation rules and zero Defective Lights tickets | Rapid plate/type switch, saved penalty snapshot | IN PROGRESS |
| 2 / ~01:20; 3 / dashboard | Press GPS, then view recorded citations | Coordinate is clearly labeled, not misrepresented as a geographic area | GPS inserted coordinates into `location`, chart displayed coordinate-like label | Confirmed code path | `fillGPS` writes six-decimal pair to location; `tvtms_report_hotspots` groups exact location strings; read-only count found 8 coordinate-format records | Manual/GPS/legacy coordinate labeling | IN PROGRESS |
| 2 / dashboard; 3 / analytics | Open/refresh page with API pending | Display loading/refresh state; distinguish empty from failed | Temporary zero KPI values | Confirmed source-level presentation | Admin/Officer/Analytics initialize empty stats and render `??0` or `||0` before fetch | All-pending/partial failure/empty/refresh | IN PROGRESS |
| 3 / payment | View payment with 1,999 paid and 1 outstanding | Show partial payment while retaining unpaid lifecycle | UNPAID badge despite recorded partial payment | Confirmed presentation mismatch | `tickets.php` enriches `payment_status='partially_paid'`; Payments ticket table renders `row.status`; read-only query found 1 partial ticket | Unpaid, partial, paid, cancelled badge | IN PROGRESS |
| 1 / Contact | Navigate via menu, then manually scroll | Anchor stops below sticky bar; manual clipping distinguished | Heading partially obscured in captured scroll | Unverified anchor regression | Existing `landing-anchor-offset.css` deployed; recording alone does not isolate scroll source | Desktop/mobile anchor and manual scrolling | NOT VERIFIED |
| 3 / notifications | View contact notification | Timestamp and View Message remain readable at narrow widths | Tight spacing | Likely visual defect | `Notifications.jsx` renders adjacent date and link; CSS inspection/reproduction needed | Narrow viewport screenshot | NOT VERIFIED |
| 1 / hero | Inspect hero title/background | Sufficient readability without redesign | Busy photo behind text | Subjective; not verified readability failure | Existing police-station asset and overlay | Side-by-side viewport assessment | NOT VERIFIED |
| 3 / admin | Check QA-marked tickets/contact/disputes | Test data excluded from research conclusions | QA markers visible | Confirmed presence, ownership unverified | Read-only marker scan: 9 contact subjects, 1 dispute reason, 4 ticket remarks | Identify only, never delete | NOT APPLICABLE to app change |

## Baseline verification and constraints

- GitHub connector established known `sync-v4` commit and verified prior guarded production deploy succeeded. Feature branch contains only previously approved spec and plan before this dossier.
- Container has a user-uploaded v4 ZIP, but it predates the live GitHub feature changes (IssueTicket blob and ticket handler hashes differ). It is **not** a valid current-source whole-suite baseline. Do not present its failures as current branch defects.
- On extracted, filtered ZIP snapshot only: `npm run verify:jsx` passed 49 files and PHP lint passed. Its old Windows-only `npm test` command fails under Linux (`%PATH%` expansion), and direct Python pytest showed **7 failures / 76 passes** attributable to out-of-date files versus present branch, not classified as current branch failures. Current-source full suite and real authenticated browser/API testing: NOT VERIFIED at this point.
- No real tickets, payments, dispute, SMTP messages, DB writes, permission changes, or production deploy performed. No sensitive person-identifying records copied into this dossier. Production data cleanup requires distinct user approval.

## Rollback checkpoint

Production branch is `sync-v4` SHA `16780da4c90be56d9bf6541dcee58611d5de15e4`; preserve it. All fixes stay on `feature/tvtms-defense-readiness`. Before release compare exact branch diff and rerun guarded CI; rollback after a future separately authorized deploy must be a reviewed revert followed by guarded deployment, never a forced branch reset.