// Isolated end-to-end database acceptance for Administrator protected case archiving.
// Uses real migrations and PostgreSQL-compatible PGlite; never accesses production.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { test, after } from 'node:test';

const db = new PGlite();
after(()=>db.close());
const query=async(sql,params=[]) => (await db.query(sql,params)).rows;
const scalar=async(sql,params=[]) => (await query(sql,params))[0];
const archiveRpc=async(ticketId,actorId,citation,reason,phrase) =>
  (await scalar('select public.tvtms_ticket_admin_archived_delete($1,$2,$3,$4,$5) as result',
    [ticketId,actorId,citation,reason,phrase])).result;
await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
await db.exec(fs.readFileSync('supabase/schema/database.postgres.sql','utf8'));
for(const name of fs.readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort())
  await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));

const adminId=77101,officerId=77102,paidId=77111,disputedId=77112;
await db.exec(`
  insert into public.users(id,name,email,password,role,status)
    values(77101,'Isolated Admin','archive-admin@example.test','offline-only','admin','active'),
      (77102,'Isolated Officer','archive-officer@example.test','offline-only','apprehending_officer','active');
  insert into public.owners(id,name) values(77121,'Isolated owner');
  insert into public.vehicles(id,plate_number,vehicle_type,owner_id)
    values(77131,'ISOTESTPAID','car',77121),
      (77132,'ISOTESTDISPUTE','motorcycle',77121);
  insert into public.tickets(id,ticket_number,user_id,vehicle_id,violation_id,date_issued,
    time_issued,penalty_amount_at_issue,status,location,plate_ticket_count_at_issue,
    same_violation_offense_count_at_issue)
    values (77111,'ISOLATED-PAID',77102,77131,1,current_date,'09:00',150,'paid',
      'Isolated Test Location',1,1),
      (77112,'ISOLATED-DISPUTE',77102,77132,1,current_date,'10:00',150,'unpaid',
      'Isolated Test Location',1,1);
  insert into public.payments(ticket_id,amount_paid,official_receipt_number,payment_date,payment_status,recorded_by)
    values(77111,150,'ISOLATED-OR-PAID',current_date,'full',77101);
  insert into public.evidence(ticket_id,file_path,file_name,file_type,file_size,uploaded_by,file_data)
    values(77111,'isolated-test-evidence.png','isolated-test-evidence.png','image/png',4,77102,decode('89504e47','hex'));
  insert into public.ticket_email_notifications(ticket_id,status,attempt_count)
    values(77111,'accepted',1);
  insert into public.ticket_status_history(ticket_id,previous_status,new_status,changed_by,reason)
    values(77111,'unpaid','paid',77101,'Isolated receipt test');
  insert into public.disputes(id,ticket_id,contact_name,submission_source,reason,status)
    values(77141,77112,'Isolated complainant','public','Isolated dispute demonstration','under_review');
  insert into public.notifications(user_id,type,title,message,reference_type,reference_id)
    values(77101,'payment','Isolated payment','QA only','ticket',77111),
      (77101,'dispute','Isolated dispute','QA only','dispute',77141);
`);

test('unauthorized and invalid confirmations fail without deleting anything',async()=>{
  const baseline=await scalar('select count(*)::int as n from public.tickets');
  assert.equal(baseline.n,2);
  let result=await archiveRpc(paidId,officerId,'ISOLATED-PAID','Isolated archive test reason','ARCHIVE AND DELETE');
  assert.equal(result.error.errorCode,'ADMIN_REQUIRED');
  result=await archiveRpc(paidId,adminId,'ISOLATED-PAID','Isolated archive test reason','WRONG CONFIRMATION');
  assert.equal(result.error.errorCode,'ARCHIVE_CONFIRMATION_REQUIRED');
  result=await archiveRpc(paidId,adminId,'NOT-THE-ISSUED-NUMBER','Isolated archive test reason','ARCHIVE AND DELETE');
  assert.equal(result.error.errorCode,'DELETE_CONFIRMATION_REQUIRED');
  result=await archiveRpc(paidId,adminId,'ISOLATED-PAID','short','ARCHIVE AND DELETE');
  assert.equal(result.error.errorCode,'VALIDATION_ERROR');
  assert.equal((await scalar('select count(*)::int as n from public.tickets')).n,2);
  assert.equal((await scalar('select count(*)::int as n from private.tvtms_archived_citation_deletions')).n,0);
});

test('paid citation is archived atomically with receipt, evidence bytes and accepted email ledger',async()=>{
  const result=await archiveRpc(paidId,adminId,'ISOLATED-PAID','Duplicate official citation documented by QA','ARCHIVE AND DELETE');
  assert.equal(result.archivedAndRemoved,true);
  assert.equal(result.ticketNumber,'ISOLATED-PAID');
  assert.equal(result.archivedPayments,1);
  assert.equal(result.archivedEvidence,1);
  assert.ok(result.archiveId>0&&result.authorizationAuditId>0);
  const archived=await scalar('select snapshot,snapshot_digest,md5(snapshot::text) as actual_digest from private.tvtms_archived_citation_deletions where id=$1',[result.archiveId]);
  assert.equal(archived.snapshot_digest,archived.actual_digest);
  assert.equal(archived.snapshot.ticket.ticket_number,'ISOLATED-PAID');
  assert.equal(archived.snapshot.payments[0].official_receipt_number,'ISOLATED-OR-PAID');
  assert.equal(archived.snapshot.evidence[0].file_data,'\\x89504e47');
  assert.equal(archived.snapshot.emailNotifications[0].status,'accepted');
  assert.equal(archived.snapshot.statusHistory.length,1);
  assert.equal(archived.snapshot.notifications.length,1);
  assert.equal((await scalar('select count(*)::int as n from public.tickets where id=77111')).n,0);
  for(const table of ['payments','evidence','ticket_email_notifications','ticket_status_history']) {
    assert.equal((await scalar(`select count(*)::int as n from public.${table} where ticket_id=77111`)).n,0);
  }
  const audit=await scalar('select action,metadata from public.audit_logs where id=$1',[result.authorizationAuditId]);
  assert.equal(audit.action,'TICKET_ARCHIVED_AND_REMOVED');
  assert.equal(JSON.parse(audit.metadata).archiveId,result.archiveId);
});

test('disputed citation can be archived with dispute and linked notification, leaving accounts and catalogs unchanged',async()=>{
  const result=await archiveRpc(disputedId,adminId,'ISOLATED-DISPUTE','Approved exceptional removal with official audit','ARCHIVE AND DELETE');
  assert.equal(result.archivedAndRemoved,true);
  assert.equal(result.archivedDisputes,1);
  const archived=await scalar('select snapshot from private.tvtms_archived_citation_deletions where id=$1',[result.archiveId]);
  assert.equal(archived.snapshot.disputes[0].id,77141);
  assert.equal(archived.snapshot.notifications.length,1);
  assert.equal((await scalar('select count(*)::int as n from public.disputes')).n,0);
  assert.equal((await scalar('select count(*)::int as n from public.notifications')).n,0);
  assert.equal((await scalar('select count(*)::int as n from public.tickets')).n,0);
  assert.equal((await scalar('select count(*)::int as n from public.users')).n,2);
  assert.equal((await scalar('select count(*)::int as n from public.vehicles')).n,2);
  assert.ok((await scalar('select count(*)::int as n from public.violations')).n>=18);
});

test('repeat deletion is rejected and cannot overwrite existing snapshots',async()=>{
  const response=await archiveRpc(paidId,adminId,'ISOLATED-PAID','Repeat removal should not succeed','ARCHIVE AND DELETE');
  assert.equal(response.error.errorCode,'TICKET_NOT_FOUND');
  assert.equal((await scalar('select count(*)::int as n from private.tvtms_archived_citation_deletions')).n,2);
  assert.equal((await scalar("select count(*)::int as n from public.audit_logs where action='TICKET_ARCHIVED_AND_REMOVED'")).n,2);
});

test('archive execution is denied to ordinary browser roles',async()=>{
  const f='public.tvtms_ticket_admin_archived_delete(bigint,bigint,text,text,text)';
  const rows=await scalar(`select has_function_privilege('anon',$1,'EXECUTE') as anonymous,
    has_function_privilege('authenticated',$1,'EXECUTE') as signed_in,
    has_function_privilege('service_role',$1,'EXECUTE') as server_only`,[f]);
  assert.equal(rows.anonymous,false);assert.equal(rows.signed_in,false);
  assert.equal(rows.server_only,true);
});
