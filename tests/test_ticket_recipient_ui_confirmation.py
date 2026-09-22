"""Real API-boundary confirmation checks. No real network, DB or SMTP calls."""
import json
import subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]


def run_js(js):
    result=subprocess.run(['node','--input-type=module','-e',js],cwd=ROOT,
                          capture_output=True,text=True,timeout=12)
    assert result.returncode==0,result.stderr
    return json.loads(result.stdout)


def test_issuance_without_email_or_declined_confirmation_still_saves_ticket():
    js='''global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
let confirmations=0;const calls=[];
global.window={confirm:()=>{confirmations++;return false;},prompt:()=>null};
global.fetch=async(url,options)=>{calls.push({url,method:options.method,body:JSON.parse(options.body)});return new Response(JSON.stringify({success:true,ticket:{id:44}}),{status:201,headers:{'content-type':'application/json'}});};
const {API}=await import('./src/services/api.js');
await API.createTicket({owner_email:'prior-owner@example.test',plate_number:'ABC1234'});
await API.createTicket({owner_email:'',plate_number:'XYZ9999'});
console.log(JSON.stringify({calls,confirmations}));'''
    out=run_js(js)
    assert len(out['calls'])==2
    assert out['confirmations']==1
    assert all(call['body']['recipient_email_confirmed'] is False for call in out['calls'])
    assert all(call['method']=='POST' for call in out['calls'])


def test_issuance_confirmation_uses_current_address_in_single_ticket_request():
    js='''global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
let question='';let request=null;
global.window={confirm:q=>{question=q;return true;}};
global.fetch=async(url,options)=>{request={url,body:JSON.parse(options.body)};return new Response(JSON.stringify({success:true,ticket:{id:44}}),{status:201,headers:{'content-type':'application/json'}});};
const {API}=await import('./src/services/api.js');
await API.createTicket({owner_email:'CURRENT@example.test',plate_number:'NEW123'});
console.log(JSON.stringify({question,request}));'''
    out=run_js(js)
    assert 'CURRENT@example.test' in out['question']
    assert 'verify the intended recipient' in out['question'].lower()
    assert out['request']['body']['recipient_email_confirmed'] is True
    assert out['request']['body']['owner_email']=='CURRENT@example.test'


def test_retry_requires_fresh_entry_and_confirmation_and_cancel_does_not_send():
    js='''global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
let prompts=['','recipient@example.test','recipient@example.test'];let confirms=[false,true];let sent=[];
global.window={prompt:()=>prompts.shift(),confirm:()=>confirms.shift()};
global.fetch=async(url,options)=>{sent.push({url,body:JSON.parse(options.body)});return new Response(JSON.stringify({success:true,notification:{status:'accepted'}}),{status:200,headers:{'content-type':'application/json'}});};
const {API}=await import('./src/services/api.js');
const first=await API.retryTicketNotification(44);
const second=await API.retryTicketNotification(44);
const third=await API.retryTicketNotification(44);
console.log(JSON.stringify({first,second,third,sent}));'''
    out=run_js(js)
    assert len(out['sent'])==1
    assert out['sent'][0]['url']=='/api/tickets/44/notification/retry'
    assert out['sent'][0]['body']=={'owner_email':'recipient@example.test','recipient_email_confirmed':True}
    assert out['first']['notification']['status']=='confirmation_cancelled'
    assert out['second']['notification']['status']=='confirmation_cancelled'
    assert out['third']['notification']['status']=='accepted'
