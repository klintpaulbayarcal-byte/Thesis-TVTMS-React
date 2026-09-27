from pathlib import Path
import json
import subprocess
import pytest

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'src/pages/PublicTicketLookup.jsx'
API = ROOT / 'src/services/api.js'


def test_dispute_form_is_not_rendered_until_eligible_ticket_is_selected():
    source = PAGE.read_text(encoding='utf-8')
    assert '{selected?<form className="dispute-form"' in source
    assert 'No ticket selected' in source
    assert 'Select an eligible ticket above' in source
    assert 'canFilePublicDispute(ticket)' in source
    assert 'canFilePublicDispute(selected)' in source


def test_dispute_api_only_exposes_submission():
    source = API.read_text(encoding='utf-8')
    assert 'publicDisputeRequestCode' not in source
    assert 'publicDisputeVerifyCode' not in source
    assert "publicDispute: data => apiRequest('/public/dispute'" in source


def test_dispute_submission_has_single_status_progress_and_no_email_input():
    source = PAGE.read_text(encoding='utf-8')
    assert 'disputeNotice' in source
    assert '<Notice type={disputeNotice.type}>{disputeNotice.text}</Notice>' in source
    assert 'disputeSubmitting' in source
    assert 'verificationStatus' not in source
    assert 'Submitting…' in source
    assert 'reason.trim().length<10' in source
    assert 'disputeEmail' not in source
    assert 'Owner Email *' not in source


def test_reason_is_enabled_for_eligible_selection_without_email_or_otp():
    source = PAGE.read_text(encoding='utf-8')
    assert 'has_notification_email' not in source
    assert 'verificationCode' not in source
    assert 'challengeToken' not in source
    assert 'required disabled={disputeSubmitting} value={reason}' in source
    assert 'API.publicDispute({ticketNumber:selected.ticket_number,plateNumber:selected.plate_number,reason:reason.trim()})' in source
    assert 'disputePlate' not in source
    assert 'reason.trim().length>4000' in source


def test_dispute_draft_resets_on_context_changes():
    source = PAGE.read_text(encoding='utf-8')
    assert "const resetDispute=" in source
    assert "setReason('')" in source
    assert 'localStorage' not in source
    assert 'setSearchParams' not in source
    assert source.count('resetDispute(') >= 3


def test_dispute_policy_is_not_weakened_by_ui_changes():
    source = (ROOT / 'api/src/handlers/public.php').read_text(encoding='utf-8')
    assert "The '.$deadline.'-day dispute period has ended." in source
    assert 'challengeToken' not in source
    assert 'tvtms_public_dispute_submit' in source


@pytest.mark.parametrize('ticket,expected', [
    (None, False),
    ({'dispute_eligible': True, 'status': 'unpaid', 'total_paid': 0}, True),
    ({'dispute_eligible': False, 'status': 'unpaid', 'total_paid': 0}, False),
    ({'dispute_eligible': True, 'status': 'unpaid', 'total_paid': '1999.00'}, False),
    ({'dispute_eligible': True, 'status': 'unpaid', 'total_paid': 0.01}, False),
    ({'dispute_eligible': True, 'status': 'unpaid', 'payment_status': 'partially_paid'}, False),
    ({'dispute_eligible': True, 'status': 'paid', 'total_paid': 2000}, False),
    ({'dispute_eligible': True, 'status': 'unpaid', 'total_paid': 0, 'has_recorded_payment': True}, False),
    ({'dispute_eligible': True, 'status': 'cancelled', 'total_paid': 0}, False),
])
def test_ui_dispute_guard_rejects_payments_even_if_eligibility_flag_is_stale(ticket, expected):
    script = f"import {{canFilePublicDispute}} from './src/utils/publicDispute.js'; console.log(JSON.stringify(canFilePublicDispute({json.dumps(ticket)})));"
    result = subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT, capture_output=True, text=True, timeout=10)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) is expected
