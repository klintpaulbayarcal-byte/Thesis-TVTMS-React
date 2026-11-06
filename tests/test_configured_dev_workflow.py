"""Normal startup provenance and private-config preservation; no hosted DB calls."""
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


@pytest.mark.parametrize('inherited', [
    {}, {'TVTMS_ISOLATED_DEV': '1'},
    {'TVTMS_CONFIGURED_DEV': '0', 'VITE_PHP_API_ORIGIN': 'https://fixture.example.invalid'},
    {'tvtms_isolated_dev': '1', 'tvtms_configured_dev': '0',
     'vite_php_api_origin': 'https://fixture.example.invalid'},
])
def test_actual_normal_launcher_starts_existing_commands_without_qa_or_seed_steps(tmp_path, inherited):
    (tmp_path / 'scripts').mkdir()
    shutil.copyfile(ROOT / 'scripts/dev-configured.mjs', tmp_path / 'scripts/dev-configured.mjs')
    cli = tmp_path / 'node_modules/concurrently/dist/bin/concurrently.js'
    cli.parent.mkdir(parents=True)
    # Observe the real launcher's child arguments/env without starting any database/app.
    cli.write_text("""console.log(JSON.stringify({args:process.argv.slice(2),
isolated:process.env.TVTMS_ISOLATED_DEV,configured:process.env.TVTMS_CONFIGURED_DEV,
origin:process.env.VITE_PHP_API_ORIGIN,existingKeyPreserved:process.env.SUPABASE_SECRET_KEY==='fixture-existing-key'}));""")
    env = {key: value for key, value in os.environ.items() if key.upper() not in (
        'TVTMS_ISOLATED_DEV', 'TVTMS_CONFIGURED_DEV', 'VITE_PHP_API_ORIGIN', 'SUPABASE_SECRET_KEY')}
    env.update(inherited)
    env['SUPABASE_SECRET_KEY'] = 'fixture-existing-key'
    result = subprocess.run(['node', str(tmp_path / 'scripts/dev-configured.mjs')], cwd=tmp_path,
                            env=env, stdin=subprocess.DEVNULL, capture_output=True,
                            text=True, timeout=15)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == {
        'args': ['-k', 'npm run dev:api', 'npm run dev:web'],
        'isolated': '0', 'configured': '1', 'origin': 'http://127.0.0.1:8000',
        'existingKeyPreserved': True}
    assert not (tmp_path / '.test-tmp').exists()


@pytest.mark.parametrize('flags,blocked', [
    ({}, True), ({'configured_development': True}, False),
    ({'configured_development': 'true'}, True),
    ({'configured_development': True, 'isolated_development': True}, True),
    ({'configured_development': True, 'supabase_url': ''}, True),
    ({'configured_development': False}, True),
])
def test_configured_access_is_explicit_and_never_granted_to_isolated_mode(flags, blocked):
    config = {'development': False, 'environment': 'production',
              'supabase_url': 'https://fixture-configured.example.invalid', **flags}
    literal = 'json_decode(' + json.dumps(json.dumps(config)) + ',true)'
    script = 'require ' + json.dumps(str(ROOT / 'api/src/development_safety.php')) + ';'
    script += 'echo json_encode(development_configuration_error(' + literal + ",'cli-server')!==null);"
    result = subprocess.run([PHP, '-r', script], cwd=ROOT, stdin=subprocess.DEVNULL,
                            capture_output=True, text=True, timeout=15)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) is blocked


@pytest.mark.parametrize('normal,isolated,private_flags,expected', [
    ('1', '0', {}, 200), ('0', '0', {}, 503),
    ('1', '1', {}, 200), ('1', '0', {'supabase_url': ''}, 503),
    ('0', '0', {'configured_development': True}, 503),
    ('1', '0', {'configured_development': False}, 200),
])
def test_real_php_loader_preserves_private_config_only_for_explicit_normal_startup(
        tmp_path, normal, isolated, private_flags, expected):
    shutil.copytree(ROOT / 'api', tmp_path / 'api', ignore=shutil.ignore_patterns('config.local.php'))
    fixture = {'supabase_url': 'https://fixture-configured.example.invalid',
               'supabase_secret_key': 'fixture-existing-key',
               'token_secret': 'fixture-existing-signing-secret',
               'development': False, 'environment': 'production',
               'smtp': {'enabled': True}, **private_flags}
    private_file = tmp_path / 'api/config/config.local.php'
    literal = 'json_decode(' + json.dumps(json.dumps(fixture)) + ',true)'
    private_file.write_text('<?php return ' + literal + ';')
    original_bytes = private_file.read_bytes()
    router = tmp_path / 'probe.php'
    router.write_text("""<?php require __DIR__.'/api/src/common.php';
$c=app_config();echo json_encode([
'configured'=>$c['configured_development'],'isolated'=>$c['isolated_development'],
'existingDatabase'=>$c['supabase_url']==='https://fixture-configured.example.invalid',
'existingKey'=>$c['supabase_secret_key']==='fixture-existing-key',
'existingSigningSecret'=>$c['token_secret']==='fixture-existing-signing-secret',
'development'=>$c['development'],'smtpEnabled'=>$c['smtp']['enabled']]);""")
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    env = {**os.environ, 'TVTMS_CONFIGURED_DEV': normal, 'TVTMS_ISOLATED_DEV': isolated}
    with (tmp_path / 'server.log').open('w') as log:
        server = subprocess.Popen([PHP, '-S', f'127.0.0.1:{port}', '-t', str(tmp_path), str(router)],
                                  cwd=tmp_path, env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=log)
        try:
            deadline = time.monotonic() + 20
            while True:
                try:
                    with urllib.request.urlopen(f'http://127.0.0.1:{port}/probe', timeout=3) as response:
                        status, data = response.status, json.load(response)
                    break
                except urllib.error.HTTPError as error:
                    status, data = error.code, json.load(error)
                    break
                except (urllib.error.URLError, TimeoutError):
                    if time.monotonic() >= deadline:
                        pytest.fail('Fixture-only PHP probe failed to start')
                    time.sleep(0.05)
            assert status == expected
            if expected == 503:
                assert data['errorCode'] == 'DEVELOPMENT_DATABASE_BLOCKED'
            elif isolated == '1':
                assert data == {'configured': False, 'isolated': True,
                                'existingDatabase': False, 'existingKey': False,
                                'existingSigningSecret': False, 'development': True, 'smtpEnabled': False}
            else:
                assert data == {'configured': True, 'isolated': False,
                                'existingDatabase': True, 'existingKey': True,
                                'existingSigningSecret': True, 'development': False, 'smtpEnabled': True}
        finally:
            server.terminate()
            server.wait(timeout=10)
    assert private_file.read_bytes() == original_bytes
    assert 'Supabase error' not in (tmp_path / 'server.log').read_text()
