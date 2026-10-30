// Actual PHP HTTP acceptance tests. All records and account tokens are disposable.
// These tests never contact a hosted database and do not send mail.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {isolatedQaEnvironment} from '../scripts/isolated-qa-safety.mjs';
const root=process.cwd();
fs.mkdirSync(path.join(root,'.test-tmp'),{recursive:true});
const temp=fs.mkdtempSync(path.join(root,'.test-tmp/driver-http-'));
const php=process.env.TVTMS_PHP;
assert.ok(php&&fs.existsSync(php),'A PHP CLI is required');
const env={...isolatedQaEnvironment(process.env),TVTMS_PHP:php,TMP:temp,TEMP:temp,TMPDIR:temp};
const children=[];
const stop=()=>{for(const child of children)child.kill('SIGTERM');};
process.on('SIGTERM',()=>{stop();process.exit(1);});
let passed=0;
const pass=name=>{passed++;console.log('PASS '+name);};
const origin='http://127.0.0.1:8000/api';
async function call(route,token,method='GET',body,status=200){
 const response=await fetch(origin+route,{method,signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const result=await response.json();
 assert.equal(response.status,status,`${method} ${route}: ${result.errorCode||'unexpected status'}`);
 return result;
}
async function table(table,method='GET',body,query=''){
 const response=await fetch(`http://127.0.0.1:54321/rest/v1/${table}${query}`,{method,signal:AbortSignal.timeout(10000),headers:{apikey:'local-fixture-only','Content-Type':'application/json',Prefer:'return=representation'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 assert.ok(response.ok,'Disposable fixture adapter failed');return response.json();
}
const password='LocalTestPass123!'; // Existing isolated fixture password, never a real account.
const login=async email=>(await call('/auth/login',null,'POST',{email,password})).token;
try{
 // Refuse to borrow an already-running API/adapter, which might have unrelated data.
 for(const url of [origin+'/health','http://127.0.0.1:54321']){
  let occupied=false;try{await fetch(url,{signal:AbortSignal.timeout(500)});occupied=true;}catch{}
  assert.equal(occupied,false,'Isolated test ports are already occupied');
 }
 const adapter=spawn(process.execPath,['scripts/isolated-rest.mjs'],{cwd:root,env,stdio:['ignore','ignore','ignore','ipc']});children.push(adapter);
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Database startup timed out')),25000);adapter.once('message',m=>{clearTimeout(timeout);m.ready?resolve():reject(Error('Database not ready'));});adapter.once('exit',()=>{clearTimeout(timeout);reject(Error('Database startup failed'));});});
 const api=spawn(php,['-S','127.0.0.1:8000','dev-router.php'],{cwd:root,env,stdio:'ignore'});children.push(api);
 let health;
 for(let i=0;i<50;i++){try{health=await call('/health');break;}catch{await delay(100);}}
 assert.equal(health?.isolatedDevelopment,true);assert.equal(health.smtp,'not_configured');
 assert.equal((await table('tickets')).length,0);
 pass('Fresh isolated PHP API, empty database, SMTP disabled');
 const email='alice-driver@local.test';
 await call('/driver/register',null,'POST',{name:'TEST Driver Alice',email,password},201);
 const duplicate=await call('/driver/register',null,'POST',{name:'TEST Driver Alice',email,password},201);
 const unrelated=await call('/driver/register',null,'POST',{name:'Test Staff',email:'officer@local.test',password},201);
 assert.equal(duplicate.message,unrelated.message);
 assert.equal((await table('users','GET',undefined,'?email=eq.'+email)).length,1);
 const [alice]=await table('users','GET',undefined,'?email=eq.'+email);
 assert.equal(alice.role,'driver');assert.equal(alice.status,'inactive');assert.equal(alice.driver_verified_at,null);
 assert.match(alice.driver_signup_token_hash,/^[a-f0-9]{64}$/);assert.match(alice.password,/^\$2/);
 await call('/auth/login',null,'POST',{email,password},401);
 await call('/driver/resend-activation',null,'POST',{email,password},429);
 await call('/driver/activate',null,'POST',{token:'invalid'},400);
 pass('Registration persists inactive hashed account; login blocked and resend cooldown enforced');
 // Inject a known TEST token into this disposable row to test the activation API.
 // This does NOT establish SMTP acceptance or recipient inbox delivery.
 const activation='a'.repeat(64);
 await table('users','PATCH',{driver_signup_token_hash:createHash('sha256').update(activation).digest('hex')},'?id=eq.'+alice.id);
 await call('/driver/activate',null,'POST',{token:activation});
 await call('/driver/activate',null,'POST',{token:activation},400);
 const [verified]=await table('users','GET',undefined,'?id=eq.'+alice.id);
 assert.equal(verified.status,'active');assert.ok(verified.driver_verified_at);assert.equal(verified.driver_signup_token_hash,null);
 const driver=await login(email);const officer=await login('officer@local.test');const admin=await login('admin@local.test');
 assert.equal((await call('/auth/profile',driver)).user.role,'driver');
 pass('Activation clears one-use token and permits verified Driver login');
 const context=(await call('/tickets/issuance-context',officer)).context;
 const choices=(await call('/violations/active',officer)).violations.filter(v=>!v.requires_description).slice(0,2);
 const base={ticket_number:'QA-DRIVER-HTTP-ALICE',plate_number:'QAHTTP01',vehicle_type:'car',vehicle_make:'TEST MAKE',driver_first_name:'TEST',driver_last_name:'Alice',driver_address:'TEST driver address',driver_nationality:'TEST nationality',driver_email:email,license_type:'Non-Professional',driver_license_number:'TEST-LICENSE-01',owner_name:'TEST Owner',owner_address:'PRIVATE TEST OWNER ADDRESS',location:'TEST isolated location',expected_date:context.date_issued,violation_ids:choices.map(v=>Number(v.id))};
 const ticket=(await call('/tickets',officer,'POST',base,201)).ticket;
 await call('/tickets',officer,'POST',{...base,ticket_number:'QA-DRIVER-HTTP-BOB',driver_last_name:'Bob',driver_email:'bob-driver@local.test'},201);
 const portal=await call('/driver/portal?email=bob-driver@local.test',driver);
 assert.equal(portal.count,1);assert.equal(portal.citations[0].ticketNumber,base.ticket_number);
 const citation=portal.citations[0];assert.equal(citation.penaltyAmount,300);assert.equal(citation.violations.length,2);
 assert.equal(citation.licenseNumber,base.driver_license_number);assert.equal(citation.registeredOwnerName,base.owner_name);
 assert.ok(!Object.hasOwn(citation,'ownerAddress'));assert.ok(!Object.hasOwn(citation,'ownerEmail'));
 await call('/payments',admin,'POST',{ticket_id:ticket.id,official_receipt_number:'QA-HTTP-DRIVER-OR',amount_paid:100,payment_date:context.date_issued,payment_method:'cash'},201);
 const after=(await call('/driver/portal',driver)).citations[0];assert.equal(after.totalPaid,100);assert.equal(after.remainingBalance,200);
 pass('Driver sees only own email snapshots despite shared plate or spoofed query, with correct partial balance');
 for(const route of ['/users','/tickets','/system/settings','/disputes','/reports/daily','/vehicles/search'])await call(route,driver,'GET',undefined,403);
 for(const route of ['/tickets','/payments','/users'])await call(route,driver,'POST',{},403);
 await call('/users/me',driver,'PUT',{email:'bob-driver@local.test'},403);
 await call(`/users/${alice.id}/driver-status`,driver,'PUT',{status:'active'},403);
 await call('/driver/portal',admin,'GET',undefined,403);await call('/driver/portal',officer,'GET',undefined,403);
 await call('/driver/portal',null,'GET',undefined,401);
 pass('Actual PHP endpoints reject Driver staff operations, email reassignment, anonymous access and wrong-role portal access');
 await call(`/users/${alice.id}/driver-status`,admin,'PUT',{status:'inactive'});
 await call('/driver/portal',driver,'GET',undefined,401);
 await call(`/users/${alice.id}/driver-status`,admin,'PUT',{status:'active'});
 const again=await login(email);await call('/driver/portal',again);
 await call('/auth/logout',again,'POST',{});await call('/driver/portal',again,'GET',undefined,401);
 pass('Admin deactivation revokes access immediately; verified reactivation and logout enforced');
 const hash=spawnSync(php,['-r',"echo password_hash('LocalTestPass123!',PASSWORD_BCRYPT);"],{encoding:'utf8'});assert.equal(hash.status,0);
 const expired='b'.repeat(64);
 const [pending]=await table('users','POST',{name:'TEST Pending Driver',email:'pending-driver@local.test',password:hash.stdout,role:'driver',status:'inactive',driver_signup_token_hash:createHash('sha256').update(expired).digest('hex'),driver_signup_expires_at:'2000-01-01T00:00:00Z'});
 await call('/driver/activate',null,'POST',{token:expired},400);
 await call(`/users/${pending.id}/driver-status`,admin,'PUT',{status:'active'},409);
 assert.equal((await table('users','GET',undefined,'?id=eq.'+pending.id))[0].status,'inactive');
 assert.equal((await table('tickets')).length,2);
 pass('Expired token and Admin activation of unverified Driver rejected without changing status');
 console.log(`${passed} isolated Driver HTTP acceptance groups passed; real email delivery NOT TESTED.`);
}finally{stop();}
