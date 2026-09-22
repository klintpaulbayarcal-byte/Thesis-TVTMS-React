from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'src/pages/PublicTicketLookup.jsx'
API = ROOT / 'src/services/api.js'


def test_dispute_form_is_not_rendered_until_eligible_ticket_is_selected():
    source = PAGE.read_text(encoding='utf-8')
    assert '{selected?<form className="dispute-form"' in source
    assert 'No ticket selected' in source
    assert 'Select an eligible ticket above' in source
    assert 'ticket.dispute_eligible' in source


def test_dispute_api_has_separate_request_verify_and_submit_calls():
    source = API.read_text(encoding='utf-8')
    assert "publicDisputeRequestCode: ticketNumber => apiRequest('/public/dispute/verification/request'" in source
    assert "publicDisputeVerifyCode: data => apiRequest('/public/dispute/verification/verify'" in source
    assert "publicDispute: data => apiRequest('/public/dispute'" in source


def test_dispute_submission_has_single_status_progress_and_no_email_input():
    source = PAGE.read_text(encoding='utf-8')
    assert 'disputeNotice' in source
    assert '<Notice type={disputeNotice.type}>{disputeNotice.text}</Notice>' in source
    assert "useState('idle')" in source
    assert 'verificationStatus' in source
    assert 'Sending code…' in source
    assert 'Verifying…' in source
    assert 'Submitting…' in source
    assert 'reason.trim().length<10' in source
    assert 'disputeEmail' not in source
    assert 'Owner Email *' not in source


def test_code_verification_precedes_reason_and_uses_masked_recipient():
    source = PAGE.read_text(encoding='utf-8')
    assert 'notificationEmailMasked&&' in source
    assert 'response.notificationEmailMasked' in source
    assert 'selected?.has_notification_email' in source
    assert 'API.publicDisputeRequestCode(selected.ticket_number)' in source
    assert 'API.publicDisputeVerifyCode' in source
    assert 'verificationCode' in source
    assert 'maxLength="6"' in source
    assert "verificationStatus!=='verified'" in source
    assert 'challengeToken' in source


def test_challenge_is_memory_only_and_resets_on_context_changes():
    source = PAGE.read_text(encoding='utf-8')
    assert "const resetDispute=" in source
    assert 'setChallengeToken' in source
    assert "setNotificationEmailMasked('')" in source
    assert 'localStorage' not in source
    assert 'setSearchParams' not in source
    assert source.count('resetDispute(') >= 3


def test_dispute_policy_is_not_weakened_by_ui_changes():
    source = (ROOT / 'api/src/handlers/public.php').read_text(encoding='utf-8')
    assert "The '.$deadline.'-day dispute period has ended." in source
    assert 'challengeToken' in source
    assert 'tvtms_public_dispute_verified' in source
