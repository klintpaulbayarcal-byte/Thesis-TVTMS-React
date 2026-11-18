import { useEffect, useState } from 'react';
import { API } from '../services/api';
import Notice from '../components/Notice';
import StatusBadge from '../components/StatusBadge';
import { effectivePaymentStatus } from '../utils/paymentStatus';
import { dateOnly, money } from '../utils/format';

export default function MyTickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    API.myTickets().then(response => {
      if (active) setTickets(Array.isArray(response.tickets) ? response.tickets : response.data || []);
    }).catch(problem => {
      if (active) setError(problem.message || 'Unable to load your tickets.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return <div className="restored-ticket-list-page">
    <section className="card">
      <div className="card-header"><div><p className="section-kicker">Public Driver Account</p><h3 className="card-title">My Issued Tickets</h3></div></div>
      <div className="card-body">
        <p>These are traffic citations recorded using the email address on your account.</p>
        <Notice type="error">{error}</Notice>
        {loading ? <p role="status">Loading your tickets...</p> : tickets.length === 0 ? <p role="status">No issued tickets were found for your account.</p> : <div className="table-responsive"><table className="data-table"><thead><tr><th>Ticket Number</th><th>Date</th><th>Violation</th><th>Vehicle</th><th>Amount</th><th>Status</th></tr></thead><tbody>{tickets.map(ticket => <tr key={ticket.id}><td>{ticket.ticket_number}</td><td>{dateOnly(ticket.date_issued)}</td><td>{ticket.violations?.map(item => item.violation_name).join(', ') || ticket.violation_name || 'Not recorded'}</td><td>{ticket.plate_number || 'Not recorded'}</td><td>{money(ticket.penalty_amount)}</td><td><StatusBadge value={effectivePaymentStatus(ticket)} /></td></tr>)}</tbody></table></div>}
      </div>
    </section>
  </div>;
}
