from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/202609220001_ticket_email_snapshot_only.sql"


def sql() -> str:
    return MIGRATION.read_text(encoding="utf-8").lower()


def function_body(name: str) -> str:
    source = sql()
    marker = f"create or replace function public.{name}"
    assert marker in source, f"missing function {name}"
    tail = source.split(marker, 1)[1]
    delimiter = "$function$" if "as $function$" in tail else "$$"
    body = tail.split(f"as {delimiter}", 1)[1]
    return body.split(f"{delimiter};", 1)[0]


def test_all_ticket_email_paths_use_only_the_issuance_snapshot():
    for name in (
        "tvtms_ticket_email_claim",
        "tvtms_dispute_verification_request",
        "tvtms_public_dispute_verified",
        "tvtms_payment_record",
        "tvtms_dispute_resolve",
    ):
        body = function_body(name)
        assert "owner_email_at_issue" in body
        assert ".owner_email" not in body.replace(".owner_email_at_issue", "")


def test_missing_snapshot_fails_closed_instead_of_using_mutable_vehicle_email():
    source = sql()
    assert "verification_email_unavailable" in source
    assert "missing_recipient" in source
    assert "coalesce(nullif(trim(ti.owner_email_at_issue),''),nullif(trim(v.owner_email),''))" not in source
    assert "coalesce(nullif(trim(ti.owner_email_at_issue),''),nullif(trim(ve.owner_email),''))" not in source


def test_replacement_functions_remain_service_role_only():
    source = sql()
    signatures = (
        "tvtms_ticket_email_claim(bigint,bigint)",
        "tvtms_dispute_verification_request(text,text,text,text)",
        "tvtms_public_dispute_verified(text,text,text)",
        "tvtms_payment_record(bigint,text,numeric,date,text,text,bigint)",
        "tvtms_dispute_resolve(bigint,text,text,bigint)",
    )
    for signature in signatures:
        assert f"revoke all on function public.{signature} from public, anon, authenticated, service_role" in source
        assert f"grant execute on function public.{signature} to service_role" in source


def test_dispute_resolution_handler_uses_only_snapshot_notification_recipient():
    handler = (ROOT / "api/src/handlers/disputes.php").read_text(encoding="utf-8").lower()
    resolve = handler.split("function disputes_resolve", 1)[1]
    assert "$d['notification_email']" in resolve
    assert "$d['contact_email']" not in resolve
    assert "$d['owner_email']" not in resolve
