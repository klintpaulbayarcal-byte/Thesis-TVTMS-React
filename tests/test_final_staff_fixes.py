"""Isolated regression verification; never contacts production."""
import json
import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
PHP = os.environ.get('TVTMS_PHP', 'php')


def php(code):
    r = subprocess.run([PHP, '-r', code], cwd=ROOT, capture_output=True, text=True, timeout=10)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


@pytest.mark.parametrize('report', ['daily', 'monthly', 'yearly', 'range'])
def test_report_tickets_use_valid_payment_totals_and_keep_lifecycle(report):
    r = php('''
function supabase_rpc(string $name,array $args): array {
 return str_contains($name,'revenue')?[['total'=>1999]]:[['id'=>23,'status'=>'unpaid','penalty_amount_at_issue'=>2000]];
}
function supabase_select(string $table,array $filters,array $options): array {
 return [['ticket_id'=>23,'amount_paid'=>1999,'payment_status'=>'partial'],['ticket_id'=>23,'amount_paid'=>1,'payment_status'=>'voided']];
}
require 'api/src/handlers/tickets.php';require 'api/src/handlers/reports.php';
$rows=report_rpc_rows('tvtms_report_''' + report + '''_tickets',[]);
echo json_encode(['rows'=>$rows,'stats'=>report_stats($rows,'2026-09-01','2026-10-07')]);
''')
    row = r['rows'][0]
    assert row['status'] == 'unpaid'  # Stored lifecycle is preserved.
    assert (row['penalty_amount_at_issue'], row['total_paid'], row['remaining_balance']) == (2000, 1999, 1)
    assert row['payment_status'] == 'partially_paid'
    assert r['stats']['partially_paid'] == 1 and r['stats']['unpaid'] == 0


@pytest.mark.parametrize('case,status,code', [
    ('success', 201, None), ('missing_id', 503, 'PUBLIC_DISPUTE_UNAVAILABLE'),
    ('duplicate', 409, 'DISPUTE_ALREADY_EXISTS'), ('unavailable', 503, 'PUBLIC_DISPUTE_UNAVAILABLE'),
    ('missing_rpc', 503, 'PUBLIC_DISPUTE_NOT_CONFIGURED'),
])
def test_dispute_handler_reports_save_result_without_replaying_mutation(case, status, code):
    r = php('''
class SupabaseException extends RuntimeException {public ?string $pgCode;public function __construct(string $message,int $status=500,?string $code=null){parent::__construct($message);$this->pgCode=$code;}}
function json_input(): array {return ['ticketNumber'=>'TEST-ONLY','plateNumber'=>'TESTQA','reason'=>'TEST ONLY valid dispute reason'];}
function normalize_plate($v): string {return $v;}
function json_response(array $data,int $status=200): never {global $calls;echo json_encode(['response'=>$data,'status'=>$status,'calls'=>$calls]);exit;}
function fail(string $msg,int $status,string $code): never {json_response(['message'=>$msg,'errorCode'=>$code],$status);}
function rpc_domain_error($r) {return isset($r['errorCode'])?$r:null;}
function fail_domain($r): never {fail($r['message'],$r['statusCode'],$r['errorCode']);}
$calls=0;
function supabase_rpc(string $name,array $args): array {
 global $calls;$calls++;
 $case=''' + json.dumps(case) + ''';
 if($case==='unavailable')throw new SupabaseException('Test unavailable',503);
 if($case==='missing_rpc')throw new SupabaseException('Test missing',404,'PGRST202');
 if($case==='duplicate')return ['errorCode'=>'DISPUTE_ALREADY_EXISTS','message'=>'Already open','statusCode'=>409];
 return $case==='success'?['disputeId'=>42]:[];
}
require 'api/src/handlers/public.php';public_dispute();
''')
    assert r['status'] == status and r['calls'] == 1
    assert r['response'].get('errorCode') == code
    if case == 'success':
        assert r['response']['success'] is True and r['response']['dispute_id'] == 42


@pytest.mark.parametrize('page', ['AdminDashboard', 'OfficerDashboard', 'TicketDetails', 'ViewTickets', 'Payments', 'Reports'])
def test_all_staff_status_renderers_share_the_effective_rule(page):
    s = (ROOT / f'src/pages/{page}.jsx').read_text()
    assert 'effectivePaymentStatus(' in s
    assert 'value={ticket.status}' not in s and 'value={r.status}' not in s


def test_public_currency_copy():
    s = (ROOT / 'src/pages/Landing.jsx').read_text()
    assert '₱150 per violation' in s and '?150 per violation' not in s


@pytest.mark.parametrize('suite', ['final-staff-client-runtime.mjs', 'final-staff-database-runtime.mjs'])
def test_new_isolated_runtime_suites(suite):
    r = subprocess.run(['node', '--test', f'tests/{suite}'], cwd=ROOT, capture_output=True, text=True, timeout=180)
    assert r.returncode == 0, r.stdout + r.stderr
