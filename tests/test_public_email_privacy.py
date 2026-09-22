import json
import os
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PHP = Path(os.environ.get("TVTMS_PHP", r"C:\tools\php83\php.exe"))
HANDLER = ROOT / "api/src/handlers/public.php"


def test_public_lookup_uses_boolean_email_availability_without_private_fields():
    script = f'''$_GET=["ticket"=>"TVT-2026-000022"];$selectCall=[];
function normalize_plate($value): string {{ return strtoupper(trim((string)$value)); }}
function normalize_email($value): string {{ return strtolower(trim((string)$value)); }}
function fail(string $message,int $status=400,string $code="ERROR",array $extra=[]): never {{ echo json_encode(["failed"=>$code]);exit; }}
function supabase_rpc(string $name,array $args=[]): mixed {{ return [
  ["id"=>22,"ticket_number"=>"TVT-2026-000022","status"=>"unpaid","payment_status"=>"unpaid","owner_email"=>"leaked@example.test","has_notification_email"=>true,"dispute_deadline_days"=>15,"dispute_age_days"=>2,"has_open_dispute"=>0],
  ["id"=>11,"ticket_number"=>"TVT-2026-000011","status"=>"unpaid","payment_status"=>"unpaid","has_notification_email"=>false,"dispute_deadline_days"=>15,"dispute_age_days"=>3,"has_open_dispute"=>0]
]; }}
function supabase_select(string $table,array $filters=[],array $options=[]): array {{ global $selectCall;$selectCall=[$table,$filters,$options];return [
  ["id"=>11,"owner_email"=>""],
  ["id"=>22,"owner_email"=>"djklintskie@gmail.com"]
]; }}
function mask_email(string $email): ?string {{ if($email==="")return null;[$local,$domain]=explode("@",$email,2);return substr($local,0,2)."***@".$domain; }}
function json_response(array $payload,int $status=200): never {{ global $selectCall;echo json_encode(["payload"=>$payload,"selectCall"=>$selectCall]);exit; }}
require {json.dumps(str(HANDLER))};
public_ticket_lookup();'''
    result = subprocess.run(
        [str(PHP), "-r", script],
        cwd=ROOT,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    output = json.loads(result.stdout)
    payload = output["payload"]
    assert payload["tickets"][0]["has_notification_email"] is True
    assert payload["tickets"][1]["has_notification_email"] is False
    assert output["selectCall"] == []
    serialized = json.dumps(payload)
    assert "djklintskie@gmail.com" not in serialized
    assert "leaked@example.test" not in serialized
    assert "owner_email" not in serialized
    assert '"id"' not in serialized


def test_public_lookup_ui_uses_only_boolean_email_availability():
    source = (ROOT / "src/pages/PublicTicketLookup.jsx").read_text(encoding="utf-8")
    assert "ticket.has_notification_email" in source
    assert "ticket.notification_email_masked" not in source
    assert "selected.notification_email_masked" in source
    for forbidden in ["owner_name", "owner_email", "owner_address", "driver_license_number", "official_receipt_number"]:
        assert forbidden not in source
