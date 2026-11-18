import json
import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
PHP = os.environ.get('TVTMS_PHP', 'C:/tools/php83/php.exe')


def php_json(script):
    result = subprocess.run([PHP, '-r', script], cwd=ROOT, capture_output=True, text=True, timeout=10)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def eligibility(overrides=None, now='2026-09-27T00:00:00+08:00'):
    ticket = {'status': 'unpaid', 'date_issued': '2026-09-12', 'total_paid': 0,
              'has_recorded_payment': False, 'has_open_dispute': 0, 'dispute_deadline_days': 15}
    ticket.update(overrides or {})
    return php_json(f'''require {json.dumps(str(ROOT / 'api/src/handlers/public.php'))};
echo json_encode(public_dispute_eligibility_message(json_decode({json.dumps(json.dumps(ticket))},true),new DateTimeImmutable({json.dumps(now)})));''')


@pytest.mark.parametrize('paid', [0.01, 1999, 2000])
def test_lookup_blocks_any_paid_amount_even_with_unpaid_ticket_status(paid):
    assert eligibility({'total_paid': paid}) == 'Tickets with any recorded payment cannot be disputed.'


def test_lookup_blocks_voided_payment_history_with_zero_net_paid():
    assert eligibility({'has_recorded_payment': True, 'total_paid': 0}) == 'Tickets with any recorded payment cannot be disputed.'


def test_lookup_allows_unpaid_ticket_on_last_manila_dispute_day():
    assert eligibility(now='2026-09-27T23:59:59+08:00') == ''


def test_lookup_expires_at_manila_midnight_not_utc_midnight():
    assert eligibility(now='2026-09-27T16:00:00+00:00') == 'The 15-day dispute period has ended.'


def test_lookup_preserves_active_dispute_guard():
    assert eligibility({'has_open_dispute': 1}) == 'A dispute is already open for this ticket.'


def rate_script(directory, body):
    return f'''require {json.dumps(str(ROOT / 'api/src/common.php'))};
$dir={json.dumps(str(directory))};
{body}'''


def test_rate_limit_preserves_eight_submission_window_and_resets(tmp_path):
    result = php_json(rate_script(tmp_path, '''$r=[];
for($i=0;$i<9;$i++)$r[]=rate_limit_check('public-dispute-submit',8,1800,'203.0.113.8',1000,$dir);
$r[]=rate_limit_check('public-dispute-submit',8,1800,'203.0.113.8',2800,$dir);
echo json_encode($r);'''))
    assert all(row['allowed'] for row in result[:8])
    assert result[8]['allowed'] is False
    assert result[8]['retry_after'] == 1800
    assert result[9]['allowed'] is True


def test_rate_limit_rejects_uncreatable_storage(tmp_path):
    blocked = tmp_path / 'file'
    blocked.write_text('not a directory', encoding='utf-8')
    result = php_json(rate_script(blocked / 'limits', "echo json_encode(rate_limit_check('public-dispute-submit',8,1800,'ip',1000,$dir));"))
    assert result['allowed'] is False
    assert result['unavailable'] is True


@pytest.mark.parametrize('failure', ['open', 'lock', 'corrupt'])
def test_rate_limit_rejects_storage_or_lock_failure(tmp_path, failure):
    setup = {
        'open': 'mkdir($file);',
        'lock': "$held=fopen($file,'c+');if(!flock($held,LOCK_EX|LOCK_NB))exit(2);",
        'corrupt': "file_put_contents($file,'{broken json');",
    }[failure]
    result = php_json(rate_script(tmp_path, f'''$file=$dir.'/'.hash('sha256','public-dispute-submit|ip').'.json';
{setup}
echo json_encode(rate_limit_check('public-dispute-submit',8,1800,'ip',1000,$dir));'''))
    assert result['allowed'] is False
    assert result['unavailable'] is True
    assert result['retry_after'] > 0
