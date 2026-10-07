-- Forward-only report corrections. No ticket, payment or location data is rewritten.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.tvtms_report_aging(p_args jsonb default '[]'::jsonb)
returns jsonb language sql stable security invoker
set search_path = '' set timezone = 'Asia/Manila'
as $report$
 select coalesce(jsonb_agg(to_jsonb(r) order by r.days_overdue desc),'[]'::jsonb)
 from (
  select v.plate_number,v.vehicle_type,v.owner_name,v.owner_email,
    count(t.id) as unpaid_tickets,
    sum(coalesce(t.penalty_amount_at_issue,viol.penalty_amount)) as original_penalty,
    sum(pay.total_paid) as total_paid,
    sum(debt.balance) as total_due,
    min(t.date_issued) as oldest_unpaid_date,
    current_date-min(t.date_issued)::date as days_overdue,
    case when current_date-min(t.date_issued)::date<=30 then '0-30 days'
         when current_date-min(t.date_issued)::date<=60 then '31-60 days'
         else '60+ days (critical)' end as aging_bucket
  from public.tickets t
  join public.vehicles v on v.id=t.vehicle_id
  left join public.violations viol on viol.id=t.violation_id
  left join lateral (
    select coalesce(sum(p.amount_paid),0) as total_paid from public.payments p
    where p.ticket_id=t.id and p.payment_status<>'voided'
  ) pay on true
  cross join lateral (
    select greatest(coalesce(t.penalty_amount_at_issue,viol.penalty_amount)-pay.total_paid,0) as balance
  ) debt
  where t.status<>'cancelled' and debt.balance>0
  group by v.plate_number,v.vehicle_type,v.owner_name,v.owner_email
 ) r;
$report$;

create or replace function public.tvtms_report_barangay(p_args jsonb default '[]'::jsonb)
returns jsonb language sql stable security invoker
set search_path = '' set timezone = 'Asia/Manila'
as $report$
 with citations as (
  -- Keep the whole recorded place. A comma may separate a coordinate pair.
  select t.id,trim(t.location) as barangay,t.status,
    coalesce(t.penalty_amount_at_issue,v.penalty_amount) as penalty
  from public.tickets t left join public.violations v on v.id=t.violation_id
  where nullif(trim(t.location),'') is not null
 ), totals as (
  select barangay,count(*) as total_tickets,
    count(*) filter(where status='paid') as paid,
    count(*) filter(where status='unpaid') as unpaid,sum(penalty) as total_value
  from citations group by barangay
 ), names as (
  select c.barangay,string_agg(distinct tv.violation_name_at_issue,', ' order by tv.violation_name_at_issue) as top_violations
  from citations c join public.ticket_violations tv on tv.ticket_id=c.id group by c.barangay
 )
 select coalesce(jsonb_agg(to_jsonb(r) order by r.total_tickets desc),'[]'::jsonb)
 from (select totals.*,names.top_violations from totals left join names using(barangay)
       order by totals.total_tickets desc,totals.barangay limit 30) r;
$report$;

create or replace function public.tvtms_report_payment_status(p_args jsonb default '[]'::jsonb)
returns jsonb language sql stable security invoker
set search_path = '' set timezone = 'Asia/Manila'
as $report$
 with settlement as (
  select case when t.status='cancelled' then 'cancelled'
              when debt.balance<=0 then 'paid'
              when pay.total_paid>0 then 'partially_paid' else 'unpaid' end as status,
         coalesce(t.penalty_amount_at_issue,v.penalty_amount) as penalty,debt.balance
  from public.tickets t left join public.violations v on v.id=t.violation_id
  left join lateral (
   select coalesce(sum(p.amount_paid),0) as total_paid from public.payments p
   where p.ticket_id=t.id and p.payment_status<>'voided'
  ) pay on true
  cross join lateral (
   select greatest(coalesce(t.penalty_amount_at_issue,v.penalty_amount)-pay.total_paid,0) as balance
  ) debt
  where t.date_issued between (p_args->>0)::date and (p_args->>1)::date
 )
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (
  select status,count(*) as count,
    sum(case when status in ('unpaid','partially_paid') then balance else penalty end) as amount
  from settlement group by status
 ) r;
$report$;

revoke all on function public.tvtms_report_aging(jsonb),public.tvtms_report_barangay(jsonb),public.tvtms_report_payment_status(jsonb) from public,anon,authenticated;
grant execute on function public.tvtms_report_aging(jsonb),public.tvtms_report_barangay(jsonb),public.tvtms_report_payment_status(jsonb) to service_role;
commit;
