from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def test_dispute_guard_runs_for_selection_open_and_save():
    ui=(ROOT/'src/pages/Payments.jsx').read_text()
    gate=(ROOT/'src/utils/paymentDisputeGate.js').read_text()
    assert "paymentDisputeDecision(await API.disputes({ticketId}),ticketId)" in ui
    assert "Promise.allSettled([API.paymentsForTicket(row.id),checkDispute(row.id)])" in ui
    assert "if(version!==selectionVersion.current)return;" in ui
    assert "disabled={checking||!disputeGate.allowed}" in ui
    assert "const gate=await checkDispute(selected.id);" in ui
    assert "if(!gate.allowed)" in ui
    assert "['submitted', 'under_review']" in gate
    assert "String(item.ticket_id) !== String(ticketId)" in gate
    assert "allowed: false" in gate
