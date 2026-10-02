"""Release blockers found while inspecting the latest recovered user source.

These static contracts are scoped to known old/new functionality mismatches;
full browser/database testing remains a separate release gate.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def src(relative):
    return (ROOT / relative).read_text(encoding='utf-8')


def test_ticket_qr_url_is_consumed_and_lookup_runs_automatically():
    lookup = src('src/pages/PublicTicketLookup.jsx')
    ticket = src('src/pages/TicketDetails.jsx')
    landing = src('src/pages/Landing.jsx')
    assert '/ticket-lookup?ticket=' in ticket
    assert 'useSearchParams' in lookup, 'QR ticket URL must be read, not ignored'
    assert "searchParams.get('ticket')" in lookup
    assert 'runLookup(referenceFromUrl,modeFromUrl)' in lookup, 'ticket and plate URLs must search immediately'
    assert "searchParams.get('plate')" in lookup
    assert "lastQrRequest.current=''" in lookup, 'QR lookup must reset when its URL parameter is removed'
    assert 'encodeURIComponent(t.ticket_number)' in landing, 'landing results must preserve selected ticket'


def test_admin_does_not_advertise_officer_only_ticket_issuance():
    backend = src('api/src/handlers/tickets.php')
    assert "require_role(['apprehending_officer'])" in backend
    routes = src('src/routes/AppRoutes.jsx')
    sidebar = src('src/components/Sidebar.jsx')
    dashboard = src('src/pages/AdminDashboard.jsx')
    assert "secure(['apprehending_officer'], <IssueTicket/>)" in routes
    admin = sidebar.split('const adminSections = [', 1)[1].split('const officerSections = [', 1)[0]
    assert "'/officer/issue-ticket'" not in admin
    assert 'to="/officer/issue-ticket"' not in dashboard


def test_admin_dashboard_does_not_present_invented_barangays_as_real_risk_data():
    dashboard = src('src/pages/AdminDashboard.jsx')
    for fictional_fallback in ("name:'Poblacion'", "name:'San Isidro'", "name:'Talisay'", "name:'Desamparados'", "name:'Calunasan'"):
        assert fictional_fallback not in dashboard
    assert 'No location data available' in dashboard
    assert 'Patrol Cleared' not in dashboard


def test_deployment_documented_local_config_template_exists_and_is_not_a_secret():
    template = ROOT / 'api/config/config.local.example.php'
    assert template.is_file(), 'Deployment guide refers to missing config.local.example.php'
    config = template.read_text(encoding='utf-8')
    assert 'CHANGE_ME_SERVER_SECRET' in config
    assert 'CHANGE_THIS_TO_A_LONG_RANDOM_SECRET_32_CHARS_MINIMUM' in config
    assert 'sb_secret_' not in config
    assert 'api/config/config.local.php' in (ROOT / '.gitignore').read_text(encoding='utf-8')
    assert not (ROOT / 'deploy/api/config/config.local.php').exists(), 'Never ship private config in deploy output'


def test_windows_release_script_fails_closed_and_checks_all_required_files():
    script = ROOT / 'scripts/build-verified-hostinger.ps1'
    assert script.is_file()
    content = script.read_text(encoding='utf-8')
    for marker in ('npm.cmd ci', 'npm.cmd run verify:jsx', 'npm.cmd test',
                   'npm.cmd run build:hostinger', 'PHP_VERSION_ID',
                   'LOCALAPPDATA', 'Python\\bin',
                   'deploy/api/src/handlers/contact_messages.php',
                   'deploy/api/config/config.local.php', '.htaccess',
                   'ZipFile', 'TVTMS_V4_FINAL_HOSTINGER_DEPLOY.zip'):
        assert marker in content, f'Missing release gate: {marker}'
    assert 'ftp' not in content.lower(), 'The build script must never deploy automatically'


def test_pdf_export_default_uses_approved_study_title():
    php = src('api/src/handlers/reports.php')
    assert "'Traffic Violation Ticketing and Management System'" in php
    assert "'Municipal Traffic Violation Ticketing and Management System'" not in php


def test_distribution_does_not_republish_sample_login_credentials():
    for file in ROOT.rglob('*'):
        if not file.is_file() or file.suffix.lower() not in {'.md', '.txt', '.php', '.jsx', '.js'}:
            continue
        if any(parent in {'node_modules', 'dist', 'deploy'} for parent in file.parts):
            continue
        contents = file.read_text(encoding='utf-8', errors='ignore')
        import re
        assert not re.search(r'\b(?:Admin|Officer)@[0-9]{6,}\b', contents), (
            f'The shared source handoff must omit historical credentials in {file.relative_to(ROOT)}'
        )


def test_handoff_readme_does_not_claim_obsolete_release_results():
    readme = src('README_FIRST.txt')
    assert 'FINAL_RELEASE_STATUS_READ_FIRST.md' in readme
    assert 'FINAL_VERIFICATION_REPORT.md' not in readme
    assert '36 automated tests' not in readme
    assert 'npm run build:hostinger' in readme
    assert 'NOT DEPLOYABLE' in readme
