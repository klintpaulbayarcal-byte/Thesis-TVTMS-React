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


def test_citation_issuance_sends_reviewed_driver_email_in_one_request():
    js='''global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
let confirmations=0;let request=null;
global.window={confirm:()=>{confirmations++;return false;}};
global.fetch=async(url,options)=>{request={url,body:JSON.parse(options.body)};return new Response(JSON.stringify({success:true,ticket:{id:44}}),{status:201,headers:{'content-type':'application/json'}});};
const {API}=await import('./src/services/api.js');
await API.createTicket({ticket_number:'7258',driver_email:'driver@example.test',violation_ids:[1,2]});
console.log(JSON.stringify({confirmations,request}));'''
    out=run_js(js)
    assert out['confirmations']==0
    assert out['request']['url']=='/api/tickets'
    assert out['request']['body']=={'ticket_number':'7258','driver_email':'driver@example.test','violation_ids':[1,2]}
    page=(ROOT/'src/pages/IssueTicket.jsx').read_text(encoding='utf-8')
    assert 'Driver email — notice recipient' in page
    assert page.count('API.createTicket')==1


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
    assert out['sent'][0]['body']=={'recipient_email':'recipient@example.test','recipient_email_confirmed':True}
    assert out['first']['notification']['status']=='confirmation_cancelled'
    assert out['second']['notification']['status']=='confirmation_cancelled'
    assert out['third']['notification']['status']=='accepted'
