// Settlement is derived from valid payment totals; lifecycle history stays intact.
export function effectivePaymentStatus(ticket = {}) {
  if (ticket.status === 'cancelled') return 'cancelled';
  const paid = Number(ticket.total_paid);
  const penalty = Number(ticket.penalty_amount_at_issue ?? ticket.penalty_amount);
  const balance = ticket.remaining_balance == null
    ? (ticket.total_paid != null ? Math.max(0, penalty - paid) : NaN)
    : Number(ticket.remaining_balance);
  if (Number.isFinite(balance)) {
    if (balance <= 0) return 'paid';
    if (Number.isFinite(paid) && paid > 0) return 'partially_paid';
    if (ticket.total_paid != null) return 'unpaid';
  }
  return ticket.payment_status ?? ticket.status ?? 'unpaid';
}
