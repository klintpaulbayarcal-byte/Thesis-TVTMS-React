import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
const db=new PGlite();
after(()=>db.close());
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
const rpc=async(a)=> (await q('select public.tvtms_ticket_admin_safe_delete($1,$2,$3,$4) result',a))[0].result;
const error=result=>result?.error?.errorCode??result?.errorCode;
await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
await db.exec(fs.readFileSync('supabase/schema/database.postgres.sql','utf8'));
for(const n of fs.readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort()){
  await db.exec(fs.readFileSync('supabase/migrations/'+n,'utf8'));
}
await db.exec(`insert into public.users(id,name,email,password,role,status) values
(93101,'QA Admin','admin-qa@example.test','no-login','admin','active'),
(93102,'QA Officer','officer-qa@example.test','no-login','apprehending_officer','active');
insert into public.vehicles(id,plate_number,vehicle_type) values
(93101,'QA93101','car'),(93102,'QA93102','car'),(93103,'QA93103','car'),(93104,'QA93104','car');
insert into public.tickets(id,ticket_number,user_id,vehicle_id,violation_id,date_issued,time_issued,penalty_amount_at_issue,status,location,plate_ticket_count_at_issue,same_violation_offense_count_at_issue)
values
(93101,'QA-CANCELLED-FAILED',93102,93101,1,current_date,'09:00',150,'cancelled','QA test',1,1),
(93102,'QA-UNPAID-FAILED',93102,93102,1,current_date,'09:00',150,'unpaid','QA test',1,1),
(93103,'QA-CANCELLED-ACCEPTED',93102,93103,1,current_date,'09:00',150,'cancelled','QA test',1,1),
(93104,'QA-CANCELLED-DISPUTED',93102,93104,1,current_date,'09:00',150,'cancelled','QA test',1,1);
insert into public.ticket_email_notifications(ticket_id,status,attempt_count) values
(93101,'failed',1),(93102,'failed',1),(93103,'accepted',1);
insert into public.disputes(ticket_id,reason) values(93104,'Protected QA dispute');`);
test('officer cannot delete and confirmation must exactly match',async()=>{
 assert.equal(error(await rpc([93101,93102,'QA-CANCELLED-FAILED','Admin QA cleanup'])),'ADMIN_REQUIRED');
 assert.equal(error(await rpc([93101,93101,'NOT-SAME','Admin QA cleanup'])),'DELETE_CONFIRMATION_REQUIRED');
 assert.equal((await q('select count(*) n from public.tickets where id=93101'))[0].n,1);
});
test('unpaid with failed email and cancelled with accepted email are protected',async()=>{
 assert.equal(error(await rpc([93102,93101,'QA-UNPAID-FAILED','Admin QA cleanup'])),'LINKED_RECORDS_EXIST');
 assert.equal(error(await rpc([93103,93101,'QA-CANCELLED-ACCEPTED','Admin QA cleanup'])),'LINKED_RECORDS_EXIST');
 assert.equal(error(await rpc([93104,93101,'QA-CANCELLED-DISPUTED','Admin QA cleanup'])),'LINKED_RECORDS_EXIST');
});
test('cancelled failed-email citation deletion is atomic and archived',async()=>{
 const result=await rpc([93101,93101,'QA-CANCELLED-FAILED','Admin QA cleanup']);
 assert.equal(error(result),undefined);
 assert.ok(Number(result.authorizationAuditId)>0);
 assert.equal(result.archivedFailedEmails,1);
 assert.equal((await q('select count(*) n from public.tickets where id=93101'))[0].n,0);
 assert.equal((await q('select count(*) n from public.ticket_email_notifications where ticket_id=93101'))[0].n,0);
 const logs=await q("select metadata from public.audit_logs where id=$1",[result.authorizationAuditId]);
 const record=JSON.parse(logs[0].metadata);
 assert.equal(record.ticket.ticket_number,'QA-CANCELLED-FAILED');
 assert.equal(record.emailNotifications[0].status,'failed');
 assert.equal((await q('select count(*) n from public.tickets where id=93102'))[0].n,1);
});
test('anonymous browser RPC grants are denied',async()=>{
 const a=(await q("select has_function_privilege('anon','public.tvtms_ticket_admin_safe_delete(bigint,bigint,text,text)','execute') anon,has_function_privilege('authenticated','public.tvtms_ticket_admin_safe_delete(bigint,bigint,text,text)','execute') auth,has_function_privilege('service_role','public.tvtms_ticket_admin_safe_delete(bigint,bigint,text,text)','execute') server"))[0];
 assert.deepEqual(a,{anon:false,auth:false,server:true});
});