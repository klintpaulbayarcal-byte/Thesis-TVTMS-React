// The blank popup must retain its handle until the public-only document is written.
export function printPublicTicketQr(canvas, ticketNumber, open = window.open.bind(window)) {
  const popup = open('', '_blank');
  if (!popup) return false;
  popup.opener = null;
  popup.document.write('<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Ticket QR Code</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:40px;color:#0b2545}img{display:block;margin:20px auto;width:180px;height:180px}p{font-family:monospace}@media print{button{display:none}}</style></head><body><h1>Traffic Violation Ticket</h1><p id="ticket-number"></p><img id="ticket-qr" alt="Public ticket lookup QR code"><button id="print-qr" type="button">Print QR Code</button></body></html>');
  popup.document.close();
  popup.document.getElementById('ticket-number').textContent = ticketNumber;
  popup.document.getElementById('print-qr').onclick = () => { popup.focus(); popup.print(); };
  const image = popup.document.getElementById('ticket-qr');
  image.onload = () => { popup.focus(); popup.print(); };
  image.src = canvas.toDataURL('image/png');
  popup.focus();
  return true;
}
