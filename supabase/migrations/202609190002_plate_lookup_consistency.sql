-- Follow-up to 202609190001_ticket_history_payment_display.sql.
-- Review-only migration: do NOT execute against production before staging approval.
-- A vehicle ID is not a canonical plate identity: older rows can have distinct
-- vehicle IDs with plates such as ABC-123 and ABC123.

create or replace function public.tvtms_catalog_vehicle_violations(p_id bigint)
returns jsonb language sql stable security invoker set search_path='' as $$
  with plate as (
    select replace(replace(upper(plate_number),'-',''),' ','') as normalized_plate
    from public.vehicles where id=p_id
  )
  select coalesce(jsonb_agg(r order by r.date_issued desc,r.time_issued desc,r.id desc),'[]'::jsonb)
  from (
    select t.id,t.ticket_number,t.date_issued,t.time_issued,t.location,t.status,
      t.plate_ticket_count_at_issue,t.same_violation_offense_count_at_issue,
      coalesce(t.penalty_amount_at_issue,v.penalty_amount) penalty_amount,
      coalesce(p.total,0) total_paid,
      case when t.status='cancelled' then 0
           else greatest(coalesce(t.penalty_amount_at_issue,v.penalty_amount)-coalesce(p.total,0),0)
      end remaining_balance,
      case when t.status='cancelled' then 'cancelled'
           when greatest(coalesce(t.penalty_amount_at_issue,v.penalty_amount)-coalesce(p.total,0),0)=0 then 'paid'
           when coalesce(p.total,0)>0 then 'partially_paid'
           else 'unpaid' end payment_status,
      v.violation_name,v.violation_code,v.demerit_points
    from plate pl
    join public.vehicles tv
      on replace(replace(upper(tv.plate_number),'-',''),' ','')=pl.normalized_plate
    join public.tickets t on t.vehicle_id=tv.id
    join public.violations v on v.id=t.violation_id
    left join lateral (
      select sum(amount_paid) total from public.payments
      where ticket_id=t.id and payment_status<>'voided'
    ) p on true
  ) r;
$$;

create or replace function public.tvtms_catalog_vehicle_stats(p_id bigint)
returns jsonb language sql stable security invoker set search_path='' as $$
  with plate as (
    select replace(replace(upper(plate_number),'-',''),' ','') as normalized_plate
    from public.vehicles where id=p_id
  )
  select jsonb_build_object(
    'historical_ticket_count',count(t.id),
    'total_violations',count(t.id) filter(where t.status<>'cancelled'),
    'non_cancelled_ticket_count',count(t.id) filter(where t.status<>'cancelled'),
    'paid_count',count(t.id) filter(where t.status='paid'),
    'unpaid_count',count(t.id) filter(where t.status='unpaid'),
    'cancelled_count',count(t.id) filter(where t.status='cancelled'),
    'disputed_count',count(t.id) filter(where exists(
      select 1 from public.disputes d where d.ticket_id=t.id
      and d.status in ('submitted','under_review')
    )),
    'outstanding_balance',coalesce(sum(
      case when t.status='unpaid'
           then greatest(coalesce(t.penalty_amount_at_issue,v.penalty_amount)-coalesce(p.total,0),0)
           else 0 end
    ),0),
    -- The sequence is authoritative even when the most recent ticket was
    -- permanently deleted. Never infer the next number from surviving rows.
    'next_plate_ticket_count',coalesce((
      select s.last_number+1 from public.plate_ticket_sequences s
      where s.normalized_plate=pl.normalized_plate
    ),1)
  )
  from plate pl
  left join public.vehicles tv
    on replace(replace(upper(tv.plate_number),'-',''),' ','')=pl.normalized_plate
  left join public.tickets t on t.vehicle_id=tv.id
  left join public.violations v on v.id=t.violation_id
  left join lateral (
    select sum(amount_paid) total from public.payments
    where ticket_id=t.id and payment_status<>'voided'
  ) p on true
  group by pl.normalized_plate;
$$;

revoke all on function public.tvtms_catalog_vehicle_violations(bigint),
  public.tvtms_catalog_vehicle_stats(bigint) from public,anon,authenticated;
grant execute on function public.tvtms_catalog_vehicle_violations(bigint),
  public.tvtms_catalog_vehicle_stats(bigint) to service_role;
