"""Executable regressions for the two localhost findings; no hosted services."""
import json
import os
from pathlib import Path
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]
PHP = os.environ.get('TVTMS_PHP', 'php')
UNSAFE_ORIGINS = [
    'https://production.example.invalid', 'http://192.0.2.1:8000',
    'http://localhost:59999', 'http://127.0.0.1:8001',
    'http://localhost.example.invalid:8000', 'http://user:fixture@localhost:8000',
    'http://127.0.0.1:8000/other', 'http://127.0.0.1:8000?target=other',
    'http://127.0.0.1:8000#other', 'https://localhost:8000',
]


def payment_boundary(changes, must_reject=False):
    fixture = {'ticket_id': 1, 'official_receipt_number': 'TEST-ONLY-OR',
               'amount_paid': 100, 'payment_method': 'cash', **changes}
    input_php = 'json_decode(' + json.dumps(json.dumps(fixture)) + ',true)'
    rpc = ("throw new Exception('Database write reached for invalid date');"
           if must_reject else "echo json_encode(['rpc'=>$name,'date'=>$args['p_date']]);exit;")
    script = '''function require_role($roles){return ['id'=>2];}
function json_input(){return INPUT;}
function clean_string($value,$max){return substr(trim((string)$value),0,$max);}
function manila_today(){return '2026-10-02';}
function fail($message,$status,$code){echo json_encode(['status'=>$status,'code'=>$code]);exit;}
function supabase_rpc($name,$args){RPC}
require HANDLER;payments_record();'''
    script = script.replace('INPUT', input_php).replace('RPC', rpc).replace(
        'HANDLER', json.dumps(str(ROOT / 'api/src/handlers/payments.php')))
    result = subprocess.run([PHP, '-r', script], cwd=ROOT, capture_output=True,
                            text=True, stdin=subprocess.DEVNULL, timeout=15)
    assert result.returncode == 0, result.stderr
    assert not result.stderr, result.stderr
    return json.loads(result.stdout)


@pytest.mark.parametrize('value', [
    'not-a-date', '2026-02-30', '2025-02-29', '2026-13-01',
    '2026-10-02T00:00:00Z', '2026-1-2', '2026-10-02 ',
    '', None, 123, True, [], {},
])
def test_supplied_invalid_payment_date_rejected_before_database_write(value):
    assert payment_boundary({'payment_date': value}, must_reject=True) == {
        'status': 400, 'code': 'INVALID_PAYMENT_DATE'}


@pytest.mark.parametrize('value', ['2026-10-02', '2026-10-01', '2024-02-29'])
def test_valid_payment_date_reaches_rpc_without_substitution(value):
    assert payment_boundary({'payment_date': value}) == {
        'rpc': 'tvtms_payment_record', 'date': value}


def test_omitted_payment_date_keeps_existing_today_default():
    assert payment_boundary({}) == {'rpc': 'tvtms_payment_record', 'date': '2026-10-02'}


def test_future_payment_date_still_rejected_before_database_write():
    assert payment_boundary({'payment_date': '2026-10-03'}, must_reject=True) == {
        'status': 400, 'code': 'INVALID_PAYMENT_DATE'}


def qa_env(origin, isolated=True):
    env = {key: value for key, value in os.environ.items()
           if key.upper() not in ('VITE_PHP_API_ORIGIN', 'TVTMS_ISOLATED_DEV')}
    env['TVTMS_ISOLATED_DEV'] = '1' if isolated else '0'
    if origin is not None:
        env['VITE_PHP_API_ORIGIN'] = origin
    return env


def run_node(script, env, cwd=ROOT):
    return subprocess.run(['node', '--input-type=module', '-e', script], cwd=cwd,
                          env=env, capture_output=True, text=True,
                          stdin=subprocess.DEVNULL, timeout=20)


@pytest.mark.parametrize('origin', UNSAFE_ORIGINS)
def test_actual_isolated_launcher_rejects_unsafe_origin_before_runtime_or_children(tmp_path, origin):
    scripts = tmp_path / 'scripts'
    scripts.mkdir()
    for name in ['dev-isolated.mjs', 'isolated-qa-safety.mjs']:
        shutil.copyfile(ROOT / 'scripts' / name, scripts / name)
    result = subprocess.run(['node', str(scripts / 'dev-isolated.mjs')], cwd=tmp_path,
                            env=qa_env(origin), capture_output=True, text=True,
                            stdin=subprocess.DEVNULL, timeout=15)
    assert result.returncode != 0
    assert 'Unsafe VITE_PHP_API_ORIGIN override' in result.stderr
    assert origin not in result.stderr  # Never echo potentially credential-bearing input.
    assert not (tmp_path / '.test-tmp').exists()
    assert 'TEST-ONLY local QA accounts' not in result.stdout
    assert 'Disposable migrated database' not in result.stdout


@pytest.mark.parametrize('origin', UNSAFE_ORIGINS)
def test_vite_independently_rejects_unsafe_origin_in_isolated_mode(origin):
    result = run_node("const {default:config}=await import('./vite.config.js');"
                      "config({mode:'development'});", qa_env(origin))
    assert result.returncode != 0
    assert 'Unsafe VITE_PHP_API_ORIGIN override' in result.stderr
    assert origin not in result.stderr


@pytest.mark.parametrize('origin', [None, '', 'http://127.0.0.1:8000',
                                  'http://127.0.0.1:8000/', 'http://localhost:8000',
                                  'http://localhost:8000/'])
def test_safe_origins_pin_child_environment_and_both_vite_proxies_to_isolated_php(origin):
    script = """import {isolatedQaEnvironment} from './scripts/isolated-qa-safety.mjs';
const env=isolatedQaEnvironment(process.env);
Object.assign(process.env,env);
const {default:config}=await import('./vite.config.js');
const server=config({mode:'development'}).server;
console.log(JSON.stringify({flag:env.TVTMS_ISOLATED_DEV,origin:env.VITE_PHP_API_ORIGIN,
 host:server.host,port:server.port,strictPort:server.strictPort,
 api:server.proxy['/api'].target,uploads:server.proxy['/uploads'].target}));"""
    result = run_node(script, qa_env(origin))
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == {
        'flag': '1', 'origin': 'http://127.0.0.1:8000', 'host': '127.0.0.1',
        'port': 5173, 'strictPort': True, 'api': 'http://127.0.0.1:8000',
        'uploads': 'http://127.0.0.1:8000'}


def test_windows_environment_aliases_cannot_bypass_origin_validation():
    script = """import {isolatedQaEnvironment} from './scripts/isolated-qa-safety.mjs';
import assert from 'node:assert/strict';
assert.throws(()=>isolatedQaEnvironment({VITE_PHP_API_ORIGIN:'http://127.0.0.1:8000',
 vite_php_api_origin:'https://production.example.invalid'}),/Unsafe VITE_PHP_API_ORIGIN/);
const env=isolatedQaEnvironment({vite_php_api_origin:'http://localhost:8000',OTHER:'unchanged'});
assert.equal(env.VITE_PHP_API_ORIGIN,'http://127.0.0.1:8000');
assert.equal(env.OTHER,'unchanged');assert.ok(!Object.hasOwn(env,'vite_php_api_origin'));"""
    result = run_node(script, qa_env(None))
    assert result.returncode == 0, result.stderr


def test_ordinary_development_and_production_build_configuration_unchanged():
    script = """import assert from 'node:assert/strict';
const {default:config}=await import('./vite.config.js');
const server=config({mode:'development'}).server;
assert.equal(server.proxy['/api'].target,'http://development.example.invalid:8000');
assert.equal(server.proxy['/uploads'].target,'http://development.example.invalid:8000');
assert.equal(server.host,undefined);assert.equal(server.strictPort,undefined);
assert.equal(config({mode:'production'}).server.proxy,undefined);"""
    result = run_node(script, qa_env('http://development.example.invalid:8000', isolated=False))
    assert result.returncode == 0, result.stderr
