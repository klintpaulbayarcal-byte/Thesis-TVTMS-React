from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parents[1]
def source(path): return (ROOT/path).read_text()
def test_driver_only_routes_and_permissions():
    routes=source('src/routes/AppRoutes.jsx')
    assert 'secure([\'driver\'], <DriverDashboard/>)' in routes
    assert "secure(['admin','apprehending_officer'], <AppLayout/>)" in routes
    assert "path=\"/driver/register\"" in routes
    auth=source('api/src/handlers/auth.php')
    assert "['admin','apprehending_officer','driver']" in auth
    dashboard=source('src/pages/DriverDashboard.jsx')
    assert 'API.driverPortal()' in dashboard
    assert 'API.createTicket(' not in dashboard
    assert 'API.recordPayment(' not in dashboard
    assert 'item.remainingBalance' in dashboard
    api=source('api/src/handlers/driver_portal.php')
    assert "require_role(['driver'])" in api
    assert "['role'=>'eq.driver'" in api or "'role'=>'eq.driver'" in api
    assert "tvtms_driver_portal" in api
    assert "'role'=>'driver'" in api
    assert "'status'=>'inactive'" in api
    assert "'status'=>'active'" in api
def test_db_scope_is_email_and_issue_time_only():
    sql=source('supabase/migrations/202610290001_driver_readonly_portal.sql')
    assert 'citation_version=2' in sql
    assert 'driver_email_at_issue' in sql
    assert 'lower(trim(p_email))' in sql
    assert 'plateNumber' in sql
    assert "'remainingBalance'" in sql
    assert 'grant execute on function public.tvtms_driver_portal(text) to service_role' in sql
    assert 'grant execute on function public.tvtms_driver_portal(text) to anon' not in sql
    assert 'update public.tickets' not in sql.lower()
def test_php_driver_registration_lints():
    p=subprocess.run(['php','-l','api/src/handlers/driver_portal.php'],capture_output=True,text=True,cwd=ROOT,timeout=20)
    assert p.returncode==0,p.stdout+'\n'+p.stderr
