import json
import os
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PHP = Path(r"C:\tools\php83\php.exe")


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


def invoke_public_dispute(owner_matches: bool) -> dict:
    handler = json.dumps(str(ROOT / "api/src/handlers/public.php"))
    match = "true" if owner_matches else "false"
    script = f'''$selectCalls=0;$rpcCalls=0;
function json_input(): array {{ return ["ticket_number"=>"TVT-2026-000001","email"=>"owner@example.invalid","reason"=>"A sufficiently detailed dispute reason."]; }}
function clean_string($value,int $max=4000): string {{ return substr(trim((string)$value),0,$max); }}
function normalize_email($value): string {{ return strtolower(trim((string)$value)); }}
function supabase_select(string $table,array $filters,array $options=[]): array {{ global $selectCalls; $selectCalls++; return {match} ? [["id"=>44]] : []; }}
function supabase_rpc(string $name,array $args=[]): mixed {{ global $rpcCalls; $rpcCalls++; return ["disputeId"=>99]; }}
function rpc_domain_error(mixed $result): ?array {{ return null; }}
function fail_domain(array $error): never {{ exit(2); }}
function fail(string $message,int $status=400,string $errorCode="ERROR",array $extra=[]): never {{ global $selectCalls,$rpcCalls; echo json_encode(["status"=>$status,"errorCode"=>$errorCode,"selectCalls"=>$selectCalls,"rpcCalls"=>$rpcCalls]); exit; }}
function json_response(array $payload,int $status=200): never {{ global $selectCalls,$rpcCalls; echo json_encode(["status"=>$status,"payload"=>$payload,"selectCalls"=>$selectCalls,"rpcCalls"=>$rpcCalls]); exit; }}
require {handler};
public_dispute([]);'''
    result = run_php(script)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def test_public_dispute_requires_matching_owner_email_before_rpc():
    """Knowing only a ticket number must not let an anonymous caller open a dispute."""
    rejected = invoke_public_dispute(False)
    assert rejected == {
        "status": 404,
        "errorCode": "TICKET_VERIFICATION_FAILED",
        "selectCalls": 1,
        "rpcCalls": 0,
    }
    accepted = invoke_public_dispute(True)
    assert accepted["status"] == 201
    assert accepted["selectCalls"] == 1
    assert accepted["rpcCalls"] == 1


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
    assert "partially_paid" not in migration.split("elsif p_action='status'", 1)[1].split("elsif p_action='details'", 1)[0]


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
        assert "payment_status<>'voided'" in function_body
        assert "greatest(" in function_body
