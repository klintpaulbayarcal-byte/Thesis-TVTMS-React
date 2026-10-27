import subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def test_repeat_owner_real_db_runtime():
    result=subprocess.run(['node','--test','tests/repeat-owner-e2e-runtime.mjs'],
                          cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                          text=True,timeout=120)
    assert result.returncode==0,result.stdout+'\n'+result.stderr
