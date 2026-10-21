"""Contract checks: admin deletion stays gated by the database's atomic audit RPC."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def test_admin_deletion_requires_exact_confirmation_and_atomic_audit():
    handler=(ROOT/'api/src/handlers/tickets.php').read_text().split('function tickets_permanent_delete',1)[1].split('function tickets_mark_unpaid',1)[0]
    for token in ["require_role(['admin'])","confirm_ticket_number","tvtms_ticket_admin_safe_delete","authorizationAuditId","DELETE_RPC_UNAVAILABLE"]:
        assert token in handler
    assert "tvtms_ticket_mutate" not in handler
    sql=(ROOT/'supabase/migrations/202610200001_admin_safe_cancelled_failed_email_delete.sql').read_text()
    for token in ["p_ticket_number", "actor_role", "actor_status", "select * into t", "for update",
                  "status='failed'", "TICKET_PERMANENTLY_DELETED", "jsonb_agg", "audit_logs",
                  "delete from public.ticket_email_notifications", "delete from public.tickets",
                  "revoke all", "service_role"]:
        assert token in sql.lower() if token=="jsonb_agg" else token in sql

def test_ui_confirmation_and_failed_mail_eligibility():
    ui=(ROOT/'src/pages/TicketDetails.jsx').read_text()
    client=(ROOT/'src/services/api.js').read_text()
    assert "deleteConfirmation!==ticket.ticket_number" in ui
    assert "disabled={!canDelete}" in ui
    # Server now determines eligibility, including cancelled/failed-email cases.
    # Ticket Details must not independently infer permissions from incomplete fields.
    handler=(ROOT/'api/src/handlers/tickets.php').read_text()
    policy=handler.split('function ticket_admin_delete_eligibility(',1)[1].split('function tickets_list(',1)[0]
    assert "ticket.delete_eligible === true" in ui
    assert "ticket.delete_block_reason" in ui
    assert "$state!=='cancelled'" in policy
    assert "$status!=='failed'" in policy
    assert "['unpaid','cancelled']" in policy
    assert "confirm_ticket_number: confirmTicketNumber" in client
