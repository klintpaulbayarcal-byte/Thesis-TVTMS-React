import {PGlite} from '@electric-sql/pglite';
import {test,after} from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
after(()=>db.close());
const run=async(sql,params=[])=> (await db.query(sql,params)).rows;
await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
await db.exec(fs.readFileSync('supabase/schema/database.postgres.sql','utf8'));
for(const f of fs.readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort()){
 await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
}
test('driver portal RPC returns empty list for email with no citations',async()=>{
 const r=await run("select public.tvtms_driver_portal('unknown-driver@example.test') as result");
 assert.deepEqual(r[0].result,[]);
});
test('driver portal grants remain service role only',async()=>{
 const a=await run("select has_function_privilege('anon','public.tvtms_driver_portal(text)','EXECUTE') as permitted");
 const b=await run("select has_function_privilege('service_role','public.tvtms_driver_portal(text)','EXECUTE') as permitted");
 assert.equal(a[0].permitted,false);
 assert.equal(b[0].permitted,true);
});


test('driver portal returns only verified-email citation snapshots, not another driver or owner records',async()=>{
 const id=async(sql,params=[])=>(await run(sql,params))[0].id;
 const officer=await id("insert into public.users(name,email,password,role) values ('QA Officer','qa-officer-portal@example.test','test-only','apprehending_officer') returning id");
 const vehicle=await id("insert into public.vehicles(plate_number,vehicle_type) values ('QA-PRIV-01','car') returning id");
 const violation=await id("insert into public.violations(violation_code,violation_name,penalty_amount) values ('QA-PRIV-01','Test-only citation violation',150) returning id");
 const secondViolation=await id("insert into public.violations(violation_code,violation_name,penalty_amount) values ('QA-PRIV-02','Test-only secondary violation',150) returning id");
 const makeTicket=async(number,driverEmail,version=2,ownerEmail=null,extraViolationId=null)=>{
  const penaltyAmount=extraViolationId?300:150;
  return id(`with inserted as (
    insert into public.tickets
      (ticket_number,user_id,vehicle_id,violation_id,date_issued,time_issued,
       plate_ticket_count_at_issue,same_violation_offense_count_at_issue,
       citation_version,driver_email_at_issue,owner_email_at_issue,
       driver_first_name,driver_last_name,driver_address,driver_license_at_issue,
       plate_at_issue,vehicle_type_at_issue,penalty_amount_at_issue)
    values ($1,$2,$3,$4,'2026-10-29','09:00',1,1,$5,$6,$7,'QA','Driver',
            'Private test address','PRIVATE-123','QA-PRIV-01','car',$8)
    returning id
   ), seeded as (
    insert into public.ticket_violations
      (ticket_id,violation_id,violation_code_at_issue,violation_name_at_issue,
       penalty_amount_at_issue,same_violation_offense_count_at_issue,snapshot_origin)
    select inserted.id,v.violation_id,concat($1,'-V',v.seq),'Test violation',150,1,'issued'
    from inserted
    cross join (
      select $4::bigint as violation_id,1 as seq
      union all
      select $9::bigint as violation_id,2 as seq where $9 is not null
    ) v
   )
   select id from inserted`,[number,officer,vehicle,violation,version,driverEmail,ownerEmail,penaltyAmount,extraViolationId]);
 };
 const alice=await makeTicket('QA-DRIVER-A','  Alice@Example.test ',2,null,secondViolation);
 const bob=await makeTicket('QA-DRIVER-B','bob@example.test',2,'alice@example.test');
 await makeTicket('QA-DRIVER-LEGACY','alice@example.test',1);
 await makeTicket('QA-DRIVER-NOEMAIL',null,2,'alice@example.test');
 await run(`insert into public.payments
  (ticket_id,amount_paid,official_receipt_number,payment_status,payment_date)
  values ($1,100,'QA-DRIVER-PAID','partial','2026-10-29'),
         ($1,25,'QA-DRIVER-VOID','voided','2026-10-29')`,[alice]);
 const a=(await run("select public.tvtms_driver_portal($1) as citations",['ALICE@example.TEST']))[0].citations;
 const b=(await run("select public.tvtms_driver_portal($1) as citations",['bob@example.test']))[0].citations;
 const none=(await run("select public.tvtms_driver_portal($1) as citations",['other@example.test']))[0].citations;
 assert.deepEqual(a.map(x=>x.ticketNumber),['QA-DRIVER-A']);
 assert.deepEqual(b.map(x=>x.ticketNumber),['QA-DRIVER-B']);
 assert.deepEqual(none,[]);
 assert.equal(a[0].penaltyAmount,300);
 assert.equal(a[0].totalPaid,100);
 assert.equal(a[0].violations.length,2);
 assert.equal(a[0].driverAddress,'Private test address');
 assert.equal(a[0].licenseNumber,'PRIVATE-123');
 assert.ok(!a.some(x=>x.ticketNumber==='QA-DRIVER-B'||x.ticketNumber==='QA-DRIVER-LEGACY'||x.ticketNumber==='QA-DRIVER-NOEMAIL'));
 assert.notEqual(alice,bob);
});
