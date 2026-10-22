-- REVIEW ONLY: apply manually before deploying the matching PHP handler.
-- Public submissions no longer require email verification. Keep the existing
-- authenticated create/resolve RPCs and historical verification records intact.
begin;

create or replace function public.tvtms_public_dispute_submit(p_ticket text,p_plate text,p_reason text)
returns jsonb language plpgsql security invoker set search_path='' as $function$
declare
  t public.tickets%rowtype;
  deadline integer;
  dispute_id bigint;
begin
  if coalesce(length(p_ticket),0) not between 1 and 30
     or coalesce(length(regexp_replace(trim(p_plate),'[[:space:]-]+','','g')),0) not between 1 and 30
     or coalesce(length(trim(p_reason)),0) not between 10 and 4000 then
    return jsonb_build_object('errorCode','VALIDATION_ERROR','message','Invalid ticket number or dispute reason.','statusCode',400);
  end if;

  -- Serialize eligibility checks and insertion with other ticket operations.
  select * into t from public.tickets where ticket_number=p_ticket for update;
  if not found then
    return jsonb_build_object('errorCode','TICKET_NOT_FOUND','message','Ticket not found.','statusCode',404);
  end if;
  if not exists(select 1 from public.vehicles where id=t.vehicle_id
      and upper(regexp_replace(trim(plate_number),'[[:space:]-]+','','g'))=upper(regexp_replace(trim(p_plate),'[[:space:]-]+','','g'))) then
    return jsonb_build_object('errorCode','TICKET_PLATE_MISMATCH','message','Ticket number and plate number do not match.','statusCode',403);
  end if;
  -- ANY historical payment makes public filing ineligible, even if later voided.
  if exists(select 1 from public.payments where ticket_id=t.id) then
    return jsonb_build_object('errorCode','PAYMENT_EXISTS','message','Tickets with any recorded payment cannot be disputed.','statusCode',403);
  end if;
  if t.status<>'unpaid' then
    return jsonb_build_object('errorCode','INVALID_TICKET_STATUS','message','Only unpaid tickets can be disputed.','statusCode',403);
  end if;
  select coalesce((select setting_value::integer from public.system_settings where setting_key='dispute_deadline_days'),15) into deadline;
  if (current_timestamp at time zone 'Asia/Manila')::date-t.date_issued>deadline then
    return jsonb_build_object('errorCode','DISPUTE_DEADLINE_EXPIRED','message','The '||deadline||'-day dispute period has ended.','statusCode',403);
  end if;
  if exists(select 1 from public.disputes where ticket_id=t.id and status in ('submitted','under_review')) then
    return jsonb_build_object('errorCode','DISPUTE_ALREADY_EXISTS','message','A dispute is already open for this ticket.','statusCode',409);
  end if;

  -- Preserve issue-time contact snapshots when available; email is optional.
  -- Filing only creates a review request. It never changes ticket status.
  insert into public.disputes(ticket_id,submitted_by,contact_name,contact_email,submission_source,reason,status)
  values(t.id,null,nullif(trim(t.owner_name_at_issue),''),nullif(trim(t.owner_email_at_issue),''),'public',trim(p_reason),'submitted')
  returning id into dispute_id;
  insert into public.notifications(user_id,type,title,message,reference_type,reference_id)
  select id,'dispute','Public Dispute Filed','Public dispute filed for ticket '||p_ticket,'dispute',dispute_id
  from public.users where role='admin' and status='active';
  return jsonb_build_object('disputeId',dispute_id);
end;
$function$;

-- Only the rate-limited PHP endpoint may call this RPC with a service key.
revoke all on function public.tvtms_public_dispute_submit(text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.tvtms_public_dispute_submit(text,text,text) to service_role;

-- Keep lookup eligibility consistent with submission, including voided payments.
create or replace function public.tvtms_public_lookup(p_plate text,p_ticket text)
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(q) order by q.date_issued desc,q.ticket_number desc),'[]'::jsonb) from (
 select td.ticket_number,td.plate_number,td.vehicle_type,td.violation_code,td.violation_name,td.date_issued,td.status,td.payment_date,td.penalty_amount,
 coalesce((select setting_value::integer from public.system_settings where setting_key='dispute_deadline_days'),15) dispute_deadline_days,
 (current_timestamp at time zone 'Asia/Manila')::date-td.date_issued dispute_age_days,
 case when exists(select 1 from public.disputes d where d.ticket_id=td.id and d.status in ('submitted','under_review')) then 1 else 0 end has_open_dispute,
 exists(select 1 from public.payments recorded where recorded.ticket_id=td.id) has_recorded_payment,
 coalesce(nullif(trim(t.owner_email_at_issue),''),'')<>'' has_notification_email,
 coalesce(p.total,0) total_paid,case when td.status='cancelled' then 0 else greatest(td.penalty_amount-coalesce(p.total,0),0) end remaining_balance,
 case when td.status='cancelled' then 'cancelled' when greatest(td.penalty_amount-coalesce(p.total,0),0)=0 then 'paid' when coalesce(p.total,0)>0 then 'partially_paid' else 'unpaid' end payment_status
 from public.ticket_details td join public.tickets t on t.id=td.id
 left join lateral (select sum(amount_paid) total from public.payments where ticket_id=td.id and payment_status<>'voided') p on true
 where (p_plate is not null or p_ticket is not null)
 and (p_plate is null or replace(replace(td.plate_number,'-',''),' ','')=p_plate)
 and (p_ticket is null or td.ticket_number=p_ticket)
 order by td.date_issued desc,td.id desc limit 100) q;
$$;
revoke all on function public.tvtms_public_lookup(text,text) from public, anon, authenticated, service_role;
grant execute on function public.tvtms_public_lookup(text,text) to service_role;

commit;
