-- Bind all ticket-related email to the immutable issuance snapshot.
-- Legacy tickets without an email snapshot fail closed and require an offline correction workflow.

create or replace function public.tvtms_payment_record(p_ticket_id bigint,p_receipt text,p_amount numeric,p_date date,p_method text,p_notes text,p_actor bigint)
returns jsonb language plpgsql security invoker set search_path='' as $function$
declare t record; paid numeric; penalty numeric; balance numeric; total numeric; ps text; ns text; payment_id bigint;
begin
 if not exists(select 1 from public.users where id=p_actor and role='admin' and status='active') then
 return jsonb_build_object('errorCode','ACCESS_DENIED','message','Administrator access required','statusCode',403); end if;
 if p_amount is null or p_amount<=0 or p_amount>10000000 or p_amount<>round(p_amount,2) or coalesce(length(trim(p_receipt)),0) not between 1 and 50 or p_method is null or p_method not in ('cash','gcash','maya','bank_transfer','other') or length(p_notes)>2000 then
 return jsonb_build_object('errorCode','VALIDATION_ERROR','message','Invalid payment details','statusCode',400); end if;
 if p_date is null or p_date>(current_timestamp at time zone 'Asia/Manila')::date then
 return jsonb_build_object('errorCode','INVALID_PAYMENT_DATE','message','Payment date cannot be in the future','statusCode',400); end if;
 select ti.*,coalesce(ti.penalty_amount_at_issue,v.penalty_amount) penalty,ti.owner_name_at_issue owner_name,ti.owner_email_at_issue owner_email into t from public.tickets ti join public.violations v on v.id=ti.violation_id where ti.id=p_ticket_id for update of ti;
 if not found then return jsonb_build_object('errorCode','TICKET_NOT_FOUND','message','Ticket not found','statusCode',404); end if;
 if t.status='cancelled' then return jsonb_build_object('errorCode','TICKET_CANCELLED','message','Cancelled tickets cannot receive payments','statusCode',409); end if;
 if exists(select 1 from public.disputes where ticket_id=p_ticket_id and status in ('submitted','under_review')) then return jsonb_build_object('errorCode','ACTIVE_DISPUTE','message','Resolve the active dispute before recording payment','statusCode',409); end if;
 if exists(select 1 from public.payments where official_receipt_number=p_receipt) then return jsonb_build_object('errorCode','OR_NUMBER_EXISTS','message','Official receipt number already exists','statusCode',409); end if;
 select coalesce(sum(amount_paid),0) into paid from public.payments where ticket_id=p_ticket_id and payment_status<>'voided';
 penalty:=t.penalty; balance:=greatest(0,penalty-paid);
 if balance<=0 or t.status='paid' then return jsonb_build_object('errorCode','ALREADY_PAID','message','This ticket is already fully paid','statusCode',409); end if;
 if p_amount>balance+0.001 then return jsonb_build_object('errorCode','OVERPAYMENT','message','Payment exceeds the remaining balance of PHP '||to_char(balance,'FM999999990.00'),'statusCode',400); end if;
 total:=paid+p_amount; ps:=case when total+0.001>=penalty then 'full' else 'partial' end; ns:=case when ps='full' then 'paid' else 'unpaid' end;
 insert into public.payments(ticket_id,official_receipt_number,amount_paid,payment_date,payment_method,payment_status,notes,recorded_by) values(p_ticket_id,p_receipt,p_amount,p_date,p_method,ps,p_notes,p_actor) returning id into payment_id;
 update public.tickets set status=ns,payment_date=case when ps='full' then p_date else null end where id=p_ticket_id;
 insert into public.ticket_status_history(ticket_id,previous_status,new_status,changed_by,reason) values(p_ticket_id,t.status,case when ps='full' then 'paid' else 'partially_paid' end,p_actor,'Payment recorded. OR: '||p_receipt);
 return jsonb_build_object('paymentId',payment_id,'ticket',to_jsonb(t),'paymentStatus',ps,'total',total,'penalty',penalty,'nextStatus',ns);
exception when unique_violation then
 return jsonb_build_object('errorCode','OR_NUMBER_EXISTS','message','Official receipt number already exists','statusCode',409);
end;
$function$;

create or replace function public.tvtms_dispute_resolve(p_id bigint,p_status text,p_notes text,p_actor bigint)
returns jsonb language plpgsql security invoker set search_path='' as $function$
declare d record; ticket_id_value bigint;
begin
 if not exists(select 1 from public.users where id=p_actor and role='admin' and status='active') then return jsonb_build_object('errorCode','ACCESS_DENIED','message','Administrator access required','statusCode',403); end if;
 if p_status is null or p_status not in ('under_review','approved','rejected','closed') then return jsonb_build_object('errorCode','INVALID_STATUS','message','Invalid dispute status','statusCode',400); end if;
 if length(p_notes)>4000 or (p_status in ('approved','rejected','closed') and coalesce(length(trim(p_notes)),0)<5) then return jsonb_build_object('errorCode','VALIDATION_ERROR','message','Resolution notes of at least 5 characters are required','statusCode',400); end if;
 select ticket_id into ticket_id_value from public.disputes where id=p_id;
 perform 1 from public.tickets where id=ticket_id_value for update;
 select di.*,t.ticket_number,t.status ticket_status,t.owner_email_at_issue owner_email,t.owner_name_at_issue owner_name into d from public.disputes di join public.tickets t on t.id=di.ticket_id where di.id=p_id for update of di;
 if not found then return jsonb_build_object('errorCode','DISPUTE_NOT_FOUND','message','Dispute not found','statusCode',404); end if;
 if d.status in ('approved','rejected','closed') then return jsonb_build_object('errorCode','DISPUTE_FINALIZED','message','This dispute is already finalized','statusCode',409); end if;
 if p_status='approved' and (select coalesce(sum(amount_paid),0) from public.payments where ticket_id=d.ticket_id and payment_status<>'voided')>0 then return jsonb_build_object('errorCode','PAYMENT_EXISTS','message','A dispute cannot be approved after payment has been recorded','statusCode',409); end if;
 update public.disputes set status=p_status,resolution_notes=p_notes,resolved_by=p_actor,resolved_at=case when p_status in ('approved','rejected','closed') then current_timestamp else null end where id=p_id;
 if p_status='approved' and d.ticket_status='unpaid' then
 update public.tickets set status='cancelled' where id=d.ticket_id;
 insert into public.ticket_status_history(ticket_id,previous_status,new_status,changed_by,reason,approver_id) values(d.ticket_id,'unpaid','cancelled',p_actor,'Dispute approved: '||p_notes,p_actor);
 end if;
 return jsonb_build_object('dispute',to_jsonb(d));
end;
$function$;

create or replace function public.tvtms_ticket_email_claim(p_ticket_id bigint,p_actor_id bigint)
returns jsonb language plpgsql security invoker set search_path='' as $function$
declare t record; actor_role text; actor_status text; recipient text; ledger public.ticket_email_notifications%rowtype; ledger_found boolean:=false;
begin
  if p_ticket_id is null or p_ticket_id<=0 or p_actor_id is null or p_actor_id<=0 then return jsonb_build_object('errorCode','VALIDATION_ERROR','message','Valid ticket and actor are required.','statusCode',400); end if;
  select role,status into actor_role,actor_status from public.users where id=p_actor_id;
  if actor_status is distinct from 'active' or actor_role not in ('admin','apprehending_officer') then return jsonb_build_object('errorCode','TICKET_ACCESS_DENIED','message','Access denied.','statusCode',403); end if;
  select ti.id,ti.ticket_number,ti.user_id,v.plate_number,viol.violation_name,coalesce(ti.penalty_amount_at_issue,viol.penalty_amount) penalty_amount,nullif(trim(ti.owner_email_at_issue),'') recipient
    into t from public.tickets ti join public.vehicles v on v.id=ti.vehicle_id join public.violations viol on viol.id=ti.violation_id where ti.id=p_ticket_id for update of ti;
  if not found then return jsonb_build_object('errorCode','TICKET_NOT_FOUND','message','Ticket not found.','statusCode',404); end if;
  if actor_role='apprehending_officer' and t.user_id<>p_actor_id then return jsonb_build_object('errorCode','TICKET_ACCESS_DENIED','message','You can only manage notifications for tickets you issued.','statusCode',403); end if;
  recipient:=lower(trim(coalesce(t.recipient,'')));
  select * into ledger from public.ticket_email_notifications where ticket_id=t.id and notification_type='ticket_issued' for update;
  ledger_found:=found;
  if ledger_found and ledger.status='accepted' then return jsonb_build_object('status','already_accepted','ticketId',t.id,'ticketNumber',t.ticket_number,'attemptCount',ledger.attempt_count); end if;
  if ledger_found and ledger.status='unknown' then return jsonb_build_object('status','unknown','ticketId',t.id,'ticketNumber',t.ticket_number,'attemptCount',ledger.attempt_count); end if;
  if ledger_found and ledger.status='sending' then
    if ledger.claimed_at is not null and ledger.claimed_at<=current_timestamp-interval '5 minutes' then
      update public.ticket_email_notifications set status='unknown',updated_at=current_timestamp,last_error_code='delivery_state_unknown',last_error_message='The prior SMTP attempt did not finalize.' where id=ledger.id returning * into ledger;
      return jsonb_build_object('status','unknown','ticketId',t.id,'ticketNumber',t.ticket_number,'attemptCount',ledger.attempt_count);
    end if;
    return jsonb_build_object('status','sending','ticketId',t.id,'ticketNumber',t.ticket_number,'attemptCount',ledger.attempt_count);
  end if;
  if recipient='' or recipient !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    if not ledger_found then insert into public.ticket_email_notifications(ticket_id,status,last_error_code,last_error_message) values(t.id,'not_applicable','missing_recipient','No valid email was recorded for this ticket.') returning * into ledger;
    else update public.ticket_email_notifications set status='not_applicable',updated_at=current_timestamp,last_error_code='missing_recipient',last_error_message='No valid email was recorded for this ticket.' where id=ledger.id returning * into ledger; end if;
    return jsonb_build_object('status','not_applicable','ticketId',t.id,'ticketNumber',t.ticket_number,'attemptCount',ledger.attempt_count);
  end if;
  if ledger_found and ledger.status='not_applicable' then return jsonb_build_object('status','not_applicable','ticketId',t.id,'ticketNumber',t.ticket_number,'attemptCount',ledger.attempt_count); end if;
  if not ledger_found then insert into public.ticket_email_notifications(ticket_id,status) values(t.id,'pending') returning * into ledger; end if;
  update public.ticket_email_notifications set status='sending',attempt_count=attempt_count+1,claimed_at=current_timestamp,last_attempt_at=current_timestamp,updated_at=current_timestamp,last_error_code=null,last_error_message=null where id=ledger.id and status in ('pending','failed') returning * into ledger;
  if not found then return jsonb_build_object('status','unknown','ticketId',t.id,'ticketNumber',t.ticket_number,'attemptCount',ledger.attempt_count); end if;
  return jsonb_build_object('status','claimed','ticketId',t.id,'ticketNumber',t.ticket_number,'recipient',recipient,'plateNumber',t.plate_number,'violationName',t.violation_name,'penaltyAmount',t.penalty_amount,'attemptCount',ledger.attempt_count);
end;
$function$;

create or replace function public.tvtms_dispute_verification_request(p_ticket text,p_challenge_hash text,p_code_hash text,p_requester_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $function$
declare t record; deadline integer; recipient text; latest_request timestamptz; retry_seconds integer; ticket_requests integer; requester_requests integer; verification_id bigint;
begin
  if coalesce(length(p_ticket),0) not between 1 and 30 or p_challenge_hash !~ '^[0-9a-f]{64}$' or p_code_hash !~ '^[0-9a-f]{64}$' or p_requester_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('errorCode','VALIDATION_ERROR','message','Invalid verification request.','statusCode',400); end if;
  select ti.id,ti.ticket_number,ti.status,ti.date_issued,nullif(trim(ti.owner_name_at_issue),'') contact_name,nullif(trim(ti.owner_email_at_issue),'') contact_email into t from public.tickets ti where ti.ticket_number=p_ticket for update of ti;
  if not found then return jsonb_build_object('errorCode','TICKET_NOT_FOUND','message','Ticket not found.','statusCode',404); end if;
  if t.status<>'unpaid' then return jsonb_build_object('errorCode','INVALID_TICKET_STATUS','message','Only unpaid tickets can be disputed.','statusCode',403); end if;
  select coalesce((select setting_value::integer from public.system_settings where setting_key='dispute_deadline_days'),15) into deadline;
  if (current_timestamp at time zone 'UTC')::date-t.date_issued>deadline then return jsonb_build_object('errorCode','DISPUTE_DEADLINE_EXPIRED','message','The '||deadline||'-day dispute period has ended.','statusCode',403); end if;
  if exists(select 1 from public.disputes where ticket_id=t.id and status in ('submitted','under_review')) then return jsonb_build_object('errorCode','DISPUTE_ALREADY_EXISTS','message','A dispute is already open for this ticket.','statusCode',409); end if;
  recipient:=lower(trim(coalesce(t.contact_email,'')));
  if recipient='' or recipient !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return jsonb_build_object('errorCode','VERIFICATION_EMAIL_UNAVAILABLE','message','No valid notification email is recorded for this ticket.','statusCode',409); end if;
  select greatest(requested_at,coalesce(last_sent_at,requested_at)) into latest_request from public.public_dispute_verifications where ticket_id=t.id and delivery_status in ('pending','accepted') and status in ('pending','verified') order by requested_at desc limit 1;
  if latest_request is not null and latest_request>current_timestamp-interval '60 seconds' then retry_seconds:=greatest(1,ceil(extract(epoch from (latest_request+interval '60 seconds'-current_timestamp)))::integer); return jsonb_build_object('errorCode','VERIFICATION_COOLDOWN','message','Please wait before requesting another verification code.','statusCode',429,'retryAfter',retry_seconds); end if;
  select count(*) into ticket_requests from public.public_dispute_verifications where ticket_id=t.id and requested_at>current_timestamp-interval '1 hour';
  select count(*) into requester_requests from public.public_dispute_verifications where requester_fingerprint=p_requester_hash and requested_at>current_timestamp-interval '1 hour';
  if ticket_requests>=5 or requester_requests>=5 then return jsonb_build_object('errorCode','VERIFICATION_RATE_LIMIT','message','Too many verification requests. Please try again later.','statusCode',429,'retryAfter',3600); end if;
  update public.public_dispute_verifications set status='expired' where ticket_id=t.id and status in ('pending','verified');
  insert into public.public_dispute_verifications(ticket_id,challenge_token_hash,code_hash,requester_fingerprint,expires_at) values(t.id,p_challenge_hash,p_code_hash,p_requester_hash,current_timestamp+interval '10 minutes') returning id into verification_id;
  return jsonb_build_object('status','created','verificationId',verification_id,'ticketId',t.id,'ticketNumber',t.ticket_number,'recipient',recipient,'expiresIn',600,'resendAfter',60);
end;
$function$;

create or replace function public.tvtms_public_dispute_verified(p_ticket text,p_challenge_hash text,p_reason text)
returns jsonb language plpgsql security invoker set search_path='' as $function$
declare t record; v public.public_dispute_verifications%rowtype; deadline integer; dispute_id bigint;
begin
  if coalesce(length(p_ticket),0) not between 1 and 30 or p_challenge_hash !~ '^[0-9a-f]{64}$' or coalesce(length(trim(p_reason)),0) not between 10 and 4000 then return jsonb_build_object('errorCode','VALIDATION_ERROR','message','Invalid ticket, verification, or dispute reason.','statusCode',400); end if;
  select ti.*,nullif(trim(ti.owner_name_at_issue),'') contact_name,nullif(trim(ti.owner_email_at_issue),'') contact_email into t from public.tickets ti where ti.ticket_number=p_ticket for update of ti;
  if not found then return jsonb_build_object('errorCode','TICKET_NOT_FOUND','message','Ticket not found.','statusCode',404); end if;
  select * into v from public.public_dispute_verifications where challenge_token_hash=p_challenge_hash for update;
  if not found or v.ticket_id<>t.id then return jsonb_build_object('errorCode','VERIFICATION_REQUIRED','message','A verified email code is required.','statusCode',403); end if;
  if v.status='consumed' then return jsonb_build_object('errorCode','VERIFICATION_ALREADY_USED','message','This verification has already been used.','statusCode',409); end if;
  if v.expires_at<=current_timestamp then update public.public_dispute_verifications set status='expired' where id=v.id and status in ('pending','verified'); return jsonb_build_object('errorCode','VERIFICATION_EXPIRED','message','The verification has expired.','statusCode',410); end if;
  if v.status<>'verified' or v.delivery_status<>'accepted' then return jsonb_build_object('errorCode','VERIFICATION_REQUIRED','message','A verified email code is required.','statusCode',403); end if;
  if t.status<>'unpaid' then return jsonb_build_object('errorCode','INVALID_TICKET_STATUS','message','Only unpaid tickets can be disputed.','statusCode',403); end if;
  if coalesce(trim(t.contact_email),'')='' then return jsonb_build_object('errorCode','VERIFICATION_EMAIL_UNAVAILABLE','message','No valid notification email is recorded for this ticket.','statusCode',409); end if;
  select coalesce((select setting_value::integer from public.system_settings where setting_key='dispute_deadline_days'),15) into deadline;
  if (current_timestamp at time zone 'UTC')::date-t.date_issued>deadline then return jsonb_build_object('errorCode','DISPUTE_DEADLINE_EXPIRED','message','The '||deadline||'-day dispute period has ended.','statusCode',403); end if;
  if exists(select 1 from public.disputes where ticket_id=t.id and status in ('submitted','under_review')) then return jsonb_build_object('errorCode','DISPUTE_ALREADY_EXISTS','message','A dispute is already open for this ticket.','statusCode',409); end if;
  insert into public.disputes(ticket_id,submitted_by,contact_name,contact_email,submission_source,reason,status) values(t.id,null,t.contact_name,t.contact_email,'public',trim(p_reason),'submitted') returning id into dispute_id;
  insert into public.notifications(user_id,type,title,message,reference_type,reference_id) select id,'dispute','Public Dispute Filed','Public dispute filed for ticket '||p_ticket,'dispute',dispute_id from public.users where role='admin' and status='active';
  update public.public_dispute_verifications set status='consumed',consumed_at=current_timestamp where id=v.id;
  return jsonb_build_object('disputeId',dispute_id);
end;
$function$;

revoke all on function public.tvtms_ticket_email_claim(bigint,bigint) from public, anon, authenticated, service_role;
revoke all on function public.tvtms_dispute_verification_request(text,text,text,text) from public, anon, authenticated, service_role;
revoke all on function public.tvtms_public_dispute_verified(text,text,text) from public, anon, authenticated, service_role;
revoke all on function public.tvtms_payment_record(bigint,text,numeric,date,text,text,bigint) from public, anon, authenticated, service_role;
revoke all on function public.tvtms_dispute_resolve(bigint,text,text,bigint) from public, anon, authenticated, service_role;

grant execute on function public.tvtms_ticket_email_claim(bigint,bigint) to service_role;
grant execute on function public.tvtms_dispute_verification_request(text,text,text,text) to service_role;
grant execute on function public.tvtms_public_dispute_verified(text,text,text) to service_role;
grant execute on function public.tvtms_payment_record(bigint,text,numeric,date,text,text,bigint) to service_role;
grant execute on function public.tvtms_dispute_resolve(bigint,text,text,bigint) to service_role;

-- Minimize unauthenticated lookup responses while retaining the approved ticket,
-- payment-status, balance, and dispute-eligibility workflow.
create or replace function public.tvtms_public_lookup(p_plate text,p_ticket text)
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(q) order by q.date_issued desc,q.ticket_number desc),'[]'::jsonb) from (
 select td.ticket_number,td.plate_number,td.vehicle_type,td.violation_code,td.violation_name,td.date_issued,td.status,td.payment_date,td.penalty_amount,
 coalesce((select setting_value::integer from public.system_settings where setting_key='dispute_deadline_days'),15) dispute_deadline_days,
 current_date-td.date_issued dispute_age_days,
 case when exists(select 1 from public.disputes d where d.ticket_id=td.id and d.status in ('submitted','under_review')) then 1 else 0 end has_open_dispute,
 coalesce(nullif(trim(t.owner_email_at_issue),''),'')<>'' has_notification_email,
 coalesce(p.total,0) total_paid,greatest(td.penalty_amount-coalesce(p.total,0),0) remaining_balance
 from public.ticket_details td join public.tickets t on t.id=td.id
 left join lateral (select sum(amount_paid) total from public.payments where ticket_id=td.id and payment_status<>'voided') p on true
 where (p_plate is not null or p_ticket is not null)
 and (p_plate is null or replace(replace(td.plate_number,'-',''),' ','')=p_plate)
 and (p_ticket is null or td.ticket_number=p_ticket)
 order by td.date_issued desc,td.id desc limit 20) q;
$$;

create or replace function public.tvtms_public_vehicle(p_plate text)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'vehicles',coalesce((select jsonb_agg(to_jsonb(v)) from (select plate_number,vehicle_type from public.vehicles where replace(replace(plate_number,'-',''),' ','')=p_plate limit 1) v),'[]'::jsonb),
 'violations',coalesce((select jsonb_agg(to_jsonb(q) order by q.date_issued desc,q.ticket_number desc) from (
 select td.ticket_number,td.plate_number,td.violation_name,td.violation_code,td.date_issued,td.status,td.penalty_amount,
 coalesce(p.total,0) total_paid,greatest(td.penalty_amount-coalesce(p.total,0),0) remaining_balance
 from public.ticket_details td
 left join lateral (select sum(amount_paid) total from public.payments where ticket_id=td.id and payment_status<>'voided') p on true
 where replace(replace(td.plate_number,'-',''),' ','')=p_plate order by td.date_issued desc,td.id desc limit 20) q),'[]'::jsonb));
$$;

revoke all on function public.tvtms_public_lookup(text,text) from public, anon, authenticated, service_role;
revoke all on function public.tvtms_public_vehicle(text) from public, anon, authenticated, service_role;
grant execute on function public.tvtms_public_lookup(text,text) to service_role;
grant execute on function public.tvtms_public_vehicle(text) to service_role;
