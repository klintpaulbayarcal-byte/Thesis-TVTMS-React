import json
import os
import subprocess
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
PHP = Path(os.environ.get("TVTMS_PHP", r"C:\tools\php83\php.exe"))


def run_php(script: str) -> subprocess.CompletedProcess[str]:
    if not PHP.exists():
        pytest.skip(f"PHP runtime is unavailable at {PHP}")
    return subprocess.run(
        [str(PHP), "-r", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )


def test_active_react_ui_uses_search_ticket_wording():
    files = [
        ROOT / "src/components/Sidebar.jsx",
        ROOT / "src/components/Topbar.jsx",
        ROOT / "src/pages/OfficerDashboard.jsx",
        ROOT / "src/pages/LicensePlateLookup.jsx",
    ]
    combined = "\n".join(path.read_text(encoding="utf-8") for path in files)
    assert "Search Ticket" in combined
    assert "Search Violator" not in combined


def test_search_ticket_has_all_adviser_requested_modes():
    page = (ROOT / "src/pages/LicensePlateLookup.jsx").read_text(encoding="utf-8")
    assert "By Citation Number" in page
    assert "By Plate Number" in page
    assert "By License Number" in page
    assert "By Owner / Driver Name" in page
    assert "Driver Citation History" in page
    assert "different vehicles" in page


def test_license_search_is_exact_snapshot_based_and_officer_scoped():
    handler = json.dumps(str(ROOT / "api/src/handlers/tickets.php"))
    script = f'''
$_GET=["search"=>"N01-23-456789","mode"=>"license"];
$calls=[];
function require_role(array $roles): array {{ return ["role"=>"apprehending_officer","id"=>7]; }}
function text_length(string $value): int {{ return strlen($value); }}
function supabase_select(string $table,array $filters=[],array $options=[]): array {{
 global $calls;$calls[]=[$table,$filters,$options];
 if($table==="ticket_details") return [[
  "id"=>91,"ticket_number"=>"7258","user_id"=>7,"driver_license_number"=>"N01-23-456789",
  "plate_number"=>"ABC1234","penalty_amount"=>150,"status"=>"unpaid"
 ]];
 return [];
}}
function supabase_rpc(string $name,array $args=[]): mixed {{ throw new RuntimeException("RPC should not be used for explicit license mode"); }}
function rpc_domain_error(mixed $result): ?array {{ return null; }}
function fail_domain(array $error): never {{ echo json_encode(["fail_domain"=>$error]); exit; }}
function fail(string $message,int $status=400,string $errorCode="ERROR",array $extra=[]): never {{ echo json_encode(["status"=>$status,"errorCode"=>$errorCode,"message"=>$message]); exit; }}
function ok(string $message,mixed $data=null,array $extra=[]): never {{ global $calls;echo json_encode(["data"=>$data,"extra"=>$extra,"calls"=>$calls]);exit; }}
require {handler};
tickets_search();
'''
    result = run_php(script)
    assert result.returncode == 0, result.stderr
    body = json.loads(result.stdout)
    first_call = body["calls"][0]
    assert first_call[0] == "ticket_details"
    assert first_call[1]["user_id"] == "eq.7"
    assert first_call[1]["driver_license_number"] == "ilike.N01-23-456789"
    assert body["extra"]["mode"] == "license"
    assert body["data"][0]["ticket_number"] == "7258"


def test_name_search_uses_driver_and_owner_fields_without_identity_guessing():
    handler = (ROOT / "api/src/handlers/tickets.php").read_text(encoding="utf-8")
    assert "owner_name.ilike.*" in handler
    assert "driver_first_name.ilike.*" in handler
    assert "driver_middle_name.ilike.*" in handler
    assert "driver_last_name.ilike.*" in handler
    page = (ROOT / "src/pages/LicensePlateLookup.jsx").read_text(encoding="utf-8")
    assert "Name search is a finding aid only." in page


def test_public_dispute_deadline_is_server_computed_in_manila_calendar_days():
    handler = json.dumps(str(ROOT / "api/src/handlers/public.php"))
    script = f'''
require {handler};
echo json_encode([
 public_dispute_deadline_date(["date_issued"=>"2026-10-01","dispute_deadline_days"=>15]),
 public_dispute_deadline_date(["date_issued"=>"2026-10-01","dispute_deadline_days"=>1])
]);
'''
    result = run_php(script)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == ["2026-10-16", "2026-10-02"]


def test_public_lookup_displays_deadline_and_itemized_totals():
    public_page = (ROOT / "src/pages/PublicTicketLookup.jsx").read_text(encoding="utf-8")
    public_handler = (ROOT / "api/src/handlers/public.php").read_text(encoding="utf-8")
    violations = (ROOT / "src/components/CitationViolations.jsx").read_text(encoding="utf-8")
    issue = (ROOT / "src/pages/IssueTicket.jsx").read_text(encoding="utf-8")
    assert "dispute_deadline_date" in public_handler
    assert "Available until" in public_page
    assert "Asia/Manila dates" in public_page
    assert "Total Penalty" in violations
    assert "itemizedTotal" in violations
    assert "Total Citation Penalty:" in issue


def test_no_lto_or_ocr_feature_was_added_to_this_batch():
    page = (ROOT / "src/pages/LicensePlateLookup.jsx").read_text(encoding="utf-8").lower()
    assert "ocr" not in page
    assert "stolen vehicle" not in page
    assert "lto database" not in page
