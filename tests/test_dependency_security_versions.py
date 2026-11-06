import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_security_fixed_router_and_build_versions_are_locked():
    package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
    lock = json.loads((ROOT / 'package-lock.json').read_text(encoding='utf-8'))

    assert package['dependencies']['react-router-dom'] == '7.18.4'
    assert package['devDependencies']['vite'] == '8.3.4'
    assert package['devDependencies']['@vitejs/plugin-react'] == '6.1.1'

    root_lock = lock['packages']['']
    assert root_lock['dependencies']['react-router-dom'] == '7.18.4'
    assert root_lock['devDependencies']['vite'] == '8.3.4'
    assert root_lock['devDependencies']['@vitejs/plugin-react'] == '6.1.1'

    assert lock['packages']['node_modules/react-router']['version'] == '7.18.4'
    assert lock['packages']['node_modules/react-router-dom']['version'] == '7.18.4'
    assert lock['packages']['node_modules/vite']['version'] == '8.3.4'
    # Patched dev-tool transitive dependencies: GHSA-pqg4-j6r4-53mv and GHSA-68fv-2mgg-jv7q.
    assert lock['packages']['node_modules/shell-quote']['version'] == '1.11.0'
    assert lock['packages']['node_modules/source-map-js']['version'] == '1.2.2'


def test_declarative_route_contract_remains_present_for_router_v7():
    main = (ROOT / 'src/main.jsx').read_text(encoding='utf-8')
    routes = (ROOT / 'src/routes/AppRoutes.jsx').read_text(encoding='utf-8')
    protected = (ROOT / 'src/routes/ProtectedRoute.jsx').read_text(encoding='utf-8')

    assert 'BrowserRouter' in main
    for marker in ('<Routes>', '<Route', '<Navigate', '/admin', '/officer', '/ticket-lookup'):
        assert marker in routes
    assert 'roles.includes(user.role)' in protected
