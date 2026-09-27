"""Isolated PHP handler checks. Fake Supabase reads; never connect to a database."""
import json
import subprocess
from pathlib import Path

import pytest

HANDLER = Path(__file__).resolve().parents[1] / 'api/src/handlers/contact_messages.php'


def invoke(role: str, message_id: object) -> dict:
    # No configuration loader, credentials, network client, or writes are loaded.
    script = r'''
$role = ''' + json.dumps(role) + r''';
$calls = [];
function require_role(array $roles): array {
    global $role;
    if ($role === 'anonymous') fail('Authentication required.', 401, 'AUTH_REQUIRED');
    if (!in_array($role, $roles, true)) fail('Access denied.', 403, 'FORBIDDEN');
    return ['id'=>1, 'role'=>$role];
}
function supabase_select(string $table, array $filters, array $options): array {
    global $calls;
    $calls[] = compact('table','filters','options');
    if (($filters['id'] ?? '') !== 'eq.11') return [];
    return [['id'=>11,'full_name'=>'QA TEST CONTACT','email'=>'qa-contact@example.invalid',
             'subject'=>'QA_TEST_CONTACT','message'=>'Synthetic contact message.',
             'status'=>'new','created_at'=>'2026-09-18T00:00:00+08:00']];
}
function fail(string $message, int $status, string $code): never {
    global $calls;
    echo json_encode(['status'=>$status,'errorCode'=>$code,'calls'=>$calls]); exit;
}
function json_response(array $payload, int $status=200): never {
    global $calls;
    echo json_encode(['status'=>$status,'payload'=>$payload,'calls'=>$calls]); exit;
}
require ''' + json.dumps(str(HANDLER)) + r''';
contact_messages_get_one(['id'=>''' + json.dumps(message_id) + r''']);
'''
    result = subprocess.run(['php', '-r', script], capture_output=True, text=True, timeout=5)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


@pytest.mark.parametrize('role,status,error', [
    ('anonymous', 401, 'AUTH_REQUIRED'),
    ('apprehending_officer', 403, 'FORBIDDEN'),
])
def test_private_contact_message_rejects_other_roles_before_supabase(role, status, error):
    result = invoke(role, 11)
    assert result['status'] == status
    assert result['errorCode'] == error
    assert result['calls'] == []


def test_admin_get_one_is_read_only_with_consistent_api_response():
    result = invoke('admin', 11)
    assert result['status'] == 200
    body = result['payload']
    assert body['success'] is True
    assert isinstance(body['message'], str), 'API message should remain a human-readable string'
    assert body['data']['id'] == 11
    assert body['data']['status'] == 'new'
    assert result['calls'] == [{
        'table': 'contact_messages',
        'filters': {'id': 'eq.11'},
        'options': {'select': 'id,full_name,email,subject,message,status,created_at', 'limit': 1},
    }]


@pytest.mark.parametrize('message_id', [0, -1, 9999])
def test_invalid_or_missing_contact_message_is_not_found(message_id):
    result = invoke('admin', message_id)
    assert result['status'] == 404
    assert result['errorCode'] == 'CONTACT_MESSAGE_NOT_FOUND'
    assert len(result['calls']) == (1 if message_id == 9999 else 0)


def test_contact_modal_has_a_programmatic_accessible_name():
    modal = (HANDLER.parents[3] / 'src/components/Modal.jsx').read_text(encoding='utf-8')
    assert 'useId' in modal
    assert 'aria-labelledby={titleId}' in modal
    assert '<h2 id={titleId}>' in modal
