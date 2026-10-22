from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL = (ROOT / 'supabase/migrations/202609270001_public_dispute_without_otp.sql').read_text(encoding='utf-8').lower()
BODY = SQL.split('as $function$', 1)[1].split('$function$;', 1)[0]


def test_public_submission_checks_policy_under_ticket_lock_before_insert():
    lock = BODY.index('where ticket_number=p_ticket for update')
    insert = BODY.index('insert into public.disputes')
    for guard in ['if not found', "t.status<>'unpaid'", "setting_key='dispute_deadline_days'",
                  "::date-t.date_issued>deadline", "status in ('submitted','under_review')",
                  "from public.vehicles where id=t.vehicle_id", "from public.payments where ticket_id=t.id"]:
        assert lock < BODY.index(guard) < insert
    assert 'coalesce(length(trim(p_reason)),0) not between 10 and 4000' in BODY
    assert 'challenge' not in BODY
    assert 'verification' not in BODY


def test_public_submission_only_creates_review_request_and_admin_notification():
    assert "'public',trim(p_reason),'submitted'" in BODY
    assert 'insert into public.notifications' in BODY
    assert "role='admin' and status='active'" in BODY
    assert 'update public.tickets' not in BODY
    assert 'delete from' not in BODY
    assert 'tvtms_dispute_create(' not in SQL
    assert 'tvtms_dispute_resolve(' not in SQL


def test_public_submission_rpc_is_service_role_only():
    signature = 'public.tvtms_public_dispute_submit(text,text,text)'
    assert f'revoke all on function {signature} from public, anon, authenticated, service_role' in SQL
    assert f'grant execute on function {signature} to service_role' in SQL
    assert "security invoker set search_path=''" in SQL


def test_plate_payment_and_manila_policy_are_enforced_in_migration():
    assert "upper(regexp_replace(trim(p_plate),'[[:space:]-]+','','g'))" in BODY
    assert 'payment_status' not in BODY  # All recorded payments, including voided.
    assert "at time zone 'asia/manila'" in BODY
    assert "at time zone 'utc'" not in SQL
    assert 'has_recorded_payment' in SQL
    assert "at time zone 'asia/manila')::date-td.date_issued" in SQL
