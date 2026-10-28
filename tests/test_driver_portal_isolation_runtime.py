from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parents[1]
def test_isolated_driver_portal_sql():
 r=subprocess.run(['node','--test','tests/driver-portal-isolation-runtime.mjs'],cwd=ROOT,text=True,capture_output=True,timeout=120)
 assert r.returncode==0,r.stdout+'\n'+r.stderr
