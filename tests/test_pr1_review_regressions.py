"""Source-contract regression checks; separate staging PostgreSQL tests are still required."""
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding='utf-8').lower()


def test_ci_checks_pull_requests_without_requiring_packaged_user_uploads():
    workflow = read('.github/workflows/verify-hostinger-package.yml')
    assert 'pull_request:' in workflow
    assert 'test -f deploy/uploads/.htaccess' not in workflow
    assert 'test ! -e deploy/uploads' in workflow
    assert 'npm test' in workflow
    assert 'ftp-deploy-action' not in workflow


def test_plate_lookup_fix_uses_normalized_identity_and_persistent_sequence():
    sql = read('supabase/migrations/202609190002_plate_lookup_consistency.sql')
    assert 'create or replace function public.tvtms_catalog_vehicle_violations(p_id bigint)' in sql
    assert 'create or replace function public.tvtms_catalog_vehicle_stats(p_id bigint)' in sql
    assert 'replace(replace(upper(tv.plate_number)' in sql
    assert 'public.plate_ticket_sequences' in sql
    assert 'next_plate_ticket_count' in sql
    assert 'max(t.plate_ticket_count_at_issue)' not in sql
    assert 'grant execute on function public.tvtms_catalog_vehicle_violations(bigint)' in sql
