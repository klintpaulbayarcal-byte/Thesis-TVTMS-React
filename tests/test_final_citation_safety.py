"""Executable API and bootstrap regressions. Fixtures contain no real secrets."""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.request

import pytest

ROOT = Path(__file__).resolve().parents[1]
PHP = os.environ.get('TVTMS_PHP', 'php')


def php_json(script):
    result = subprocess.run([PHP, '-r', script], cwd=ROOT, capture_output=True,
                            stdin=subprocess.DEVNULL, text=True, timeout=15)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


@pytest.mark.parametrize('field,value', [
    ('violation_name', 'Renamed'), ('violation_code', 'DRIFT'),
    ('status', 'inactive'), ('is_citation_selectable', False),
    ('requires_description', True),
])
def test_admin_update_rejects_official_drift_before_any_write(field, value):
    script = '''function require_role($r){return ['id'=>1];}
function json_input(){return INPUT;}
function supabase_select($t,$f,$o){return [['id'=>1,'is_citation_selectable'=>true,
'violation_code'=>'TC001','violation_name'=>"Not carrying driver's license",
'status'=>'active','requires_description'=>false]];}
function fail($m,$s,$c){echo json_encode(['status'=>$s,'code'=>$c]);exit;}
function supabase_rpc(){throw new Exception('Database write boundary reached');}
require HANDLER;violations_update(['id'=>1]);'''
    data = php_json(script.replace('INPUT', json_to_php({field: value}))
                    .replace('HANDLER', json.dumps(str(ROOT / 'api/src/handlers/violations.php'))))
    assert data == {'status': 409, 'code': 'OFFICIAL_CATALOG_PROTECTED'}


def json_to_php(value):
    return 'json_decode(' + json.dumps(json.dumps(value)) + ',true)'


def test_admin_delete_rejects_official_choice_before_delete_rpc():
    data = php_json('''function require_role($r){return ['id'=>1];}
function supabase_select($t,$f,$o){return [['is_citation_selectable'=>true]];}
function fail($m,$s,$c){echo json_encode(['status'=>$s,'code'=>$c]);exit;}
function supabase_rpc(){throw new Exception('Delete RPC reached');}
require ''' + json.dumps(str(ROOT / 'api/src/handlers/violations.php')) +
                    ";violations_delete(['id'=>1]);")
    assert data == {'status': 409, 'code': 'OFFICIAL_CATALOG_PROTECTED'}


def test_public_catalog_uses_official_filter_and_only_public_fields():
    data = php_json('''function supabase_select($t,$f,$o){return [['table'=>$t,'filters'=>$f,'options'=>$o]];}
function json_response($x){echo json_encode($x);exit;}
require ''' + json.dumps(str(ROOT / 'api/src/handlers/public.php')) + ';public_violations();')
    query = data['violations'][0]
    assert query['filters'] == {'status': 'eq.active', 'is_citation_selectable': 'eq.true'}
    assert query['options']['select'].split(',') == [
        'violation_code', 'violation_name', 'description', 'penalty_amount']


@pytest.mark.parametrize('license_type', ['', 'Professional', 'Non-Professional', 'Student Permit / SP', 'Others'])
def test_php_license_boundary_accepts_intentional_optional_classification(license_type):
    fixture = {'ticket_number': 'QA-1', 'plate_number': 'QA123', 'vehicle_type': 'car',
               'vehicle_make': 'Fixture', 'driver_first_name': 'Test', 'driver_last_name': 'Driver',
               'driver_address': 'Fixture', 'driver_nationality': 'Fixture',
               'driver_email': 'driver@example.test', 'license_type': license_type,
               'license_type_other': 'Custom classification', 'owner_name': 'Test Owner',
               'owner_address': 'Fixture', 'location': 'Fixture',
               'expected_date': '2026-10-02', 'violation_ids': [1]}
    script = '''function fail($m,$s,$c){throw new Exception($c);}
function text_length($s){return strlen($s);}function normalize_plate($s){return $s;}
function normalize_email($s){return $s;}
require HANDLER;echo json_encode(citation_input(INPUT));'''
    data = php_json(script.replace('HANDLER', json.dumps(str(ROOT / 'api/src/handlers/tickets.php')))
                    .replace('INPUT', json_to_php(fixture)))
    assert data['license_type'] == license_type
    assert data['license_type_other'] == ('Custom classification' if license_type == 'Others' else '')


@pytest.mark.parametrize('fixture', [
    {'development': False, 'supabase_url': 'http://127.0.0.1:1'},
    {'development': True, 'supabase_url': 'https://cwrhxvrmnfmzuxotsjrw.supabase.co'},
    {'development': True, 'supabase_url': 'http://127.0.0.1:1',
     'app_public_url': 'https://trafficviolation.dcsbisu.com'},
    {'development': True, 'supabase_url': ''},
])
def test_real_php_development_bootstrap_blocks_before_database_io(tmp_path, fixture):
    api = tmp_path / 'api'
    shutil.copytree(ROOT / 'api', api, ignore=shutil.ignore_patterns('config.local.php'))
    # Fixture-only private file. No production config is copied or read.
    (api / 'config/config.local.php').write_text('<?php return ' + json_to_php(fixture) + ';')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    env = {**os.environ, 'TVTMS_ISOLATED_DEV': '0'}
    with (tmp_path / 'server.log').open('w') as log:
        process = subprocess.Popen([PHP, '-S', f'127.0.0.1:{port}', '-t', str(tmp_path), str(api / 'index.php')],
                                   cwd=tmp_path, env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=log)
        try:
            deadline = time.monotonic() + 25
            while time.monotonic() < deadline:
                try:
                    urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health', timeout=5)
                except urllib.error.HTTPError as error:
                    assert error.code == 503
                    payload = json.load(error)
                    assert payload['errorCode'] == 'DEVELOPMENT_DATABASE_BLOCKED'
                    break
                except (urllib.error.URLError, TimeoutError):
                    time.sleep(0.05)
                else:
                    pytest.fail('Production configuration was accepted')
            else:
                pytest.fail('PHP fixture server did not start')
        finally:
            process.terminate()
            process.wait(timeout=10)
    assert 'Supabase error' not in (tmp_path / 'server.log').read_text(encoding='utf-8')


def test_safety_policy_allows_explicit_nonproduction_and_hosted_production():
    data = php_json('require ' + json.dumps(str(ROOT / 'api/src/development_safety.php')) + ''';
echo json_encode([
development_configuration_error(['development'=>true,'supabase_url'=>'https://nonproduction.example.test'],'cli-server'),
development_configuration_error(['development'=>false,'supabase_url'=>'https://cwrhxvrmnfmzuxotsjrw.supabase.co'],'fpm-fcgi')]);''')
    assert data == [None, None]


def test_local_safety_rejects_production_jwt_and_ambiguous_development_flags():
    data = php_json('require ' + json.dumps(str(ROOT / 'api/src/development_safety.php')) + ''';
$safe=['development'=>true,'supabase_url'=>'https://nonproduction.example.test'];
$key='fixture.'.base64_encode(json_encode(['ref'=>'cwrhxvrmnfmzuxotsjrw'])).'.fixture';
echo json_encode([
development_configuration_error(array_replace($safe,['supabase_secret_key'=>$key]),'cli-server')!==null,
development_configuration_error(array_replace($safe,['development'=>'false']),'cli-server')!==null,
development_configuration_error(array_replace($safe,['environment'=>'production']),'cli-server')!==null]);''')
    assert data == [True, True, True]


@pytest.mark.parametrize('hardcoded', [False, True])
def test_packager_excludes_private_config_before_copy_and_rejects_other_secrets(tmp_path, hardcoded):
    (tmp_path / 'dist').mkdir()
    (tmp_path / 'dist/index.html').write_text('<html>Fixture</html>')
    (tmp_path / 'api/config').mkdir(parents=True)
    fixture_secret = 'sb_' + 'secret_' + 'x' * 40
    (tmp_path / 'api/config/config.local.php').write_text('<?php /* ' + fixture_secret + ' */')
    (tmp_path / 'api/index.php').write_text('<?php /* ' + (fixture_secret if hardcoded else 'safe fixture') + ' */')
    result = subprocess.run(['node', str(ROOT / 'scripts/package-hostinger.cjs')], cwd=tmp_path,
                            stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=15)
    assert not (tmp_path / 'deploy/api/config/config.local.php').exists()
    assert not (tmp_path / 'deploy/scripts').exists()
    assert fixture_secret not in result.stdout + result.stderr
    assert result.returncode == (1 if hardcoded else 0)


def test_form_and_public_reference_no_silent_defaults_or_truncation():
    page = (ROOT / 'src/pages/IssueTicket.jsx').read_text(encoding='utf-8')
    assert "vehicle_type: ''" in page and "license_type: ''" in page
    assert 'Select vehicle type' in page and 'Select if applicable' in page
    assert '<select required value={form.vehicle_type}' in page
    assert 'vehicle_type: vehicle.vehicle_type' not in page
    assert 'violations.slice(0,10)' not in (ROOT / 'src/pages/Landing.jsx').read_text(encoding='utf-8')
    assert 'ticket slip' not in (ROOT / 'src/pages/PublicTicketLookup.jsx').read_text(encoding='utf-8')
