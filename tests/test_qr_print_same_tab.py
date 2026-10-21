"""QR printing must stay in the same tab and expose no private citation data."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_same_tab_qr_print_contract():
    source = (ROOT / "src/utils/printQr.js").read_text(encoding="utf-8")
    details = (ROOT / "src/pages/TicketDetails.jsx").read_text(encoding="utf-8")
    assert "export function printPublicTicketQr" in source
    assert "browser.print();" in source
    assert "browser.addEventListener?.('afterprint', cleanup" in source
    assert "context.drawImage(canvas, 0, 0)" in source
    assert "number.textContent = ticketNumber" in source
    assert "body > *:not(" in source
    assert "window.open" not in source
    assert "document.write" not in source
    assert "printPublicTicketQr(qrCanvas.current, ticket.ticket_number)" in details
