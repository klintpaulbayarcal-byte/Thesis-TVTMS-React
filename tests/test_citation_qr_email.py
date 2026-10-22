"""Citation email QR image and safe delivery contract tests."""
import base64
import email
import json
import os
from pathlib import Path
import struct
import subprocess
import zlib

ROOT = Path(__file__).resolve().parents[1]
PHP = os.environ.get("TVTMS_PHP", "php")


def run_php(code):
    proc = subprocess.run([PHP, "-r", code], cwd=ROOT, capture_output=True, text=True, timeout=20)
    assert proc.returncode == 0, proc.stderr
    return proc.stdout


def test_ticket_email_includes_qr_png_matching_the_public_link():
    code = f'''
    function app_config(): array {{ return ["app_public_url"=>"https://trafficviolation.dcsbisu.com"]; }}
    require {json.dumps(str(ROOT / "api/src/ticket_email.php"))};
    $mail=ticket_notification_message([
        "ticketNumber"=>"CAL-2026/001", "plateNumber"=>"ABC1234",
        "penaltyAmount"=>300, "dateIssued"=>"2026-10-07", "appearanceDueDate"=>"2026-10-14",
        "violations"=>[["violation_code"=>"A","violation_name"=>"No license","penalty_amount"=>150],
                        ["violation_code"=>"B","violation_name"=>"Defective lights","penalty_amount"=>150]]
    ]);
    echo json_encode(["html"=>$mail["html"],"images"=>array_map(
        fn($i)=>["cid"=>$i["cid"],"data"=>base64_encode($i["bytes"])],$mail["inlineImages"])]);
    '''
    result = json.loads(run_php(code))
    html = result["html"]
    assert "CAL-2026/001" in html and "No license" in html and "Defective lights" in html
    assert "300.00" in html and "2026-10-14" in html
    assert "/ticket-lookup?ticket=CAL-2026%2F001" in html
    assert '<img src="cid:tvtms-ticket-qr"' in html
    assert len(result["images"]) == 1 and result["images"][0]["cid"] == "tvtms-ticket-qr"
    png = base64.b64decode(result["images"][0]["data"])
    assert png.startswith(b"\x89PNG\r\n\x1a\n")
    width, height = struct.unpack(">II", png[16:24])
    assert 200 <= width == height <= 600
    offset, image_data = 8, b""
    while offset < len(png):
        n = struct.unpack(">I", png[offset:offset+4])[0]
        kind, data = png[offset+4:offset+8], png[offset+8:offset+8+n]
        assert zlib.crc32(kind + data) & 0xFFFFFFFF == struct.unpack(">I", png[offset+8+n:offset+12+n])[0]
        if kind == b"IDAT":
            image_data += data
        offset += n + 12
    assert len(zlib.decompress(image_data)) == height * (width + 1)


def test_qr_email_uses_related_mime_with_inline_content_id():
    code = f'''
    require {json.dumps(str(ROOT / "api/src/mail.php"))};
    require {json.dumps(str(ROOT / "api/src/qr_code.php"))};
    $url="https://trafficviolation.dcsbisu.com/ticket-lookup?ticket=7258";
    $png=TicketQrCode::png($url);
    echo base64_encode(smtp_compose_message("from@example.org","TVTMS","driver@example.org",
        "Traffic Citation 7258",'<a href="'.$url.'">Open citation</a><img src="cid:tvtms-ticket-qr">',
        [["cid"=>"tvtms-ticket-qr","bytes"=>$png]]));
    '''
    msg = email.message_from_bytes(base64.b64decode(run_php(code)))
    assert msg.get_content_type() == "multipart/related"
    html, image_part = msg.get_payload()
    assert html.get_content_type() == "text/html"
    assert b"cid:tvtms-ticket-qr" in html.get_payload(decode=True)
    assert image_part.get_content_type() == "image/png"
    assert image_part["Content-ID"] == "<tvtms-ticket-qr>"
    assert image_part.get_payload(decode=True).startswith(b"\x89PNG")


def test_qr_failure_preserves_email_link_and_other_mail_stays_html():
    code = f'''
    function app_config(): array {{ return ["app_public_url"=>"http://invalid.example.org"]; }}
    require {json.dumps(str(ROOT / "api/src/ticket_email.php"))};
    $m=ticket_notification_message(["ticketNumber"=>"1234","plateNumber"=>"XYZ","penaltyAmount"=>150]);
    echo json_encode(["html"=>$m["html"],"count"=>count($m["inlineImages"])]);
    '''
    result = json.loads(run_php(code))
    assert result["count"] == 0 and 'src="cid:' not in result["html"]
    assert "View your citation in the public lookup" in result["html"]
    code = f'''
    require {json.dumps(str(ROOT / "api/src/mail.php"))};
    echo base64_encode(smtp_compose_message("from@example.org","TVTMS","to@example.org","Test","<p>Ordinary email</p>"));
    '''
    msg = email.message_from_bytes(base64.b64decode(run_php(code)))
    assert msg.get_content_type() == "text/html"
    assert "Ordinary email" in msg.get_payload(decode=True).decode("utf-8")


def test_issuance_still_commits_before_email_and_existing_public_url_autoloads():
    issue = (ROOT / "api/src/handlers/tickets.php").read_text()
    section = issue[issue.index("function tickets_create("):issue.index("function tickets_retry_notification(")]
    assert section.index("tvtms_ticket_create") < section.index("ticket_notification_attempt")
    assert "['driver_email']" in section
    mail = (ROOT / "api/src/ticket_email.php").read_text()
    assert "hash_equals($snapshot,$confirmed)" in mail
    assert "send_email($recipient,$content['subject'],$content['html'],$content['inlineImages']??[])" in mail
    lookup = (ROOT / "src/pages/PublicTicketLookup.jsx").read_text()
    assert "searchParams.get('ticket')" in lookup and "runLookup(referenceFromUrl,modeFromUrl)" in lookup


def test_qr_rejects_non_https_unrelated_paths_and_control_sequences():
    code = f'''
    require {json.dumps(str(ROOT / "api/src/qr_code.php"))};
    $bad=["http://example.org/ticket-lookup?ticket=1234",
          "https://example.org/other?ticket=1234",
          "https://example.org/ticket-lookup?ticket=1%0AHeader"];
    $rejected=0;
    foreach($bad as $url) {{
        try {{ TicketQrCode::png($url); }} catch (InvalidArgumentException $e) {{ $rejected++; }}
    }}
    echo $rejected;
    '''
    assert run_php(code).strip() == "3"
