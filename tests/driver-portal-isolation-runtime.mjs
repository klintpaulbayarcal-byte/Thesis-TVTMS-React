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
