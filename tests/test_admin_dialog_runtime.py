"""Runtime coverage for actual React event handlers with offline API doubles."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def test_administrator_dialog_event_handlers():
    result = subprocess.run(['node', '--test', 'tests/admin-dialog-runtime.mjs'], cwd=ROOT,
                            capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, (result.stdout + result.stderr)[-9000:]
