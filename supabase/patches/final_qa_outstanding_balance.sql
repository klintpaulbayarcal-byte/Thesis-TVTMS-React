-- F3 forward correction, prepared for review only.
-- No migration replay or data rewrite. Apply only after separate approval.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.tvtms_report_payment_status(p_args jsonb default '[]'::jsonb)
returns jsonb language sql stable security invoker
set search_path = ''
set timezone = 'Asia/Manila'
as $report$
    select coalesce(jsonb_agg(to_jsonb(report_row)), '[]'::jsonb) from (
        select t.status, count(*) as count,
            coalesce(sum(case when t.status = 'unpaid'
                then greatest(coalesce(t.penalty_amount_at_issue,v.penalty_amount)-pay.total_paid,0)
                else coalesce(t.penalty_amount_at_issue,v.penalty_amount) end),0) as amount
        from public.tickets t
        left join public.violations v on t.violation_id=v.id
        left join lateral (
            select coalesce(sum(p.amount_paid),0) as total_paid
            from public.payments p
            where p.ticket_id=t.id and p.payment_status<>'voided'
        ) pay on true
        where t.date_issued between (p_args->>0)::date and (p_args->>1)::date
        group by t.status
    ) report_row;
$report$;
revoke all on function public.tvtms_report_payment_status(jsonb) from public,anon,authenticated;
grant execute on function public.tvtms_report_payment_status(jsonb) to service_role;
commit;
