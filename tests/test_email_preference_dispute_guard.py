"""Offline regression checks; never contacts Supabase, SMTP, or production."""
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PHP = os.environ.get("TVTMS_PHP") or shutil.which("php")
COMMON = ROOT / "api/src/common.php"
TICKETS = ROOT / "api/src/handlers/tickets.php"
PAYMENTS = ROOT / "api/src/handlers/payments.php"
PUBLIC = ROOT / "api/src/handlers/public.php"


def run_php(source):
    assert PHP, "PHP CLI is needed for this test"
    result = subprocess.run([str(PHP), "-r", source], capture_output=True, text=True, timeout=15)
    assert result.returncode == 0, result.stderr
    return result.stdout


def php_function(text, name):
    match = re.search(r"\\bfunction\\s+" + name + r"\\s*\\(", text)
    assert match, f"Missing PHP function: {name}"
    start = text.index("{", match.end())
    depth = 0
    for pos in range(start, len(text)):
        if text[pos] == "{":
            depth += 1
        if text[pos] == "}":
            depth -= 1
            if depth == 0:
                return text[match.start():pos + 1]
    raise AssertionError("Unclosed PHP function")


def test_email_preferences_are_fail_closed_in_php_runtime():
    code = COMMON.read_text(encoding="utf-8")
    helpers = php_function(code, "bool_setting") + "\n" + php_function(code, "email_notification_setting_enabled")
    for mode, expected in [("1", "1"), ("0", "0"), ("unknown", "0"), ("MISSING", "0"), ("ERROR", "0")]:
        script = (
            "$GLOBALS['mode']=" + json.dumps(mode) + ";"
            "function supabase_select($table,$filters,$opts){"
            "if($table!=='system_settings'||$filters['setting_key']!=='eq.send_violation_notice')throw new RuntimeException('wrong query');"
            "if($GLOBALS['mode']==='ERROR')throw new RuntimeException('offline error');"
            "if($GLOBALS['mode']==='MISSING')return [];"
            "return [['setting_value'=>$GLOBALS['mode']]];}"
            + helpers + ";echo email_notification_setting_enabled('send_violation_notice')?'1':'0';"
        )
        assert run_php(script) == expected, mode


def test_all_automatic_email_paths_use_administrator_preference():
    tickets = TICKETS.read_text(encoding="utf-8")
    payments = PAYMENTS.read_text(encoding="utf-8")
    assert "email_notification_setting_enabled('send_violation_notice')" in tickets
    assert "email_notification_setting_enabled('send_payment_confirmation')" in payments
    assert "NOTIFICATION_DISABLED" in tickets
    assert "&&email_notification_setting_enabled('send_payment_confirmation')" in payments
    assert "ticket_notification_attempt((int)$u['id'],$ticket,$data['driver_email'])" in tickets


def test_dispute_503_failures_include_private_safe_request_id():
    for mode, expected in [("missing", "PUBLIC_DISPUTE_NOT_CONFIGURED"), ("db", "PUBLIC_DISPUTE_UNAVAILABLE"), ("other", "PUBLIC_DISPUTE_UNAVAILABLE"), ("invalid", "PUBLIC_DISPUTE_UNAVAILABLE"), ("ok", "SUCCESS")]:
        code = """
class Captured extends Exception {public function __construct(public array $payload){parent::__construct('captured');}}
class SupabaseException extends RuntimeException {public function __construct($msg,public int $httpStatus=500,public ?string $pgCode=null){parent::__construct($msg);}}
function json_input(){return ['ticket_number'=>'TEST-OFFLINE','plate_number'=>'ZZZ000','reason'=>'Safe offline sample only'];}
function normalize_plate($x){return strtoupper(trim($x));}
function supabase_rpc($name,$args){
    if($name!=='tvtms_public_dispute_submit')throw new RuntimeException('wrong RPC');
    switch(MODE){
      case 'missing':throw new SupabaseException('missing',404,'PGRST202');
      case 'db':throw new SupabaseException('unavailable',502,'XX001');
      case 'other':throw new RuntimeException('mock failure');
      case 'invalid':return [];
      default:return ['disputeId'=>93];
    }
}
function rpc_domain_error($result){return null;}
function fail($msg,$status=400,$code='ERROR',$extra=[]):never{throw new Captured(array_merge(['code'=>$code,'status'=>$status],$extra));}
function fail_domain($data):never{throw new Captured(['code'=>'DOMAIN_ERROR']);}
function json_response($payload,$status=200):never{throw new Captured(array_merge(['code'=>'SUCCESS','status'=>$status],$payload));}
require FILE;
try{public_dispute();}catch(Captured $e){echo json_encode($e->payload);}
""".replace("MODE", json.dumps(mode)).replace("FILE", json.dumps(str(PUBLIC)))
        data = json.loads(run_php(code))
        assert data["code"] == expected
        assert data["status"] == (201 if mode == "ok" else 503)
        if mode != "ok":
            assert re.fullmatch("[0-9a-f]{16}", data["request_id"])


def test_public_dispute_diagnostic_logs_do_not_include_private_input():
    lines = PUBLIC.read_text(encoding="utf-8").splitlines()
    log_lines = [line for line in lines if "error_log('TVTMS public dispute [" in line]
    assert len(log_lines) >= 3
    assert not any(token in line for line in log_lines for token in ("$ticket", "$plate", "$reason"))
