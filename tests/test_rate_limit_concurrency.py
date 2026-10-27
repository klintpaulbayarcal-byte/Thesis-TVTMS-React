import hashlib
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
PHP = Path(os.environ.get("TVTMS_PHP", r"C:\\tools\\php83\\php.exe"))


def run_php(script: str, timeout: float = 10) -> subprocess.CompletedProcess[str]:
    if not PHP.exists():
        pytest.skip(f"PHP runtime is unavailable at {PHP}")
    return subprocess.run(
        [str(PHP), "-r", script],
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def test_rate_limit_waits_briefly_for_same_bucket_lock():
    """A normal concurrent request must not become RATE_LIMIT_UNAVAILABLE."""
    if not PHP.exists():
        pytest.skip(f"PHP runtime is unavailable at {PHP}")

    common = json.dumps(str(ROOT / "api/src/common.php"))
    bucket = "api"
    ip = "203.0.113.50"

    with tempfile.TemporaryDirectory() as temp_dir:
        directory = Path(temp_dir)
        lock_file = directory / (hashlib.sha256(f"{bucket}|{ip}".encode()).hexdigest() + ".json")
        lock_file.write_text('{"start":1000,"count":0}', encoding="utf-8")

        holder_script = f'''$fh=fopen({json.dumps(str(lock_file))},"c+");
if(!$fh||!flock($fh,LOCK_EX)){{fwrite(STDERR,"lock failed");exit(2);}}
echo "READY\\n";fflush(STDOUT);
usleep(200000);
flock($fh,LOCK_UN);fclose($fh);'''
        holder = subprocess.Popen(
            [str(PHP), "-r", holder_script],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        assert holder.stdout is not None
        assert holder.stdout.readline().strip() == "READY"

        caller_script = f'''require {common};
$result=rate_limit_check({json.dumps(bucket)},300,300,{json.dumps(ip)},1000,{json.dumps(str(directory))});
echo json_encode($result);'''
        started = time.monotonic()
        result = run_php(caller_script)
        elapsed = time.monotonic() - started

        holder_stdout, holder_stderr = holder.communicate(timeout=5)
        assert holder.returncode == 0, holder_stderr
        assert result.returncode == 0, result.stderr
        payload = json.loads(result.stdout)
        assert payload["allowed"] is True
        assert payload.get("unavailable") is not True
        # It should have waited for the short-lived lock rather than failing immediately.
        assert elapsed >= 0.12
        assert elapsed < 2.0


def test_rate_limit_still_fails_closed_when_storage_is_unusable():
    common = json.dumps(str(ROOT / "api/src/common.php"))
    with tempfile.TemporaryDirectory() as temp_dir:
        blocked_path = Path(temp_dir) / "not-a-directory"
        blocked_path.write_text("file", encoding="utf-8")
        script = f'''require {common};
echo json_encode(rate_limit_check("api",300,300,"203.0.113.51",1000,{json.dumps(str(blocked_path))}));'''
        result = run_php(script)
        assert result.returncode == 0, result.stderr
        payload = json.loads(result.stdout)
        assert payload["allowed"] is False
        assert payload["unavailable"] is True
        assert payload["retry_after"] == 60
