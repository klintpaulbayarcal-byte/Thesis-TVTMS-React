-- Panel revision: verified driver self-service accounts and read-only,
-- email-scoped citation snapshots. Never infer ownership from a plate alone.
alter table public.users
  add column if not exists driver_signup_token_hash char(64),
  add column if not exists driver_signup_expires_at timestamptz,
  add column if not exists driver_signup_last_sent_at timestamptz,
  add column if not exists driver_verified_at timestamptz;

-- Invoker privileges apply. This is only callable by the server service role;
-- browser anon/authenticated clients receive no Data API permission.
create or replace function public.tvtms_driver_portal(p_email text)
returns jsonb language sql stable security invoker set search_path='' as $fn$
select coalesce(jsonb_agg(
 jsonb_build_object(
  'ticketNumber',t.ticket_number,
  'dateIssued',t.date_issued,
  'citedDriverName',nullif(trim(concat_ws(' ',nullif(trim(t.driver_first_name),''),nullif(trim(t.driver_middle_name),''),nullif(trim(t.driver_last_name),''))),''),
  'driverAddress',t.driver_address,
  'driverNationality',t.driver_nationality,
  'licenseType',t.license_type,
  'licenseTypeOther',t.license_type_other,
  'licenseNumber',t.driver_license_at_issue,
  'plateNumber',t.plate_at_issue,
  'vehicleType',t.vehicle_type_at_issue,
  'vehicleMake',t.vehicle_make_at_issue,
  'status',t.status,
  'penaltyAmount',coalesce((select sum(tv.penalty_amount_at_issue)
                    from public.ticket_violations tv where tv.ticket_id=t.id),
                    t.penalty_amount_at_issue,0),
  'totalPaid',coalesce((select sum(p.amount_paid) from public.payments p
                    where p.ticket_id=t.id and p.payment_status in ('partial','full')),0),
  'remainingBalance',case when t.status='cancelled' then 0
    else greatest(0,
      coalesce((select sum(tv.penalty_amount_at_issue) from public.ticket_violations tv where tv.ticket_id=t.id),
               t.penalty_amount_at_issue,0)
      -coalesce((select sum(p.amount_paid) from public.payments p
                 where p.ticket_id=t.id and p.payment_status in ('partial','full')),0))
    end,
  'violations',coalesce((select jsonb_agg(jsonb_build_object(
    'name',tv.violation_name_at_issue,
    'code',tv.violation_code_at_issue,
    'penalty',tv.penalty_amount_at_issue) order by tv.id)
                    from public.ticket_violations tv where tv.ticket_id=t.id),'[]'::jsonb)
 ) order by t.date_issued desc,t.id desc
), '[]'::jsonb)
from (select * from public.tickets
      where citation_version=2
        and nullif(trim(driver_email_at_issue),'') is not null
        and lower(trim(driver_email_at_issue))=lower(trim(p_email))
      order by date_issued desc,id desc limit 200) t;
$fn$;
revoke all on function public.tvtms_driver_portal(text) from public,anon,authenticated,service_role;
grant execute on function public.tvtms_driver_portal(text) to service_role;
