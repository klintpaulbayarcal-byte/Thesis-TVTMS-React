"""Source-level guards for React confirmation, complemented by PHP runtime tests."""
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]


def test_officer_review_requires_explicit_recipient_confirmation():
    ui=(ROOT/'src/pages/IssueTicket.jsx').read_text(encoding='utf-8')
    assert 'recipientConfirmed' in ui
    assert 'recipient_email_confirmed:recipientConfirmed' in ui
    assert 'checked={recipientConfirmed}' in ui
    assert 'setRecipientConfirmed(false)' in ui
    assert 'verify the intended recipient' in ui.lower()
    assert 'Email notification is optional' in ui


def test_retry_requires_fresh_confirmation_before_sending():
    ui=(ROOT/'src/pages/TicketDetails.jsx').read_text(encoding='utf-8')
    assert 'retryRecipient' in ui
    assert 'retryRecipientConfirmed' in ui
    assert 'recipient_email_confirmed:true' in ui
    assert 'owner_email:retryRecipient.trim()' in ui
    assert 'setRetryRecipientConfirmed(false)' in ui
    assert 'API.retryTicketNotification(id,' in ui
