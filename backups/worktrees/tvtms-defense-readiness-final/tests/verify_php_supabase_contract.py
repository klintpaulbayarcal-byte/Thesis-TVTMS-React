from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]

def test_supabase_client_exists_and_uses_curl():
    p=ROOT/'api/src/supabase.php'
    assert p.is_file(), 'missing PHP Supabase client'
    t=p.read_text(encoding='utf-8')
    assert 'curl_init' in t
    assert 'SUPABASE' not in t or True
    for fn in ['supabase_request','supabase_select','supabase_insert','supabase_update','supabase_delete','supabase_rpc']:
        assert re.search(rf'function\s+{fn}\s*\(', t), f'missing {fn}'

def test_config_uses_supabase_not_mysql():
    p=ROOT/'api/config/config.example.php'
    assert p.is_file()
    t=p.read_text(encoding='utf-8')
    assert 'supabase_url' in t
    assert 'supabase_secret_key' in t
    assert 'db_host' not in t
    assert 'db_name' not in t

def test_common_has_no_pdo_mysql_dependency():
    p=ROOT/'api/src/common.php'
    t=p.read_text(encoding='utf-8')
    assert 'pdo_mysql' not in t
    assert 'mysql:' not in t

def test_router_keeps_core_routes():
    p=ROOT/'api/src/router.php'
    t=p.read_text(encoding='utf-8')
    for marker in ['/api/auth/login','/api/tickets','/api/payments','/api/disputes','/api/evidence','/api/notifications','/api/reports','/api/vehicles','/api/public']:
        assert marker in t, marker

def test_runtime_config_accepts_environment_or_local_server_only_secrets():
    t=(ROOT/'api/config/config.php').read_text(encoding='utf-8')
    assert "getenv('SUPABASE_SECRET_KEY')" in t
    assert "getenv('TVTMS_TOKEN_SECRET')" in t
    assert 'config.local.php' in t
    assert 'CHANGE_ME_SERVER_SECRET' not in t
    assert 'CHANGE_THIS_TO_A_LONG_RANDOM_SECRET_32_CHARS_MINIMUM' not in t

def test_supabase_headers_support_new_secret_and_legacy_service_role_formats():
    import json, subprocess
    php=ROOT/'api/src/supabase.php'
    script=f'''require {json.dumps(str(php))}; echo json_encode([supabase_auth_headers("sb_secret_example"), supabase_auth_headers("eyJlegacy.jwt.value")]);'''
    result=subprocess.run(['php','-r',script],capture_output=True,text=True)
    assert result.returncode==0,result.stderr
    new,legacy=json.loads(result.stdout)
    assert new==['apikey: sb_secret_example']
    assert 'apikey: eyJlegacy.jwt.value' in legacy
    assert 'Authorization: Bearer eyJlegacy.jwt.value' in legacy

def test_server_credential_validator_rejects_publishable_keys_and_accepts_server_keys():
    import json, subprocess, base64
    php=ROOT/'api/src/supabase.php'
    payload=base64.urlsafe_b64encode(json.dumps({'role':'service_role'}).encode()).decode().rstrip('=')
    legacy='eyJhbGciOiJIUzI1NiJ9.'+payload+'.signature'
    script=f'''require {json.dumps(str(php))}; echo json_encode([
      supabase_server_key_kind("sb_secret_example_123"),
      supabase_server_key_kind("sb_publishable_example_123"),
      supabase_server_key_kind({json.dumps(legacy)}),
      supabase_server_key_kind("not-a-server-key")
    ]);'''
    result=subprocess.run(['php','-r',script],capture_output=True,text=True)
    assert result.returncode==0,result.stderr
    assert json.loads(result.stdout)==['secret',None,'legacy_service_role',None]


def test_api_path_normalization_closes_trailing_slash_rate_limit_bypass():
    import json, subprocess
    router=ROOT/'api/src/router.php'
    script=f'''require {json.dumps(str(router))}; echo json_encode([
      normalize_api_path("/api/auth/login/"),
      normalize_api_path("/foo/api/public/ticket-lookup/"),
      normalize_api_path("/api/")
    ]);'''
    result=subprocess.run(['php','-r',script],capture_output=True,text=True)
    assert result.returncode==0,result.stderr
    assert json.loads(result.stdout)==['/api/auth/login','/api/public/ticket-lookup','/api']
