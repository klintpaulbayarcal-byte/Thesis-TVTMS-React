-- Immutable plate ticket sequence snapshots and dynamic payment/history displays.
-- Review artifact only: apply to staging before any separately authorized production use.

alter table public.tickets
  add column if not exists plate_ticket_count_at_issue integer,
  add column if not exists same_violation_offense_count_at_issue integer;

alter table public.tickets drop constraint if exists tickets_plate_ticket_count_at_issue_check;
alter table public.tickets add constraint tickets_plate_ticket_count_at_issue_check
  check (plate_ticket_count_at_issue is null or plate_ticket_count_at_issue > 0);
alter table public.tickets drop constraint if exists tickets_same_violation_offense_count_at_issue_check;
alter table public.tickets add constraint tickets_same_violation_offense_count_at_issue_check
  check (same_violation_offense_count_at_issue is null or same_violation_offense_count_at_issue > 0);

with ranked as (
  select t.id,
    row_number() over (
      partition by replace(replace(upper(v.plate_number),'-',''),' ','')
      order by t.date_issued,t.time_issued,t.created_at,t.id
    )::integer plate_count
  from public.tickets t join public.vehicles v on v.id=t.vehicle_id
)
update public.tickets t set plate_ticket_count_at_issue=r.plate_count
from ranked r where r.id=t.id and t.plate_ticket_count_at_issue is null;

with ranked as (
  select t.id,
    count(*) filter (where prior.status<>'cancelled')::integer offense_count
  from public.tickets t
  join public.vehicles v on v.id=t.vehicle_id
  join public.tickets prior on prior.violation_id=t.violation_id
  join public.vehicles pv on pv.id=prior.vehicle_id
    and replace(replace(upper(pv.plate_number),'-',''),' ','')=replace(replace(upper(v.plate_number),'-',''),' ','')
    and (prior.date_issued,prior.time_issued,prior.created_at,prior.id)<=(t.date_issued,t.time_issued,t.created_at,t.id)
  group by t.id
)
update public.tickets t set same_violation_offense_count_at_issue=greatest(r.offense_count,1)
from ranked r where r.id=t.id and t.same_violation_offense_count_at_issue is null;

alter table public.tickets alter column plate_ticket_count_at_issue set not null;
alter table public.tickets alter column same_violation_offense_count_at_issue set not null;

create table if not exists public.plate_ticket_sequences (
  normalized_plate text primary key,
  last_number integer not null check (last_number > 0),
  updated_at timestamptz not null default current_timestamp
);

insert into public.plate_ticket_sequences(normalized_plate,last_number)
select replace(replace(upper(v.plate_number),'-',''),' ',''),max(t.plate_ticket_count_at_issue)
from public.tickets t join public.vehicles v on v.id=t.vehicle_id
group by replace(replace(upper(v.plate_number),'-',''),' ','')
on conflict (normalized_plate) do update
set last_number=greatest(public.plate_ticket_sequences.last_number,excluded.last_number),updated_at=current_timestamp;

alter table public.plate_ticket_sequences enable row level security;
revoke all on table public.plate_ticket_sequences from anon, authenticated;
revoke all on table public.plate_ticket_sequences from public, service_role;
grant select, insert, update on table public.plate_ticket_sequences to service_role;

create or replace function private.prevent_ticket_snapshot_update()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.plate_ticket_count_at_issue is distinct from old.plate_ticket_count_at_issue
    or new.same_violation_offense_count_at_issue is distinct from old.same_violation_offense_count_at_issue then
    raise exception 'Ticket issuance snapshots are immutable' using errcode='23514';
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_immutable_issuance_snapshots on public.tickets;
create trigger tickets_immutable_issuance_snapshots
before update of plate_ticket_count_at_issue,same_violation_offense_count_at_issue on public.tickets
for each row execute function private.prevent_ticket_snapshot_update();

create or replace view public.ticket_details with (security_invoker = true) as
select t.id,t.ticket_number,t.date_issued,t.time_issued,t.location,t.status,t.payment_date,t.user_id,
       coalesce(t.penalty_amount_at_issue,viol.penalty_amount) as penalty_amount,t.penalty_amount_at_issue,
       u.name as officer_name,v.plate_number,v.vehicle_type,
       coalesce(t.owner_name_at_issue,v.owner_name) as owner_name,
       coalesce(t.owner_email_at_issue,v.owner_email) as owner_email,
       coalesce(t.owner_address_at_issue,v.owner_address) as owner_address,
       v.driver_license_number,viol.violation_code,viol.violation_name,viol.demerit_points,
       t.plate_ticket_count_at_issue,t.same_violation_offense_count_at_issue
from public.tickets t
join public.users u on t.user_id=u.id
join public.vehicles v on t.vehicle_id=v.id
join public.violations viol on t.violation_id=viol.id;

revoke all on table public.ticket_details from anon,authenticated;
grant select on table public.ticket_details to service_role;

create or replace function public.tvtms_ticket_create(p_data jsonb,p_user_id bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_vehicle public.vehicles%rowtype; v_violation public.violations%rowtype; v_owner_id bigint;
  v_ticket public.tickets%rowtype; v_name text:=nullif(p_data->>'owner_name','');
  v_email text:=nullif(p_data->>'owner_email',''); v_address text:=nullif(p_data->>'owner_address','');
  v_plate text:=p_data->>'plate_number'; v_now timestamp:=current_timestamp at time zone 'Asia/Manila';
  v_year smallint:=extract(year from v_now)::smallint; v_number integer; v_offense integer;
  v_plate_count integer; v_penalty numeric; v_rule boolean;
begin
  select * into v_violation from public.violations where id=(p_data->>'violation_id')::bigint for share;
  if not found or v_violation.status<>'active' then return public.tvtms_ticket_error('VIOLATION_UNAVAILABLE','Selected violation is unavailable',400); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tvtms:plate:'||v_plate,0));
  if v_name is not null or v_email is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tvtms:owner:'||coalesce(v_email,v_name),0));
    if v_email is not null then select id into v_owner_id from public.owners where email=v_email order by id limit 1 for update;
    else select id into v_owner_id from public.owners where name=v_name order by id desc limit 1 for update; end if;
    if v_owner_id is null then insert into public.owners(name,email,address) values(coalesce(v_name,'Unknown Owner'),v_email,v_address) returning id into v_owner_id;
    else update public.owners set name=coalesce(v_name,name),email=coalesce(v_email,email),address=coalesce(v_address,address) where id=v_owner_id; end if;
  end if;
  select * into v_vehicle from public.vehicles where replace(replace(upper(plate_number),'-',''),' ','')=v_plate order by id limit 1 for update;
  if found then
    update public.vehicles set vehicle_type=p_data->>'vehicle_type',owner_name=coalesce(v_name,owner_name),owner_email=coalesce(v_email,owner_email),
      owner_address=coalesce(v_address,owner_address),owner_id=coalesce(v_owner_id,owner_id),driver_license_number=coalesce(nullif(p_data->>'driver_license_number',''),driver_license_number)
      where id=v_vehicle.id;
    v_name:=coalesce(v_name,v_vehicle.owner_name); v_email:=coalesce(v_email,v_vehicle.owner_email); v_address:=coalesce(v_address,v_vehicle.owner_address);
  else
    insert into public.vehicles(plate_number,vehicle_type,owner_name,owner_email,owner_address,owner_id,driver_license_number)
      values(v_plate,p_data->>'vehicle_type',v_name,v_email,v_address,v_owner_id,nullif(p_data->>'driver_license_number','')) returning * into v_vehicle;
  end if;
  insert into public.plate_ticket_sequences(normalized_plate,last_number) values(v_plate,1)
    on conflict (normalized_plate) do update set last_number=public.plate_ticket_sequences.last_number+1,updated_at=current_timestamp
    returning last_number into v_plate_count;
  select count(*)+1 into v_offense from public.tickets t join public.vehicles v on v.id=t.vehicle_id
    where t.violation_id=v_violation.id and replace(replace(upper(v.plate_number),'-',''),' ','')=v_plate and t.status<>'cancelled';
  select penalty_amount into v_penalty from public.violation_penalty_rules where violation_id=v_violation.id and offense_count=v_offense
    and is_active=1 and effective_from<=v_now::date and (effective_to is null or effective_to>=v_now::date) order by effective_from desc limit 1;
  v_rule:=found; v_penalty:=coalesce(v_penalty,v_violation.penalty_amount);
  insert into public.ticket_number_sequences(sequence_year,last_number) values(v_year,1)
    on conflict(sequence_year) do update set last_number=public.ticket_number_sequences.last_number+1,updated_at=current_timestamp returning last_number into v_number;
  insert into public.tickets(ticket_number,user_id,vehicle_id,violation_id,owner_name_at_issue,owner_email_at_issue,owner_address_at_issue,
    penalty_amount_at_issue,date_issued,time_issued,location,remarks,plate_ticket_count_at_issue,same_violation_offense_count_at_issue)
  values('TVT-'||v_year||'-'||lpad(v_number::text,greatest(6,length(v_number::text)),'0'),p_user_id,v_vehicle.id,v_violation.id,v_name,v_email,v_address,
    v_penalty,v_now::date,v_now::time,nullif(p_data->>'location',''),nullif(p_data->>'remarks',''),v_plate_count,v_offense) returning * into v_ticket;
  insert into public.ticket_status_history(ticket_id,previous_status,new_status,changed_by,reason) values
    (v_ticket.id,null,'draft',p_user_id,'Ticket drafted in system'),(v_ticket.id,'draft','issued',p_user_id,'Ticket was issued');
  return jsonb_build_object('ticket',(select to_jsonb(td) from public.ticket_details td where td.id=v_ticket.id),
    'penaltyInfo',jsonb_build_object('basePenalty',v_violation.penalty_amount,'effectivePenalty',v_penalty,
      'plateTicketCountAtIssue',v_plate_count,'sameViolationOffenseCountAtIssue',v_offense,'nextOffenseCount',v_offense,'usedEscalationRule',v_rule));
end;
$$;

create or replace function public.tvtms_catalog_vehicle_violations(p_id bigint)
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(r order by r.date_issued desc,r.time_issued desc,r.id desc),'[]'::jsonb) from (
    select t.id,t.ticket_number,t.date_issued,t.time_issued,t.location,t.status,t.plate_ticket_count_at_issue,t.same_violation_offense_count_at_issue,
      coalesce(t.penalty_amount_at_issue,v.penalty_amount) penalty_amount,coalesce(p.total,0) total_paid,
      case when t.status='cancelled' then 0 else greatest(coalesce(t.penalty_amount_at_issue,v.penalty_amount)-coalesce(p.total,0),0) end remaining_balance,
      case when t.status='cancelled' then 'cancelled' when greatest(coalesce(t.penalty_amount_at_issue,v.penalty_amount)-coalesce(p.total,0),0)=0 then 'paid' when coalesce(p.total,0)>0 then 'partially_paid' else 'unpaid' end payment_status,
      v.violation_name,v.violation_code,v.demerit_points
    from public.tickets t join public.violations v on v.id=t.violation_id
    left join lateral(select sum(amount_paid) total from public.payments where ticket_id=t.id and payment_status<>'voided') p on true
    where t.vehicle_id=p_id) r;
$$;

create or replace function public.tvtms_catalog_vehicle_stats(p_id bigint)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('historical_ticket_count',count(*),'total_violations',count(*) filter(where t.status<>'cancelled'),
    'non_cancelled_ticket_count',count(*) filter(where t.status<>'cancelled'),'paid_count',count(*) filter(where t.status='paid'),
    'unpaid_count',count(*) filter(where t.status='unpaid'),'cancelled_count',count(*) filter(where t.status='cancelled'),
    'disputed_count',count(*) filter(where exists(select 1 from public.disputes d where d.ticket_id=t.id and d.status in ('submitted','under_review'))),
    'outstanding_balance',coalesce(sum(case when t.status='unpaid' then greatest(coalesce(t.penalty_amount_at_issue,v.penalty_amount)-coalesce(p.total,0),0) else 0 end),0),
    'next_plate_ticket_count',coalesce(max(t.plate_ticket_count_at_issue),0)+1)
  from public.tickets t join public.violations v on v.id=t.violation_id
  left join lateral(select sum(amount_paid) total from public.payments where ticket_id=t.id and payment_status<>'voided') p on true where t.vehicle_id=p_id;
$$;

create or replace function public.tvtms_public_lookup(p_plate text,p_ticket text)
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(q) order by q.date_issued desc,q.time_issued desc),'[]'::jsonb) from (
 select td.id,td.ticket_number,td.plate_number,td.vehicle_type,td.violation_code,td.violation_name,td.date_issued,td.time_issued,td.location,td.status,
 td.payment_date,td.demerit_points,td.penalty_amount,td.plate_ticket_count_at_issue,td.same_violation_offense_count_at_issue,
 coalesce((select setting_value::integer from public.system_settings where setting_key='dispute_deadline_days'),15) dispute_deadline_days,
 current_date-td.date_issued dispute_age_days,case when exists(select 1 from public.disputes d where d.ticket_id=td.id and d.status in ('submitted','under_review')) then 1 else 0 end has_open_dispute,
 coalesce(p.total,0) total_paid,case when td.status='cancelled' then 0 else greatest(td.penalty_amount-coalesce(p.total,0),0) end remaining_balance,
 case when td.status='cancelled' then 'cancelled' when greatest(td.penalty_amount-coalesce(p.total,0),0)=0 then 'paid' when coalesce(p.total,0)>0 then 'partially_paid' else 'unpaid' end payment_status
 from public.ticket_details td left join lateral(select sum(amount_paid) total from public.payments where ticket_id=td.id and payment_status<>'voided') p on true
 where (p_plate is not null or p_ticket is not null) and (p_plate is null or replace(replace(upper(td.plate_number),'-',''),' ','')=p_plate)
 and (p_ticket is null or td.ticket_number=p_ticket) order by td.date_issued desc,td.time_issued desc limit 100) q;
$$;

create or replace function public.tvtms_public_vehicle(p_plate text)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('vehicles',coalesce((select jsonb_agg(to_jsonb(v)) from (select plate_number,vehicle_type from public.vehicles where replace(replace(upper(plate_number),'-',''),' ','')=p_plate limit 1)v),'[]'::jsonb),
 'violations',coalesce((select jsonb_agg(to_jsonb(q)-'sort_time' order by q.date_issued desc,q.sort_time desc) from (
 select td.ticket_number,td.violation_name,td.violation_code,td.date_issued,td.status,td.penalty_amount,td.location,td.demerit_points,td.time_issued sort_time,
 td.plate_ticket_count_at_issue,td.same_violation_offense_count_at_issue,coalesce(p.total,0) total_paid,
 case when td.status='cancelled' then 0 else greatest(td.penalty_amount-coalesce(p.total,0),0) end remaining_balance,
 case when td.status='cancelled' then 'cancelled' when greatest(td.penalty_amount-coalesce(p.total,0),0)=0 then 'paid' when coalesce(p.total,0)>0 then 'partially_paid' else 'unpaid' end payment_status
 from public.ticket_details td left join lateral(select sum(amount_paid) total from public.payments where ticket_id=td.id and payment_status<>'voided')p on true
 where replace(replace(upper(td.plate_number),'-',''),' ','')=p_plate order by td.date_issued desc,td.time_issued desc limit 100)q),'[]'::jsonb));
$$;

create or replace function public.tvtms_public_summary(p_plate text)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('historical_ticket_count',count(*),'total_violations',count(*) filter(where t.status<>'cancelled'),
 'non_cancelled_ticket_count',count(*) filter(where t.status<>'cancelled'),'unpaid_count',count(*) filter(where t.status='unpaid'),
 'paid_count',count(*) filter(where t.status='paid'),'cancelled_count',count(*) filter(where t.status='cancelled'),
 'total_outstanding_balance',coalesce(sum(case when t.status='unpaid' then greatest(coalesce(t.penalty_amount_at_issue,v.penalty_amount)-coalesce(p.total,0),0) else 0 end),0),
 'total_unpaid_amount',coalesce(sum(case when t.status='unpaid' then greatest(coalesce(t.penalty_amount_at_issue,v.penalty_amount)-coalesce(p.total,0),0) else 0 end),0),
 'total_demerit_points',coalesce(sum(case when t.status<>'cancelled' then v.demerit_points else 0 end),0))
 from public.tickets t join public.vehicles ve on ve.id=t.vehicle_id join public.violations v on v.id=t.violation_id
 left join lateral(select sum(amount_paid) total from public.payments where ticket_id=t.id and payment_status<>'voided')p on true
 where replace(replace(upper(ve.plate_number),'-',''),' ','')=p_plate;
$$;

create or replace function public.tvtms_ticket_mark_unpaid(p_id bigint,p_user_id bigint,p_role text,p_reason text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_ticket public.tickets%rowtype; v_ids bigint[]; v_amount numeric:=0; v_count integer:=0;
begin
  if p_role<>'admin' then return public.tvtms_ticket_error('ADMIN_REQUIRED','Administrator approval is required',403); end if;
  select * into v_ticket from public.tickets where id=p_id for update;
  if not found then return public.tvtms_ticket_error('TICKET_NOT_FOUND','Ticket not found',404); end if;
  if v_ticket.status<>'paid' then return public.tvtms_ticket_error('TICKET_NOT_PAID','Only paid tickets can be marked unpaid',409); end if;
  select coalesce(array_agg(id order by id),'{}'::bigint[]),coalesce(sum(amount_paid),0),count(*)
    into v_ids,v_amount,v_count from public.payments where ticket_id=p_id and payment_status<>'voided';
  update public.payments set payment_status='voided',notes=concat_ws(E'\n',nullif(notes,''),'Voided because paid status was corrected: '||p_reason)
    where ticket_id=p_id and payment_status<>'voided';
  update public.tickets set status='unpaid',payment_date=null where id=p_id returning * into v_ticket;
  insert into public.ticket_status_history(ticket_id,previous_status,new_status,changed_by,reason,approver_id)
    values(p_id,'paid','unpaid',p_user_id,'Payment correction: '||p_reason||' (voided payment records: '||v_count||', amount: '||v_amount||')',p_user_id);
  return jsonb_build_object('ticket',to_jsonb(v_ticket),'voidedPayments',v_count,'voidedPaymentIds',to_jsonb(v_ids),'voidedPaymentAmount',v_amount);
end;
$$;

revoke all on function public.tvtms_ticket_create(jsonb,bigint),public.tvtms_catalog_vehicle_violations(bigint),public.tvtms_catalog_vehicle_stats(bigint),
 public.tvtms_public_lookup(text,text),public.tvtms_public_vehicle(text),public.tvtms_public_summary(text),public.tvtms_ticket_mark_unpaid(bigint,bigint,text,text)
 from public,anon,authenticated;
grant execute on function public.tvtms_ticket_create(jsonb,bigint),public.tvtms_catalog_vehicle_violations(bigint),public.tvtms_catalog_vehicle_stats(bigint),
 public.tvtms_public_lookup(text,text),public.tvtms_public_vehicle(text),public.tvtms_public_summary(text),public.tvtms_ticket_mark_unpaid(bigint,bigint,text,text)
 to service_role;
