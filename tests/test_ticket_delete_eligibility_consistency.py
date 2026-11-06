"""Regression: both staff views rely on the same fail-closed eligibility check."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_shared_delete_eligibility_checks_all_protected_records():
    handler = (ROOT / "api/src/handlers/tickets.php").read_text(encoding="utf-8")
    helper = handler.split("function ticket_admin_delete_eligibility(", 1)[1].split("function tickets_list(", 1)[0]
    for related in ("payments", "disputes", "evidence", "public_dispute_verifications", "ticket_email_notifications"):
        assert related in helper
    assert "$verified=false;" in helper
    assert "catch(Throwable $e)" in helper
    assert "$item['delete_eligible']=$reason===null;" in helper
    assert "if($u['role']==='admin'&&$tickets)$tickets=ticket_admin_delete_eligibility($tickets);" in handler
    assert "$checked=ticket_admin_delete_eligibility([$ticket]);" in handler
    assert "'delete_eligible'=>false" in handler


def test_ticket_detail_refuses_unverified_delete():
    detail = (ROOT / "src/pages/TicketDetails.jsx").read_text(encoding="utf-8")
    assert "const canReviewDelete=ticket.delete_eligible===true;" in detail
    assert "const canDelete = isAdmin && ticket.delete_eligible === true;" in detail
    assert "ticket.delete_block_reason" in detail
    assert "!ticket.has_dispute" not in detail
    assert "disabled={!canDelete}" in detail
