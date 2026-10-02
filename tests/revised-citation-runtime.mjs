// Real PostgreSQL execution in isolated WASM memory. No network, credentials or SMTP.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { manilaDateKey, manilaDaysAgo } from '../src/utils/format.js';

const db = new PGlite();
after(() => db.close());
const query = async (sql, args=[]) => (await db.query(sql,args)).rows;
const rpc = async (name,args=[]) => (await query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args))[0].result;
await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
await db.exec(fs.readFileSync('supabase/schema/database.postgres.sql','utf8'));
const migrations=fs.readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort();
const revised=migrations.find(x=>x.includes('revised_traffic_citation_flat_penalty'));
for(const name of migrations.filter(x=>x!==revised))await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
await db.exec(`insert into public.users(id,name,email,password,role) values
 (9001,'Test Officer','officer@example.test','not-a-login','apprehending_officer'),
 (9002,'Test Admin','admin@example.test','not-a-login','admin');
 insert into public.vehicles(id,plate_number,vehicle_type,owner_email) values(9001,'LEG123','car','owner@example.test');
 insert into public.tickets(ticket_number,user_id,vehicle_id,violation_id,date_issued,time_issued,penalty_amount_at_issue,plate_ticket_count_at_issue,same_violation_offense_count_at_issue)
 values('LEGACY-STORED',9001,9001,1,current_date,'09:00',1999,1,1),('LEGACY-NULL',9001,9001,2,current_date,'10:00',null,2,1);
 insert into public.violations(violation_code,violation_name,penalty_amount,demerit_points)
 values('CUSTOM-HITCH','Hitching',777,0),
 ('CUSTOM-INVALID','Invalid driver''s license',777,0),
 ('CUSTOM-DUI','Drunk Driving',777,0);
 insert into public.violation_penalty_rules(violation_id,offense_count,penalty_amount,effective_from) values(1,2,9000,'2000-01-01');`);
const legacyNullAmount=(await query('select penalty_amount from public.violations where id=2'))[0].penalty_amount;
await db.exec(fs.readFileSync('supabase/migrations/'+revised,'utf8'));
const officialIds=(await query('select id from public.violations where is_citation_selectable and status=$1 order by id',['active'])).map(row=>Number(row.id));
await db.exec("update public.users set officer_rank='Police Corporal' where id=9001;");
let serial=8000;
async function payload(changes={}) {
 const context=await rpc('tvtms_citation_context',[9001]);
 return {ticket_number:String(++serial),plate_number:'TEST123',vehicle_type:'car',vehicle_make:'Test Make',
 driver_first_name:'Test',driver_middle_name:'Middle',driver_last_name:'Driver',driver_address:'Test Address',driver_nationality:'Filipino',driver_email:'driver@example.test',
 license_type:'Non-Professional',driver_license_number:'TEST-LICENSE',owner_name:'Test Owner',owner_address:'Test Owner Address',
 location:'Test Barangay',remarks:'Test only',expected_date:context.date_issued,
 violation_ids:officialIds.slice(0,2),violation_descriptions:{},...changes};
}
const issue=async (changes={},actor=9001)=>rpc('tvtms_ticket_create',[JSON.stringify(await payload(changes)),actor]);
const code=r=>r.error?.errorCode??r.errorCode;
let issued;

test('date controls use the Manila calendar across UTC day and year boundaries',()=>{
 const localMorning=new Date('2026-09-30T22:53:00Z');
 assert.equal(manilaDateKey(localMorning),'2026-10-01');
 assert.equal(manilaDaysAgo(1,localMorning),'2026-09-30');
 assert.equal(manilaDateKey(new Date('2026-12-31T16:15:00Z')),'2027-01-01');
});

test('legacy stored amounts preserved; missing amounts frozen before catalog update',async()=>{
 const rows=await query('select ticket_number,penalty_amount_at_issue,legacy_penalty_recovered from public.tickets order by id');
 assert.equal(Number(rows[0].penalty_amount_at_issue),1999);assert.equal(rows[0].legacy_penalty_recovered,false);
 assert.equal(Number(rows[1].penalty_amount_at_issue),Number(legacyNullAmount));assert.equal(rows[1].legacy_penalty_recovered,true);
 assert.equal((await query('select * from public.ticket_violations')).length,2);
 assert.equal((await query('select * from public.violation_penalty_rules where penalty_amount=9000')).length,1);
});
test('revised citation issuance requires a recorded officer rank',async()=>{
 const before=(await query('select count(*) n from public.tickets'))[0].n;
 for(const rank of [null,'   ']){
  await query('update public.users set officer_rank=$1 where id=9001',[rank]);
  assert.equal(code(await issue()),'OFFICER_RANK_REQUIRED');
 }
 assert.equal((await query('select count(*) n from public.tickets'))[0].n,before);
 await db.exec("update public.users set officer_rank='Police Corporal' where id=9001;");
});
test('adviser citation choices reuse seed equivalents and add only missing active choices',async()=>{
 const required=["Not carrying driver's license","Driving with delinquent or invalid driver's license",'Driving without license',
 'Defective lighting accessory','Overspeeding','Reckless Driving','Hitching','Driving under the influence of liquor or drugs',
 'Obstruction to traffic','Illegal stopping & parking','Disregarding traffic signs & signals',
 'Abandon/unattended vehicles or trailers on highways','Obstruction loading/unloading in prohibited zone',
 'Overloading','Motor vehicle racing','Refusal to convey passenger','Operating without permit/franchise','Others'];
 const rows=await query("select violation_name,violation_code,penalty_amount from public.violations where status='active' and is_citation_selectable");
 assert.equal(rows.length,18);
 assert.deepEqual(rows.map(r=>r.violation_name).sort(),required.sort());
 assert.ok(rows.every(r=>Number(r.penalty_amount)===150));
 assert.equal((await query("select count(*) n from public.violations where status='active' and penalty_amount=150"))[0].n,29);
 assert.equal((await query("select count(*) n from public.violations where status='active' and not is_citation_selectable"))[0].n,11);
 assert.equal((await query("select count(*) n from public.violations where violation_code='V001' and not is_citation_selectable"))[0].n,1);
 assert.equal((await query("select count(*) n from public.violations where violation_code='V002'"))[0].n,1);
 assert.equal((await query("select count(*) n from public.violations where violation_code='CUSTOM-HITCH'"))[0].n,1);
 assert.equal((await query("select count(*) n from public.violations where violation_code='TC007'"))[0].n,0);
 for(const code of ['CUSTOM-INVALID','CUSTOM-DUI'])
  assert.equal((await query('select is_citation_selectable from public.violations where violation_code=$1',[code]))[0].is_citation_selectable,false);
 for(const code of ['TC002','TC008'])
  assert.equal((await query('select is_citation_selectable from public.violations where violation_code=$1',[code]))[0].is_citation_selectable,true);
});
test('catalog enforces configured 150 on updates and inserts',async()=>{
 await db.exec("update public.violations set penalty_amount=9000 where id=1;");
 assert.equal((await query('select * from public.violations where penalty_amount<>150')).length,0);
 const v=(await query("insert into public.violations(violation_code,violation_name,penalty_amount) values('NEWTEST','Test additional violation',9999) returning *"))[0];
 assert.equal(Number(v.penalty_amount),150);
 assert.equal(v.is_citation_selectable,false);
 await query('update public.violations set requires_description=true where id=$1',[v.id]);
});
test('all 18 official choices reject identity, activation, removal and selection drift',async()=>{
 const before=await query('select * from public.violations where is_citation_selectable order by id');
 for(const row of before) {
  for(const sql of ["violation_name='Renamed'","violation_code='DRIFT'","status='inactive'",
    'is_citation_selectable=false',`requires_description=${!row.requires_description}`]) {
   await assert.rejects(()=>query(`update public.violations set ${sql} where id=$1`,[row.id]),/protected/);
  }
  await assert.rejects(()=>query('delete from public.violations where id=$1',[row.id]),/cannot be deleted/);
  await query("update public.violations set description='Test metadata',demerit_points=1 where id=$1",[row.id]);
 }
 await assert.rejects(()=>query('update public.violations set is_citation_selectable=true where id=1'),/protected/);
 await assert.rejects(()=>query("insert into public.violations(violation_code,violation_name,penalty_amount,is_citation_selectable) values('DRIFT','Extra',150,true)"),/protected/);
 const after=await query('select * from public.violations where is_citation_selectable order by id');
 assert.equal(after.length,18);
 for(let i=0;i<18;i++)for(const key of ['violation_name','violation_code','status','requires_description'])assert.equal(after[i][key],before[i][key]);
});
test('blank license is null; supported classifications are intentional; vehicle must be selected',async()=>{
 for(const license_type of ['',null,'Professional','Non-Professional','Student Permit / SP','Others']) {
  const result=await issue({license_type,license_type_other:'Custom classification',driver_license_number:''});
  assert.ok(result.ticket,JSON.stringify(result));
  assert.equal(result.ticket.license_type,license_type||null);
  assert.equal(result.ticket.license_type_other,license_type==='Others'?'Custom classification':null);
 }
 for(const input of [{license_type:'Others',license_type_other:''},{license_type:'Invented'},
   {vehicle_type:''},{vehicle_type:null},{vehicle_type:'spaceship'}]) {
  assert.equal(code(await issue(input)),'VALIDATION_ERROR');
 }
 for(const vehicle_type of ['motorcycle','tricycle','car','truck','bus','van'])assert.ok((await issue({vehicle_type})).ticket);
});
test('single and multiple violations store separate 150 snapshots and one total',async()=>{
 for(let count=1;count<=4;count++){
  const r=await issue({violation_ids:officialIds.slice(0,count),penalty_amount:0,effectivePenalty:9000});assert.ok(r.ticket,JSON.stringify(r));
  assert.equal(Number(r.ticket.penalty_amount),count*150);assert.equal(r.ticket.violations.length,count);
  assert.ok(r.ticket.violations.every(v=>Number(v.penalty_amount)===150));issued=r.ticket;
 }
});
test('same-plate counts are separate per violation, with no escalation',async()=>{
 const first=(await issue({plate_number:'REPEAT1',violation_ids:[officialIds[0]]})).ticket;
 const second=(await issue({plate_number:'REPEAT1',violation_ids:officialIds.slice(0,2)})).ticket;
 assert.equal(first.violations[0].same_violation_offense_count_at_issue,1);
 assert.deepEqual(second.violations.map(v=>v.same_violation_offense_count_at_issue),[2,1]);
 assert.equal(Number(second.penalty_amount),300);
});
test('duplicate citation and request replay rejected without extra rows',async()=>{
 const d=await payload();const first=await rpc('tvtms_ticket_create',[JSON.stringify(d),9001]);
 assert.ok(first.ticket);assert.equal(code(await rpc('tvtms_ticket_create',[JSON.stringify(d),9001])),'DUPLICATE_CITATION');
 assert.equal((await query('select id from public.tickets where ticket_number=$1',[d.ticket_number])).length,1);
});
test('missing, invalid, duplicate and inactive violation selections rejected',async()=>{
 for(const violation_ids of [[],[999999],[officialIds[0],officialIds[0]],['abc']])assert.ok(code(await issue({violation_ids})));
 assert.equal(code(await issue({violation_ids:[1]})),'VIOLATION_UNAVAILABLE');
 await assert.rejects(()=>query("update public.violations set status='inactive' where id=$1",[officialIds[2]]),/protected/);
});
test('only an active Officer can issue; admin/public/unknown IDs rejected',async()=>{
 for(const id of [9002,999999,null])assert.equal(code(await issue({},id)),'FORBIDDEN');
 await db.exec("update public.users set status='inactive' where id=9001");
 assert.equal(code(await issue()),'FORBIDDEN');await db.exec("update public.users set status='active' where id=9001");
});
test('insertion failure rolls back ticket, vehicle, sequence and audit together',async()=>{
 await db.exec("create function private.test_fail() returns trigger language plpgsql as $$ begin raise exception 'simulated item insert failure'; end; $$; create trigger test_failure before insert on public.ticket_violations for each row execute function private.test_fail();");
 const before=(await query('select count(*) n from public.tickets'))[0].n;
 await assert.rejects(()=>issue({plate_number:'ROLLBACK1'}),/simulated item insert failure/);
 assert.equal((await query('select count(*) n from public.tickets'))[0].n,before);
 assert.equal((await query("select id from public.vehicles where plate_number='ROLLBACK1'")).length,0);
 assert.equal((await query("select * from public.plate_ticket_sequences where normalized_plate='ROLLBACK1'")).length,0);
 await db.exec('drop trigger test_failure on public.ticket_violations; drop function private.test_fail();');
});
test('appearance deadline uses seven calendar days and Manila business date',async()=>{
 const t=(await issue({incident_date:'1999-01-01',incident_time:'01:01',violation_latitude:9.896123,violation_longitude:123.900456})).ticket;
 assert.equal((await query('select $1::date = ((current_timestamp at time zone \'Asia/Manila\')::date+7) ok',[t.appearance_due_date]))[0].ok,true);
 assert.equal(t.incident_date,t.date_issued);assert.equal(t.incident_time,t.time_issued);
 assert.equal(Number(t.violation_latitude),9.896123);assert.equal(Number(t.violation_longitude),123.900456);
 const [boundary]=await query("select (timestamptz '2026-09-30 16:00:00+00' at time zone 'Asia/Manila')::date + 7 due");
 assert.equal(boundary.due.toISOString().slice(0,10),'2026-10-08');assert.equal(code(await issue({expected_date:'2000-01-01'})),'STALE_REVIEW');
 assert.equal(code(await issue({violation_latitude:9.8})),'VALIDATION_ERROR');
 assert.equal(code(await issue({violation_latitude:91,violation_longitude:123})),'VALIDATION_ERROR');
});
test('Others requires description but always uses configured flat penalty',async()=>{
 const id=Number((await query("select id from public.violations where violation_name='Others'"))[0].id);
 assert.equal(code(await issue({violation_ids:[id]})),'VALIDATION_ERROR');
 const t=(await issue({violation_ids:[id],violation_descriptions:{[id]:'Test configured other violation'}})).ticket;
 assert.equal(Number(t.penalty_amount),150);assert.equal(t.violations[0].description,'Test configured other violation');
});
test('officer, driver, vehicle and violation snapshots survive profile/catalog edits',async()=>{
 const t=(await issue()).ticket;
 await query("update public.users set name='Changed Officer',officer_rank='Changed Rank' where id=9001");
 await query("update public.violations set description='Changed Catalog Description' where id=$1",[officialIds[0]]);
 const detail=await rpc('tvtms_ticket_detail',[t.id]);assert.equal(detail.officer_name,'Test Officer');assert.equal(detail.officer_rank_at_issue,'Police Corporal');
 assert.equal(detail.violations[0].violation_name,t.violations[0].violation_name);assert.equal(detail.driver_email_at_issue,'driver@example.test');
 await assert.rejects(()=>query("update public.tickets set driver_email_at_issue='other@example.test' where id=$1",[t.id]),/immutable/);
});
test('catalog misconfiguration fails closed before ticket creation',async()=>{
 await db.exec("update public.system_settings set setting_value='999' where setting_key='citation_flat_penalty'");
 await assert.rejects(()=>issue(),/configuration unavailable/);
 await db.exec("update public.system_settings set setting_value='150.00' where setting_key='citation_flat_penalty'");
});
test('payment balance uses complete citation total for partial/full/voided records',async()=>{
 const t=(await issue({plate_number:'PAYMENT1'})).ticket;const today=t.date_issued;
 const first=await rpc('tvtms_payment_record',[t.id,'TEST-OR-1',100,today,'cash','Test',9002]);
 assert.equal(Number(first.penalty),300);assert.equal(Number(first.total),100);
 const second=await rpc('tvtms_payment_record',[t.id,'TEST-OR-2',200,today,'cash','Test',9002]);assert.equal(second.nextStatus,'paid');
 const corrected=await rpc('tvtms_ticket_mark_unpaid',[t.id,9002,'admin','Test correction']);assert.ok(!code(corrected),JSON.stringify(corrected));
 const pub=(await rpc('tvtms_public_lookup',[null,t.ticket_number]))[0];assert.equal(Number(pub.total_paid),0);assert.equal(Number(pub.remaining_balance),300);assert.equal(pub.has_recorded_payment,true);
});
test('public search by citation and plate shows safe violations and appearance date',async()=>{
 for(const args of [[null,issued.ticket_number],['TEST123',null]]){
  const rows=await rpc('tvtms_public_lookup',args);assert.ok(rows.length);
  for(const r of rows){assert.ok(r.violations.length);assert.ok(r.appearance_due_date);assert.equal(r.has_notification_email,true);for(const key of ['id','user_id','driver_email_at_issue','driver_license_number','driver_first_name','owner_email','remarks','violation_latitude','violation_longitude','incident_date','incident_time'])assert.equal(key in r,false);for(const v of r.violations)assert.deepEqual(Object.keys(v).sort(),['penalty_amount','violation_code','violation_name']);}
 }
});
test('eligible public dispute stays one citation; duplicates blocked; ticket unchanged',async()=>{
 const t=(await issue()).ticket;const before=await query('select * from public.tickets where id=$1',[t.id]);
 const r=await rpc('tvtms_public_dispute_submit',[t.ticket_number,t.plate_number,'This is a test dispute reason.']);assert.ok(r.disputeId);
 const contact=(await query('select contact_name,contact_email from public.disputes where id=$1',[r.disputeId]))[0];
 assert.equal(contact.contact_name,'Test Middle Driver');assert.equal(contact.contact_email,'driver@example.test');
 assert.equal(code(await rpc('tvtms_public_dispute_submit',[t.ticket_number,t.plate_number,'A second test dispute reason.'])),'DISPUTE_ALREADY_EXISTS');
 assert.deepEqual(await query('select * from public.tickets where id=$1',[t.id]),before);
 const review=await rpc('tvtms_dispute_resolve',[r.disputeId,'under_review','Test administrator review',9002]);assert.ok(!code(review));
});
test('public dispute verifies the issued plate after a vehicle plate correction',async()=>{
 const t=(await issue({plate_number:'OLDPLATE1'})).ticket;
 const current=await query('select vehicle_id from public.tickets where id=$1',[t.id]);
 await query("update public.vehicles set plate_number='NEWPLATE1' where id=$1",[current[0].vehicle_id]);
 const found=(await rpc('tvtms_public_lookup',[null,t.ticket_number]))[0];
 assert.equal(found.plate_number,'OLDPLATE1');
 assert.equal(code(await rpc('tvtms_public_dispute_submit',[t.ticket_number,'NEWPLATE1','Plate correction test dispute.'])),'TICKET_PLATE_MISMATCH');
 const filed=await rpc('tvtms_public_dispute_submit',[t.ticket_number,found.plate_number,'Plate correction test dispute.']);
 assert.ok(filed.disputeId,JSON.stringify(filed));
});
test('any recorded payment blocks dispute, including partial/full/voided',async()=>{
 for(const amount of [1,300]){
  const t=(await issue()).ticket;await rpc('tvtms_payment_record',[t.id,'TEST-'+t.ticket_number,amount,t.date_issued,'cash','Test',9002]);
  assert.equal(code(await rpc('tvtms_public_dispute_submit',[t.ticket_number,t.plate_number,'Test dispute with a payment.'])),'PAYMENT_EXISTS');
  await rpc('tvtms_ticket_mark_unpaid',[t.id,9002,'admin','Test correction']);
  assert.equal(code(await rpc('tvtms_public_dispute_submit',[t.ticket_number,t.plate_number,'Test dispute after voiding payment.'])),'PAYMENT_EXISTS');
 }
});
test('expired dispute, reason boundaries and mismatched plate rejected',async()=>{
 assert.equal(code(await rpc('tvtms_public_dispute_submit',[issued.ticket_number,'WRONG','Valid reason for testing.'])),'TICKET_PLATE_MISMATCH');
 for(const reason of ['short','x'.repeat(4001)])assert.equal(code(await rpc('tvtms_public_dispute_submit',[issued.ticket_number,issued.plate_number,reason])),'VALIDATION_ERROR');
 await db.exec("update public.system_settings set setting_value='-1' where setting_key='dispute_deadline_days'");
 assert.equal(code(await rpc('tvtms_public_dispute_submit',[issued.ticket_number,issued.plate_number,'Valid expired test reason.'])),'DISPUTE_DEADLINE_EXPIRED');
 await db.exec("update public.system_settings set setting_value='15' where setting_key='dispute_deadline_days'");
});
test('cancelled history does not increase future occurrence or leave a public balance',async()=>{
 const t=(await issue({plate_number:'CANCEL1',violation_ids:[officialIds[0]]})).ticket;
 await query("update public.tickets set status='cancelled' where id=$1",[t.id]);
 const next=(await issue({plate_number:'CANCEL1',violation_ids:[officialIds[0]]})).ticket;assert.equal(next.violations[0].same_violation_offense_count_at_issue,1);
 assert.equal(Number((await rpc('tvtms_public_lookup',[null,t.ticket_number]))[0].remaining_balance),0);
});
test('email claim uses driver snapshot, includes all violations/deadline, preserves retry ledger',async()=>{
 const t=(await issue()).ticket;
 await query("update public.vehicles set owner_email='mutable@example.test' where plate_number=$1",[t.plate_number]);
 const claim=await rpc('tvtms_ticket_email_claim',[t.id,9001]);assert.equal(claim.recipient,'driver@example.test');assert.equal(claim.violations.length,2);assert.equal(claim.appearanceDueDate,t.appearance_due_date);
 assert.equal((await rpc('tvtms_ticket_email_claim',[t.id,9001])).status,'sending');
 assert.equal((await query('select count(*) n from public.tickets where id=$1',[t.id]))[0].n,1);
});
test('report citation counts and collections never multiply; frequency counts child rows',async()=>{
 const today=(await rpc('tvtms_citation_context',[9001])).date_issued;
 const total=Number((await query('select count(*) n from public.tickets where date_issued=$1',[today]))[0].n);
 const stats=(await rpc('tvtms_report_ticket_totals',[JSON.stringify([today,today])]))[0];assert.equal(Number(stats.totalIssued),total);
 const occurrences=Number((await query('select count(*) n from public.ticket_violations'))[0].n);
 const frequency=await rpc('tvtms_report_violation_stats',[JSON.stringify([])]);assert.equal(frequency.reduce((n,r)=>n+Number(r.count),0),occurrences);assert.ok(frequency.every(r=>!('total_revenue' in r)));
 const revenue=(await rpc('tvtms_report_collection_totals',[JSON.stringify([today,today])]))[0];assert.equal(Number(revenue.totalAmount),Number((await query("select coalesce(sum(amount_paid),0) n from public.payments where payment_status<>'voided'"))[0].n));
 await rpc('tvtms_report_hotspots',[JSON.stringify([today,today])]);
 const locations=await rpc('tvtms_report_barangay',[JSON.stringify([])]);
 const testLocation=locations.find(r=>r.barangay==='test barangay');
 assert.ok(testLocation);assert.ok(testLocation.top_violations.includes(issued.violations[0].violation_name));
 assert.equal(Number(testLocation.total_tickets),Number((await query("select count(*) n from public.tickets where location='Test Barangay'"))[0].n));
});
test('service role can issue; anon/authenticated cannot execute RPCs or read private tables',async()=>{
 await db.exec('set role service_role');const r=await issue();assert.ok(r.ticket,JSON.stringify(r));await db.exec('reset role');
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  await assert.rejects(()=>query('select * from public.ticket_violations'),/permission denied/);
  await assert.rejects(()=>rpc('tvtms_ticket_create',['{}',9001]),/permission denied/);
  await assert.rejects(()=>rpc('tvtms_public_lookup',[null,issued.ticket_number]),/permission denied/);
  await db.exec('reset role');
 }
});
