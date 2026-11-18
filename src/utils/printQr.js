// Render the public-only QR on the current page for printing. This avoids
// new windows, popup blockers and cross-window credential policy restrictions.
// It never includes authenticated citation fields in the printable sheet.
const SHEET_ID = 'tvtms-public-qr-print-sheet';
const STYLE_ID = 'tvtms-public-qr-print-style';

export function printPublicTicketQr(canvas, ticketNumber, browser = window) {
  const doc = browser?.document;
  if (!canvas || typeof ticketNumber !== 'string' || !ticketNumber.trim()
    || !doc?.body || !doc?.head || typeof browser.print !== 'function') return false;

  let sheet;
  let style;
  try {
    // Copy canvas pixels synchronously: printing cannot race an image.onload.
    const printCanvas = doc.createElement('canvas');
    printCanvas.width = canvas.width;
    printCanvas.height = canvas.height;
    if (!printCanvas.width || !printCanvas.height) return false;
    const context = printCanvas.getContext('2d');
    if (!context) return false;
    context.drawImage(canvas, 0, 0);

    doc.getElementById(SHEET_ID)?.remove();
    doc.getElementById(STYLE_ID)?.remove();

    sheet = doc.createElement('section');
    sheet.id = SHEET_ID;
    sheet.setAttribute('aria-hidden', 'true');
    const heading = doc.createElement('h1');
    heading.textContent = 'Traffic Violation Ticket';
    const number = doc.createElement('p');
    number.textContent = ticketNumber; // textContent prevents HTML injection.
    const help = doc.createElement('p');
    help.textContent = 'Scan to open public citation lookup.';
    sheet.append(heading, number, printCanvas, help);

    style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media screen { #${SHEET_ID} { display: none !important; } }
      @media print {
        body > *:not(#${SHEET_ID}) { display: none !important; }
        #${SHEET_ID} {
          display: block !important;
          margin: 0 auto;
          padding: 35px 20px;
          max-width: 550px;
          text-align: center;
          font-family: Arial, sans-serif;
          color: #0b2545;
          break-inside: avoid;
        }
        #${SHEET_ID} h1 { font-size: 22px; margin-bottom: 20px; }
        #${SHEET_ID} p { font-size: 16px; }
        #${SHEET_ID} canvas {
          display: block;
          width: 200px;
          height: 200px;
          max-width: 100%;
          margin: 24px auto;
          image-rendering: crisp-edges;
        }
      }
    `;
    doc.head.append(style);
    doc.body.append(sheet);

    const cleanup = () => {
      sheet?.remove();
      style?.remove();
      browser.removeEventListener?.('afterprint', cleanup);
    };
    browser.addEventListener?.('afterprint', cleanup, { once: true });
    try {
      browser.print();
      return true;
    } catch {
      cleanup();
      return false;
    }
  } catch {
    sheet?.remove();
    style?.remove();
    return false;
  }
}
