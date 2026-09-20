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


def test_hostinger_deploy_bootstraps_over_ca_verified_ip_ftps():
    """Requiring old remote files or weakening FTPS must block a first GitHub-only release."""
    workflow = read('.github/workflows/deploy-hostinger-v4.yml')

    assert "test \"$ftp_server\" = '145.223.108.219'" in workflow
    assert "test \"$ftp_username\" = 'u948876618.trafficviolation'" in workflow
    assert 'set ftp:ssl-force yes' in workflow
    assert 'set ftp:ssl-protect-data yes' in workflow
    assert 'set ssl:verify-certificate yes' in workflow
    assert 'set ssl:check-hostname no' in workflow
    assert 'openssl s_client' in workflow
    assert '*.hstgr.io' in workflow

    assert 'cls -1 /index.html' not in workflow
    assert 'cls -1 /.htaccess' not in workflow
    assert 'cls -1 /api/config/config.local.php' not in workflow
    assert 'supabase_secret_key: ${{ secrets.supabase_secret_key }}' in workflow
    assert 'tvtms_token_secret: ${{ secrets.tvtms_token_secret }}' in workflow
    assert 'export tvtms_python="$(python -c' in workflow
    assert 'export tvtms_php="$(command -v php)"' in workflow
    assert 'deploy/api/config/config.local.php' in workflow
    assert '--exclude-glob uploads/' in workflow
    assert '--exclude-glob config.local.php' not in workflow
    mirror_commands = [
        line.strip()
        for line in workflow.splitlines()
        if 'mirror -r' in line and not line.lstrip().startswith('#')
    ]
    assert len(mirror_commands) == 1
    assert '--delete' not in mirror_commands[0]


def test_plate_lookup_fix_uses_normalized_identity_and_persistent_sequence():
    sql = read('supabase/migrations/202609190002_plate_lookup_consistency.sql')
    assert 'create or replace function public.tvtms_catalog_vehicle_violations(p_id bigint)' in sql
    assert 'create or replace function public.tvtms_catalog_vehicle_stats(p_id bigint)' in sql
    assert 'replace(replace(upper(tv.plate_number)' in sql
    assert 'public.plate_ticket_sequences' in sql
    assert 'next_plate_ticket_count' in sql
    assert 'max(t.plate_ticket_count_at_issue)' not in sql
    assert 'grant execute on function public.tvtms_catalog_vehicle_violations(bigint)' in sql
