"""Real PHP authorization functions and handlers; fixture JWTs stay offline."""
import json
import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def php_function(source, name):
    start = source.index('function ' + name + '(')
    brace = source.index('{', start)
    depth = 0
    for end in range(brace, len(source)):
        depth += (source[end] == '{') - (source[end] == '}')
        if depth == 0:
            return source[start:end + 1]
    raise AssertionError(name)


def request(handler_file, invocation, role='apprehending_officer', status='active'):
    common = (ROOT / 'api/src/common.php').read_text()
    helpers = '\n'.join(php_function(common, name) for name in
                        ('bearer_token', 'current_user', 'require_role'))
    script = r'''
require __AUTH__;
function app_config(){return ['token_secret'=>str_repeat('OFFLINE-QA-',8)];}
function supabase_select($table,$filters,$options){
 if($table==='users')return [['id'=>100,'name'=>'QA only','role'=>__ROLE__,'status'=>__STATUS__,'password'=>'QA-only-hash']];
 return [];
}
function supabase_rpc($name,$arguments=[]){
 $GLOBALS['rpc_calls'][]=['name'=>$name,'args'=>$arguments];
 if($name==='tvtms_ticket_detail')return ['id'=>101,'user_id'=>999];
 if($name==='tvtms_ticket_list')return ['tickets'=>[],'total'=>0];
 throw new RuntimeException('Unexpected mutation boundary');
}
function json_input(){throw new RuntimeException('Write payload was read before authorization');}
function rpc_domain_error($result){return null;}
function fail($message,$status,$code){echo json_encode(['status'=>$status,'code'=>$code,'rpc'=>$GLOBALS['rpc_calls']??[]]);exit;}
function ok($message,$data=null,$extra=[]){echo json_encode(['status'=>200,'extra'=>$extra,'rpc'=>$GLOBALS['rpc_calls']??[]]);exit;}
$_SERVER['HTTP_AUTHORIZATION']='Bearer '.token_sign(['id'=>100,'role'=>'admin','pwd'=>token_password_fingerprint('QA-only-hash')],app_config()['token_secret']);
$_GET=['enforcerId'=>999,'officerId'=>999];
__HELPERS__
require __HANDLER__;
__INVOCATION__
'''
    replacements = {
        'AUTH': json.dumps(str(ROOT / 'api/src/auth.php')),
        'ROLE': json.dumps(role), 'STATUS': json.dumps(status), 'HELPERS': helpers,
        'HANDLER': json.dumps(str(ROOT / 'api/src/handlers' / handler_file)),
        'INVOCATION': invocation,
    }
    for key, value in replacements.items():
        script = script.replace('__' + key + '__', value)
    result = subprocess.run([os.environ.get('TVTMS_PHP', 'php'), '-r', script], cwd=ROOT,
                            text=True, capture_output=True, timeout=15)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


@pytest.mark.parametrize('file,call', [
    ('payments.php', 'payments_record();'),
    ('tickets.php', "tickets_permanent_delete(['id'=>101]);"),
    ('tickets.php', "tickets_cancel(['id'=>101]);"),
    ('users.php', 'users_create();'),
    ('users.php', "users_unlock(['id'=>101]);"),
    ('settings.php', 'settings_update();'),
    ('violations.php', 'violations_create();'),
    ('disputes.php', "disputes_resolve(['id'=>101]);"),
])
def test_officer_cannot_call_administrator_mutations_even_with_admin_role_claim(file, call):
    result = request(file, call)
    assert result == {'status': 403, 'code': 'FORBIDDEN', 'rpc': []}


def test_administrator_cannot_issue_citations():
    assert request('tickets.php', 'tickets_create();', role='admin') == {
        'status': 403, 'code': 'FORBIDDEN', 'rpc': []}


def test_inactive_account_is_rejected_before_any_ticket_query():
    assert request('tickets.php', 'tickets_list();', status='inactive') == {
        'status': 401, 'code': 'INVALID_SESSION', 'rpc': []}


def test_officer_cannot_open_another_officers_details():
    result = request('tickets.php', "tickets_get_one(['id'=>101]);")
    assert result['status'] == 403
    assert result['code'] == 'TICKET_ACCESS_DENIED'
    assert len(result['rpc']) == 1


def test_officer_list_scope_is_derived_from_verified_account_not_supplied_filters():
    result = request('tickets.php', 'tickets_list();')
    assert result['status'] == 200
    assert result['rpc'][0]['args']['p_filters']['officerId'] == 100
