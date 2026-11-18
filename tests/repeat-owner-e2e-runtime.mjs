import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
const db=new PGlite(); after(()=>db.close());
const query=async(sql,args=[]) => (await db.query(sql,args)).rows;
await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
await db.exec(fs.readFileSync('supabase/schema/database.postgres.sql','utf8'));
for(const file of fs.readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort())
  await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
await db.exec(`insert into public.users(id,name,email,password,role,status,officer_rank)
 values(88901,'Isolated Officer','isolated-officer@example.test','offline-only','apprehending_officer','active','Officer');`);
const official=(await query("select id from public.violations where is_citation_selectable=true order by id limit 2")).map(r=>r.id);
const payload=(number,plate,owner='Same Registered Owner',address='Same address')=>({
 ticket_number:number,plate_number:plate,vehicle_type:'car',vehicle_make:'Toyota',
 owner_name:owner,owner_address:address,driver_first_name:'Different',
 driver_last_name:'Driver',driver_address:'Driver address',driver_nationality:'Filipino',
 driver_email:'driver@example.test',license_type:'Professional',driver_license_number:'',
 location:'Test location',expected_date:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'}),
 violation_ids:official
});
const issue=async(v)=> (await query('select public.tvtms_ticket_create($1::jsonb,$2::bigint) result',[JSON.stringify(v),88901]))[0].result;
test('the same plate stores successive citations on one vehicle with one owner link',async()=>{
 let first=await issue(payload('ISO-CITE-1','AB1234'));
 assert.ok(first.ticket,JSON.stringify(first));
 let second=await issue(payload('ISO-CITE-2','AB-1234'));
 assert.ok(second.ticket,JSON.stringify(second));
 let vehicles=await query("select id,owner_id,plate_number from public.vehicles where plate_number='AB1234'");
 assert.equal(vehicles.length,1);
 assert.ok(Number(vehicles[0].owner_id)>0);
 assert.equal((await query('select count(*)::int n from public.owners'))[0].n,1);
 let tickets=await query("select vehicle_id,plate_ticket_count_at_issue,owner_name_at_issue from public.tickets where ticket_number in ('ISO-CITE-1','ISO-CITE-2') order by id");
 assert.equal(tickets.length,2);
 assert.equal(tickets[0].vehicle_id,tickets[1].vehicle_id);
 assert.deepEqual(tickets.map(t=>t.plate_ticket_count_at_issue),[1,2]);
 assert.equal((await query("select count(*)::int n from public.ticket_violations tv join public.tickets t on t.id=tv.ticket_id where t.ticket_number in ('ISO-CITE-1','ISO-CITE-2')"))[0].n,4);
});
test('the same owner name on a different plate is not automatically merged',async()=>{
 const r=await issue(payload('ISO-CITE-3','CD5678'));
 assert.ok(r.ticket,JSON.stringify(r));
 assert.equal((await query('select count(*)::int n from public.vehicles'))[0].n,2);
 assert.equal((await query('select count(*)::int n from public.owners'))[0].n,2);
});
