from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8").lower()


def migration_function(name: str) -> str:
    source = read("supabase/migrations/202609220001_ticket_email_snapshot_only.sql")
    marker = f"create or replace function public.{name}"
    assert marker in source
    tail = source.split(marker, 1)[1]
    return tail.split("$$;", 1)[0]


def test_public_lookup_sql_exposes_only_approved_ticket_and_balance_fields():
    for name in ("tvtms_public_lookup", "tvtms_public_vehicle"):
        body = migration_function(name)
        for private_or_excess_field in (
            "owner_name",
            "driver_license",
            "owner_address",
            "location",
            "demerit_points",
            "time_issued",
        ):
            assert private_or_excess_field not in body
        assert " owner_email," not in body
        assert "ticket_number" in body
        assert "violation_name" in body
        assert "penalty_amount" in body
        assert "total_paid" in body
        assert "remaining_balance" in body


def test_public_handler_does_not_fetch_or_return_email_metadata():
    handler = read("api/src/handlers/public.php")
    lookup = handler.split("function public_ticket_lookup", 1)[1].split("function public_vehicle_lookup", 1)[0]
    assert "owner_email" not in lookup
    assert "notification_email_masked" not in lookup


def test_public_lookup_ui_does_not_render_incident_location():
    page = read("src/pages/publicticketlookup.jsx")
    assert "ticket.location" not in page
