from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parents[1]
def test_qr_identity_verification_security_boundaries():
    sql=(ROOT/'supabase/migrations/202610270001_qr_citation_identity_email_verification.sql').read_text()
    api=(ROOT/'api/src/handlers/qr_identity.php').read_text()
    router=(ROOT/'api/src/router.php').read_text()
    public=(ROOT/'api/src/handlers/public.php').read_text()
    ui=(ROOT/'src/pages/PublicTicketLookup.jsx').read_text()
    assert 'private.tvtms_qr_identity_challenges' in sql
    assert 'attempts_remaining' in sql and "interval '10 minutes'" in sql
    assert "interval '90 seconds'" in sql
    assert 'status=\'used\'' in sql
    assert "grant execute on function public.tvtms_qr_identity_verify" in sql
    assert "'citedDriverName'" in sql and "'registeredOwnerName'" in sql
    assert 'driver_email_at_issue' in sql
    assert "select * into challenge" in sql
    assert 'owner_name_at_issue' in sql
    assert 'driver_first_name' in sql
    assert 'random_int(0,999999)' in api
    assert "hash_hmac('sha256'" in api
    assert "'challengeToken'" in api
    assert "mask_email($recipient)" in api
    assert "qr_identity_request" in router and "qr_identity_verify" in router
    public_lookup = public.split('function public_ticket_lookup',1)[1].split('function public_vehicle_lookup',1)[0]
    assert "'citedDriverName'" not in public_lookup and "'registeredOwnerName'" not in public_lookup
    assert "mode==='ticket'&&tickets.map" in ui
    assert 'Verify and Show Names' in ui
    assert 'resetIdentity();setBusy(true)' in ui
def test_php_qr_handler_syntax():
    result=subprocess.run(['php','-l','api/src/handlers/qr_identity.php'],cwd=ROOT,capture_output=True,text=True,timeout=15)
    assert result.returncode==0,result.stdout+result.stderr
