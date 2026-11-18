"""Real in-memory PostgreSQL safety regression; never touches production."""
from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parents[1]
def test_admin_failed_email_delete_is_atomic():
    outcome=subprocess.run(['node','--test','tests/admin-failed-email-deletion-runtime.mjs'],cwd=ROOT,capture_output=True,text=True,timeout=120)
    assert outcome.returncode==0,(outcome.stdout+'\n'+outcome.stderr)[-7000:]
