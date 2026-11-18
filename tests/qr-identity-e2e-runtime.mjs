import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {test, after} from 'node:test';
const db=new PGlite();after(()=>db.close());
const query=async(sql,args=[]) => (await db.query(sql,args)).rows;
await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
await db.exec(fs.readFileSync('supabase/schema/database.postgres.sql','utf8'));
for(const file of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())
  await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
await db.exec(`insert into public.users(id,name,email,password,role,status,officer_rank)
values(88902,'OTP Test Officer','otp-officer@example.test','offline-only','apprehending_officer','active','Officer')`);
const official=(await query("select id from public.violations where is_citation_selectable=true order by id limit 1"))[0].id;
const issueData={
 ticket_number:'OTP-QA-1',plate_number:'OTP01234',vehicle_type:'car',vehicle_make:'Toyota',
 owner_name:'Registered Owner Test',owner_address:'Test address',
 driver_first_name:'Driver',driver_last_name:'Test',driver_address:'Test address',
 driver_nationality:'Filipino',driver_email:'driver-otp@example.test',
 license_type:'Professional',driver_license_number:'',location:'Test location',
 expected_date:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'}),
 violation_ids:[official],
};
const issue=(await query('select public.tvtms_ticket_create($1::jsonb,$2::bigint) result',[JSON.stringify(issueData),88902]))[0].result;
assert.ok(issue.ticket,JSON.stringify(issue));
const tokenA='a'.repeat(64),codeA='b'.repeat(64),bad='c'.repeat(64),requester='d'.repeat(64);
const result=async(fn,args)=> (await query('select public.'+fn+'('+args.map((_,i)=>'$'+(i+1)+'::text').join(',')+') result',args))[0].result;
test('codes are never public and challenge is delivered only to immutable citation email',async()=>{
 const r=await result('tvtms_qr_identity_request',['OTP-QA-1',tokenA,codeA,requester]);
 assert.equal(r.status,'created');assert.equal(r.recipient,'driver-otp@example.test');
 assert.ok(!JSON.stringify(r).includes('Registered Owner Test'));
 const cooldown=await result('tvtms_qr_identity_request',['OTP-QA-1','e'.repeat(64),codeA,requester]);
 assert.equal(cooldown.errorCode,'IDENTITY_COOLDOWN');
});
test('codes cannot unlock names until email delivery accepted, and are single use',async()=>{
 const before=await result('tvtms_qr_identity_verify',['OTP-QA-1',tokenA,codeA]);
 assert.equal(before.errorCode,'IDENTITY_VERIFICATION_FAILED');
 const d=await result('tvtms_qr_identity_delivery',[tokenA,'accepted']);assert.equal(d.status,'accepted');
 const wrong=await result('tvtms_qr_identity_verify',['OTP-QA-1',tokenA,bad]);
 assert.equal(wrong.errorCode,'IDENTITY_CODE_INVALID');assert.equal(wrong.attemptsRemaining,4);
 const verified=await result('tvtms_qr_identity_verify',['OTP-QA-1',tokenA,codeA]);
 assert.equal(verified.verified,true);
 assert.equal(verified.citedDriverName,'Driver Test');
 assert.equal(verified.registeredOwnerName,'Registered Owner Test');
 const reused=await result('tvtms_qr_identity_verify',['OTP-QA-1',tokenA,codeA]);
 assert.equal(reused.errorCode,'IDENTITY_VERIFICATION_FAILED');
});
test('no one can unlock other ticket with first ticket code',async()=>{
 const r=await result('tvtms_qr_identity_verify',['DIFFERENT-TICKET',tokenA,codeA]);
 assert.equal(r.errorCode,'IDENTITY_VERIFICATION_FAILED');
});
