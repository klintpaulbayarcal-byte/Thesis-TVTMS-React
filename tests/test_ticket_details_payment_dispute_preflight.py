from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def test_ticket_details_payment_checks_disputes_before_open_and_save():
    src=(ROOT/'src/pages/TicketDetails.jsx').read_text(encoding='utf-8')
    assert "paymentDisputeDecision(await API.disputes({ticketId: id}), id)" in src
    assert "const gate = await checkPaymentDispute();" in src
    assert src.count("const gate = await checkPaymentDispute();")==2
    assert "if (!gate.allowed)" in src
    assert "onClick={openPayment}>Record Payment" in src
    assert "await API.recordPayment" in src
    assert src.index("const gate = await checkPaymentDispute();",src.index("const recordPayment")) < src.index("await API.recordPayment",src.index("const recordPayment"))
def test_qr_print_error_does_not_mention_popups():
    src=(ROOT/'src/pages/TicketDetails.jsx').read_text(encoding='utf-8')
    assert "Allow pop-ups to print" not in src
    assert "The QR print view is unavailable" in src
