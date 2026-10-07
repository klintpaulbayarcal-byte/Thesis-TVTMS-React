# TVTMS Email and Dispute System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reliably notify the recorded ticket email, show only a masked address publicly, and require a secure emailed one-time code before an eligible public dispute can be submitted.

**Architecture:** Add two server-owned Supabase tables and service-role RPCs for notification idempotency and one-time-code state, while keeping SMTP and all secret-derived hashing in PHP. Extend the existing React forms with explicit state machines and accurate outcomes; the production workflow renders a private SMTP configuration only from GitHub Secrets and remains blocked until those secrets and the separately approved migration exist.

**Tech Stack:** React 18.3, Vite 5, PHP 8.1+, custom SMTP over PHP streams, Supabase PostgreSQL/PostgREST, GitHub Actions, pytest contract/runtime tests.

**Spec:** `docs/superpowers/specs/2026-09-20-email-and-dispute-verification-design.md`

## Global Constraints

- Work only in the existing checkout and `feature/email-dispute-verification-design`; do not create a worktree or duplicate project.
- Preserve all unrelated tracked files and the existing untracked `docs/superpowers/specs/2026-09-19-ticket-history-payment-display-design.md`.
- Do not apply a migration to production Supabase, alter live data, configure GitHub Secrets, send a real email, submit a real dispute, merge a PR, push `sync-v4`, or deploy Hostinger.
- Preserve existing React layout/classes, landing page, roles, authentication, ticket history, repeat-offender snapshots, payment calculations, dispute review, reporting, and Hostinger packaging.
- Keep `system_settings.dispute_deadline_days` authoritative with its current default of 15; do not create a second deadline setting.
- Use `djklintskie@gmail.com` only in a future separately authorized delivery test, never as a hardcoded sender or production recipient.
- Automated SMTP tests use a localhost fake server; automated dispute tests never call production Supabase or the live API.
- No new runtime npm or Composer dependency. A transient, version-resolved Supabase CLI invocation may create the migration scaffold and must not change `package.json` or lockfiles.
- All public API responses use `Cache-Control: no-store` and expose neither full email, OTP, token/code hashes, raw IPs, internal IDs, nor secret configuration.
- “Accepted” means the SMTP server accepted the DATA transaction; it never means inbox delivery.

## Review Focus

- A ticket can be committed while ledger or SMTP finalization fails: the API must still return the saved ticket and an accurate `failed` or `unknown` notification state.
- An SMTP server can accept a message immediately before PHP crashes: a stale `sending` claim must become `unknown`, never automatically resend.
- A plate lookup can return many tickets whose snapshots differ: each public card must receive the masked email for its own ticket ID and no full address.
- A ticket can become paid, cancelled, expired, or disputed between OTP verification and submission: the final RPC must reject it atomically without consuming or inserting incorrectly.
- Two concurrent code requests, verification attempts, retries, or submissions must serialize on the ticket/challenge and produce one active code, one mail attempt, and at most one dispute.

---

### Task 1: Baseline and additive Supabase migration

**Files:**
- Create: `tests/test_email_dispute_migration.py`
- Create: `supabase/migrations/202609200001_ticket_email_dispute_verification.sql`

**Interfaces:**
- Consumes: existing `tickets`, `ticket_details`, `disputes`, `notifications`, `users`, `system_settings`, and service-role-only PostgREST model.
- Produces: `tvtms_ticket_email_claim(bigint,bigint)`, `tvtms_ticket_email_finalize(bigint,text,text,text)`, `tvtms_dispute_verification_request(text,text,text,text)`, `tvtms_dispute_verification_delivery(text,text,text)`, `tvtms_dispute_verification_verify(text,text,text)`, and `tvtms_public_dispute_verified(text,text,text)`.

- [ ] **Step 1: Record a clean baseline**

Run:

```powershell
npm test
```

Expected: the pre-change suite exits 0. If it does not, ledger the exact baseline failures before changing code and use systematic debugging only for failures blocking this feature.

- [ ] **Step 2: Write failing migration behavior/structure tests**

Add tests that load the new SQL path and assert independently derived security and behavior contracts:

```python
def test_migration_is_additive_and_service_role_only():
    sql = migration_sql().lower()
    assert 'create table public.ticket_email_notifications' in sql
    assert 'create table public.public_dispute_verifications' in sql
    assert sql.count('enable row level security') >= 2
    assert 'revoke all on table public.ticket_email_notifications from public, anon, authenticated, service_role' in sql
    assert 'revoke all on table public.public_dispute_verifications from public, anon, authenticated, service_role' in sql
    assert 'grant select, insert, update on table public.ticket_email_notifications to service_role' in sql
    assert 'grant select, insert, update on table public.public_dispute_verifications to service_role' in sql
    assert 'grant usage, select on sequence public.ticket_email_notifications_id_seq to service_role' in sql
    assert 'grant usage, select on sequence public.public_dispute_verifications_id_seq to service_role' in sql
    assert 'drop table public.tickets' not in sql
    assert 'delete from public.tickets' not in sql

def test_notification_claim_prevents_duplicate_or_ambiguous_resend():
    body = function_body('tvtms_ticket_email_claim')
    assert "status='accepted'" in body
    assert "status='unknown'" in body
    assert 'for update' in body
    assert "interval '5 minutes'" in body

def test_verified_submission_rechecks_existing_eligibility_and_consumes_once():
    body = function_body('tvtms_public_dispute_verified')
    assert "t.status<>'unpaid'" in body
    assert "setting_key='dispute_deadline_days'" in body
    assert "coalesce((select setting_value::integer" in body
    assert "status in ('submitted','under_review')" in body
    assert "v.status='verified'" in body
    assert "set status='consumed'" in body
    assert 'for update' in body
```

The helper `function_body(name)` must extract the named SQL function between its `create or replace function` and closing tagged dollar quote; it must fail if either boundary is absent.

- [ ] **Step 3: Run the new test and verify RED**

Run:

```powershell
python -m pytest -q -s -p no:cacheprovider tests/test_email_dispute_migration.py
```

Expected: FAIL because `202609200001_ticket_email_dispute_verification.sql` does not exist.

- [ ] **Step 4: Create the migration scaffold using the current CLI**

Run:

```powershell
$supabaseCliVersion=(npm view supabase version).Trim()
$before=@(Get-ChildItem -LiteralPath supabase/migrations -Filter '*.sql' | ForEach-Object FullName)
npx --yes "supabase@$supabaseCliVersion" migration new ticket_email_dispute_verification
$after=@(Get-ChildItem -LiteralPath supabase/migrations -Filter '*.sql' | ForEach-Object FullName)
$generated=@($after | Where-Object { $_ -notin $before })
if($generated.Count -ne 1){throw 'Expected exactly one generated migration'}
Move-Item -LiteralPath $generated[0] -Destination 'supabase/migrations/202609200001_ticket_email_dispute_verification.sql'
```

Expected: exactly one empty migration is created through `supabase migration new` and renamed to the repository’s deterministic date/sequence convention; `package.json` and `package-lock.json` are unchanged.

- [ ] **Step 5: Implement the two tables**

Use constrained text states, bounded error fields, indexes for ticket/status/time lookups, and no stored recipient email or raw requester IP:

```sql
create table public.ticket_email_notifications (
  id bigint generated by default as identity primary key,
  ticket_id bigint not null references public.tickets(id) on delete restrict,
  notification_type text not null default 'ticket_issued' check (notification_type='ticket_issued'),
  status text not null default 'pending' check (status in ('pending','sending','accepted','failed','not_applicable','unknown')),
  attempt_count integer not null default 0 check (attempt_count>=0),
  claimed_at timestamptz,
  last_attempt_at timestamptz,
  accepted_at timestamptz,
  last_error_code varchar(60),
  last_error_message varchar(240),
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  unique(ticket_id,notification_type)
);

create table public.public_dispute_verifications (
  id bigint generated by default as identity primary key,
  ticket_id bigint not null references public.tickets(id) on delete cascade,
  challenge_token_hash char(64) not null unique,
  code_hash char(64) not null,
  requester_fingerprint char(64) not null,
  status text not null default 'pending' check (status in ('pending','verified','consumed','expired','locked')),
  attempts_remaining integer not null default 5 check (attempts_remaining between 0 and 5),
  delivery_status text not null default 'pending' check (delivery_status in ('pending','accepted','failed')),
  delivery_error_code varchar(60),
  requested_at timestamptz not null default current_timestamp,
  last_sent_at timestamptz,
  expires_at timestamptz not null,
  verified_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default current_timestamp
);
```

- [ ] **Step 6: Implement notification claim/finalize RPCs**

`tvtms_ticket_email_claim` must lock the ticket and existing ledger row, validate the active actor and officer ownership, derive the recipient from `coalesce(t.owner_email_at_issue,v.owner_email)`, insert `not_applicable` when absent, return `already_accepted` for accepted rows, convert a stale `sending` row older than five minutes to `unknown`, and claim only `pending`/`failed` rows by setting `sending` and incrementing `attempt_count`.

`tvtms_ticket_email_finalize` accepts only `accepted` or `failed`, updates only a current `sending` row, sets `accepted_at` only for acceptance, truncates error strings to their column bounds, and returns a domain error when the claim is no longer finalizable.

Both return JSON objects with camelCase keys consumed later. Revoke direct `service_role` execution of the legacy unverified `tvtms_public_dispute(text,text)` RPC so no server path can bypass the new verified RPC; the rollback comment must restore only that prior execute grant after dropping the new objects.

```sql
return jsonb_build_object(
  'status','claimed', 'ticketId',t.id, 'ticketNumber',t.ticket_number,
  'recipient',recipient, 'plateNumber',v.plate_number,
  'violationName',viol.violation_name,
  'penaltyAmount',coalesce(t.penalty_amount_at_issue,viol.penalty_amount),
  'attemptCount',ledger.attempt_count
);
```

- [ ] **Step 7: Implement dispute request/delivery/verify RPCs**

The request RPC locks the ticket, rechecks unpaid/deadline/open-dispute/email eligibility, enforces a 60-second cooldown after an accepted or pending delivery, rejects more than five requests in one hour for either the ticket or requester fingerprint, expires older active rows, and inserts a 10-minute/five-attempt challenge using only supplied hashes.

Return domain errors in the repository format, including `retryAfter` for cooldown/rate limits:

```sql
return jsonb_build_object(
  'errorCode','VERIFICATION_COOLDOWN',
  'message','Please wait before requesting another verification code.',
  'statusCode',429,
  'retryAfter',retry_seconds
);
```

The delivery RPC changes `delivery_status` only for a pending challenge. The verify RPC locks the ticket/challenge, rejects mismatched, undelivered, expired, locked, consumed, or already superseded rows, decrements attempts on a wrong fixed-length keyed digest, and marks a correct digest `verified`.

- [ ] **Step 8: Implement atomic verified dispute submission**

`tvtms_public_dispute_verified` must lock ticket then challenge, require `verified` and unexpired state, repeat the existing `unpaid`, `system_settings.dispute_deadline_days` default-15, and open-dispute checks, insert the same public dispute/contact data and administrator notifications as the old RPC, then mark the challenge `consumed` in the same transaction. A replay returns `VERIFICATION_ALREADY_USED` with 409.

- [ ] **Step 9: Lock down grants and document rollback**

Enable RLS, revoke all privileges from `public`, `anon`, `authenticated`, and `service_role`, then explicitly grant only required table operations, identity-sequence usage/select, and new RPC execution to the backend service role. Add a final SQL comment containing exact rollback order: revoke/drop only the six new RPCs, drop only the two new tables after backup/dependency review, and restore the legacy unverified RPC execute grant only if rolling the application back to its old full-email verification code.

- [ ] **Step 10: Run migration tests and existing database contracts**

Run:

```powershell
python -m pytest -q -s -p no:cacheprovider tests/test_email_dispute_migration.py tests/test_ticket_history_payment_changes.py tests/test_final_release_regressions.py
```

Expected: new migration tests pass; the old full-email dispute test is expected to remain green until Task 6 replaces that contract.

- [ ] **Step 11: Commit Task 1**

```powershell
git add -- tests/test_email_dispute_migration.py supabase/migrations/202609200001_ticket_email_dispute_verification.sql
git commit -m "feat(db): add email and dispute verification state"
```

### Task 2: Structured mail transport and privacy helpers

**Files:**
- Create: `api/src/mail.php`
- Create: `tests/test_mail_runtime.py`
- Modify: `api/src/common.php`

**Interfaces:**
- Consumes: `app_config()['smtp']`, `app_config()['development']`, PHP streams, `TVTMS_TOKEN_SECRET` through the existing config.
- Produces: `mask_email(string): ?string`, `smtp_configuration_status(array): string`, `email_send_with_config(array,string,string,string): array`, `send_email(string,string,string): array`, and compatibility `send_basic_email(...): bool`.

- [ ] **Step 1: Write failing masking/configuration tests**

Run PHP from pytest and assert literal results:

```python
assert php_json("echo json_encode([mask_email('djklintskie@gmail.com'),mask_email('a@example.org'),mask_email('bad'),mask_email('')]);") == [
    'dj***@gmail.com', 'a***@example.org', None, None
]

assert php_json("echo json_encode([smtp_configuration_status([]),smtp_configuration_status(valid_smtp())]);") == [
    'not_configured', 'configured'
]
```

Also assert disabled, missing sender, invalid port, and unsupported production security modes report `not_configured` without returning configuration values.

- [ ] **Step 2: Write a failing fake-SMTP acceptance/rejection test**

Create a Python localhost SMTP fixture that implements greeting, EHLO, MAIL FROM, RCPT TO, DATA, final 250, and QUIT without TLS. Spawn PHP against its assigned port and assert:

```python
assert result == {'status':'accepted','errorCode':None}
assert 'Subject:' in fixture.message
assert 'TVT-2026-000123' in fixture.message
```

A second fixture rejects RCPT with 550 and must produce `status='failed'`, `errorCode='smtp_rejected'`; PHP stderr must not contain the configured password or full recipient.

- [ ] **Step 3: Run the mail tests and verify RED**

Run:

```powershell
python -m pytest -q -s -p no:cacheprovider tests/test_mail_runtime.py
```

Expected: FAIL because `api/src/mail.php` and its functions do not exist.

- [ ] **Step 4: Implement mail helpers**

Move SMTP protocol code out of `common.php` into `mail.php`. Return stable safe structures:

```php
function mail_result(string $status, ?string $code, string $message): array {
    return ['status'=>$status,'errorCode'=>$code,'message'=>$message];
}

function send_email(string $to,string $subject,string $html): array {
    return email_send_with_config(app_config()['smtp']??[],$to,$subject,$html);
}

function send_basic_email(string $to,string $subject,string $html): bool {
    return send_email($to,$subject,$html)['status']==='accepted';
}
```

`email_send_with_config` returns `disabled`, `configuration_error`, or `invalid_recipient` without opening a socket. The SMTP transport records `accepted` only after the post-DATA 250/251 response. Exceptions/logging expose only a stable stage/error code, never server authentication payloads, password, OTP, token, or full recipient.

- [ ] **Step 5: Require the focused helper from common**

Keep `app_config()` in `common.php`, remove its old SMTP functions, and add:

```php
require_once __DIR__ . '/mail.php';
```

after `app_config()` is declared. Existing password-reset, payment, contact, and dispute-resolution callers continue receiving the compatibility boolean.

- [ ] **Step 6: Run RED tests GREEN plus PHP syntax**

Run:

```powershell
python -m pytest -q -s -p no:cacheprovider tests/test_mail_runtime.py
Get-ChildItem api -Recurse -Filter '*.php' | ForEach-Object { & 'C:/tools/php83/php.exe' -l $_.FullName; if($LASTEXITCODE -ne 0){throw "PHP lint failed: $($_.FullName)"} }
```

Expected: all mail tests pass and every PHP file reports no syntax errors.

- [ ] **Step 7: Commit Task 2**

```powershell
git add -- api/src/mail.php api/src/common.php tests/test_mail_runtime.py
git commit -m "feat(mail): report structured SMTP outcomes"
```

### Task 3: Ticket notification backend, idempotency, and retry API

**Files:**
- Create: `api/src/ticket_email.php`
- Create: `tests/test_ticket_email_workflow.py`
- Modify: `api/src/common.php`
- Modify: `api/src/handlers/tickets.php`
- Modify: `api/src/router.php`
- Modify: `src/services/api.js`

**Interfaces:**
- Consumes: Task 1 claim/finalize RPCs and Task 2 `send_email`/`mask_email`.
- Produces: `ticket_notification_attempt(int,array): array`, ticket-create `notification` payload, ticket-detail `notification` payload, `POST /api/tickets/{id}/notification/retry`, and `API.retryTicketNotification(id)`.

- [ ] **Step 1: Write failing workflow tests with controlled boundaries**

Use PHP subprocess fixtures whose `supabase_rpc` returns complete real-shaped claim objects and whose `send_email` returns controlled outcomes. Assert behavior, not mock existence:

```python
def test_canonical_claim_recipient_and_complete_message_are_used():
    result = invoke_attempt(claim=CLAIMED_REPEAT_OFFENDER, mail='accepted')
    assert result['status'] == 'accepted'
    assert result['recipientMasked'] == 'dj***@gmail.com'
    assert captured_mail_contains(['TVT-2026-000123','Illegal Parking','1,500.00','ABC1234','/ticket-lookup?ticket=TVT-2026-000123'])

def test_accepted_or_unknown_claim_never_calls_transport():
    assert invoke_attempt(claim={'status':'already_accepted'})['status'] == 'already_accepted'
    assert invoke_attempt(claim={'status':'unknown'})['status'] == 'unknown'
    assert captured_send_count() == 0

def test_finalize_failure_after_smtp_acceptance_returns_unknown():
    assert invoke_attempt(claim=CLAIMED,mail='accepted',finalize_error=True)['status'] == 'unknown'
```

Add handler tests proving ticket creation returns HTTP 201 and the persisted ticket for accepted, failed, disabled, missing-email, and ledger exceptions; the canonical email comes from the saved/claimed ticket rather than request JSON.

- [ ] **Step 2: Write failing retry authorization/idempotency tests**

Invoke `tickets_retry_notification` with stubbed current users/RPC results. Prove an officer’s ticket can be retried, another officer gets 403 from the RPC domain result, and the handler never calls `tvtms_ticket_create`. Accepted/sending/unknown states must never call `send_email`.

- [ ] **Step 3: Run the workflow tests and verify RED**

Run:

```powershell
python -m pytest -q -s -p no:cacheprovider tests/test_ticket_email_workflow.py
```

Expected: FAIL because `ticket_notification_attempt` and retry route do not exist and ticket create has no notification payload.

- [ ] **Step 4: Implement the ticket notification orchestrator**

In `ticket_email.php`, build escaped content and map claim outcomes without exposing recipient:

```php
function ticket_notification_attempt(int $actorId,array $ticket=[]): array {
    try {
        $claim=supabase_rpc('tvtms_ticket_email_claim',['p_ticket_id'=>(int)($ticket['id']??0),'p_actor_id'=>$actorId]);
    } catch(Throwable $e) {
        error_log('Ticket notification ledger unavailable.');
        return ticket_notification_result('failed',null,false,'Ticket saved, but notification tracking is unavailable.');
    }
    // Non-claimed states return without transport. Claimed state sends once,
    // then finalizes accepted/failed. Accepted + finalize failure => unknown.
}
```

The HTML uses `htmlspecialchars`, `number_format`, and `rawurlencode`; its link base comes from `app_public_url`. Map SMTP outcomes to user-safe status/message and persist only bounded stable error code/message.

- [ ] **Step 5: Integrate create, detail, and retry handlers**

`tickets_create` calls notification only after the ticket RPC and audit log. Its 201 response includes both `ticket` and `notification` even when notification fails.

`tickets_get_one` performs a safe best-effort service-role select of the ledger and adds:

```php
$ticket['notification']=[
  'status'=>$row['status']??'not_recorded',
  'attemptCount'=>(int)($row['attempt_count']??0),
  'retryAllowed'=>($row['status']??'')==='failed',
  'recipientMasked'=>mask_email((string)($ticket['owner_email']??'')),
];
```

The retry route requires `admin` or `apprehending_officer`, validates ID, and delegates ownership to the claim RPC. Add its router entry before the generic ticket-ID route and add `API.retryTicketNotification(id)`.

- [ ] **Step 6: Run targeted backend and route tests GREEN**

Run:

```powershell
python -m pytest -q -s -p no:cacheprovider tests/test_ticket_email_workflow.py tests/test_functional_contract.py
npm run verify:jsx
```

Expected: workflow and existing ticket contracts pass; JSX verification exits 0.

- [ ] **Step 7: Commit Task 3**

```powershell
git add -- api/src/ticket_email.php api/src/common.php api/src/handlers/tickets.php api/src/router.php src/services/api.js tests/test_ticket_email_workflow.py
git commit -m "feat(tickets): send idempotent issuance notifications"
```

### Task 4: Officer-facing notification outcomes and retry control

**Files:**
- Create: `tests/test_ticket_notification_ui.py`
- Modify: `src/pages/IssueTicket.jsx`
- Modify: `src/pages/TicketDetails.jsx`

**Interfaces:**
- Consumes: Task 3 `response.notification`, ticket-detail `ticket.notification`, and `API.retryTicketNotification`.
- Produces: separate visible ticket/mail outcome and an authenticated retry button only for `retryAllowed` failures.

- [ ] **Step 1: Write failing UI contract tests**

Assert that `IssueTicket` reads `response.notification`, always starts its success copy with the persisted ticket number, includes the server’s notification message, and does not claim “sent” independently. Assert `TicketDetails` renders notification status/masked recipient and calls retry only from a button guarded by `retryAllowed`.

The mutation these tests catch is restoring the old unconditional `Ticket ... issued successfully.` branch or enabling retry for accepted/unknown states.

- [ ] **Step 2: Run the UI test and verify RED**

Run:

```powershell
python -m pytest -q -s -p no:cacheprovider tests/test_ticket_notification_ui.py
```

Expected: FAIL because neither page renders the new notification contract.

- [ ] **Step 3: Implement explicit issuance feedback**

Keep the existing review modal and fields. In `confirmSubmit`, compute one notice from the two independent outcomes:

```jsx
const notification=response.notification??{};
setNotice({
  type: notification.status==='accepted'||notification.status==='already_accepted'?'success':'info',
  text:`Ticket ${ticket?.ticket_number||''} issued successfully. ${notification.message||'No email notification status was returned.'}`
});
```

Close the review modal after success and delay existing navigation by 2500 milliseconds so the result is readable; do not issue a second create request.

- [ ] **Step 4: Add retry to existing ticket details layout**

Use existing card/button/Notice components and no page redesign. Disable the button while retrying, refresh the ticket after the response, and render exact server wording. Never render the full email.

- [ ] **Step 5: Verify UI and build**

Run:

```powershell
python -m pytest -q -s -p no:cacheprovider tests/test_ticket_notification_ui.py tests/test_functional_contract.py
npm run verify:jsx
npm run build
```

Expected: tests and JSX pass; Vite build exits 0.

- [ ] **Step 6: Commit Task 4**

```powershell
git add -- src/pages/IssueTicket.jsx src/pages/TicketDetails.jsx tests/test_ticket_notification_ui.py
git commit -m "feat(ui): show ticket email outcomes and retry"
```

### Task 5: Privacy-safe public lookup email

**Files:**
- Create: `tests/test_public_email_privacy.py`
- Modify: `api/src/handlers/public.php`
- Modify: `src/pages/PublicTicketLookup.jsx`
- Modify: `tests/test_ticket_history_payment_changes.py`

**Interfaces:**
- Consumes: Task 2 `mask_email`, internal IDs from `tvtms_public_lookup`, server-only `ticket_details.owner_email` (snapshot-first view behavior).
- Produces: public `has_notification_email:boolean` and `notification_email_masked:string|null` only.

- [ ] **Step 1: Write failing PHP response privacy tests**

Stub public lookup with two ticket IDs and server-only email rows. Invoke the real handler and assert:

```python
assert payload['tickets'][0]['notification_email_masked'] == 'dj***@gmail.com'
assert payload['tickets'][0]['has_notification_email'] is True
assert payload['tickets'][1]['notification_email_masked'] is None
serialized = json.dumps(payload)
assert 'djklintskie@gmail.com' not in serialized
assert 'owner_email' not in serialized
assert '"id"' not in serialized
```

Also prove email rows are mapped by ticket ID rather than list position.

- [ ] **Step 2: Update the existing privacy expectation and add failing UI test**

Keep `owner_email`, owner name/address, license, and receipt forbidden in public JSX. Permit only the dedicated masked field. Require ticket cards to display `Notification Email` with the masked value or `No email recorded`.

- [ ] **Step 3: Run privacy tests and verify RED**

Run:

```powershell
python -m pytest -q -s -p no:cacheprovider tests/test_public_email_privacy.py tests/test_ticket_history_payment_changes.py
```

Expected: FAIL because the handler does not add the safe fields and the card does not render them.

- [ ] **Step 4: Implement server-side masking and UI row**

Collect positive internal IDs, make one `ticket_details` select with `id=in.(...)` and `select=id,owner_email`, map by ID, then mask in PHP. Always unset `id`, deadline internals, open-dispute internals, and any accidental `owner_email` before JSON response.

Render only:

```jsx
<div><dt>Notification Email</dt><dd>{ticket.has_notification_email?ticket.notification_email_masked:'No email recorded'}</dd></div>
```

- [ ] **Step 5: Verify privacy and existing lookup behavior**

Run:

```powershell
python -m pytest -q -s -p no:cacheprovider tests/test_public_email_privacy.py tests/test_ticket_history_payment_changes.py tests/test_public_dispute_ux.py
npm run verify:jsx
```

Expected: all pass; full owner email remains absent from public output/UI.

- [ ] **Step 6: Commit Task 5**

```powershell
git add -- api/src/handlers/public.php src/pages/PublicTicketLookup.jsx tests/test_public_email_privacy.py tests/test_ticket_history_payment_changes.py
git commit -m "feat(public): show only masked ticket email"
```

### Task 6: OTP hashing, public routes, and atomic submission contract

**Files:**
- Create: `api/src/dispute_verification.php`
- Create: `tests/test_dispute_verification_runtime.py`
- Modify: `api/src/common.php`
- Modify: `api/src/handlers/public.php`
- Modify: `api/src/router.php`
- Modify: `api/index.php`
- Modify: `tests/test_final_release_regressions.py`

**Interfaces:**
- Consumes: Task 1 dispute RPCs, Task 2 mailer/masking, existing token secret and trusted `REMOTE_ADDR`.
- Produces: `POST /api/public/dispute/verification/request`, `POST /api/public/dispute/verification/verify`, and verified-token-only `POST /api/public/dispute`.

- [ ] **Step 1: Write failing cryptographic helper tests**

Require deterministic helper inputs while keeping generation random in production:

```python
assert len(token_hash('opaque-token')) == 64
assert code_hash('TVT-2026-000123', token_hash('opaque-token'), '004219', 's'*32) != hashlib.sha256(b'004219').hexdigest()
assert requester_hash('203.0.113.8','s'*32) != hashlib.sha256(b'203.0.113.8').hexdigest()
```

Add a generation test proving 100 generated codes match `^[0-9]{6}$`, tokens decode to 32 random bytes, and neither function returns a hash in place of the browser token.

- [ ] **Step 2: Write failing request/verify/submit handler tests**

Use complete stub RPC results and real hashing helpers. Prove:

- request accepts only ticket number, sends the generated code to the RPC-returned canonical recipient, and returns only challenge token, masked email, `expiresIn=600`, `resendAfter=60`, and mail acceptance;
- failed SMTP marks delivery failed, returns an accurate 503, and does not return code/full email;
- SMTP acceptance followed by delivery-finalization failure returns an `unknown`/503 activation outcome, withholds the challenge token, and never logs or retries the code automatically;
- verify accepts ticket number/token/six-digit code, sends only token/code hashes to the RPC, and exposes only verified/attempts remaining;
- final dispute rejects email-only input, requires a valid-shaped challenge token, calls only `tvtms_public_dispute_verified`, and returns 201 only from its success;
- RPC `retryAfter` reaches an HTTP `Retry-After` header path through `rpc_domain_error`/`fail_domain`.

- [ ] **Step 3: Run runtime tests and verify RED**

Run:

```powershell
python -m pytest -q -s -p no:cacheprovider tests/test_dispute_verification_runtime.py tests/test_final_release_regressions.py
```

Expected: FAIL because helper/routes are missing and the old test still requires full email.

- [ ] **Step 4: Implement token/code/fingerprint helpers**

```php
function dispute_new_token(): string {
    return rtrim(strtr(base64_encode(random_bytes(32)),'+/','-_'),'=');
}
function dispute_new_code(): string {
    return str_pad((string)random_int(0,999999),6,'0',STR_PAD_LEFT);
}
function dispute_token_hash(string $token): string { return hash('sha256',$token); }
function dispute_code_hash(string $ticket,string $tokenHash,string $code,string $secret): string {
    return hash_hmac('sha256',$ticket.'|'.$tokenHash.'|'.$code,$secret);
}
function dispute_requester_hash(?string $ip,string $secret): string {
    return hash_hmac('sha256','dispute-requester|'.($ip?:'unknown'),$secret);
}
```

Validate a 32+-character token secret before generating challenges. Use only `client_ip_for_audit()` so caller-controlled forwarding headers cannot change the fingerprint.

- [ ] **Step 5: Implement request and delivery finalization**

The handler validates only ticket number, generates values, calls the request RPC, sends escaped OTP content, then calls the delivery RPC with `accepted` or `failed`. Return the opaque challenge token only when SMTP is accepted and the accepted delivery state is successfully finalized. If SMTP accepted but finalization fails, return an `unknown` 503 activation outcome without the token and do not automatically send again. The email includes ticket number, 10-minute expiry, and advice to ignore unrequested codes; logs/responses never include the code.

- [ ] **Step 6: Implement verify and replace final public dispute**

Verify validates exactly six digits and a base64url challenge token, derives both hashes, and delegates attempt/expiry/ticket binding to the locking RPC. Final dispute removes full-email validation entirely and sends ticket/hash/reason only to `tvtms_public_dispute_verified`.

Extend `rpc_domain_error` to preserve optional `retryAfter`; `fail_domain` emits a positive `Retry-After` header before the JSON error.

- [ ] **Step 7: Register routes and distinct outer rate limits**

Add exact routes before `/api/public/dispute` and exact `api/index.php` limits:

```php
if($requestMethod==='POST'&&$requestPath==='/api/public/dispute/verification/request')
    $limits[]=['dispute-code-request',10,3600,'Too many verification-code requests. Please try again later.','RATE_LIMIT_DISPUTE_CODE'];
if($requestMethod==='POST'&&$requestPath==='/api/public/dispute/verification/verify')
    $limits[]=['dispute-code-verify',20,600,'Too many verification attempts. Please try again later.','RATE_LIMIT_DISPUTE_VERIFY'];
if($requestMethod==='POST'&&$requestPath==='/api/public/dispute')
    $limits[]=['public-dispute-submit',8,1800,'Too many dispute submissions. Please try again later.','RATE_LIMIT_PUBLIC_DISPUTE'];
```

Keep contact submissions on their existing public-write bucket.

- [ ] **Step 8: Replace legacy regression and run GREEN**

Replace `test_public_dispute_requires_matching_owner_email_before_rpc` with tests proving a verified challenge is required and raw email is ignored/rejected. Run:

```powershell
python -m pytest -q -s -p no:cacheprovider tests/test_dispute_verification_runtime.py tests/test_final_release_regressions.py tests/test_email_dispute_migration.py
Get-ChildItem api -Recurse -Filter '*.php' | ForEach-Object { & 'C:/tools/php83/php.exe' -l $_.FullName; if($LASTEXITCODE -ne 0){throw "PHP lint failed: $($_.FullName)"} }
```

Expected: runtime, regression, migration contracts, and PHP lint pass.

- [ ] **Step 9: Commit Task 6**

```powershell
git add -- api/src/dispute_verification.php api/src/common.php api/src/handlers/public.php api/src/router.php api/index.php tests/test_dispute_verification_runtime.py tests/test_final_release_regressions.py
git commit -m "feat(disputes): require ticket-bound email verification"
```

### Task 7: Preserve the public dispute design with a controlled React state machine

**Files:**
- Modify: `src/services/api.js`
- Modify: `src/pages/PublicTicketLookup.jsx`
- Modify: `tests/test_public_dispute_ux.py`

**Interfaces:**
- Consumes: Task 6 request/verify/final endpoint contracts and Task 5 masked fields.
- Produces: in-memory-only `challengeToken` and status states `idle`, `requesting`, `code_sent`, `verifying`, `verified`, `submitting`, `submitted`.

- [ ] **Step 1: Write failing API/state/UX tests**

Require API methods:

```js
publicDisputeRequestCode: ticketNumber => apiRequest('/public/dispute/verification/request', ...)
publicDisputeVerifyCode: data => apiRequest('/public/dispute/verification/verify', ...)
publicDispute: data => apiRequest('/public/dispute', ...)
```

Require the existing `.dispute-wrap`, `.dispute-card`, `.dispute-form`, selected-ticket summary, reason label, and Notice. Prove the owner-email input is gone; code request appears only for eligible tickets with recorded email; six-digit verification precedes an enabled reason field; challenge state resets when ticket/mode/query changes; no `localStorage` or URL receives the token.

- [ ] **Step 2: Run UI tests and verify RED**

Run:

```powershell
python -m pytest -q -s -p no:cacheprovider tests/test_public_dispute_ux.py tests/test_public_email_privacy.py
```

Expected: FAIL because the old email input/one-step submission remains.

- [ ] **Step 3: Add API methods and single-status state machine**

Follow current React guidance by avoiding contradictory booleans:

```jsx
const [verificationStatus,setVerificationStatus]=useState('idle');
const [challengeToken,setChallengeToken]=useState('');
const [verificationCode,setVerificationCode]=useState('');
```

Event handlers perform async calls directly. Request stores only the returned opaque token in component memory. Verify clears the code after success. Submit sends `{ticketNumber,challengeToken,reason}` and clears token/selection after success.

- [ ] **Step 4: Preserve layout while staging controls**

Inside the existing selected form, show masked email, request/resend action, code field, verification action, and the original reason field/button after verification. Buttons and fields use the single status to disable concurrent actions and show `Sending code…`, `Verifying…`, and `Submitting…`.

Switching mode, running a new lookup, or choosing another ticket must call one reset helper that clears code, raw challenge token, reason, status, and dispute notice.

- [ ] **Step 5: Verify JSX, UI contracts, and build**

Run:

```powershell
python -m pytest -q -s -p no:cacheprovider tests/test_public_dispute_ux.py tests/test_public_email_privacy.py tests/test_ticket_history_payment_changes.py
npm run verify:jsx
npm run build
```

Expected: tests pass, JSX verification exits 0, and Vite build succeeds without redesigning the page.

- [ ] **Step 6: Commit Task 7**

```powershell
git add -- src/services/api.js src/pages/PublicTicketLookup.jsx tests/test_public_dispute_ux.py
git commit -m "feat(public): add staged dispute email verification"
```

### Task 8: Secure production SMTP config rendering and deployment gate

**Files:**
- Create: `scripts/render-production-config.php`
- Create: `tests/test_production_smtp_config.py`
- Modify: `.github/workflows/deploy-hostinger-v4.yml`
- Modify: `api/index.php`

**Interfaces:**
- Consumes: GitHub Secrets `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`, plus existing Supabase/token secrets.
- Produces: private `deploy/api/config/config.local.php` with complete SMTP config and health value based on actual readiness.

- [ ] **Step 1: Write failing renderer behavior tests**

Run the real PHP script in a temporary directory with controlled environment variables. A complete TLS fixture must exit 0, create mode-compatible PHP returning `smtp.enabled=true`, and preserve exact secret values only inside the private output file. Stdout/stderr must not include any supplied password/token.

Missing password, invalid port, unsupported `SMTP_SECURE`, invalid sender, or token secret shorter than 32 must exit nonzero and leave no target file.

- [ ] **Step 2: Write failing workflow and health tests**

Assert all seven secret names feed job environment, the preflight checks them without echoing values, the workflow calls the renderer instead of writing `enabled => false`, and health uses `smtp_configuration_status` rather than checking only the enabled flag.

- [ ] **Step 3: Run deployment config tests and verify RED**

Run:

```powershell
python -m pytest -q -s -p no:cacheprovider tests/test_production_smtp_config.py
```

Expected: FAIL because the renderer is absent and the workflow still disables SMTP.

- [ ] **Step 4: Implement atomic private config renderer**

The CLI accepts exactly one target path, validates required values, builds the existing config array, writes a temporary sibling file using `var_export`, chmods 0600 where supported, then renames atomically. On failure it removes only its temporary file and prints a generic field-name error, never a value.

```php
$smtp=[
 'enabled'=>true,
 'host'=>required_env('SMTP_HOST'),
 'port'=>validated_port(required_env('SMTP_PORT')),
 'secure'=>validated_secure(required_env('SMTP_SECURE')),
 'username'=>required_env('SMTP_USERNAME'),
 'password'=>required_env('SMTP_PASSWORD'),
 'from_email'=>validated_email(required_env('SMTP_FROM_EMAIL')),
 'from_name'=>required_env('SMTP_FROM_NAME'),
];
```

- [ ] **Step 5: Replace workflow inline config and strengthen health**

Add secret env entries, presence/format gates, and:

```bash
php scripts/render-production-config.php deploy/api/config/config.local.php
php -l deploy/api/config/config.local.php
```

Keep all existing FTPS guards, tests, non-delete mirror, uploads exclusion, legacy redirect cleanup, and live checks unchanged. Health returns `configured` only when `smtp_configuration_status(app_config()['smtp']??[])==='configured'` and reveals nothing else.

- [ ] **Step 6: Run renderer, package, and workflow regression tests**

Run:

```powershell
python -m pytest -q -s -p no:cacheprovider tests/test_production_smtp_config.py tests/test_release_handoff_regressions.py tests/verify_distribution.py
npm run build:hostinger
```

Expected: all tests pass; package succeeds; `deploy/api/config/config.local.php`, `.env*`, uploads, and secrets remain excluded.

- [ ] **Step 7: Commit Task 8**

```powershell
git add -- scripts/render-production-config.php tests/test_production_smtp_config.py .github/workflows/deploy-hostinger-v4.yml api/index.php
git commit -m "fix(deploy): require secure SMTP configuration"
```

### Task 9: Full verification, security review, and feature-branch publication

**Files:**
- Modify only if a failing test demonstrates a defect in an authorized file.
- Review: every file changed since `origin/sync-v4`.

**Interfaces:**
- Consumes: all prior task contracts.
- Produces: verified feature-branch commits and a production-stop report; no migration application or deployment.

- [ ] **Step 1: Run the full automated suite**

Run:

```powershell
npm test
```

Expected: exit 0 with zero failed tests. Any failure is reported by exact test name and debugged from root cause; fixes require their own RED→GREEN reproduction.

- [ ] **Step 2: Run fresh JSX and PHP validation**

Run:

```powershell
npm run verify:jsx
Get-ChildItem api,scripts -Recurse -Filter '*.php' | ForEach-Object { & 'C:/tools/php83/php.exe' -l $_.FullName; if($LASTEXITCODE -ne 0){throw "PHP lint failed: $($_.FullName)"} }
```

Expected: JSX exits 0 and every PHP file reports no syntax errors.

- [ ] **Step 3: Run the Hostinger production build**

Run:

```powershell
npm run build:hostinger
```

Expected: exit 0; required deploy files exist and private config/uploads remain absent.

- [ ] **Step 4: Inspect database-runtime availability and record limitation**

Run:

```powershell
$commands='docker','psql','pg_isready','supabase'
$commands | ForEach-Object { if(Get-Command $_ -ErrorAction SilentlyContinue){"$_=available"}else{"$_=not-found"} }
```

Expected in the current environment: no isolated PostgreSQL/Docker runtime. Do not connect to production. Report the migration as structurally tested but not executed against PostgreSQL unless an isolated runtime becomes available.

- [ ] **Step 5: Review diff scope and secret leakage**

Run:

```powershell
git diff --check origin/sync-v4...HEAD
git diff --name-status origin/sync-v4...HEAD
git status --short --branch
rg -n --hidden --glob '!node_modules/**' --glob '!deploy/**' --glob '!.git/**' '(ghp_[A-Za-z0-9]{20,}|sb_secret_[A-Za-z0-9_-]+|AIza[A-Za-z0-9_-]{20,}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|SMTP_PASSWORD\s*[=:]\s*[^$<{[:space:]])' .
```

Expected: diff contains only the approved design/plan and implementation files; no whitespace errors or literal credentials; the pre-existing untracked design remains untracked.

- [ ] **Step 6: Perform whole-branch review**

Generate the executing-plans review package from merge base `origin/sync-v4` to `HEAD`. Because developer policy prohibits unrequested subagents, use the code-reviewer rubric as a separate self-review and record that limitation in the ledger. Grade privacy leaks, authorization bypass, duplicate/replay behavior, SMTP ambiguity, SQL grants/RLS, payment/deadline preservation, exception behavior, and workflow secret handling.

Any Critical/Important finding gets one TDD fix pass and a fresh full suite. Deferred Minor findings and every ruling go to the ledger and final report.

- [ ] **Step 7: Commit review fixes if any**

```powershell
git commit -am "fix: address email and dispute review findings"
```

Skip this commit when review finds no defect; never create an empty commit.

- [ ] **Step 8: Re-run all release gates immediately before publication**

Run:

```powershell
npm test
npm run verify:jsx
npm run build:hostinger
git diff --check origin/sync-v4...HEAD
git status --short --branch
```

Expected: all commands exit 0; only the preserved pre-existing untracked design remains outside Git.

- [ ] **Step 9: Push only the non-production feature branch**

Run:

```powershell
git push origin feature/email-dispute-verification-design
git ls-remote origin refs/heads/feature/email-dispute-verification-design
```

Expected: remote SHA equals local `HEAD`. Do not push `sync-v4`, create/merge a PR, apply the migration, configure secrets, send real mail, submit a real dispute, or deploy.

- [ ] **Step 10: Prepare the completion report**

Report exact root causes, changed files, tests/counts, commit SHA, migration filename and rollback/application prerequisites, missing SMTP secret names, database-runtime limitation, and production unchanged. Separate `IMPLEMENTED AND TESTED`, `IMPLEMENTED BUT NOT LIVE-VERIFIED`, and `REQUIRES MY APPROVAL OR CONFIGURATION`, with the exact next approval/configuration sequence.
