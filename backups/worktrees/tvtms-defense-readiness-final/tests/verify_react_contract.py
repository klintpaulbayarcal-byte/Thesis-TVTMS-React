from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
REQUIRED_PAGES = {
    'Landing','Login','ResetPassword','AdminDashboard','AdminOverview','AdminSettings',
    'AnalyticsDashboard','AuditLogs','Disputes','IssueTicket','LicensePlateLookup',
    'ManageUsers','ManageViolations','Notifications','OfficerDashboard','Payments',
    'Profile','PublicTicketLookup','Reports','TicketDetails','ViewTickets'
}
REQUIRED_ROUTES = {
    '/', '/login', '/reset-password', '/ticket-lookup',
    '/admin', '/admin/overview', '/admin/users', '/admin/violations', '/admin/payments',
    '/admin/disputes', '/admin/reports', '/admin/analytics', '/admin/audit-logs', '/admin/settings',
    '/officer', '/officer/issue-ticket', '/officer/tickets', '/officer/lookup',
    '/notifications', '/profile', '/tickets/:id'
}

def test_react_pages_exist():
    pages_dir = ROOT / 'src' / 'pages'
    missing = sorted(name for name in REQUIRED_PAGES if not (pages_dir / f'{name}.jsx').is_file())
    assert not missing, f'missing React pages: {missing}'

def test_routes_are_declared():
    route_file = ROOT / 'src' / 'routes' / 'AppRoutes.jsx'
    assert route_file.is_file(), 'missing AppRoutes.jsx'
    text = route_file.read_text(encoding='utf-8')
    missing = sorted(route for route in REQUIRED_ROUTES if f'path="{route}"' not in text and f"path='{route}'" not in text)
    assert not missing, f'missing routes: {missing}'

def test_api_service_is_same_origin_by_default():
    p = ROOT / 'src' / 'services' / 'api.js'
    assert p.is_file(), 'missing API service'
    text = p.read_text(encoding='utf-8')
    assert "'/api'" in text or '"/api"' in text
    assert 'SUPABASE_SECRET' not in text
    assert 'service_role' not in text

def test_no_secret_env_usage_in_react_source():
    bad = []
    for p in (ROOT/'src').rglob('*'):
        if p.is_file() and p.suffix in {'.js','.jsx','.ts','.tsx'}:
            t=p.read_text(encoding='utf-8', errors='ignore')
            if re.search(r'SUPABASE_(SECRET|SERVICE_ROLE)|sb_secret_', t, re.I):
                bad.append(str(p.relative_to(ROOT)))
    assert not bad, f'server secrets referenced in React source: {bad}'
