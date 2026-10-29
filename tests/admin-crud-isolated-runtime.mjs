import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { test, after } from 'node:test';

// In-memory database only. Never touches live police records.
const db=new PGlite();
after(()=>db.close());
const q=async(s,a=[]) => (await db.query(s,a)).rows;
const rpc=async(n,a=[]) => (await q('select public.'+n+'('+a.map((_,i)=>'$'+(i+1)).join(',')+') result',a))[0].result;
const code=r=>r?.error?.errorCode??r?.errorCode;
await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
await db.exec(fs.readFileSync('supabase/schema/database.postgres.sql','utf8'));
for(const f of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
await db.exec(`insert into public.users(id,name,email,password,role) values
(96001,'QA Officer','qa-officer@example.test','no-login','apprehending_officer'),
(96002,'QA Admin','qa-admin@example.test','no-login','admin'),
(96003,'QA Other Officer','qa-officer2@example.test','no-login','apprehending_officer');
insert into public.vehicles(id,plate_number,vehicle_type) values
(96001,'E2E96001','car'),(96002,'E2E96002','car'),(96003,'E2E96003','car'),(96004,'E2E96004','car');
insert into public.tickets(id,ticket_number,user_id,vehicle_id,violation_id,date_issued,time_issued,penalty_amount_at_issue,status,location,plate_ticket_count_at_issue,same_violation_offense_count_at_issue)
values
(96001,'QA-EDIT',96001,96001,1,current_date,'09:00',150,'unpaid','Original',1,1),
(96002,'QA-DELETE',96001,96002,1,current_date,'09:00',150,'cancelled','Original',1,1),
(96003,'QA-DISPUTED',96001,96003,1,current_date,'09:00',150,'unpaid','Original',1,1),
(96004,'QA-PAID',96003,96004,1,current_date,'09:00',150,'paid','Original',1,1);
insert into public.disputes(ticket_id,reason) values(96003,'Synthetic test dispute');
insert into public.payments(ticket_id,amount_paid,official_receipt_number,payment_date,payment_status,recorded_by)
values(96004,150,'QA-E2E-OR',current_date,'full',96002);`);
const mutate=(act,id,user,role,data={})=>rpc('tvtms_ticket_mutate',[act,id,user,role,JSON.stringify(data)]);
test('Admin reads all; officer filter restricts to own citations',async()=>{
 const a=await rpc('tvtms_ticket_list',[JSON.stringify({pageSize:100})]);
 const o=await rpc('tvtms_ticket_list',[JSON.stringify({pageSize:100,officerId:96001})]);
 assert.ok(a.tickets.some(x=>Number(x.id)===96004));
 assert.ok(o.tickets.length===3 && o.tickets.every(x=>Number(x.user_id)===96001));
});
test('Admin citation creation rejected, officer-only issue',async()=>{
 const result=await rpc('tvtms_ticket_create',[JSON.stringify({}),96002]);
 assert.equal(code(result),'FORBIDDEN');
});
test('Admin edit saves location and notes, other officer edit denied',async()=>{
 const a=await mutate('details',96001,96002,'admin',{location:'QA CHANGED',remarks:'TEST'});
 assert.equal(code(a),undefined);
 const saved=(await q('select location,remarks from public.tickets where id=96001'))[0];
 assert.equal(saved.location,'QA CHANGED');assert.equal(saved.remarks,'TEST');
 const denied=await mutate('details',96001,96003,'apprehending_officer',{location:'UNAUTHORIZED'});
 assert.equal(code(denied),'TICKET_ACCESS_DENIED');
});
test('Officer cancel and delete denied',async()=>{
 assert.equal(code(await mutate('cancel',96001,96001,'apprehending_officer',{reason:'test reason'})),'ADMIN_REQUIRED');
 assert.equal(code(await mutate('delete',96002,96001,'apprehending_officer')),'ADMIN_REQUIRED');
});
test('Admin cancels eligible and writes history',async()=>{
 const r=await mutate('cancel',96001,96002,'admin',{reason:'QA status test'});
 assert.equal(code(r),undefined);
 assert.equal((await q('select status from public.tickets where id=96001'))[0].status,'cancelled');
 assert.equal(Number((await q("select count(*) n from public.ticket_status_history where ticket_id=96001 and new_status='cancelled'"))[0].n),1);
});
test('Admin deletes eligible cancelled ticket and preserves other data',async()=>{
 assert.equal(code(await mutate('delete',96002,96002,'admin')),undefined);
 assert.equal(Number((await q('select count(*) n from public.tickets where id=96002'))[0].n),0);
 assert.equal(Number((await q('select count(*) n from public.tickets where id=96004'))[0].n),1);
});
test('Disputed and paid tickets cannot be deleted',async()=>{
 assert.equal(code(await mutate('delete',96003,96002,'admin')),'LINKED_RECORDS_EXIST');
 assert.equal(code(await mutate('delete',96004,96002,'admin')),'TICKET_DELETE_NOT_ALLOWED');
 assert.equal(Number((await q('select count(*) n from public.disputes where ticket_id=96003'))[0].n),1);
 assert.equal(Number((await q('select count(*) n from public.payments where ticket_id=96004'))[0].n),1);
});
test('Paid tickets cannot be edited and direct paid-status changes blocked',async()=>{
 assert.equal(code(await mutate('details',96004,96002,'admin',{location:'BAD'})),'INVALID_OPERATION');
 assert.equal(code(await mutate('status',96003,96002,'admin',{status:'paid'})),'PAYMENT_REQUIRED');
});
test('Supabase functions only executable by service role',async()=>{
 const v=(await q("select has_function_privilege('anon','public.tvtms_ticket_mutate(text,bigint,bigint,text,jsonb)','execute') a,has_function_privilege('authenticated','public.tvtms_ticket_mutate(text,bigint,bigint,text,jsonb)','execute') b,has_function_privilege('service_role','public.tvtms_ticket_mutate(text,bigint,bigint,text,jsonb)','execute') c"))[0];
 assert.deepEqual(v,{a:false,b:false,c:true});
});
