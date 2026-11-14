export function canFilePublicDispute(ticket) {
  return ticket?.dispute_eligible === true
    && !ticket.has_recorded_payment
    && Number(ticket.total_paid ?? 0) === 0
    && (ticket.payment_status ?? ticket.status) === 'unpaid';
}
