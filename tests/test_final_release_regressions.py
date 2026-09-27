import json
import os
import subprocess
import pytest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PHP = Path(os.environ.get("TVTMS_PHP", r"C:\tools\php83\php.exe"))


def run_php(script: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(PHP), "-r", script],
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )


def test_audit_csv_treats_formula_like_cells_as_text():
    """Removing CSV formula neutralization must make exported audit cells unsafe again."""
    script = """
import { csvCell } from './src/utils/csv.js';
console.log(JSON.stringify([
  csvCell('=2+2'), csvCell('+SUM(A1:A2)'), csvCell('-10+20'),
  csvCell('@HYPERLINK(\"https://example.invalid\")'), csvCell('\t=1+1'),
  csvCell('normal \"quoted\" value')
]));
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == [
        '"\'=2+2"',
        '"\'+SUM(A1:A2)"',
        '"\'-10+20"',
        '"\'@HYPERLINK(""https://example.invalid"")"',
        '"\'\t=1+1"',
        '"normal ""quoted"" value"',
    ]


def test_audit_client_ip_ignores_untrusted_forwarded_headers():
    """A caller-controlled X-Forwarded-For value must never reach audit storage."""
    common = json.dumps(str(ROOT / "api/src/common.php"))
    spoofed = json.dumps('=HYPERLINK("https://example.invalid")')
    script = f'''$_SERVER["REMOTE_ADDR"]="203.0.113.42";
$_SERVER["HTTP_X_FORWARDED_FOR"]={spoofed};
require {common};
echo client_ip_for_audit();'''
    result = run_php(script)
    assert result.returncode == 0, result.stderr
    assert result.stdout == "203.0.113.42"


def test_password_change_fingerprint_and_revocation_key_are_stable_and_bounded():
    """Removing either password binding or the bounded session key must break revocation."""
    auth = json.dumps(str(ROOT / "api/src/auth.php"))
    script = f'''require {auth};
$hash=password_hash("Example!Pass123", PASSWORD_BCRYPT);
$pwd=token_password_fingerprint($hash);
$token=token_sign(["id"=>7,"pwd"=>$pwd],str_repeat("s",32),3600,1000);
$payload=token_verify($token,str_repeat("s",32),1001);
echo json_encode([
 token_matches_password($payload,$hash),
 token_matches_password($payload,password_hash("Different!Pass123", PASSWORD_BCRYPT)),
 token_revocation_entity($token),
 strlen(token_revocation_entity($token))
]);'''
    result = run_php(script)
    assert result.returncode == 0, result.stderr
    matched, changed_password_matches, entity, length = json.loads(result.stdout)
    assert matched is True
    assert changed_password_matches is False
    assert entity.startswith("s:")
    assert length <= 50


def test_logout_revokes_current_bearer_session_before_success():
    """Deleting the server revocation call must make logout leave the token usable."""
    handler = json.dumps(str(ROOT / "api/src/handlers/auth.php"))
    script = f'''$calls=[];
function current_user(bool $required=true): ?array {{ return ["id"=>7,"role"=>"admin"]; }}
function bearer_token(): ?string {{ return "header.payload.signature"; }}
function revoke_session(string $token,int $userId): void {{ global $calls; $calls[]=["revoke",$token,$userId]; }}
function log_audit(?int $userId,string $action,?string $entityType=null,?int $entityId=null,array $metadata=[]): void {{ global $calls; $calls[]=["audit",$action]; }}
function json_response(array $payload,int $status=200): never {{ global $calls; echo json_encode(["status"=>$status,"payload"=>$payload,"calls"=>$calls]); exit; }}
require {handler};
auth_logout([]);'''
    result = run_php(script)
    assert result.returncode == 0, result.stderr
    body = json.loads(result.stdout)
    assert body["status"] == 200
    assert body["calls"][0] == ["revoke", "header.payload.signature", 7]
    assert ["audit", "LOGOUT"] in body["calls"]


def invoke_public_dispute(body: dict, rpc_result=None) -> dict:
    handler = json.dumps(str(ROOT / "api/src/handlers/public.php"))
    response = json.dumps(json.dumps(rpc_result if rpc_result is not None else {"disputeId": 99}))
    script = f'''$rpcCalls=[];$body=json_decode({json.dumps(json.dumps(body))},true);
function json_input(): array {{ global $body;return $body; }}
function clean_string($value,int $max=4000): string {{ return substr(trim((string)$value),0,$max); }}
function normalize_plate($value): string {{ return strtoupper(preg_replace('/[\\s-]+/','',trim($value))); }}
class SupabaseException extends RuntimeException {{ public ?string $pgCode; public function __construct(string $code) {{ parent::__construct('private database detail owner@example.test secret-key'); $this->pgCode=$code; }} }}
function supabase_rpc(string $name,array $args=[]): mixed {{ global $rpcCalls;$rpcCalls[]=[$name,$args];$r=json_decode({response},true);if(isset($r['_throw'])){{if($r['_throw']==='transport')throw new RuntimeException('private connection secret-key');throw new SupabaseException($r['_throw']);}}return $r; }}
function rpc_domain_error(mixed $result): ?array {{ return is_array($result)&&isset($result['errorCode'])?$result:null; }}
function fail_domain(array $error): never {{ fail($error['message'],$error['statusCode'],$error['errorCode']); }}
function fail(string $message,int $status=400,string $errorCode="ERROR",array $extra=[]): never {{ global $rpcCalls;echo json_encode(["status"=>$status,"message"=>$message,"errorCode"=>$errorCode,"rpcCalls"=>$rpcCalls]);exit; }}
function json_response(array $payload,int $status=200): never {{ global $rpcCalls;echo json_encode(["status"=>$status,"payload"=>$payload,"rpcCalls"=>$rpcCalls]);exit; }}
require {handler};
public_dispute([]);'''
    result = run_php(script)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def test_public_dispute_sends_ticket_plate_and_reason_to_eligibility_rpc():
    """Caller-controlled email and obsolete tokens never reach dispute storage."""
    reason = "A sufficiently detailed dispute reason."
    accepted = invoke_public_dispute({"ticketNumber": " tvt-2026-000001 ", "plateNumber": " abc-123 ", "email": "ignored@example.invalid", "reason": reason})
    assert accepted["status"] == 201
    assert accepted["rpcCalls"] == [["tvtms_public_dispute_submit", {"p_ticket": "TVT-2026-000001", "p_plate": "ABC123", "p_reason": reason}]]
    assert "ignored@example.invalid" not in json.dumps(accepted)


@pytest.mark.parametrize('reason', ['', ' ' * 20, 'short', 'x' * 4001, 'é' * 9, [], None])
def test_public_dispute_rejects_invalid_reasons_without_rpc(reason):
    result = invoke_public_dispute({'ticketNumber': 'TVT-2026-000001', 'plateNumber': 'ABC123', 'reason': reason})
    assert result['status'] == 400
    assert result['errorCode'] == 'VALIDATION_ERROR'
    assert result['rpcCalls'] == []


@pytest.mark.parametrize('reason', ['x' * 10, 'x' * 4000, 'é' * 10, 'é' * 4000])
def test_public_dispute_accepts_reason_character_boundaries_without_truncation(reason):
    result = invoke_public_dispute({'ticketNumber': 'TVT-2026-000001', 'plateNumber': 'ABC123', 'reason': reason})
    assert result['status'] == 201
    assert result['rpcCalls'][0][1]['p_reason'] == reason


@pytest.mark.parametrize('code,status', [
    ('TICKET_NOT_FOUND', 404), ('INVALID_TICKET_STATUS', 403),
    ('DISPUTE_DEADLINE_EXPIRED', 403), ('DISPUTE_ALREADY_EXISTS', 409),
    ('TICKET_PLATE_MISMATCH', 403), ('PAYMENT_EXISTS', 403),
])
def test_public_dispute_propagates_server_eligibility_rejections(code, status):
    result = invoke_public_dispute(
        {'ticketNumber': 'TVT-2026-000001', 'plateNumber': 'ABC123', 'reason': 'Please review this ticket.'},
        {'errorCode': code, 'statusCode': status, 'message': 'Rejected by policy.'},
    )
    assert result['status'] == status
    assert result['errorCode'] == code


def test_public_dispute_never_reports_success_for_malformed_rpc_result():
    result = invoke_public_dispute({'ticketNumber': 'TVT-2026-000001', 'plateNumber': 'ABC123', 'reason': 'Please review this ticket.'}, {})
    assert result['status'] == 503
    assert result['errorCode'] == 'PUBLIC_DISPUTE_UNAVAILABLE'


@pytest.mark.parametrize('plate', [None, '', ' - ', [], 'X' * 31])
def test_public_dispute_requires_valid_plate(plate):
    result = invoke_public_dispute({'ticketNumber': 'TVT-2026-000001', 'plateNumber': plate, 'reason': 'Please review this ticket.'})
    assert result['status'] == 400
    assert result['rpcCalls'] == []


@pytest.mark.parametrize('failure,code', [
    ('PGRST202', 'PUBLIC_DISPUTE_NOT_CONFIGURED'), ('42883', 'PUBLIC_DISPUTE_NOT_CONFIGURED'),
    ('42501', 'PUBLIC_DISPUTE_UNAVAILABLE'), ('transport', 'PUBLIC_DISPUTE_UNAVAILABLE'),
])
def test_public_dispute_rpc_unavailability_has_safe_actionable_error(failure, code):
    result = invoke_public_dispute({'ticketNumber': 'TVT-2026-000001', 'plateNumber': 'ABC123', 'reason': 'Please review this ticket.'}, {'_throw': failure})
    assert result['status'] == 503
    assert result['errorCode'] == code
    assert 'contact the issuing office' in result['message']
    assert 'Database operation failed' not in result['message']
    assert 'secret-key' not in json.dumps(result)
    assert 'owner@example.test' not in json.dumps(result)


def test_development_router_serves_files_from_the_real_uploads_directory():
    """Reintroducing the duplicate uploads/uploads path must break local asset serving."""
    name = f"route-probe-{os.getpid()}.txt"
    target = ROOT / "uploads" / name
    target.write_text("TVTMS_UPLOAD_ROUTE_OK", encoding="utf-8")
    try:
        router = json.dumps(str(ROOT / "dev-router.php"))
        request_uri = json.dumps(f"/uploads/{name}")
        script = f'''$_SERVER["REQUEST_URI"]={request_uri};$_SERVER["REQUEST_METHOD"]="GET";require {router};'''
        result = run_php(script)
        assert result.returncode == 0, result.stderr
        assert result.stdout == "TVTMS_UPLOAD_ROUTE_OK"
    finally:
        target.unlink(missing_ok=True)


def test_release_configuration_targets_php83_and_required_final_archive():
    """Restoring PHP 8.0 launchers or the obsolete ZIP name must fail the release gate."""
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    combined = "\n".join(
        [
            json.dumps(package),
            (ROOT / "php.cmd").read_text(encoding="utf-8"),
            (ROOT / "php.bat").read_text(encoding="utf-8"),
            (ROOT / "scripts/build-verified-hostinger.ps1").read_text(encoding="utf-8"),
        ]
    ).replace("\\", "/").lower()
    assert "c:/xampp/php" not in combined
    assert "c:/tools/php83/php.exe" in combined
    assert "tvtms_v4_final_hostinger_deploy.zip" in combined
    packager = (ROOT / "scripts/package-hostinger.cjs").read_text(encoding="utf-8")
    assert "DEPLOYMENT_README.txt" in packager


def test_ticket_csv_uses_shared_formula_safe_serializer():
    page = (ROOT / "src/pages/ViewTickets.jsx").read_text(encoding="utf-8")
    assert "import { csvCell }" in page
    assert "line.map(csvCell)" in page


def test_manual_ticket_status_cannot_fabricate_payment_history():
    handler = (ROOT / "api/src/handlers/tickets.php").read_text(encoding="utf-8")
    migration = (ROOT / "supabase/migrations/202609120002_tickets.sql").read_text(encoding="utf-8")
    valid_statuses = handler.split("$valid=", 1)[1].split(";", 1)[0]
    assert "partially_paid" not in valid_statuses
    assert "status==='partially_paid'" in handler
    status_branch = migration.split("elsif p_action='status'", 1)[1].lower()
    assert "v_status in ('paid','partially_paid')" in status_branch
    assert "payment_required" in status_branch


def test_evidence_upload_enforces_ticket_count_and_byte_quotas():
    handler = (ROOT / "api/src/handlers/evidence.php").read_text(encoding="utf-8")
    assert "EVIDENCE_TICKET_FILE_LIMIT" in handler
    assert "EVIDENCE_TICKET_BYTE_LIMIT" in handler
    assert "EVIDENCE_QUOTA_EXCEEDED" in handler


def test_financial_reports_subtract_non_voided_payments_from_penalties():
    migration = (ROOT / "supabase/migrations/202609120005_reports.sql").read_text(encoding="utf-8")
    payment_status = migration.split("create or replace function public.tvtms_report_payment_status", 1)[1].split("revoke all on function public.tvtms_report_payment_status", 1)[0]
    aging = migration.split("create or replace function public.tvtms_report_aging", 1)[1].split("revoke all on function public.tvtms_report_aging", 1)[0]
    for function_body in (payment_status, aging):
        normalized = function_body.lower()
        assert "payment_status<>'voided'" in normalized
        assert "greatest(" in normalized
