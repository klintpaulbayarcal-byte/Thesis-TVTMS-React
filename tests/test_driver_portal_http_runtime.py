from pathlib import Path
import subprocess
ROOT = Path(__file__).resolve().parents[1]
def test_isolated_driver_portal_php_http_acceptance():
    result = subprocess.run(['node', 'tests/driver-portal-http-runtime.mjs'], cwd=ROOT,
                            text=True, capture_output=True, timeout=120)
    assert result.returncode == 0, result.stdout + '\n' + result.stderr
