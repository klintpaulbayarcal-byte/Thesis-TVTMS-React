import json
import os
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
PHP = Path(os.environ.get('TVTMS_PHP', r'C:\tools\php83\php.exe'))


def source(path):
    return (ROOT / path).read_text(encoding='utf-8')


def run_php(script):
    result = subprocess.run([str(PHP), '-r', script], capture_output=True, text=True, timeout=10)
    assert result.returncode == 0, result.stderr
    return result.stdout


def test_cancelled_ticket_is_visible_but_has_zero_collectible_balance():
    handler = ROOT / 'api/src/handlers/tickets.php'
    script = f'''require {json.dumps(str(handler))};
$tickets = [["id"=>1,"status"=>"cancelled","penalty_amount_at_issue"=>1500]];
$payments = [];
echo json_encode(ticket_apply_payment_totals($tickets,$payments));'''
    rows = json.loads(run_php(script))
    assert rows == [{
        'id': 1,
        'status': 'cancelled',
        'penalty_amount_at_issue': 1500,
        'total_paid': 0,
        'remaining_balance': 0,
        'payment_status': 'cancelled',
    }]


def test_partial_payment_is_reported_as_partially_paid():
    handler = ROOT / 'api/src/handlers/tickets.php'
    script = f'''require {json.dumps(str(handler))};
$tickets = [["id"=>7,"status"=>"unpaid","penalty_amount_at_issue"=>1500]];
$payments = [["ticket_id"=>7,"amount_paid"=>400,"payment_status"=>"completed"]];
echo json_encode(ticket_apply_payment_totals($tickets,$payments));'''
    rows = json.loads(run_php(script))
    assert rows[0]['total_paid'] == 400
    assert rows[0]['remaining_balance'] == 1100
    assert rows[0]['payment_status'] == 'partially_paid'


def test_migration_defines_atomic_immutable_plate_sequence_and_safe_access():
    sql = source('supabase/migrations/202609190001_ticket_history_payment_display.sql').lower()
    assert 'plate_ticket_count_at_issue' in sql
    assert 'same_violation_offense_count_at_issue' in sql
    assert 'create table if not exists public.plate_ticket_sequences' in sql
    assert 'on conflict (normalized_plate) do update' in sql
    assert 'returning last_number' in sql
    assert 'enable row level security' in sql
    assert 'revoke all on table public.plate_ticket_sequences from anon, authenticated' in sql
    assert 'grant select, insert, update on table public.plate_ticket_sequences to service_role' in sql


def test_migration_keeps_cancelled_history_but_excludes_cancelled_debt():
    sql = source('supabase/migrations/202609190001_ticket_history_payment_display.sql').lower()
    assert "case when t.status='cancelled' then 0" in sql
    assert "t.status='unpaid'" in sql
    assert "payment_status<>'voided'" in sql
    assert 'voidedpaymentids' in sql
    assert 'voidedpaymentamount' in sql
    assert "update public.tickets set status='unpaid',payment_date=null where id=p_id returning * into v_ticket" in sql


def test_staff_ui_separates_plate_sequence_penalty_level_and_outstanding():
    issue = source('src/pages/IssueTicket.jsx')
    detail = source('src/pages/TicketDetails.jsx')
    for label in [
        'Plate Ticket Count at Issuance',
        'Same-Plate/Same-Violation Penalty Level',
        'New Ticket Penalty',
        'Current Plate Outstanding',
    ]:
        assert label in issue
    assert 'does not prove the same owner or driver' in issue
    assert 'plate_ticket_count_at_issue' in detail
    assert 'same_violation_offense_count_at_issue' in detail


def test_issue_history_has_individual_penalty_paid_balance_and_status():
    issue = source('src/pages/IssueTicket.jsx')
    for field in ['penalty_amount', 'total_paid', 'remaining_balance', 'status']:
        assert field in issue


def test_public_quick_lookup_shows_balance_status_and_full_plate_link():
    landing = source('src/pages/Landing.jsx')
    lookup = source('src/pages/PublicTicketLookup.jsx')
    assert 'remaining_balance' in landing
    assert 'View full plate history' in landing
    assert '/ticket-lookup?plate=' in landing
    assert 'rows.slice(0,4)' not in landing
    assert "searchParams.get('plate')" in lookup
    assert 'Combined Outstanding' in lookup


def test_public_lookup_source_does_not_render_private_owner_fields():
    lookup = source('src/pages/PublicTicketLookup.jsx')
    forbidden = ['owner_name', 'owner_email', 'owner_address', 'driver_license_number', 'official_receipt_number']
    for field in forbidden:
        assert field not in lookup


def test_plate_history_views_do_not_claim_driver_repeat_offender_identity():
    staff_lookup = source('src/pages/LicensePlateLookup.jsx').lower()
    public_lookup = source('src/pages/PublicTicketLookup.jsx').lower()
    assert 'repeat offender' not in staff_lookup
    assert 'repeat offender' not in public_lookup


def test_private_runtime_configuration_is_excluded_from_distribution():
    assert 'api/config/config.local.php' in source('.gitignore')
    assert not (ROOT / 'deploy/api/config/config.local.php').exists()
    assert not list(ROOT.glob('.env'))
    assert not list(ROOT.glob('.env.*'))
