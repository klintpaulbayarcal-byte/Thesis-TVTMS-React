import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
const db=new PGlite();after(()=>db.close());
const query=async(sql,args=[]) => (await db.query(sql,args)).rows;
const rpc=async(name,args=[]) => (await query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args))[0].result;
await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
await db.exec(fs.readFileSync('supabase/schema/database.postgres.sql','utf8'));
for(const file of fs.readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort())await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
await db.exec(`insert into public.users(id,name,email,password,role) values
 (9801,'TEST ONLY Officer','qa-officer@example.test','not-a-login','apprehending_officer'),
 (9802,'TEST ONLY Admin','qa-admin@example.test','not-a-login','admin');
 insert into public.vehicles(id,plate_number,vehicle_type) values(9801,'TESTPARTIAL','car'),(9802,'TESTDISPUTE','car');
 insert into public.tickets(id,ticket_number,user_id,vehicle_id,violation_id,date_issued,time_issued,penalty_amount_at_issue,status,location,plate_ticket_count_at_issue,same_violation_offense_count_at_issue) values
 (9801,'TEST-PARTIAL',9801,9801,1,current_date,'09:00',2000,'unpaid','9.882, 123.882664',1,1),
 (9802,'TEST-FULL',9801,9801,1,current_date,'09:00',300,'unpaid','Municipal Hall, Calape',1,1),
 (9803,'TEST-CANCELLED',9801,9801,1,current_date,'09:00',700,'cancelled','Municipal Hall, Calape',1,1),
 (9804,'TEST-DISPUTE',9801,9802,1,current_date,'09:00',300,'unpaid','TEST place',1,1);
 insert into public.payments(ticket_id,amount_paid,official_receipt_number,payment_date,payment_status,recorded_by) values
 (9801,1999,'TEST-PARTIAL-OR',current_date,'partial',9801),
 (9801,1,'TEST-VOID-OR',current_date,'voided',9801),
 (9802,300,'TEST-FULL-OR',current_date,'full',9801);`);
const tickets=await query('select id,penalty_amount_at_issue,status,location from public.tickets order by id');
const payments=await query('select * from public.payments order by id');
test('Aging keeps original penalty and paid amount, excludes settled/cancelled, uses balance 1',async()=>{
 const row=(await rpc('tvtms_report_aging',['[]'])).find(r=>r.plate_number==='TESTPARTIAL');
 assert.ok(row);assert.equal(Number(row.unpaid_tickets),1);assert.equal(Number(row.original_penalty),2000);
 assert.equal(Number(row.total_paid),1999);assert.equal(Number(row.total_due),1);
 assert.deepEqual(await query('select id,penalty_amount_at_issue,status,location from public.tickets order by id'),tickets);
 assert.deepEqual(await query('select * from public.payments order by id'),payments);
});
test('location report preserves complete pairs and complete human places instead of last fragments',async()=>{
 const rows=await rpc('tvtms_report_barangay',['[]']);
 assert.ok(rows.some(r=>r.barangay==='9.882, 123.882664',1,1));
 assert.ok(rows.some(r=>r.barangay==='Municipal Hall, Calape',1,1));
 assert.ok(!rows.some(r=>r.barangay==='123.882664'||r.barangay==='calape'));
});
test('payment breakdown derives partial/full settlement and outstanding sums from valid payments',async()=>{
 const today=(await query('select current_date::text as day'))[0].day;
 const rows=await rpc('tvtms_report_payment_status',[JSON.stringify([today,today])]);
 assert.equal(Number(rows.find(r=>r.status==='partially_paid').amount),1);
 assert.equal(Number(rows.find(r=>r.status==='paid').count),1);
 assert.equal(Number(rows.find(r=>r.status==='unpaid').amount),300);
});
test('public dispute saves atomically once and locked duplicate guard prevents second insertion',async()=>{
 const reason='TEST ONLY valid synthetic reason';
 const [first,second]=await Promise.all([rpc('tvtms_public_dispute_submit',['TEST-DISPUTE','TESTDISPUTE',reason]),rpc('tvtms_public_dispute_submit',['TEST-DISPUTE','TESTDISPUTE',reason])]);
 assert.ok(first.disputeId>0);assert.equal(second.errorCode,'DISPUTE_ALREADY_EXISTS');
 assert.equal(Number((await query('select count(*) n from public.disputes where ticket_id=9804'))[0].n),1);
 assert.equal(Number((await query("select count(*) n from public.notifications where reference_type='dispute' and reference_id=$1",[first.disputeId]))[0].n),1);
});
test('report replacements remain callable only by the trusted server role',async()=>{
 for(const name of ['tvtms_report_aging','tvtms_report_barangay','tvtms_report_payment_status']){
  const row=(await query("select has_function_privilege('anon',$1,'execute') anon,has_function_privilege('authenticated',$1,'execute') authenticated,has_function_privilege('service_role',$1,'execute') server",[`public.${name}(jsonb)`]))[0];
  assert.deepEqual(row,{anon:false,authenticated:false,server:true});
 }
});
