"""Isolated contact-flow contract: no database, network, real email, or secrets."""
import base64
import json
import subprocess
from pathlib import Path

HANDLER = Path(__file__).resolve().parents[1] / 'api/src/handlers/public.php'


def invoke(mode='accepted', admins=None, payload=None, db_error=False):
    if admins is None:
        admins = [{'id': 1, 'email': 'admin@example.invalid'}, {'id': 2, 'email': 'admin@example.invalid'}]
    if payload is None:
        payload = {'fullName': 'Visitor <script>alert(1)</script>', 'email': 'visitor@example.invalid',
                   'subject': 'Citation <b>query</b>', 'message': 'Please investigate <img src=x onerror=alert(1)>.'}
    script = r'''
$payload = json_decode(base64_decode(''' + repr(base64.b64encode(json.dumps(payload).encode()).decode()) + r'''), true);
$admins = json_decode(base64_decode(''' + repr(base64.b64encode(json.dumps(admins).encode()).decode()) + r'''), true);
$mode = json_decode(base64_decode(''' + repr(base64.b64encode(json.dumps(mode).encode()).decode()) + r'''), true);
$dbError = json_decode(base64_decode(''' + repr(base64.b64encode(json.dumps(db_error).encode()).decode()) + r'''), true);
$calls = []; $mails = [];
function json_input(): array { global $payload; return $payload; }
function clean_string($value, int $limit): string { return substr(trim((string)$value),0,$limit); }
function normalize_email($value): string { return strtolower(trim((string)$value)); }
function supabase_rpc(string $name, array $args): array {
 global $calls, $dbError; $calls[]=['rpc'=>$name,'args'=>$args];
 if($dbError) return ['errorCode'=>'DB_ERROR','message'=>'Database failed','statusCode'=>503];
 return ['contactId'=>41];
}
function rpc_domain_error($r) { return isset($r['errorCode']) ? $r : null; }
function fail_domain($error): never { echo json_encode(['failure'=>$error]); exit; }
function supabase_select(string $table,array $filters,array $options): array {
 global $calls,$admins; $calls[]=['table'=>$table,'filters'=>$filters,'options'=>$options]; return $admins;
}
function send_email(string $recipient,string $subject,string $html): array {
 global $mails,$mode; $mails[]=compact('recipient','subject','html');
 return ['status'=>$mode==='accepted'?'accepted':'failed','errorCode'=>$mode==='accepted'?null:'smtp_rejected'];
}
function send_basic_email(string $recipient,string $subject,string $html): bool { return send_email($recipient,$subject,$html)['status']==='accepted'; }
function json_response(array $body,int $status=200): never { global $calls,$mails; echo json_encode(compact('body','status','calls','mails')); exit; }
function fail(string $message,int $status,string $code): never { global $calls,$mails; echo json_encode(['failure'=>compact('message','status','code'),'calls'=>$calls,'mails'=>$mails]); exit; }
require ''' + json.dumps(str(HANDLER)) + r'''; public_contact();
'''
    result = subprocess.run(['php', '-r', script], text=True, capture_output=True, timeout=8)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def test_contact_saved_notifies_unique_active_admin_and_confirms_sender():
    result = invoke()
    assert result['status'] == 201
    assert result['body']['success'] is True
    assert result['body']['contact_id'] == 41
    assert result['body']['email_status'] == {'administrator': 'accepted', 'confirmation': 'accepted'}
    assert len(result['mails']) == 2
    assert result['mails'][0]['recipient'] == 'admin@example.invalid'
    assert result['mails'][1]['recipient'] == 'visitor@example.invalid'
    assert '&lt;script&gt;' in result['mails'][0]['html']
    assert '<script>' not in result['mails'][0]['html']
    assert '&lt;img' in result['mails'][0]['html']
    assert 'visitor@example.invalid' not in str(result['body'])


def test_mail_failure_does_not_erase_saved_contact_or_claim_email_sent():
    result = invoke(mode='failed')
    assert result['status'] == 201
    assert result['body']['success'] is True
    assert result['body']['contact_id'] == 41
    assert result['body']['email_status'] == {'administrator': 'failed', 'confirmation': 'failed'}
    assert 'sent successfully' not in result['body']['message'].lower()
    assert 'saved' in result['body']['message'].lower()


def test_missing_admin_mailbox_saves_contact_and_reports_no_recipient():
    result = invoke(admins=[{'id': 1, 'email': 'invalid-address'}])
    assert result['status'] == 201
    assert result['body']['email_status']['administrator'] == 'no_recipient'
    assert [m['recipient'] for m in result['mails']] == ['visitor@example.invalid']


def test_database_error_prevents_all_outbound_mail():
    result = invoke(db_error=True)
    assert 'failure' in result
    assert result.get('mails', []) == []
