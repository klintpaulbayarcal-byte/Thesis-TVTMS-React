"""Execute the real migrations and transactions locally, never against Supabase."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def test_revised_citation_postgres_regressions():
    result = subprocess.run(
        ['node', '--test', 'tests/revised-citation-runtime.mjs'], cwd=ROOT,
        capture_output=True, text=True, encoding='utf-8', timeout=180,
    )
    assert result.returncode == 0, result.stdout + result.stderr
