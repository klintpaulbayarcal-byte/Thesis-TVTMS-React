import base64
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PHP = Path(os.environ.get("TVTMS_PHP", r"C:\tools\php83\php.exe"))
RUNTIME = ROOT / "api/src/dispute_verification.php"
PUBLIC = ROOT / "api/src/handlers/public.php"


def run_php(script: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(PHP), "-r", script],
        cwd=ROOT,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )


def test_hash_helpers_are_context_bound_and_generators_return_browser_values():
    script = f'''require {json.dumps(str(RUNTIME))};
$codes=[];$tokens=[];for($i=0;$i<100;$i++){{$codes[]=dispute_new_code();$tokens[]=dispute_new_token();}}
echo json_encode(["tokenHash"=>dispute_token_hash("opaque-token"),"codeHash"=>dispute_code_hash("TVT-2026-000123",dispute_token_hash("opaque-token"),"004219",str_repeat("s",32)),"requesterHash"=>dispute_requester_hash("203.0.113.8",str_repeat("s",32)),"codes"=>$codes,"tokens"=>$tokens]);'''
    result = run_php(script)
    assert result.returncode == 0, result.stderr
    output = json.loads(result.stdout)
    assert len(output["tokenHash"]) == 64
    assert output["codeHash"] != hashlib.sha256(b"004219").hexdigest()
    assert output["requesterHash"] != hashlib.sha256(b"203.0.113.8").hexdigest()
    assert all(re.fullmatch(r"[0-9]{6}", code) for code in output["codes"])
    decoded = [base64.urlsafe_b64decode(token + "=") for token in output["tokens"]]
    assert all(len(value) == 32 for value in decoded)
    assert len(set(output["tokens"])) == 100
    assert all(len(token) == 43 for token in output["tokens"])


def invoke_request(mail_status="accepted", finalize="ok") -> dict:
    script = f'''$calls=[];$sendCount=0;$generatedCode="";$mailMeta=[];
function app_config(): array {{ return ["token_secret"=>str_repeat("s",32),"app_public_url"=>"https://trafficviolation.dcsbisu.com"]; }}
function json_input(): array {{ return ["ticketNumber"=>"TVT-2026-000123","email"=>"attacker@example.test"]; }}
function client_ip_for_audit(): ?string {{ return "203.0.113.8"; }}
function clean_string($value,int $max=4000): string {{ return substr(trim((string)$value),0,$max); }}
function mask_email(string $email): ?string {{ return "dj***@gmail.com"; }}
function rpc_domain_error(mixed $result): ?array {{ return is_array($result)&&isset($result["errorCode"])?$result:null; }}
function fail_domain(array $error): never {{ fail($error["message"]??"rejected",$error["statusCode"]??400,$error["errorCode"]??"DOMAIN_ERROR"); }}
function supabase_rpc(string $name,array $args=[]): mixed {{ global $calls;$calls[]=[$name,$args];if($name==="tvtms_dispute_verification_request")return ["status"=>"created","verificationId"=>55,"ticketId"=>44,"ticketNumber"=>"TVT-2026-000123","recipient"=>"djklintskie@gmail.com","expiresIn"=>600,"resendAfter"=>60];if({json.dumps(finalize == "throw")})throw new RuntimeException("delivery finalize failed");return ["status"=>$args["p_delivery_status"]??"unknown"]; }}
function send_email(string $to,string $subject,string $html): array {{ global $sendCount,$generatedCode,$mailMeta;$sendCount++;preg_match('/\\b([0-9]{{6}})\\b/',$html,$m);$generatedCode=$m[1]??"";$mailMeta=["recipient"=>$to,"ticket"=>str_contains($subject.$html,"TVT-2026-000123"),"expiry"=>str_contains($html,"10 minutes"),"ignore"=>str_contains(strtolower($html),"ignore")];return ["status"=>{json.dumps(mail_status)},"errorCode"=>{json.dumps(None if mail_status == "accepted" else "smtp_rejected")},"message"=>"transport result"]; }}
function json_response(array $payload,int $status=200): never {{ global $calls,$sendCount,$generatedCode,$mailMeta;$encoded=json_encode($payload);echo json_encode(["status"=>$status,"payload"=>$payload,"calls"=>$calls,"sendCount"=>$sendCount,"mailMeta"=>$mailMeta,"containsCode"=>$generatedCode!==""&&str_contains($encoded,$generatedCode)]);exit; }}
function fail(string $message,int $status=400,string $errorCode="ERROR",array $extra=[]): never {{ json_response(array_merge(["success"=>false,"message"=>$message,"errorCode"=>$errorCode],$extra),$status); }}
require {json.dumps(str(RUNTIME))};
public_dispute_verification_request();'''
    result = run_php(script)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def test_request_uses_canonical_recipient_and_returns_only_safe_activation_data():
    output = invoke_request()
    assert output["status"] == 200
    payload = output["payload"]
    assert payload["mailStatus"] == "accepted"
    assert payload["notificationEmailMasked"] == "dj***@gmail.com"
    assert payload["expiresIn"] == 600
    assert payload["resendAfter"] == 60
    assert re.fullmatch(r"[A-Za-z0-9_-]{43}", payload["challengeToken"])
    assert "code" not in json.dumps(payload).lower()
    assert "djklintskie@gmail.com" not in json.dumps(payload)
    assert output["mailMeta"] == {"recipient": "djklintskie@gmail.com", "ticket": True, "expiry": True, "ignore": True}
    assert output["sendCount"] == 1
    assert output["containsCode"] is False
    assert [call[0] for call in output["calls"]] == ["tvtms_dispute_verification_request", "tvtms_dispute_verification_delivery"]
    request_args = output["calls"][0][1]
    assert set(request_args) == {"p_ticket", "p_challenge_hash", "p_code_hash", "p_requester_hash"}
    assert all(re.fullmatch(r"[0-9a-f]{64}", request_args[key]) for key in ["p_challenge_hash", "p_code_hash", "p_requester_hash"])


def test_failed_smtp_is_finalized_without_returning_challenge_or_private_values():
    output = invoke_request(mail_status="failed")
    assert output["status"] == 503
    assert output["payload"]["mailStatus"] == "failed"
    assert "challengeToken" not in output["payload"]
    assert output["containsCode"] is False
    assert output["calls"][1][1]["p_delivery_status"] == "failed"


def test_accepted_smtp_with_finalize_failure_is_unknown_and_not_retried():
    output = invoke_request(finalize="throw")
    assert output["status"] == 503
    assert output["payload"]["mailStatus"] == "unknown"
    assert "challengeToken" not in output["payload"]
    assert output["sendCount"] == 1
    assert output["containsCode"] is False


def test_verify_sends_only_ticket_bound_hashes_and_safe_result():
    token = "A" * 43
    script = f'''$rpc=[];
function app_config(): array {{ return ["token_secret"=>str_repeat("s",32)]; }}
function json_input(): array {{ return ["ticketNumber"=>"TVT-2026-000123","challengeToken"=>{json.dumps(token)},"code"=>"004219"]; }}
function clean_string($value,int $max=4000): string {{ return substr(trim((string)$value),0,$max); }}
function rpc_domain_error(mixed $result): ?array {{ return null; }}
function fail_domain(array $error): never {{ exit(90); }}
function supabase_rpc(string $name,array $args=[]): mixed {{ global $rpc;$rpc=[$name,$args];return ["verified"=>true,"attemptsRemaining"=>4,"recipient"=>"must-not-leak@example.test"]; }}
function json_response(array $payload,int $status=200): never {{ global $rpc;echo json_encode(["status"=>$status,"payload"=>$payload,"rpc"=>$rpc]);exit; }}
function fail(string $message,int $status=400,string $errorCode="ERROR",array $extra=[]): never {{ json_response(array_merge(["success"=>false,"errorCode"=>$errorCode],$extra),$status); }}
require {json.dumps(str(RUNTIME))};
public_dispute_verification_verify();'''
    result = run_php(script)
    assert result.returncode == 0, result.stderr
    output = json.loads(result.stdout)
    assert output["status"] == 200
    assert output["payload"] == {"success": True, "verified": True, "attemptsRemaining": 4}
    assert output["rpc"][0] == "tvtms_dispute_verification_verify"
    args = output["rpc"][1]
    assert set(args) == {"p_ticket", "p_challenge_hash", "p_code_hash"}
    assert token not in json.dumps(args)
    assert "004219" not in json.dumps(args)


def test_public_dispute_requires_valid_challenge_and_calls_only_verified_rpc():
    source = PUBLIC.read_text(encoding="utf-8")
    assert "challengeToken" in source
    assert "tvtms_public_dispute_verified" in source
    assert "tvtms_public_dispute'" not in source
    assert "owner_email'=>'eq." not in source


def test_retry_after_survives_domain_error_and_is_sent_by_fail_domain():
    common = (ROOT / "api/src/common.php").read_text(encoding="utf-8")
    script = f'''require {json.dumps(str(ROOT / "api/src/common.php"))};echo json_encode(rpc_domain_error(["errorCode"=>"WAIT","message"=>"wait","statusCode"=>429,"retryAfter"=>17]));'''
    result = run_php(script)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["retryAfter"] == 17
    assert "Retry-After:" in common


def test_routes_and_outer_rate_limits_are_distinct():
    router = (ROOT / "api/src/router.php").read_text(encoding="utf-8")
    index = (ROOT / "api/index.php").read_text(encoding="utf-8")
    assert "/api/public/dispute/verification/request" in router
    assert "/api/public/dispute/verification/verify" in router
    assert router.index("/api/public/dispute/verification/request") < router.index("/api/public/dispute/?")
    for marker in ["dispute-code-request", "dispute-code-verify", "public-dispute-submit"]:
        assert marker in index
