import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ISSUE = (ROOT / "src/pages/IssueTicket.jsx").read_text(encoding="utf-8")
DETAILS = (ROOT / "src/pages/TicketDetails.jsx").read_text(encoding="utf-8")


def test_issue_ticket_reports_persistence_before_server_notification_outcome():
    assert "response.notification" in ISSUE
    assert re.search(
        r"text:`Ticket \$\{ticket\?\.ticket_number\|\|''\} issued successfully\. \$\{notification\.message",
        ISSUE,
    )
    assert "No email notification status was returned." in ISSUE
    assert "notification.status==='accepted'||notification.status==='already_accepted'" in ISSUE
    assert "setReviewOpen(false)" in ISSUE
    assert "2500" in ISSUE
    assert not re.search(r"issued successfully\.[^`'\"]*email (?:was )?sent", ISSUE, re.IGNORECASE)


def test_ticket_details_shows_only_safe_notification_fields():
    assert "ticket.notification" in DETAILS
    assert "notification.status" in DETAILS
    assert "notification.recipientMasked" in DETAILS
    assert "notification.message" in DETAILS
    assert "owner_email" not in DETAILS


def test_ticket_details_retries_only_when_server_allows_it():
    assert "API.retryTicketNotification(id)" in DETAILS
    assert re.search(r"notification\.retryAllowed\s*&&\s*<button", DETAILS)
    assert "notificationBusy" in DETAILS
    assert "await load()" in DETAILS
