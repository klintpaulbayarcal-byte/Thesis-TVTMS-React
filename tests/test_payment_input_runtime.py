"""Real payment PHP boundary, with a double that stops before database writes."""
import json
import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def payment_input(changes):
    payload = {'ticket_id': 101, 'official_receipt_number': 'QA-ONLY-RECEIPT',
               'amount_paid': 100, 'payment_date': '2026-10-21', 'payment_method': 'cash'}
    payload.update(changes)
    script = r'''
function require_role($roles){return ['id'=>1];}
function json_input(){return json_decode(__INPUT__,true);}
function clean_string($value,$length){return substr(trim((string)$value),0,$length);}
function manila_today(){return '2026-10-21';}
function fail($message,$status,$code){echo json_encode(['status'=>$status,'code'=>$code,'rpc'=>false]);exit;}
function supabase_rpc($name,$args){echo json_encode(['status'=>200,'rpc'=>true,'args'=>$args]);exit;}
require __HANDLER__;
payments_record();
'''
    script = script.replace('__INPUT__', json.dumps(json.dumps(payload)))
    script = script.replace('__HANDLER__', json.dumps(str(ROOT / 'api/src/handlers/payments.php')))
    result = subprocess.run([os.environ.get('TVTMS_PHP', 'php'), '-r', script], cwd=ROOT,
                            stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=15)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


@pytest.mark.parametrize('amount', [True, False, [100], {'amount': 100}, '100oops', '1e999', None])
def test_invalid_amount_types_never_reach_payment_rpc(amount):
    assert payment_input({'amount_paid': amount}) == {
        'status': 400, 'code': 'VALIDATION_ERROR', 'rpc': False}


@pytest.mark.parametrize('ticket_id', [True, [101], {'id': 101}, 101.5, '101trailing'])
def test_invalid_ticket_identifiers_never_reach_payment_rpc(ticket_id):
    assert payment_input({'ticket_id': ticket_id}) == {
        'status': 400, 'code': 'VALIDATION_ERROR', 'rpc': False}


@pytest.mark.parametrize('receipt', [True, [123], {'receipt': 123}, 123])
def test_receipt_must_be_text_before_any_write(receipt):
    assert payment_input({'official_receipt_number': receipt}) == {
        'status': 400, 'code': 'VALIDATION_ERROR', 'rpc': False}


@pytest.mark.parametrize('amount', [100, 100.25, '100.25'])
def test_valid_amounts_preserve_exact_payment_arguments(amount):
    result = payment_input({'amount_paid': amount})
    assert result['status'] == 200 and result['rpc'] is True
    assert result['args']['p_ticket_id'] == 101
    assert result['args']['p_amount'] == float(amount)
    assert result['args']['p_receipt'] == 'QA-ONLY-RECEIPT'
