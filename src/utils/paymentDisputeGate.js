// The payment RPC is authoritative. This read-only UI preflight prevents
// opening a payment form when the already-recorded dispute state blocks it.
export const PAYMENT_DISPUTE_UNAVAILABLE = 'Unable to verify dispute status. Payment entry is disabled until verification succeeds.';
export const PAYMENT_DISPUTE_ACTIVE = 'Resolve the active dispute before recording payment.';

export function paymentDisputeDecision(response, ticketId) {
  const disputes = response?.disputes ?? response?.data;
  if (!Array.isArray(disputes) || !Number.isSafeInteger(Number(ticketId)) || Number(ticketId) <= 0) {
    return { allowed: false, message: PAYMENT_DISPUTE_UNAVAILABLE };
  }
  // Treat malformed/mismatched records as unavailable, never as "no disputes".
  if (disputes.some(item => !item || String(item.ticket_id) !== String(ticketId))) {
    return { allowed: false, message: PAYMENT_DISPUTE_UNAVAILABLE };
  }
  const active = disputes.some(item => ['submitted', 'under_review'].includes(item.status));
  return active
    ? { allowed: false, message: PAYMENT_DISPUTE_ACTIVE }
    : { allowed: true, message: '' };
}
