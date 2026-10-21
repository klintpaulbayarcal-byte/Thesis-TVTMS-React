"""Real read-only PHP detail boundary and actual React delete predicates, offline."""
import json
import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def detail(link=None, state='unpaid', email=None, unavailable=False):
    case = dict(link=link, state=state, email=email, unavailable=unavailable)
    script = r'''
$case=json_decode(__CASE__,true);
function require_role($roles){return ['id'=>1,'role'=>'admin'];}
function supabase_rpc($name,$args){global $case;return ['id'=>18,'user_id'=>2,'ticket_number'=>'QA-ONLY','status'=>$case['state'],'penalty_amount'=>150,'has_dispute'=>false];}
function ticket_notification_read($ticket){return ['status'=>'not_recorded'];}
function supabase_select($table,$filters,$options){
 global $case;
 if($table==='tickets')return [['remarks'=>'QA only']];
 if(($options['select']??'')==='ticket_id,amount_paid,payment_status')return [];
 if($case['unavailable']&&$table==='disputes')throw new RuntimeException('QA unavailable');
 if($table===$case['link'])return [['ticket_id'=>18]];
 if($table==='ticket_email_notifications'&&$case['email']!==null)return [['ticket_id'=>18,'status'=>$case['email']]];
 return [];
}
function fail($message,$status,$code){throw new RuntimeException($code);}
function ok($message,$data=null,$extra=[]){echo json_encode($data);exit;}
require __HANDLER__;
tickets_get_one(['id'=>18]);
'''
    script = script.replace('__CASE__', json.dumps(json.dumps(case))).replace(
        '__HANDLER__', json.dumps(str(ROOT / 'api/src/handlers/tickets.php')))
    result = subprocess.run([os.environ.get('TVTMS_PHP', 'php'), '-r', script],
                            cwd=ROOT, text=True, capture_output=True, timeout=15)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


@pytest.mark.parametrize('link', ['payments', 'disputes', 'evidence', 'public_dispute_verifications'])
def test_any_historical_link_blocks_detail_deletion_even_without_open_dispute(link):
    result = detail(link=link)
    assert result.get('delete_eligible') is False
    assert link in result['delete_block_reason']


@pytest.mark.parametrize('state,email,eligible', [
    ('unpaid', None, True), ('cancelled', 'failed', True),
    ('unpaid', 'failed', False), ('cancelled', 'accepted', False),
    ('cancelled', 'sending', False), ('paid', None, False),
])
def test_detail_preserves_existing_failed_email_and_status_policy(state, email, eligible):
    assert detail(state=state, email=email).get('delete_eligible') is eligible


def test_detail_fails_closed_when_linked_record_check_is_unavailable():
    result = detail(unavailable=True)
    assert result.get('delete_eligible') is False
    assert 'cannot be checked' in result['delete_block_reason']


@pytest.mark.parametrize('eligibility', [False, None, True])
def test_actual_react_button_and_url_predicates_require_verified_eligibility(eligibility):
    script = r'''
const fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('src/pages/TicketDetails.jsx','utf8');
const ticket={status:'unpaid',has_dispute:false,delete_eligible:ELIGIBILITY};
const context={ticket,isAdmin:true,payments:[],evidence:[],notification:{status:'not_recorded'},effectiveStatus:'unpaid'};
const values=['canDelete','canReviewDelete'].map(name=>{
 const match=source.match(new RegExp('const '+name+' =?\\s*([\\s\\S]*?);')) || source.match(new RegExp('const '+name+'=([\\s\\S]*?);'));
 if(!match)throw Error('Missing actual predicate '+name);
 return vm.runInNewContext(match[1],context);
});
process.stdout.write(JSON.stringify(values));
'''.replace('ELIGIBILITY', json.dumps(eligibility))
    result = subprocess.run(['node', '-e', script], cwd=ROOT, text=True,
                            capture_output=True, timeout=15)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == [eligibility is True, eligibility is True]
