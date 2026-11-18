"""Final QA F1/F2/F3 regressions; no production network, secrets or mutations."""
import json
import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
PHP = os.environ.get('TVTMS_PHP', 'C:/tools/php83/php.exe')


@pytest.mark.parametrize('role,actor,header,expected', [
    ('apprehending_officer', 7, '*/14', 14),
    ('admin', 1, '*/27', 27),
    ('apprehending_officer', 7, '*/0', 0),
])
def test_today_count_is_exact_manila_scoped_and_not_paginated(role, actor, header, expected):
    script = f'''
$calls=[];
function require_role(array $roles): array {{ return ['role'=>{json.dumps(role)},'id'=>{actor}]; }}
function manila_today(): string {{ return '2026-10-04'; }}
function supabase_rpc(string $name,array $args): array {{ return ['total'=>27,'paid'=>3,'unpaid'=>24]; }}
function supabase_request(string $method,string $path,array $query=[],mixed $body=null,array $headers=[]): array {{
 global $calls;$calls[]=[$method,$path,$query,$headers];
 return ['headers'=>['content-range'=>{json.dumps(header)}],'data'=>[]];
}}
function ok(string $message,mixed $data=null,array $extra=[]): never {{global $calls;echo json_encode(['stats'=>$data,'calls'=>$calls]);exit;}}
require {json.dumps(str(ROOT / 'api/src/handlers/tickets.php'))};
tickets_stats();'''
    result = subprocess.run([PHP, '-r', script], cwd=ROOT, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=10)
    assert result.returncode == 0, result.stderr
    value = json.loads(result.stdout)
    assert value['stats']['today'] == expected
    assert value['stats']['total'] == 27
    method, path, filters, headers = value['calls'][0]
    assert method == 'GET' and path == '/rest/v1/tickets'
    assert filters['date_issued'] == 'eq.2026-10-04'
    assert filters['limit'] == 0 and 'Prefer: count=exact' in headers
    if role == 'apprehending_officer':
        assert filters['user_id'] == f'eq.{actor}'
    else:
        assert 'user_id' not in filters


def test_missing_exact_count_is_an_error_not_a_false_zero():
    script = f'''
function require_role(array $roles): array {{return ['role'=>'apprehending_officer','id'=>7];}}
function manila_today(): string {{return '2026-10-04';}}
function supabase_rpc(string $name,array $args): array {{return ['total'=>14];}}
function supabase_request(string $method,string $path,array $query=[],mixed $body=null,array $headers=[]): array {{return ['headers'=>['content-range'=>'*/*'],'data'=>[]];}}
function ok(string $message,mixed $data=null,array $extra=[]): never {{echo 'FALSE_SUCCESS';exit;}}
require {json.dumps(str(ROOT / 'api/src/handlers/tickets.php'))};
try{{tickets_stats();}}catch(RuntimeException $e){{echo 'COUNT_UNAVAILABLE';}}
'''
    result = subprocess.run([PHP, '-r', script], cwd=ROOT, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=10)
    assert result.returncode == 0, result.stderr
    assert result.stdout == 'COUNT_UNAVAILABLE'


def test_api_and_officer_dashboard_runtime_regressions():
    result = subprocess.run(['node', '--test', 'tests/final-qa-client-runtime.mjs'], cwd=ROOT,
                            stdin=subprocess.DEVNULL, capture_output=True, text=True, encoding='utf-8', timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr


def test_outstanding_forward_correction_runtime():
    result = subprocess.run(['node', '--test', 'tests/final-qa-database-runtime.mjs'], cwd=ROOT,
                            stdin=subprocess.DEVNULL, capture_output=True, text=True, encoding='utf-8', timeout=180)
    assert result.returncode == 0, result.stdout + result.stderr
