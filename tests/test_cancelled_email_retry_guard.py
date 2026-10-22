from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def test_cancelled_citations_block_email_retry_at_server():
    php=(ROOT/'api/src/handlers/tickets.php').read_text(encoding='utf-8')
    block=php.split('function tickets_retry_notification',1)[1].split('function tickets_update_status',1)[0]
    assert "TICKET_CANCELLED" in block
    assert "TICKET_ACCESS_DENIED" in block
    assert block.index("TICKET_CANCELLED") < block.index("ticket_notification_attempt")

def test_cancelled_citations_hide_email_retry():
    php=(ROOT/'api/src/ticket_email.php').read_text(encoding='utf-8')
    block=php.split('function ticket_notification_read',1)[1]
    assert "($ticket['status']??'')==='cancelled'" in block
    assert "$status==='failed'&&!$cancelled" in block
