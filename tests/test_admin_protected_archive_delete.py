from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def test_protected_delete_requires_admin_and_double_confirmation():
    handler=(ROOT/'api/src/handlers/tickets.php').read_text()
    portion=handler.split('function tickets_admin_archive_remove',1)[1].split('function tickets_mark_unpaid',1)[0]
    assert "require_role(['admin'])" in portion
    assert "ARCHIVE AND DELETE" in portion
    assert "confirm_ticket_number" in portion
    assert "tvtms_ticket_admin_archived_delete" in portion
    assert "authorizationAuditId" in portion
    assert "archiveId" in portion
    assert "ARCHIVE_RPC_UNAVAILABLE" in portion
    assert "supabase_delete" not in portion

def test_archive_migration_is_atomic_and_restricted():
    sql=(ROOT/'supabase/migrations/202610210001_admin_protected_archive_delete.sql').read_text()
    for token in ["SECURITY DEFINER","p_confirmation IS DISTINCT FROM 'ARCHIVE AND DELETE'",
                  "FOR UPDATE","snapshot_digest","audit_logs","public.payments","public.disputes",
                  "public.evidence","ticket_email_notifications","public.ticket_violations",
                  "private.tvtms_archived_citation_deletions","v_archive_id","v_audit_id",
                  "REVOKE ALL","GRANT EXECUTE", "service_role"]:
        assert token in sql

def test_ui_and_api_provide_deliberate_archive_override():
    ui=(ROOT/'src/pages/TicketDetails.jsx').read_text()
    listing=(ROOT/'src/pages/ViewTickets.jsx').read_text()
    api=(ROOT/'src/services/api.js').read_text()
    router=(ROOT/'api/src/router.php').read_text()
    assert "API.archiveRemoveTicket(id, actionReason.trim(), deleteConfirmation, archiveConfirmation)" in ui
    assert "archiveConfirmation!=='ARCHIVE AND DELETE'" in ui
    assert "deleteConfirmation!==ticket.ticket_number" in ui
    assert "action=archive" in listing
    assert "archiveRemoveTicket:" in api
    assert "tickets_admin_archive_remove" in router
