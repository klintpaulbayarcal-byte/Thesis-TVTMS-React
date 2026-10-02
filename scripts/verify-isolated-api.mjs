// Requires npm run dev:isolated. Fixed loopback targets; SMTP is disabled by its config.
import assert from 'node:assert/strict';
const origin='http://127.0.0.1:8000/api';
let passed=0;
async function call(route,token,method='GET',body,expected=200) {
 const res=await fetch(origin+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await res.json();
 assert.equal(res.status,expected,`${method} ${route}: ${data.errorCode||'unexpected response'}`);
 return data;
}
function check(name,fn) {fn();passed++;console.log('PASS '+name);}
const health=await call('/health');
assert.equal(health.deployment,'development');
assert.equal(health.isolatedDevelopment,true);
assert.equal(health.smtp,'not_configured');
// Verify the fixed disposable adapter is reachable with its fixture key before mutations.
const adapterHealth=await fetch('http://127.0.0.1:54321/rest/v1/system_settings?select=setting_key&limit=1',{headers:{apikey:'local-fixture-only'}});
assert.equal(adapterHealth.status,200);
const login=async (email,name,role)=>{
 const result=await call('/auth/login',null,'POST',{email,password:'LocalTestPass123!'});
 assert.equal(result.user.email,email);
 assert.equal(result.user.name,name);
 assert.equal(result.user.role,role);
 return result;
};
const officerAccount=await login('officer@local.test','TEST-ONLY Apprehending Officer (Local QA)','apprehending_officer');
const adminAccount=await login('admin@local.test','TEST-ONLY Administrator (Local QA)','admin');
const officer=officerAccount.token; const admin=adminAccount.token;
assert.ok(officer&&admin);
const context=(await call('/tickets/issuance-context',officer)).context;
const choices=(await call('/violations/active',officer)).violations;
check('Officer login, test rank and exact 18 official choices',()=>{
 assert.equal(context.officer_rank,'TEST ONLY RANK');assert.equal(choices.length,18);
 assert.ok(choices.every(v=>v.is_citation_selectable&&v.status==='active'));
 assert.ok(!choices.some(v=>['No Helmet','No Registration','Swerving'].includes(v.violation_name)));
});
const publicCatalog=(await call('/public/violations')).violations;
check('Public reference matches all 18 official choices at 150',()=>{
 assert.deepEqual(publicCatalog.map(v=>v.violation_name).sort(),choices.map(v=>v.violation_name).sort());
 assert.ok(publicCatalog.every(v=>Number(v.penalty_amount)===150 && !Object.hasOwn(v,'id') && !Object.hasOwn(v,'is_citation_selectable')));
});
for(const row of choices) {
 for(const body of [{violation_name:'Drift'},{violation_code:'DRIFT'},{status:'inactive'},
  {is_citation_selectable:false},{requires_description:!row.requires_description}]) {
  const result=await call(`/violations/${row.id}`,admin,'PUT',body,409);
  assert.equal(result.errorCode,'OFFICIAL_CATALOG_PROTECTED');
 }
 assert.equal((await call(`/violations/${row.id}`,admin,'DELETE',undefined,409)).errorCode,'OFFICIAL_CATALOG_PROTECTED');
}
check('Normal Administrator APIs protect all 18 identities and selection behavior',()=>{});
await call(`/violations/${choices[0].id}`,admin,'PUT',{description:'Isolated QA metadata'});
const stamp=Date.now();
const plate2=`QA${String(stamp).slice(-10)}A`,plate3=`QA${String(stamp).slice(-10)}B`;
const base={ticket_number:`QA-${stamp}-2`,plate_number:plate2,vehicle_type:'car',vehicle_make:'Fixture',
 driver_first_name:'Test',driver_last_name:'Driver',driver_address:'Fixture Address',driver_nationality:'Fixture',
 driver_email:'driver@example.test',license_type:'',driver_license_number:'',owner_name:'Fixture Owner',owner_address:'Fixture Owner Address',
 location:'Test Place of Violation',violation_latitude:9.9,violation_longitude:123.9,expected_date:context.date_issued,
 violation_ids:choices.slice(0,2).map(v=>Number(v.id))};
await call('/tickets',officer,'POST',{...base,vehicle_type:''},400);
await call('/tickets',officer,'POST',{...base,license_type:'Others'},400);
const others=choices.find(v=>v.violation_name==='Others');
await call('/tickets',officer,'POST',{...base,violation_ids:[Number(others.id)]},400);
const users=(await call('/users',admin)).users;
const user=users.find(u=>u.email==='officer@local.test');
assert.ok(user,'TEST-ONLY Officer fixture must exist before rank checks');
assert.equal(Number(user.id),Number(officerAccount.user.id));
assert.equal(user.name,officerAccount.user.name);
assert.equal(user.role,'apprehending_officer');
assert.equal(user.officer_rank,'TEST ONLY RANK');
await call(`/users/${user.id}`,admin,'PUT',{officer_rank:''});
assert.equal((await call('/tickets',officer,'POST',base,409)).errorCode,'OFFICER_RANK_REQUIRED');
await call(`/users/${user.id}`,admin,'PUT',{officer_rank:'TEST ONLY RANK'});
const issued=await call('/tickets',officer,'POST',base,201);const ticket=issued.ticket;
check('Two violations commit one citation for 300, with null license and immutable driver email',()=>{
 assert.equal(Number(ticket.penalty_amount),300);assert.equal(ticket.violations.length,2);
 assert.equal(ticket.license_type,null);assert.equal(ticket.driver_email_at_issue,'driver@example.test');
 assert.equal(ticket.location,base.location);assert.equal(Number(ticket.violation_latitude),9.9);
 assert.equal(ticket.officer_rank_at_issue,'TEST ONLY RANK');
 assert.equal((Date.parse(ticket.appearance_due_date)-Date.parse(ticket.date_issued))/86400000,7);
 assert.equal(issued.notification.status,'failed');
});
await call('/tickets',officer,'POST',base,409);
const three=(await call('/tickets',officer,'POST',{...base,ticket_number:`QA-${stamp}-3`,plate_number:plate3,violation_ids:choices.slice(0,3).map(v=>Number(v.id))},201)).ticket;
assert.equal(Number(three.penalty_amount),450);
const forbidden=['id','user_id','vehicle_id','driver_email_at_issue','driver_first_name','driver_address','owner_name','owner_email','driver_license_number','officer_rank_at_issue'];
for(const route of [`/public/ticket-lookup?ticket_number=${encodeURIComponent(ticket.ticket_number)}`,`/public/ticket-lookup?plate_number=${plate2}`]) {
 const out=await call(route);const item=out.tickets[0];
 assert.ok(item);assert.equal(item.violations.length,2);assert.equal(Number(item.penalty_amount),300);
 for(const key of forbidden)assert.ok(!Object.hasOwn(item,key),`Public field ${key}`);
}
check('Public citation/plate lookup and privacy',()=>{});
await call('/public/dispute',null,'POST',{ticket_number:three.ticket_number,plate_number:plate3,reason:'Isolated test dispute reason only'},201);
await call('/public/dispute',null,'POST',{ticket_number:three.ticket_number,plate_number:plate3,reason:'Duplicate isolated test dispute reason'},409);
const payment={ticket_id:ticket.id,official_receipt_number:`QA-OR-${stamp}-1`,amount_paid:100,payment_date:context.date_issued,payment_method:'cash'};
await call('/payments',admin,'POST',payment,201);
let detail=(await call(`/tickets/${ticket.id}`,admin)).ticket;
assert.equal(Number(detail.total_paid),100);assert.equal(Number(detail.remaining_balance),200);
await call('/payments',admin,'POST',{...payment,official_receipt_number:`QA-OR-${stamp}-2`,amount_paid:200},201);
detail=(await call(`/tickets/${ticket.id}`,admin)).ticket;
assert.equal(Number(detail.remaining_balance),0);assert.equal(detail.payment_status,'paid');
await call('/public/dispute',null,'POST',{ticket_number:ticket.ticket_number,plate_number:plate2,reason:'Payment history must block this dispute'},403);
check('Citation-level partial/full payments and dispute restrictions',()=>{});
for(const route of ['/reports/daily','/reports/analytics/tickets-summary','/reports/analytics/collections','/users/audit-logs','/notifications','/disputes'])await call(route,admin);
check('Admin details, reports, analytics, audit, notifications and disputes',()=>{});
console.log(`${passed} isolated HTTP smoke groups passed. No production requests or SMTP delivery.`);
