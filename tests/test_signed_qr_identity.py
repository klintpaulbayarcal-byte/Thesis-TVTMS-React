from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parents[1]

def test_signed_qr_identity_has_separate_server_protected_path():
    common=(ROOT/'api/src/common.php').read_text()
    link=(ROOT/'api/src/qr_identity_link.php').read_text()
    router=(ROOT/'api/src/router.php').read_text()
    tickets=(ROOT/'api/src/handlers/tickets.php').read_text()
    public=(ROOT/'api/src/handlers/public.php').read_text()
    ui=(ROOT/'src/pages/PublicTicketLookup.jsx').read_text()
    detail=(ROOT/'src/pages/TicketDetails.jsx').read_text()
    mail=(ROOT/'api/src/ticket_email.php').read_text()
    assert "require_once __DIR__ . '/qr_identity_link.php'" in common
    assert "hash_hmac('sha256'" in link and "hash_equals(" in link
    assert "ticket_qr_sign($ticketNumber)" in link
    assert 'function tickets_get_qr_link' in tickets and "require_role(['admin','apprehending_officer'])" in tickets
    assert "TICKET_ACCESS_DENIED" in tickets
    assert "function public_qr_identity" in public
    assert "ticket_qr_authorized($ticket,$signature)" in public
    assert "owner_name_at_issue" in public and "driver_first_name" in public
    assert "'public_qr_identity'" in router and "'tickets_get_qr_link'" in router
    assert "ticket_qr_url($ticket)" in mail
    assert "API.ticketQrLink(ticket.id)" in detail
    assert "API.publicQrIdentity(value,qrSignature)" in ui
    assert "qrIdentity?.ticketNumber===ticket.ticket_number" in ui
    assert 'Send Verification Code' in ui
    # Legacy ticket-number or plate-only public lookup must remain name-free.
    lookup=public.split('function public_ticket_lookup',1)[1].split('function public_vehicle_lookup',1)[0]
    assert 'driver_first_name' not in lookup and 'owner_name_at_issue' not in lookup
    assert 'ticket_qr_authorized' not in lookup

def test_signed_qr_php_lint():
    for path in ['api/src/qr_identity_link.php','api/src/handlers/public.php','api/src/handlers/tickets.php','api/src/router.php']:
        r=subprocess.run(['php','-l',path],cwd=ROOT,capture_output=True,text=True,timeout=20)
        assert r.returncode==0, r.stdout+r.stderr
