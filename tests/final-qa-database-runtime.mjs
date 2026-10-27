import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { test, after } from 'node:test';

const db=new PGlite();after(()=>db.close());
const query=async(sql,args=[]) => (await db.query(sql,args)).rows;
await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
await db.exec(fs.readFileSync('supabase/schema/database.postgres.sql','utf8'));
for(const name of fs.readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort())await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
await db.exec(`insert into public.users(id,name,email,password,role) values(9901,'TEST ONLY','qa@example.test','not-a-login','apprehending_officer');
 insert into public.vehicles(id,plate_number,vehicle_type) values(9901,'TESTQA','car');
 insert into public.tickets(id,ticket_number,user_id,vehicle_id,violation_id,date_issued,time_issued,penalty_amount_at_issue,status,plate_ticket_count_at_issue,same_violation_offense_count_at_issue) values
 (9901,'TEST-QA-PARTIAL',9901,9901,1,'2026-09-30','09:00',2000,'unpaid',1,1),
 (9902,'TEST-QA-UNPAID',9901,9901,1,'2026-09-30','09:00',3500,'unpaid',2,2),
 (9903,'TEST-QA-PAID',9901,9901,1,'2026-09-30','09:00',150,'paid',3,3),
 (9904,'TEST-QA-CANCELLED',9901,9901,1,'2026-09-30','09:00',150,'cancelled',4,4),
 (9905,'TEST-QA-OUTSIDE',9901,9901,1,'2026-08-01','09:00',9999,'unpaid',5,5);
 insert into public.payments(ticket_id,amount_paid,official_receipt_number,payment_date,payment_status,recorded_by) values
 (9901,1999,'TEST-QA-PARTIAL-OR','2026-09-30','partial',9901),
 (9901,1,'TEST-QA-VOID-OR','2026-09-30','voided',9901),
 (9903,150,'TEST-QA-PAID-OR','2026-09-30','full',9901);
 -- Reproduce the actual deployed drift, not the already-correct old source file.
 create or replace function public.tvtms_report_payment_status(p_args jsonb default '[]'::jsonb)
 returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from
 (select t.status,count(*) as count,sum(t.penalty_amount_at_issue) as amount from public.tickets t
 where t.date_issued between (p_args->>0)::date and (p_args->>1)::date group by t.status) r; $$;`);
const snapshots=await query('select id,penalty_amount_at_issue,status from public.tickets order by id');
const payments=await query('select id,amount_paid,payment_status from public.payments order by id');
const report=async()=> (await query('select public.tvtms_report_payment_status($1::jsonb) result',['["2026-09-05","2026-10-04"]']))[0].result;
assert.equal(Number((await report()).find(r=>r.status==='unpaid').amount),5500);
const correction='supabase/patches/final_qa_outstanding_balance.sql';
if(fs.existsSync(correction))await db.exec(fs.readFileSync(correction,'utf8'));

test('F3 forward correction subtracts partial payments, excludes voided receipts and preserves date filter',async()=>{
 const rows=await report();const unpaid=rows.find(r=>r.status==='unpaid');
 assert.equal(Number(unpaid.amount),3501);assert.equal(Number(unpaid.count),2);
 assert.equal(Number(rows.find(r=>r.status==='paid').amount),150);
 assert.equal(Number(rows.find(r=>r.status==='cancelled').amount),150);
});
test('F3 correction changes no ticket penalties, statuses, payments or accounts',async()=>{
 assert.deepEqual(await query('select id,penalty_amount_at_issue,status from public.tickets order by id'),snapshots);
 assert.deepEqual(await query('select id,amount_paid,payment_status from public.payments order by id'),payments);
 assert.equal((await query('select count(*) n from public.users'))[0].n,1);
});
test('F3 correction retains service-only execution and security invoker',async()=>{
 const [row]=await query("select prosecdef,has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') authenticated,has_function_privilege('service_role',oid,'EXECUTE') service from pg_proc where oid='public.tvtms_report_payment_status(jsonb)'::regprocedure");
 assert.equal(row.prosecdef,false);assert.equal(row.anon,false);assert.equal(row.authenticated,false);assert.equal(row.service,true);
});
