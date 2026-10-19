"""Static regression checks for safe admin-only record management.

These tests never connect to the live database or invoke destructive endpoints.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def src(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_admin_only_deletion_and_audited_reason():
    php = src("api/src/handlers/tickets.php")
    block = php.split("function tickets_permanent_delete", 1)[1].split("function tickets_mark_unpaid", 1)[0]
    assert "require_role(['admin'])" in block
    assert "strlen($reason)<5" in block
    assert "confirm_ticket_number" in block
    assert "hash_equals" in block
    assert "tvtms_ticket_admin_delete" in block
    assert "log_audit" not in block
    migration = src("supabase/migrations/202610190001_atomic_admin_ticket_delete.sql")
    assert "TICKET_PERMANENTLY_DELETED" in migration
    assert "INSERT INTO public.audit_logs" in migration
    assert "DELETE FROM public.tickets" in migration
    assert "GRANT EXECUTE ON FUNCTION public.tvtms_ticket_admin_delete" in migration


def test_linked_records_block_deletion():
    php = src("api/src/handlers/tickets.php")
    block = php.split("function tickets_permanent_delete", 1)[1].split("function tickets_mark_unpaid", 1)[0]
    for table in ("payments", "disputes", "evidence", "ticket_email_notifications"):
        assert "'"+table+"'" in block
    assert "LINKED_RECORDS_EXIST" in block


def test_ui_requires_exact_citation_and_restricts_mutations():
    jsx = src("src/pages/TicketDetails.jsx")
    api = src("src/services/api.js")
    assert "deleteConfirmation.trim() !== ticket?.ticket_number" in jsx
    assert "actionType==='delete' && deleteConfirmation.trim()!==ticket.ticket_number" in jsx
    assert "const canEdit = ticket.status === 'unpaid'" in jsx
    assert "const canDelete = isAdmin" in jsx
    assert "confirm_ticket_number: confirmTicketNumber" in api


def test_role_scoping_not_relaxed():
    php = src("api/src/handlers/tickets.php")
    routes = src("src/routes/AppRoutes.jsx")
    assert "function tickets_create(array $params=[]): never" in php
    assert "require_role(['apprehending_officer'])" in php
    assert "if($u['role']==='apprehending_officer'" in php
    assert "secure(['admin'], <ViewTickets/>)" in routes
    assert "secure(['admin','apprehending_officer'], <ViewTickets/>)" in routes
