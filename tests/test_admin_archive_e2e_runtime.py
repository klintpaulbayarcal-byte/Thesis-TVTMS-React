"""Execute isolated real PostgreSQL-compatible Administrator archival acceptance cases."""
import os
import subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def test_admin_archive_end_to_end_isolated_database():
    result=subprocess.run(["node","--test","tests/admin-archive-e2e-runtime.mjs"],
                          cwd=ROOT,env=os.environ.copy(),capture_output=True,text=True,timeout=120)
    assert result.returncode==0, result.stdout+"\n"+result.stderr
