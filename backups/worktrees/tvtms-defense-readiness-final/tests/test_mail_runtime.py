import json
import os
import socketserver
import subprocess
import threading
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PHP = Path(os.environ.get("TVTMS_PHP", r"C:\tools\php83\php.exe"))
MAIL = ROOT / "api/src/mail.php"


def run_php(script: str) -> subprocess.CompletedProcess[str]:
    wrapped = f"require {json.dumps(str(MAIL))};{script}"
    return subprocess.run(
        [str(PHP), "-r", wrapped],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )


def php_json(script: str):
    result = run_php(script)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


class FakeSmtpHandler(socketserver.StreamRequestHandler):
    def handle(self):
        self.wfile.write(b"220 localhost test smtp\r\n")
        in_data = False
        message = []
        while True:
            raw = self.rfile.readline()
            if not raw:
                break
            line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
            if in_data:
                if line == ".":
                    self.server.message = "\n".join(message)
                    self.wfile.write(b"250 accepted\r\n")
                    in_data = False
                else:
                    message.append(line)
                continue
            command = line.upper()
            if command.startswith("EHLO"):
                self.wfile.write(b"250-localhost\r\n250 SIZE 1000000\r\n")
            elif command.startswith("MAIL FROM"):
                self.wfile.write(b"250 sender ok\r\n")
            elif command.startswith("RCPT TO"):
                if self.server.reject_recipient:
                    self.wfile.write(b"550 recipient rejected\r\n")
                else:
                    self.wfile.write(b"250 recipient ok\r\n")
            elif command == "DATA":
                self.wfile.write(b"354 end with dot\r\n")
                in_data = True
            elif command == "QUIT":
                self.wfile.write(b"221 bye\r\n")
                break
            else:
                self.wfile.write(b"500 unsupported\r\n")


class FakeSmtpServer:
    def __init__(self, reject_recipient: bool = False):
        self.server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), FakeSmtpHandler)
        self.server.daemon_threads = True
        self.server.reject_recipient = reject_recipient
        self.server.message = ""
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, exc_type, exc, tb):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    @property
    def port(self):
        return self.server.server_address[1]

    @property
    def message(self):
        return self.server.message


def smtp_array(port: int) -> str:
    return "[" + ",".join(
        [
            "'enabled'=>true",
            "'host'=>'127.0.0.1'",
            f"'port'=>{port}",
            "'secure'=>'none'",
            "'username'=>''",
            "'password'=>'super-secret-test-password'",
            "'from_email'=>'noreply@example.test'",
            "'from_name'=>'TVTMS'",
        ]
    ) + "]"


def test_mask_email_reveals_at_most_two_local_characters():
    assert php_json(
        "echo json_encode([mask_email('djklintskie@gmail.com'),mask_email('a@example.org'),mask_email('bad'),mask_email('')]);"
    ) == ["dj***@gmail.com", "a***@example.org", None, None]


def test_smtp_configuration_requires_complete_secure_values():
    valid = "['enabled'=>true,'host'=>'smtp.example.test','port'=>587,'secure'=>'tls','username'=>'mailer','password'=>'secret','from_email'=>'noreply@example.test','from_name'=>'TVTMS']"
    invalid_cases = [
        "[]",
        "['enabled'=>false]",
        "['enabled'=>true,'host'=>'smtp.example.test','port'=>587,'secure'=>'tls','username'=>'mailer','password'=>'secret','from_email'=>'','from_name'=>'TVTMS']",
        "['enabled'=>true,'host'=>'smtp.example.test','port'=>0,'secure'=>'tls','username'=>'mailer','password'=>'secret','from_email'=>'noreply@example.test','from_name'=>'TVTMS']",
        "['enabled'=>true,'host'=>'smtp.example.test','port'=>587,'secure'=>'none','username'=>'mailer','password'=>'secret','from_email'=>'noreply@example.test','from_name'=>'TVTMS']",
    ]
    expression = ",".join([f"smtp_configuration_status({case})" for case in invalid_cases] + [f"smtp_configuration_status({valid})"])
    assert php_json(f"echo json_encode([{expression}]);") == [
        "not_configured",
        "not_configured",
        "not_configured",
        "not_configured",
        "not_configured",
        "configured",
    ]


def test_fake_smtp_acceptance_is_reported_only_after_message_data():
    with FakeSmtpServer() as fake:
        result = run_php(
            f"$r=smtp_send_message_result({smtp_array(fake.port)},'owner@example.test','Traffic Violation Notice — TVT-2026-000123','<p>Ticket TVT-2026-000123</p>');echo json_encode($r);"
        )
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["status"] == "accepted"
    assert payload["errorCode"] is None
    assert "Subject:" in fake.message
    assert "TVT-2026-000123" in fake.message


def test_fake_smtp_rejection_is_safe_and_does_not_log_credentials_or_recipient():
    with FakeSmtpServer(reject_recipient=True) as fake:
        result = run_php(
            f"$r=smtp_send_message_result({smtp_array(fake.port)},'private-owner@example.test','Traffic Violation Notice','<p>Notice</p>');echo json_encode($r);"
        )
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["status"] == "failed"
    assert payload["errorCode"] == "smtp_rejected"
    assert "super-secret-test-password" not in result.stderr
    assert "private-owner@example.test" not in result.stderr
