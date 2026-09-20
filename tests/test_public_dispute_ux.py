from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'src/pages/PublicTicketLookup.jsx'


def test_dispute_form_is_not_rendered_until_eligible_ticket_is_selected():
    source = PAGE.read_text(encoding='utf-8')
    assert '{selected?<form className="dispute-form"' in source
    assert 'No ticket selected' in source
    assert 'Select an eligible ticket above' in source
    assert 'ticket.dispute_eligible' in source


def test_dispute_submission_has_visible_validation_and_progress():
    source = PAGE.read_text(encoding='utf-8')
    assert 'disputeNotice' in source
    assert '<Notice type={disputeNotice.type}>{disputeNotice.text}</Notice>' in source
    assert 'Submitting…' in source
    assert 'disputeBusy' in source
    assert 'reason.trim().length<10' in source


def test_dispute_policy_is_not_weakened_by_ui_changes():
    source = (ROOT / 'api/src/handlers/public.php').read_text(encoding='utf-8')
    assert "The '.$deadline.'-day dispute period has ended." in source
    assert 'TICKET_VERIFICATION_FAILED' in source
