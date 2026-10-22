"""Offline SMTP diagnostics regression: no outgoing connections or production writes."""
import json
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PHP = os.environ.get("TVTMS_PHP") or shutil.which("php")
MAIL = ROOT / "api/src/mail.php"
TICKET_EMAIL = ROOT / "api/src/ticket_email.php"


def execute(script):
    assert PHP
    run = subprocess.run([PHP, "-r", f"require {json.dumps(str(MAIL))};" + script],
                         capture_output=True, text=True, timeout=10)
    assert run.returncode == 0, run.stderr
    return json.loads(run.stdout)


def test_rejection_records_only_numeric_reply_and_stage():
    result = execute("""
      $s=fopen('php://temp','w+');
      fwrite($s,"550 Account refused; secret@example.test\\r\\n");rewind($s);
      try { smtp_expect($s,[250],'recipient'); }catch(MailTransportException $e){
        echo json_encode([$e->errorCode,$e->stage,$e->replyCode,$e->getMessage()]);
      } fclose($s);
    """)
    assert result == ["smtp_rejected", "recipient", 550, "smtp_rejected"]


def test_multiline_smtp_response_parsing():
    result = execute("""
      $s=fopen('php://temp','w+');
      fwrite($s,"250-mail.example.test\\r\\n250 SIZE 1234\\r\\n");rewind($s);
      echo json_encode(smtp_expect($s,[250],'ehlo'));fclose($s);
    """)
    assert result == "250-mail.example.test\r\n250 SIZE 1234\r\n"


def test_after_data_ambiguity_disallows_retry():
    mail = MAIL.read_text()
    workflow = TICKET_EMAIL.read_text()
    assert "in_array($e->stage,['message_data','message_acceptance'],true)" in mail
    assert "mail_result('unknown','delivery_state_unknown'" in mail
    assert "if(($mail['status']??'')==='unknown')" in workflow
    assert "ticket_notification_result('unknown',$masked,false" in workflow
    assert "return ticket_notification_result('unknown'" in workflow
