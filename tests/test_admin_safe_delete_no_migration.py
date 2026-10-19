"""Offline checks; never delete real citations."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def test_admin_deletion_requires_exact_confirmation():
    block=(ROOT/'api/src/handlers/tickets.php').read_text().split('function tickets_permanent_delete',1)[1].split('function tickets_mark_unpaid',1)[0]
    for token in ["require_role(['admin'])","confirm_ticket_number","hash_equals","TICKET_DELETE_NOT_ALLOWED","'payments'","'disputes'","'evidence'","'ticket_email_notifications'","TICKET_DELETE_AUTHORIZED","DELETE_AUDIT_UNAVAILABLE","tvtms_ticket_mutate","TICKET_PERMANENTLY_DELETED"]:
        assert token in block
    assert block.index("TICKET_DELETE_AUTHORIZED") < block.index("tvtms_ticket_mutate")
    assert "tvtms_ticket_admin_delete" not in block

def test_ui_confirmation_and_api_alignment():
    ui=(ROOT/'src/pages/TicketDetails.jsx').read_text()
    client=(ROOT/'src/services/api.js').read_text()
    assert "deleteConfirmation!==ticket.ticket_number" in ui
    assert "disabled={!canDelete}" in ui
    assert "confirm_ticket_number: confirmTicketNumber" in client
