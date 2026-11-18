import subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def test_qr_identity_isolated_database_workflow():
    result=subprocess.run(['node','--test','tests/qr-identity-e2e-runtime.mjs'],cwd=ROOT,
        capture_output=True,text=True,timeout=120)
    assert result.returncode==0,result.stdout+'\n'+result.stderr
