import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { API } from '../services/api';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import DataTable from '../components/DataTable';
import Notice from '../components/Notice';
import Modal from '../components/Modal';
import { dateOnly, dateTime, firstArray, money } from '../utils/format';

const today = () => new Date().toISOString().slice(0, 10);

export default function TicketDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [ticket, setTicket] = useState(null);
  const [payments, setPayments] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(true);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [actionType, setActionType] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [busy, setBusy] = useState(false);
  const qrCanvas = useRef(null);
  const [payment, setPayment] = useState({
    amount_paid: '',
    official_receipt_number: '',
    payment_method: 'cash',
    payment_date: today(),
    notes: '',
  });
  const [edit, setEdit] = useState({ location: '', remarks: '' });
  const [evidenceFile, setEvidenceFile] = useState(null);

  const load = async () => {
    setLoading(true);
    setNotice({ type: '', text: '' });
    try {
      const [t, p, e] = await Promise.all([API.ticket(id), API.paymentsForTicket(id), API.evidence(id)]);
      const record = t.ticket ?? t.data ?? t;
      setTicket(record);
      setPayments(firstArray(p, ['payments']));
      setEvidence(firstArray(e, ['evidence']));
      setEdit({ location: record.location ?? '', remarks: record.remarks ?? '' });
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const publicLookupUrl = ticket?.ticket_number
    ? `${window.location.origin}/ticket-lookup?ticket=${encodeURIComponent(ticket.ticket_number)}`
    : '';

  useEffect(() => {
    if (!qrCanvas.current || !publicLookupUrl) return undefined;
    QRCode.toCanvas(qrCanvas.current, publicLookupUrl, {
      width: 180,
      margin: 2,
      color: { dark: '#0b2545', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });
    return () => {
      const context = qrCanvas.current?.getContext('2d');
      context?.clearRect(0, 0, qrCanvas.current.width, qrCanvas.current.height);
    };
  }, [publicLookupUrl]);

  const timeline = useMemo(() => Array.isArray(ticket?.timeline) ? ticket.timeline : [], [ticket]);

  const recordPayment = async () => {
    if (!payment.amount_paid || !payment.official_receipt_number.trim()) {
      setNotice({ type: 'error', text: 'Amount and official receipt number are required.' });
      return;
    }
    setBusy(true);
    try {
      await API.recordPayment({
        ticket_id: Number(id),
        amount_paid: Number(payment.amount_paid),
        official_receipt_number: payment.official_receipt_number.trim(),
        payment_method: payment.payment_method,
        payment_date: payment.payment_date,
        notes: payment.notes.trim(),
      });
      setPaymentOpen(false);
      setPayment({ amount_paid: '', official_receipt_number: '', payment_method: 'cash', payment_date: today(), notes: '' });
      setNotice({ type: 'success', text: 'Payment recorded successfully.' });
      await load();
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const saveDetails = async () => {
    setBusy(true);
    try {
      await API.updateTicketDetails(id, { location: edit.location.trim(), remarks: edit.remarks.trim() });
      setEditOpen(false);
      await load();
      setNotice({ type: 'success', text: 'Ticket details updated successfully.' });
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const startAction = type => {
    setActionType(type);
    setActionReason('');
    setActionOpen(true);
  };

  const performAdminAction = async () => {
    if (actionReason.trim().length < 5) {
      setNotice({ type: 'error', text: 'Please provide a reason with at least 5 characters.' });
      return;
    }
    setBusy(true);
    try {
      if (actionType === 'cancel') await API.cancelTicket(id, actionReason.trim());
      if (actionType === 'unpaid') await API.markUnpaid(id, actionReason.trim());
      if (actionType === 'delete') {
        await API.permanentDeleteTicket(id, actionReason.trim());
        navigate('/admin/tickets', { replace: true });
        return;
      }
      setActionOpen(false);
      await load();
      setNotice({ type: 'success', text: actionType === 'cancel' ? 'Ticket cancelled.' : 'Ticket marked unpaid.' });
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const uploadEvidence = async () => {
    if (!evidenceFile) {
      setNotice({ type: 'error', text: 'Select an image or PDF evidence file first.' });
      return;
    }
    if (evidenceFile.size > 5 * 1024 * 1024) {
      setNotice({ type: 'error', text: 'Evidence files must be 5 MB or smaller.' });
      return;
    }
    setBusy(true);
    try {
      await API.uploadEvidence(id, evidenceFile);
      setEvidenceFile(null);
      await load();
      setNotice({ type: 'success', text: 'Evidence uploaded successfully.' });
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const downloadEvidence = async row => {
    try {
      const blob = await API.evidenceFile(row.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    }
  };

  const printQr = () => {
    if (!qrCanvas.current || !ticket?.ticket_number) return;
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    if (!popup) {
      setNotice({ type: 'error', text: 'Allow pop-ups to print the ticket QR code.' });
      return;
    }
    popup.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Ticket QR Code</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:40px;color:#0b2545}img{display:block;margin:20px auto;width:180px;height:180px}p{font-family:monospace}</style></head><body><h1>Traffic Violation Ticket</h1><p id="ticket-number"></p><img id="ticket-qr" alt="Public ticket lookup QR code"></body></html>');
    popup.document.close();
    popup.document.getElementById('ticket-number').textContent = ticket.ticket_number;
    popup.document.getElementById('ticket-qr').src = qrCanvas.current.toDataURL('image/png');
    popup.focus();
    popup.print();
  };

  if (loading && !ticket) return <><PageHeader title="Ticket Details"/><div className="card">Loading ticket…</div></>;
  if (!ticket) return <><PageHeader title="Ticket Details"/><Notice type="error">{notice.text || 'Ticket could not be loaded.'}</Notice></>;

  const penalty = ticket.penalty_amount_at_issue ?? ticket.penalty_amount;
  const canEdit = ticket.status !== 'cancelled';
  const canRecordPayment = isAdmin && ticket.status !== 'cancelled' && Number(ticket.remaining_balance ?? penalty ?? 0) > 0;

  const timelineColumns = [
    { key: 'created_at', label: 'Date', render: row => dateTime(row.created_at) },
    { key: 'previous_status', label: 'From', render: row => row.previous_status ? <StatusBadge value={row.previous_status}/> : '—' },
    { key: 'new_status', label: 'To', render: row => <StatusBadge value={row.new_status}/> },
    { key: 'changed_by_name', label: 'Changed by' },
    { key: 'reason', label: 'Reason', render: row => row.reason || '—' },
  ];

  return <div className="restored-ticket-details-page">
    <PageHeader
      title="Ticket Details"
      subtitle={`Complete citation record for ${ticket.ticket_number}.`}
      actions={<div className="header-actions"><button className="btn btn-primary btn-sm no-print" onClick={()=>window.print()}>Print Ticket</button><button className="btn btn-secondary btn-sm no-print" onClick={()=>navigate(isAdmin?'/admin/tickets':'/officer/tickets')}>← Back to Tickets</button>{canEdit&&<button className="btn btn-secondary btn-sm no-print" onClick={()=>setEditOpen(true)}>Edit Details</button>}{isAdmin&&ticket.status!=='cancelled'&&<button className="btn btn-danger btn-sm no-print" onClick={()=>startAction('cancel')}>Cancel Ticket</button>}</div>}
    />
    <Notice type={notice.type} onClose={()=>setNotice({type:'',text:''})}>{notice.text}</Notice>

    <section className="card ticket-detail-card">
      <div className="ticket-document-head"><div><span className="ticket-document-kicker">MUNICIPALITY OF CALAPE · BOHOL</span><h2>VEHICLE VIOLATION TICKET</h2><p>Traffic Violation Ticketing &amp; Management System</p></div><div className="ticket-number-panel"><small>Ticket Number</small><strong>{ticket.ticket_number}</strong><StatusBadge value={ticket.status}/></div></div>

      <div className="ticket-detail-sections">
        <section className="ticket-info-section"><div className="ticket-section-title"><span>01</span><h3>Date & Time Information</h3></div><div className="details-grid"><div><dt>Date issued</dt><dd>{dateOnly(ticket.date_issued)}</dd></div><div><dt>Time issued</dt><dd>{ticket.time_issued || '—'}</dd></div><div className="span-2"><dt>Location</dt><dd>{ticket.location || '—'}</dd></div></div></section>

        <section className="ticket-info-section"><div className="ticket-section-title"><span>02</span><h3>Vehicle Information</h3></div><div className="details-grid"><div><dt>Plate number</dt><dd className="plate-value">{ticket.plate_number}</dd></div><div><dt>Vehicle type</dt><dd>{ticket.vehicle_type || '—'}</dd></div><div><dt>Driver / owner</dt><dd>{ticket.owner_name || '—'}</dd></div><div><dt>License number</dt><dd>{ticket.driver_license_number || '—'}</dd></div></div></section>

        <section className="ticket-info-section"><div className="ticket-section-title"><span>03</span><h3>Violation Information</h3></div><div className="details-grid"><div className="span-2"><dt>Violation</dt><dd>{ticket.violation_code} · {ticket.violation_name}</dd></div><div><dt>Plate Ticket Count at Issuance</dt><dd>{ticket.plate_ticket_count_at_issue??'—'}</dd></div><div><dt>Same-Plate/Same-Violation Penalty Level</dt><dd>{ticket.same_violation_offense_count_at_issue??'—'}</dd></div><div className="span-2"><dt>Remarks</dt><dd>{ticket.remarks || '—'}</dd></div></div></section>

        <section className="ticket-info-section"><div className="ticket-section-title"><span>04</span><h3>Issued By</h3></div><div className="details-grid"><div><dt>Apprehending Officer</dt><dd>{ticket.officer_name || '—'}</dd></div><div><dt>Current Status</dt><dd><StatusBadge value={ticket.status}/></dd></div></div></section>
      </div>

      <div className="ticket-financial-strip"><div><span>Penalty Amount</span><strong>{money(penalty)}</strong></div><div><span>Total Paid</span><strong className="paid-value">{money(ticket.total_paid)}</strong></div><div><span>Remaining Balance</span><strong className="balance-value">{money(ticket.remaining_balance)}</strong></div></div>

      {isAdmin&&<div className="ticket-admin-actions">{ticket.status==='paid'&&<button className="btn btn-secondary" onClick={()=>startAction('unpaid')}>Mark Unpaid</button>}<button className="btn btn-ghost danger-link" onClick={()=>startAction('delete')}>Permanent Delete</button></div>}
    </section>

    <section className="card ticket-qr-card no-print">
      <div className="card-header"><div><span className="section-kicker">PUBLIC ACCESS</span><h3 className="card-title">Ticket QR Code</h3><p>Scans to the public ticket lookup using the ticket number only.</p></div><button className="btn btn-secondary btn-sm" onClick={printQr}>Print QR Code</button></div>
      <div className="card-body ticket-qr-body"><canvas ref={qrCanvas} aria-label={`Public lookup QR code for ${ticket.ticket_number}`} /><code>{publicLookupUrl}</code></div>
    </section>

    <section className="card ticket-timeline-card">
      <div className="card-header"><div><span className="section-kicker">LIFECYCLE</span><h3 className="card-title">Ticket Timeline</h3><p>Server-recorded status and workflow changes.</p></div></div>
      <div className="card-body"><DataTable columns={timelineColumns} rows={timeline}/></div>
    </section>

    <div className="two-col ticket-support-grid">
      <section className="card">
        <div className="card-header"><div><span className="section-kicker">SETTLEMENT</span><h3 className="card-title">Payment History</h3></div>{canRecordPayment&&<button className="btn btn-primary btn-sm" onClick={()=>setPaymentOpen(true)}>Record Payment</button>}</div>
        <div className="card-body"><DataTable columns={[
          {key:'official_receipt_number',label:'Receipt'},
          {key:'amount_paid',label:'Amount',render:r=>money(r.amount_paid)},
          {key:'payment_date',label:'Date',render:r=>dateOnly(r.payment_date)},
          {key:'payment_status',label:'Status',render:r=><StatusBadge value={r.payment_status}/>}
        ]} rows={payments}/></div>
      </section>

      <section className="card">
        <div className="card-header"><div><span className="section-kicker">DOCUMENTATION</span><h3 className="card-title">Evidence</h3><p>JPEG, PNG, WebP, or PDF · maximum 5 MB</p></div></div>
        <div className="card-body"><div className="evidence-upload-row"><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>setEvidenceFile(e.target.files?.[0]??null)}/><button className="btn btn-secondary btn-sm" disabled={!evidenceFile||busy} onClick={uploadEvidence}>Upload</button></div>
        <DataTable columns={[
          {key:'file_name',label:'File'},
          {key:'created_at',label:'Uploaded',render:r=>dateTime(r.created_at)},
          {key:'id',label:'Action',render:r=><button className="text-link" onClick={e=>{e.stopPropagation();downloadEvidence(r);}}>View</button>}
        ]} rows={evidence}/></div>
      </section>
    </div>

    <Modal open={paymentOpen} title="Record Payment" onClose={()=>setPaymentOpen(false)} footer={<><button className="btn btn-secondary" onClick={()=>setPaymentOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={recordPayment}>{busy?'Saving…':'Save Payment'}</button></>}>
      <div className="form-grid">
        <label className="field"><span>Amount *</span><input type="number" min="0.01" step="0.01" value={payment.amount_paid} onChange={e=>setPayment({...payment,amount_paid:e.target.value})}/></label>
        <label className="field"><span>Official receipt no. *</span><input value={payment.official_receipt_number} onChange={e=>setPayment({...payment,official_receipt_number:e.target.value})}/></label>
        <label className="field"><span>Method</span><select value={payment.payment_method} onChange={e=>setPayment({...payment,payment_method:e.target.value})}><option value="cash">Cash</option><option value="gcash">GCash</option><option value="maya">Maya</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></label>
        <label className="field"><span>Date</span><input type="date" max={today()} value={payment.payment_date} onChange={e=>setPayment({...payment,payment_date:e.target.value})}/></label>
        <label className="field span-2"><span>Notes</span><textarea rows="3" value={payment.notes} onChange={e=>setPayment({...payment,notes:e.target.value})}/></label>
      </div>
    </Modal>

    <Modal open={editOpen} title="Edit Ticket Details" onClose={()=>setEditOpen(false)} footer={<><button className="btn btn-secondary" onClick={()=>setEditOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={saveDetails}>{busy?'Saving…':'Save Changes'}</button></>}>
      <div className="form-grid">
        <label className="field span-2"><span>Location</span><input maxLength="200" value={edit.location} onChange={e=>setEdit({...edit,location:e.target.value})}/></label>
        <label className="field span-2"><span>Remarks</span><textarea rows="5" maxLength="4000" value={edit.remarks} onChange={e=>setEdit({...edit,remarks:e.target.value})}/></label>
      </div>
    </Modal>

    <Modal open={actionOpen} title={actionType==='cancel'?'Cancel Ticket':actionType==='unpaid'?'Mark Ticket Unpaid':'Permanently Delete Ticket'} onClose={()=>setActionOpen(false)} footer={<><button className="btn btn-secondary" onClick={()=>setActionOpen(false)}>Back</button><button className="btn btn-danger" disabled={busy} onClick={performAdminAction}>{busy?'Working…':actionType==='delete'?'Delete Permanently':'Confirm'}</button></>}>
      <Notice type="error">{actionType==='delete'?'This permanently removes the ticket and its dependent records. Use only for an authorized administrative correction.':''}</Notice>
      <label className="field"><span>Reason *</span><textarea rows="4" minLength="5" maxLength="500" value={actionReason} onChange={e=>setActionReason(e.target.value)} placeholder="Enter the reason for this administrative action."/></label>
    </Modal>
  </div>;
}
