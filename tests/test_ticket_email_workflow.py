"""Isolated notification workflow regressions: no live DB and no real email."""
import json
import os
import subprocess
import pytest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PHP=os.environ.get('TVTMS_PHP') or 'php'
WORKFLOW=ROOT/'api/src/ticket_email.php'
HANDLER=ROOT/'api/src/handlers/tickets.php'

CLAIMED={'status':'claimed','ticketId':44,'ticketNumber':'TVT-2026-000123','recipient':'recipient@example.test','plateNumber':'ABC1234','violationName':'Illegal Parking','penaltyAmount':1500,'attemptCount':1}


def run_php(script):
    result=subprocess.run([str(PHP),'-r',script],cwd=ROOT,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=12)
    assert result.returncode==0,result.stderr
    return json.loads(result.stdout)


def invoke_attempt(claim,mail_status='accepted',finalize_error=False):
    script='''$calls=[];$mail=[];
function app_config():array{return ['app_public_url'=>'https://trafficviolation.dcsbisu.com'];}
function mask_email(string $email):?string{return 're***@example.test';}
function rpc_domain_error(mixed $result):?array{return null;}
function supabase_select(string $table,array $filters=[],array $options=[]):array{
 global $calls;$calls[]=['select',$table];return [['id'=>44,'user_id'=>7,'citation_version'=>2,'driver_email_at_issue'=>'recipient@example.test','owner_email_at_issue'=>'mutated@example.test']];
}
function supabase_rpc(string $name,array $args=[]):mixed{
 global $calls;$calls[]=['rpc',$name,$args];
 if($name==='tvtms_ticket_email_claim')return CLAIM;
 if(FINALIZE_ERROR)throw new RuntimeException('finalize failed');
 return ['status'=>$args['p_status']??'failed'];
}
function send_email(string $to,string $subject,string $html):array{
 global $mail;$mail=[$to,$subject,$html];return MAIL_RESULT;
}
require SOURCE;
$result=ticket_notification_attempt(7,['id'=>44],'recipient@example.test');
echo json_encode(['result'=>$result,'calls'=>$calls,'mail'=>$mail]);'''
    bindings={'CLAIM':f'json_decode({json.dumps(json.dumps(claim))},true)',
              'MAIL_RESULT':f'json_decode({json.dumps(json.dumps({"status":mail_status,"errorCode":None if mail_status=="accepted" else "transport_error","message":"mail outcome"}))},true)',
              'FINALIZE_ERROR':'true' if finalize_error else 'false','SOURCE':json.dumps(str(WORKFLOW))}
    for k,v in bindings.items():script=script.replace(k,v)
    return run_php(script)


def test_canonical_claim_recipient_and_complete_message_are_used():
    output=invoke_attempt(CLAIMED)
    assert output['result']['status']=='accepted'
    assert output['result']['recipientMasked']=='re***@example.test'
    recipient,subject,html=output['mail']
    assert recipient=='recipient@example.test'
    for expected in ['TVT-2026-000123','Illegal Parking','1,500.00','ABC1234','/ticket-lookup?ticket=TVT-2026-000123']:
        assert expected in subject+html
    assert [c[1] for c in output['calls']]==['tickets','tvtms_ticket_email_claim','tvtms_ticket_email_finalize']


def test_revised_citation_email_lists_each_violation_and_deadline_without_private_fields():
    claim={**CLAIMED,'penaltyAmount':300,'dateIssued':'2026-09-30','timeIssued':'10:15:00',
           'appearanceDueDate':'2026-10-07','violations':[
               {'violation_code':'A','violation_name':'First offense type','penalty_amount':150},
               {'violation_code':'B','violation_name':'Second offense type','penalty_amount':150},
           ]}
    recipient,subject,html=invoke_attempt(claim)['mail']
    assert recipient=='recipient@example.test'
    for value in ['First offense type','Second offense type','150.00','300.00',
                  '2026-09-30','10:15:00','2026-10-07','/ticket-lookup?ticket=TVT-2026-000123']:
        assert value in subject+html
    for private in ['mutated@example.test','TEST-LICENSE','driver@example.test','ticketId']:
        assert private not in subject+html
    assert '<strong>Violation:</strong>' not in html


def test_non_claimable_states_never_call_the_mail_transport():
    for status in ['already_accepted','sending','unknown','not_applicable']:
        out=invoke_attempt({'status':status,'ticketId':44,'ticketNumber':'TVT-2026-000123'})
        assert out['result']['status']==status
        assert out['mail']==[]
        assert [c[1] for c in out['calls']]==['tickets','tvtms_ticket_email_claim']


def test_finalize_failure_after_smtp_acceptance_returns_unknown_without_retry():
    out=invoke_attempt(CLAIMED,finalize_error=True)
    assert out['result']['status']=='unknown'
    assert out['result']['retryAllowed'] is False
    assert len(out['mail'])==3


def test_failed_transport_is_finalized_and_can_be_retried_after_confirmation():
    out=invoke_attempt(CLAIMED,mail_status='failed')
    assert out['result']['status']=='failed'
    assert out['result']['retryAllowed'] is True
    finalize=out['calls'][-1]
    assert finalize[1]=='tvtms_ticket_email_finalize'
    assert finalize[2]['p_status']=='failed'
    assert finalize[2]['p_error_code']=='transport_error'


@pytest.mark.parametrize('notification_throws', [False, True])
def test_citation_creation_attempts_driver_email_after_commit(notification_throws):
    script='''$calls=[];$notified=false;
function require_role(array $roles):array{return ['id'=>7,'role'=>'apprehending_officer'];}
function json_input():array{return ['ticket_number'=>'7258','plate_number'=>'ABC1234','vehicle_type'=>'car','vehicle_make'=>'Test Make','owner_name'=>'Owner','owner_address'=>'Address','driver_first_name'=>'Test','driver_last_name'=>'Driver','driver_address'=>'Address','driver_nationality'=>'Filipino','driver_email'=>'recipient@example.test','license_type'=>'Non-Professional','incident_date'=>'2026-09-30','incident_time'=>'09:00','expected_date'=>'2026-09-30','violation_ids'=>[3],'location'=>'Town Hall'];}
function text_length(string $v):int{return strlen($v);}
function normalize_plate($v):string{return strtoupper(trim((string)$v));}
function normalize_email($v):string{return strtolower(trim((string)$v));}
function clean_string($v,int $max=4000):string{return substr(trim((string)$v),0,$max);}
function rpc_domain_error(mixed $r):?array{return null;}
function fail_domain(array $err):never{exit(90);}
function fail(string $m,int $s=400,string $c='ERROR',array $x=[]):never{exit(91);}
function supabase_rpc(string $n,array $a=[]):mixed{global $calls;$calls[]=$n;return ['ticket'=>['id'=>44,'ticket_number'=>'TVT-2026-000123','owner_email'=>'recipient@example.test'],'penaltyInfo'=>[]];}
function log_audit(?int $id,string $action,?string $type=null,?int $entity=null,array $meta=[]):void{}
function ticket_notification_result(string $status,?string $masked,bool $retryAllowed,string $message,array $extra=[]):array{return ['status'=>$status,'message'=>$message];}
function ticket_notification_attempt(int $actor,array $ticket=[],?string $confirmed=null):array{global $notified;$notified=$confirmed!==null;if($GLOBALS['calls']!==['tvtms_ticket_create'])throw new RuntimeException('Attempt before commit');if(THROW_NOTIFICATION)throw new RuntimeException('Simulated transport outage');return ['status'=>'failed','retryAllowed'=>true,'message'=>'Simulated email failure.'];}
function ok(string $m,mixed $data=null,array $extra=[],int $s=200):never{echo json_encode(['status'=>$s,'ticket'=>$extra['ticket']??null,'notification'=>$extra['notification']??null,'calls'=>$GLOBALS['calls'],'sent'=>$GLOBALS['notified']]);exit;}
require SOURCE;tickets_create([]);'''
    out=run_php(script.replace('THROW_NOTIFICATION','true' if notification_throws else 'false').replace('SOURCE',json.dumps(str(HANDLER))))
    assert out['status']==201
    assert out['ticket']['id']==44
    assert out['notification']['status']==('unknown' if notification_throws else 'failed')
    assert out['sent'] is True
    assert out['calls']==['tvtms_ticket_create']


def test_retry_rejects_missing_confirmation_before_claim():
    script='''$calls=[];
function require_role(array $roles):array{return ['id'=>7,'role'=>'apprehending_officer'];}
function json_input():array{return [];}
function ticket_notification_attempt(int $actor,array $ticket=[],?string $confirmed=null):array{global $calls;$calls[]='attempt';return ['status'=>'accepted'];}
function supabase_rpc(string $n,array $a=[]):mixed{global $calls;$calls[]=$n;return [];}
function fail(string $m,int $s=400,string $c='ERROR',array $x=[]):never{echo json_encode(['status'=>$s,'code'=>$c,'calls'=>$GLOBALS['calls']]);exit;}
function ok(string $m,mixed $data=null,array $extra=[],int $s=200):never{echo json_encode(['status'=>$s]);exit;}
require SOURCE;tickets_retry_notification(['id'=>44]);'''
    out=run_php(script.replace('SOURCE',json.dumps(str(HANDLER))))
    assert out['status']==409
    assert out['code']=='NOTIFICATION_RECIPIENT_REQUIRED'
    assert out['calls']==[]


def test_retry_api_uses_dedicated_post_route_with_confirmation():
    script='''global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
let call=null;
global.fetch=async (url,options)=>{call={url,method:options.method,body:options.body};return new Response(JSON.stringify({success:true}),{status:200,headers:{'content-type':'application/json'}})};
const {API}=await import('./src/services/api.js');
await API.retryTicketNotification(44,{owner_email:'recipient@example.test',recipient_email_confirmed:true});
console.log(JSON.stringify(call));'''
    result=subprocess.run(['node','--input-type=module','-e',script],cwd=ROOT,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=10)
    assert result.returncode==0,result.stderr
    output=json.loads(result.stdout)
    assert output['url']=='/api/tickets/44/notification/retry'
    assert output['method']=='POST'
    assert json.loads(output['body'])=={'owner_email':'recipient@example.test','recipient_email_confirmed':True}
