-- Atomic administrator-only deletion with archived non-delivered email history.
-- Must be deployed to Supabase BEFORE the PHP/UI code is released.
create or replace function public.tvtms_ticket_admin_safe_delete(
  p_id bigint, p_user_id bigint, p_ticket_number text, p_reason text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  t public.tickets%rowtype;
  actor_role text;
  actor_status text;
  ledger_count integer;
  failed_count integer;
  v_audit_id bigint;
  v_snapshot jsonb;
begin
  select role,status into actor_role,actor_status from public.users where id=p_user_id;
  if actor_role is distinct from 'admin' or actor_status is distinct from 'active' then
    return public.tvtms_ticket_error('ADMIN_REQUIRED','Only an active Administrator may permanently delete citations.',403);
  end if;
  select * into t from public.tickets where id=p_id for update;
  if not found then return public.tvtms_ticket_error('TICKET_NOT_FOUND','Citation not found.',404); end if;
  if t.ticket_number is distinct from p_ticket_number then
    return public.tvtms_ticket_error('DELETE_CONFIRMATION_REQUIRED','Type the exact citation number.',409);
  end if;
  if length(btrim(coalesce(p_reason,''))) < 5 or length(p_reason)>500 then
    return public.tvtms_ticket_error('VALIDATION_ERROR','Provide a deletion reason of 5 to 500 characters.',400);
  end if;
  if t.status not in ('unpaid','cancelled') then
    return public.tvtms_ticket_error('TICKET_DELETE_NOT_ALLOWED','Only unpaid or cancelled citations can be deleted.',409);
  end if;
  if exists(select 1 from public.payments where ticket_id=p_id)
     or exists(select 1 from public.disputes where ticket_id=p_id)
     or exists(select 1 from public.evidence where ticket_id=p_id)
     or exists(select 1 from public.public_dispute_verifications where ticket_id=p_id) then
    return public.tvtms_ticket_error('LINKED_RECORDS_EXIST','Payments, disputes, evidence or verification records prevent deletion.',409);
  end if;
  select count(*),count(*) filter(where status='failed')
    into ledger_count,failed_count from public.ticket_email_notifications where ticket_id=p_id;
  -- Failed email history may be archived only for CANCELLED citations.
  if ledger_count>0 and not (t.status='cancelled' and ledger_count=failed_count) then
    return public.tvtms_ticket_error('LINKED_RECORDS_EXIST','Email delivery history prevents deletion; only failed notices on cancelled citations are eligible.',409);
  end if;
  -- Snapshot is retained in audit_logs. This insert and all deletes commit atomically.
  v_snapshot=jsonb_build_object(
    'ticket',to_jsonb(t),
    'emailNotifications',(select coalesce(jsonb_agg(to_jsonb(n) order by n.id),'[]'::jsonb)
      from public.ticket_email_notifications n where n.ticket_id=p_id),
    'statusHistory',(select coalesce(jsonb_agg(to_jsonb(h) order by h.id),'[]'::jsonb)
      from public.ticket_status_history h where h.ticket_id=p_id),
    'violations',(select coalesce(jsonb_agg(to_jsonb(v) order by v.id),'[]'::jsonb)
      from public.ticket_violations v where v.ticket_id=p_id),
    'reason',btrim(p_reason),'archiveType','admin_safe_delete',
    'emailRecordsArchived',ledger_count
  );
  insert into public.audit_logs(user_id,action,entity_type,entity_id,metadata)
    values(p_user_id,'TICKET_PERMANENTLY_DELETED','tickets',p_id,v_snapshot::text)
    returning id into v_audit_id;
  if v_audit_id is null then raise exception 'Deletion audit could not be persisted'; end if;
  delete from public.ticket_email_notifications where ticket_id=p_id and status='failed';
  delete from public.tickets where id=p_id;
  if found then
    return jsonb_build_object('ticketNumber',t.ticket_number,'authorizationAuditId',v_audit_id,'archivedFailedEmails',failed_count);
  end if;
  raise exception 'Citation delete failed and transaction was rolled back';
end;$$;
revoke all on function public.tvtms_ticket_admin_safe_delete(bigint,bigint,text,text)
  from public,anon,authenticated;
grant execute on function public.tvtms_ticket_admin_safe_delete(bigint,bigint,text,text) to service_role;
