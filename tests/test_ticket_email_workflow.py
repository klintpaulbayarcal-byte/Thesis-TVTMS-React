import json
import os
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PHP = Path(os.environ.get("TVTMS_PHP", r"C:\tools\php83\php.exe"))
WORKFLOW = ROOT / "api/src/ticket_email.php"
HANDLER = ROOT / "api/src/handlers/tickets.php"

CLAIMED = {
    "status": "claimed",
    "ticketId": 44,
    "ticketNumber": "TVT-2026-000123",
    "recipient": "djklintskie@gmail.com",
    "plateNumber": "ABC1234",
    "violationName": "Illegal Parking",
    "penaltyAmount": 1500,
    "attemptCount": 1,
}


def run_php(script: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(PHP), "-r", script],
        cwd=ROOT,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )


def invoke_attempt(claim: dict, mail_status: str = "accepted", finalize_error: bool = False) -> dict:
    claim_json = json.dumps(claim)
    mail_json = json.dumps(
        {
            "status": mail_status,
            "errorCode": None if mail_status == "accepted" else "transport_error",
            "message": "mail outcome",
        }
    )
    script = f'''$calls=[];$mail=[];
function app_config(): array {{ return ["app_public_url"=>"https://trafficviolation.dcsbisu.com"]; }}
function mask_email(string $email): ?string {{ [$local,$domain]=explode("@",$email,2); return substr($local,0,2)."***@".$domain; }}
function rpc_domain_error(mixed $result): ?array {{ return is_array($result)&&isset($result["errorCode"])?["errorCode"=>$result["errorCode"],"message"=>$result["message"]??"error","statusCode"=>$result["statusCode"]??400]:null; }}
function supabase_rpc(string $name,array $args=[]): mixed {{ global $calls; $calls[]=[$name,$args]; if($name==="tvtms_ticket_email_claim")return json_decode({json.dumps(claim_json)},true); if({str(finalize_error).lower()})throw new RuntimeException("finalize failed"); return ["status"=>$args["p_status"]??"failed"]; }}
function send_email(string $to,string $subject,string $html): array {{ global $mail; $mail=[$to,$subject,$html]; return json_decode({json.dumps(mail_json)},true); }}
require {json.dumps(str(WORKFLOW))};
$result=ticket_notification_attempt(7,["id"=>44]);
echo json_encode(["result"=>$result,"calls"=>$calls,"mail"=>$mail]);'''
    result = run_php(script)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def test_canonical_claim_recipient_and_complete_message_are_used():
    output = invoke_attempt(CLAIMED)
    assert output["result"]["status"] == "accepted"
    assert output["result"]["recipientMasked"] == "dj***@gmail.com"
    recipient, subject, html = output["mail"]
    assert recipient == "djklintskie@gmail.com"
    for expected in [
        "TVT-2026-000123",
        "Illegal Parking",
        "1,500.00",
        "ABC1234",
        "/ticket-lookup?ticket=TVT-2026-000123",
    ]:
        assert expected in subject + html
    assert [call[0] for call in output["calls"]] == [
        "tvtms_ticket_email_claim",
        "tvtms_ticket_email_finalize",
    ]


def test_non_claimable_states_never_call_the_mail_transport():
    for status in ["already_accepted", "sending", "unknown", "not_applicable"]:
        output = invoke_attempt({"status": status, "ticketId": 44, "ticketNumber": "TVT-2026-000123"})
        assert output["result"]["status"] == status
        assert output["mail"] == []
        assert [call[0] for call in output["calls"]] == ["tvtms_ticket_email_claim"]


def test_finalize_failure_after_smtp_acceptance_returns_unknown_without_retry():
    output = invoke_attempt(CLAIMED, finalize_error=True)
    assert output["result"]["status"] == "unknown"
    assert output["result"]["retryAllowed"] is False
    assert len(output["mail"]) == 3


def test_failed_transport_is_finalized_and_can_be_retried():
    output = invoke_attempt(CLAIMED, mail_status="failed")
    assert output["result"]["status"] == "failed"
    assert output["result"]["retryAllowed"] is True
    finalize = output["calls"][1]
    assert finalize[1]["p_status"] == "failed"
    assert finalize[1]["p_error_code"] == "transport_error"


def invoke_ticket_create(notification: dict) -> dict:
    script = f'''$notificationInput=json_decode({json.dumps(json.dumps(notification))},true);$notificationTicket=null;$rpcNames=[];
function require_role(array $roles): array {{ return ["id"=>7,"role"=>"apprehending_officer"]; }}
function json_input(): array {{ return ["plate_number"=>"ABC1234","vehicle_type"=>"car","owner_name"=>"Owner","owner_email"=>"request@example.test","violation_id"=>3,"location"=>"Town Hall"]; }}
function normalize_plate($v): string {{ return strtoupper(trim((string)$v)); }}
function normalize_email($v): string {{ return strtolower(trim((string)$v)); }}
function clean_string($v,int $max=4000): string {{ return substr(trim((string)$v),0,$max); }}
function rpc_domain_error(mixed $result): ?array {{ return null; }}
function fail_domain(array $error): never {{ exit(90); }}
function fail(string $message,int $status=400,string $code="ERROR",array $extra=[]): never {{ echo json_encode(["status"=>$status,"errorCode"=>$code]);exit; }}
function supabase_rpc(string $name,array $args=[]): mixed {{ global $rpcNames;$rpcNames[]=$name;return ["ticket"=>["id"=>44,"ticket_number"=>"TVT-2026-000123","owner_email"=>"canonical@example.test","violation_name"=>"Illegal Parking","penalty_amount"=>1500,"plate_number"=>"ABC1234"],"penaltyInfo"=>[]]; }}
function log_audit(?int $id,string $action,?string $type=null,?int $entity=null,array $meta=[]): void {{}}
function ticket_notification_attempt(int $actor,array $ticket=[]): array {{ global $notificationInput,$notificationTicket;$notificationTicket=$ticket;return $notificationInput; }}
function ok(string $message,mixed $data=null,array $extra=[],int $status=200): never {{ global $notificationTicket,$rpcNames;echo json_encode(["status"=>$status,"payload"=>array_merge(["success"=>true,"message"=>$message,"data"=>$data],$extra),"notificationTicket"=>$notificationTicket,"rpcNames"=>$rpcNames]);exit; }}
require {json.dumps(str(HANDLER))};
tickets_create([]);'''
    result = run_php(script)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def test_ticket_creation_returns_saved_ticket_for_every_notification_outcome():
    for notification in [
        {"status": "accepted", "retryAllowed": False, "message": "accepted"},
        {"status": "failed", "retryAllowed": True, "message": "failed"},
        {"status": "disabled", "retryAllowed": True, "message": "disabled"},
        {"status": "not_applicable", "retryAllowed": False, "message": "missing"},
    ]:
        output = invoke_ticket_create(notification)
        assert output["status"] == 201
        assert output["payload"]["ticket"]["id"] == 44
        assert output["payload"]["notification"] == notification
        assert output["notificationTicket"]["owner_email"] == "canonical@example.test"
        assert output["rpcNames"] == ["tvtms_ticket_create"]


def test_retry_route_never_creates_a_ticket_and_returns_notification_outcome():
    script = f'''$rpcNames=[];
function require_role(array $roles): array {{ return ["id"=>7,"role"=>"apprehending_officer"]; }}
function ticket_notification_attempt(int $actor,array $ticket=[]): array {{ return ["status"=>"failed","retryAllowed"=>true,"message"=>"Retry failed safely."]; }}
function supabase_rpc(string $name,array $args=[]): mixed {{ global $rpcNames;$rpcNames[]=$name;return []; }}
function fail(string $message,int $status=400,string $code="ERROR",array $extra=[]): never {{ echo json_encode(["status"=>$status,"errorCode"=>$code,"rpcNames"=>$GLOBALS["rpcNames"]]);exit; }}
function ok(string $message,mixed $data=null,array $extra=[],int $status=200): never {{ echo json_encode(["status"=>$status,"payload"=>array_merge(["data"=>$data],$extra),"rpcNames"=>$GLOBALS["rpcNames"]]);exit; }}
require {json.dumps(str(HANDLER))};
tickets_retry_notification(["id"=>44]);'''
    result = run_php(script)
    assert result.returncode == 0, result.stderr
    output = json.loads(result.stdout)
    assert output["status"] == 200
    assert output["payload"]["notification"]["status"] == "failed"
    assert "tvtms_ticket_create" not in output["rpcNames"]


def test_retry_api_uses_the_dedicated_post_route():
    script = r'''
global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
let call=null;
global.fetch=async (url,options)=>{call={url,method:options.method};return new Response(JSON.stringify({success:true}),{status:200,headers:{'content-type':'application/json'}})};
const {API}=await import('./src/services/api.js');
await API.retryTicketNotification(44);
console.log(JSON.stringify(call));
'''
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == {"url": "/api/tickets/44/notification/retry", "method": "POST"}
