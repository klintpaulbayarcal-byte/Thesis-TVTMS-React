"""Run real isolated SQL admin ticket CRUD flows with PGlite (never production)."""
import subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def test_admin_crud_isolated_database_runtime():
    result=subprocess.run(["node","--test","tests/admin-crud-isolated-runtime.mjs"],cwd=ROOT,text=True,capture_output=True,timeout=120)
    assert result.returncode == 0, (result.stdout+"\n"+result.stderr)[-6500:]
