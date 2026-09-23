from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/202609200001_ticket_email_dispute_verification.sql"


def migration_sql() -> str:
    return MIGRATION.read_text(encoding="utf-8").lower()


def function_body(name: str) -> str:
    sql = migration_sql()
    marker = f"create or replace function public.{name}"
    assert marker in sql, f"missing function {name}"
    tail = sql.split(marker, 1)[1]
    assert "as $function$" in tail, f"{name} must use a tagged function body"
    body = tail.split("as $function$", 1)[1]
    assert "$function$;" in body, f"unterminated function {name}"
    return body.split("$function$;", 1)[0]


def test_migration_is_additive_and_service_role_only():
    sql = migration_sql()
    assert "create table public.ticket_email_notifications" in sql
    assert "create table public.public_dispute_verifications" in sql
    assert sql.count("enable row level security") >= 2
    assert "revoke all on table public.ticket_email_notifications from public, anon, authenticated, service_role" in sql
    assert "revoke all on table public.public_dispute_verifications from public, anon, authenticated, service_role" in sql
    assert "grant select, insert, update on table public.ticket_email_notifications to service_role" in sql
    assert "grant select, insert, update on table public.public_dispute_verifications to service_role" in sql
    assert "grant usage, select on sequence public.ticket_email_notifications_id_seq to service_role" in sql
    assert "grant usage, select on sequence public.public_dispute_verifications_id_seq to service_role" in sql
    assert "drop table public.tickets" not in sql
    assert "delete from public.tickets" not in sql


def test_notification_claim_prevents_duplicate_or_ambiguous_resend():
    body = function_body("tvtms_ticket_email_claim")
    assert "status='accepted'" in body
    assert "status='unknown'" in body
    assert "for update" in body
    assert "interval '5 minutes'" in body


def test_verification_request_enforces_deadline_cooldown_and_hourly_limits():
    body = function_body("tvtms_dispute_verification_request")
    assert "setting_key='dispute_deadline_days'" in body
    assert "interval '60 seconds'" in body
    assert "interval '1 hour'" in body
    assert "requester_fingerprint" in body
    assert "status in ('submitted','under_review')" in body


def test_verified_submission_rechecks_existing_eligibility_and_consumes_once():
    body = function_body("tvtms_public_dispute_verified")
    assert "t.status<>'unpaid'" in body
    assert "setting_key='dispute_deadline_days'" in body
    assert "coalesce((select setting_value::integer" in body
    assert "status in ('submitted','under_review')" in body
    assert "v.status<>'verified'" in body
    assert "set status='consumed'" in body
    assert "for update" in body
