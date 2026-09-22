"""Isolated email-sender tests: no database writes or real SMTP delivery."""
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PHP = os.environ.get('TVTMS_PHP') or 'php'
SOURCE = ROOT / 'api/src/ticket_email.php'


def attempt(snapshot='confirmed@example.test', claim_recipient='confirmed@example.test',
            confirmed=None, claimed_id=44, actor=7):
    claim = {'status': 'claimed', 'ticketId': claimed_id,
             'ticketNumber': 'TVT-2026-000044', 'recipient': claim_recipient,
             'plateNumber': 'ABC1234', 'violationName': 'Illegal Parking',
             'penaltyAmount': 500, 'attemptCount': 1}
    script = '''$calls=[];$mail=[];
function app_config():array{return ['app_public_url'=>'https://example.test'];}
function mask_email(string $email):?string{return 'masked';}
function rpc_domain_error(mixed $value):?array{return null;}
function supabase_select(string $table,array $filters=[],array $options=[]):array{
 global $calls;$calls[]=['select',$table,$filters,$options];
 return [['id'=>44,'user_id'=>7,'owner_email_at_issue'=>SNAPSHOT]];
}
function supabase_rpc(string $name,array $args=[]):mixed{
 global $calls;$calls[]=['rpc',$name,$args];
 return $name==='tvtms_ticket_email_claim'?CLAIM:['status'=>$args['p_status']??'failed'];
}
function send_email(string $to,string $subject,string $html):array{
 global $mail;$mail[]=$to;return ['status'=>'accepted'];
}
require SOURCE;
$r=ticket_notification_attempt(ACTOR,['id'=>44],CONFIRMED);
echo json_encode(['result'=>$r,'mail'=>$mail,'calls'=>$calls]);'''
    for key, value in {'SNAPSHOT': snapshot, 'CLAIM': claim, 'SOURCE': str(SOURCE),
                       'ACTOR': actor, 'CONFIRMED': confirmed}.items():
        script = script.replace(key, json.dumps(value))
    outcome = subprocess.run([str(PHP), '-r', script], cwd=ROOT,
                             capture_output=True, text=True, timeout=12)
    assert outcome.returncode == 0, outcome.stderr
    return json.loads(outcome.stdout)


def test_unconfirmed_recipient_never_claims_or_sends():
    result = attempt(confirmed=None)
    assert result['result']['status'] == 'no_confirmed_recipient'
    assert result['mail'] == []
    assert not any(c[0] == 'rpc' for c in result['calls'])


def test_correct_snapshot_and_explicit_confirmation_sends_once():
    result = attempt(confirmed='Confirmed@Example.Test')
    assert result['result']['status'] == 'accepted'
    assert result['mail'] == ['confirmed@example.test']
    assert any(c[:2] == ['select', 'tickets'] for c in result['calls'])


def test_claim_fallback_or_changed_email_never_reaches_transport():
    result = attempt(confirmed='confirmed@example.test', claim_recipient='stale@example.test')
    assert result['mail'] == []
    assert result['result']['status'] != 'accepted'
    assert any(c[:2] == ['rpc', 'tvtms_ticket_email_finalize'] for c in result['calls'])


def test_wrong_ticket_claim_cannot_send():
    result = attempt(confirmed='confirmed@example.test', claimed_id=45)
    assert result['mail'] == []
    assert result['result']['status'] != 'accepted'


def test_missing_snapshot_blocks_mutable_vehicle_fallback():
    result = attempt(snapshot=None, claim_recipient='old-vehicle@example.test',
                     confirmed='old-vehicle@example.test')
    assert result['mail'] == []
    assert not any(c[:2] == ['rpc', 'tvtms_ticket_email_claim'] for c in result['calls'])


def test_incorrect_confirmation_blocks_claim():
    result = attempt(confirmed='other@example.test')
    assert result['mail'] == []
    assert not any(c[:2] == ['rpc', 'tvtms_ticket_email_claim'] for c in result['calls'])
