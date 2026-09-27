"""Regression contracts: a ticket list must not invite an admin into an officer-only route."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_ticket_list_issue_action_is_officer_only():
    page = (ROOT / 'src/pages/ViewTickets.jsx').read_text(encoding='utf-8')
    assert "user?.role==='apprehending_officer'&&<Link to=\"/officer/issue-ticket\"" in page


def test_ticket_lists_display_partial_payment_without_changing_stored_status():
    ticket_list = (ROOT / 'src/pages/ViewTickets.jsx').read_text(encoding='utf-8')
    plate_lookup = (ROOT / 'src/pages/LicensePlateLookup.jsx').read_text(encoding='utf-8')
    assert "<StatusBadge value={row.payment_status??row.status}/>" in ticket_list
    assert "row.penalty_amount,row.payment_status??row.status" in ticket_list
    assert "<StatusBadge value={row.payment_status??row.status}/>" in plate_lookup
    assert "row.status='partially_paid'" not in ticket_list + plate_lookup
