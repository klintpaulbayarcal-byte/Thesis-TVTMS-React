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


def test_hostinger_deploy_runs_on_every_sync_v4_push():
    workflow = read('.github/workflows/deploy-hostinger-v4.yml')
    trigger = workflow.split('on:', 1)[1].split('permissions:', 1)[0]

    assert 'push:' in trigger
    assert 'branches: [sync-v4]' in trigger
    assert 'paths:' not in trigger
    assert 'paths-ignore:' not in trigger


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

    preflight = workflow.split(
        '- name: preflight hostinger certificate and remote subdomain root (no writes)', 1
    )[1].split('- name: set up node.js', 1)[0]
    assert 'cls -1 /index.html' not in preflight
    assert 'cls -1 /.htaccess' not in preflight
    assert 'cls -1 /api/config/config.local.php' not in preflight
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
    assert '--all' not in mirror_commands[0]
    assert 'put ./deploy/.htaccess -o /.htaccess' in workflow
    assert 'put ./deploy/api/.htaccess -o /api/.htaccess' in workflow
    assert 'put ./deploy/api/config/.htaccess -o /api/config/.htaccess' in workflow


def test_legacy_landing_redirect_precedes_static_files_and_removes_only_that_file():
    """A stale deployed landing page must redirect without broad remote deletion."""
    apache = read('.htaccess')
    workflow = read('.github/workflows/deploy-hostinger-v4.yml')

    redirect = 'rewriterule ^pages/landing\\.html$ / [r=301,l]'
    assert redirect in apache
    assert apache.index(redirect) < apache.index('rewritecond %{request_filename} -f')

    active_delete_lines = [
        line.strip()
        for line in workflow.splitlines()
        if 'rm -f ' in line and not line.lstrip().startswith('#')
    ]
    assert len(active_delete_lines) == 1
    release_command = active_delete_lines[0]
    assert 'rm -f /pages/landing.html' in release_command
    assert 'rm -r' not in release_command
    assert 'rm -rf' not in release_command
    assert 'rmdir ' not in release_command
    redirect_check = '- name: verify the exact legacy redirect before cleanup'
    delete_step = '- name: remove only the obsolete deployed landing file'
    assert redirect_check in workflow
    assert delete_step in workflow
    assert workflow.index(redirect_check) < workflow.index(delete_step)


def test_plate_lookup_fix_uses_normalized_identity_and_persistent_sequence():
    sql = read('supabase/migrations/202609190002_plate_lookup_consistency.sql')
    assert 'create or replace function public.tvtms_catalog_vehicle_violations(p_id bigint)' in sql
    assert 'create or replace function public.tvtms_catalog_vehicle_stats(p_id bigint)' in sql
    assert 'replace(replace(upper(tv.plate_number)' in sql
    assert 'public.plate_ticket_sequences' in sql
    assert 'next_plate_ticket_count' in sql
    assert 'max(t.plate_ticket_count_at_issue)' not in sql
    assert 'grant execute on function public.tvtms_catalog_vehicle_violations(bigint)' in sql
