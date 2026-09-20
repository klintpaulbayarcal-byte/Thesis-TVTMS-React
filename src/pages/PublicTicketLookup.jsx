import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { API } from '../services/api';
import Notice from '../components/Notice';
import StatusBadge from '../components/StatusBadge';
import { money, dateOnly } from '../utils/format';

export default function PublicTicketLookup(){
  const [searchParams]=useSearchParams();
  const ticketFromUrl=(searchParams.get('ticket')||'').trim().toUpperCase();
  const plateFromUrl=(searchParams.get('plate')||'').trim().toUpperCase();
  const referenceFromUrl=ticketFromUrl||plateFromUrl;
  const modeFromUrl=ticketFromUrl?'ticket':'plate';
  const lastQrRequest=useRef('');
  const lookupVersion=useRef(0);
  const [mode,setMode]=useState(modeFromUrl);
  const [query,setQuery]=useState(referenceFromUrl);
  const [tickets,setTickets]=useState([]);
  const [summary,setSummary]=useState(null);
  const [notice,setNotice]=useState({type:'',text:''});
  const [busy,setBusy]=useState(false);
  const [selected,setSelected]=useState(null);
  const [email,setEmail]=useState('');
  const [reason,setReason]=useState('');
  const [disputeNotice,setDisputeNotice]=useState({type:'',text:''});
  const [disputeBusy,setDisputeBusy]=useState(false);
  const normalizedQuery=useMemo(()=>query.toUpperCase(),[query]);

  const switchMode=(next)=>{setMode(next);setQuery('');setTickets([]);setSummary(null);setSelected(null);setNotice({type:'',text:''});setDisputeNotice({type:'',text:''});};

  const runLookup=async (reference,lookupMode)=>{
    const requestVersion=++lookupVersion.current;
    const value=reference.trim().toUpperCase();
    if(value.length<2||value.length>30){
      setNotice({type:'error',text:'Enter a valid reference (2–30 characters).'});
      return;
    }
    setBusy(true);setNotice({type:'',text:''});setTickets([]);setSummary(null);setSelected(null);setDisputeNotice({type:'',text:''});
    try{
      const filters=lookupMode==='plate'?{plateNumber:value}:{ticketNumber:value};
      const r=await API.publicTicketLookup(filters);
      const rows=Array.isArray(r.tickets)?r.tickets:(Array.isArray(r.data)?r.data:[]);
      if(requestVersion!==lookupVersion.current)return;
      setTickets(rows);
      if(lookupMode==='plate'){
        try{const plate=await API.publicPlateSummary(value);if(requestVersion===lookupVersion.current)setSummary(plate.summary??null);}catch{/* search results remain usable */}
      }
      if(!rows.length)setNotice({type:'info',text:'No matching ticket record was found.'});
    }catch(error){if(requestVersion===lookupVersion.current)setNotice({type:'error',text:error.message});}
    finally{if(requestVersion===lookupVersion.current)setBusy(false);}
  };

  const search=event=>{
    event.preventDefault();
    return runLookup(normalizedQuery,mode);
  };

  // Ticket and plate URLs are read-only public lookup entry points.
  // Auto-load without creating or changing any ticket, and avoid duplicate
  // requests from React StrictMode's development effect replay.
  useEffect(()=>{
    if(!referenceFromUrl){lastQrRequest.current='';return;}
    const requestKey=`${modeFromUrl}:${referenceFromUrl}`;
    if(requestKey===lastQrRequest.current)return;
    lastQrRequest.current=requestKey;
    setMode(modeFromUrl);setQuery(referenceFromUrl);
    void runLookup(referenceFromUrl,modeFromUrl);
  },[referenceFromUrl,modeFromUrl]);

  const openDispute=ticket=>{
    if(!ticket.dispute_eligible)return;
    setSelected(ticket);setEmail('');setReason('');setDisputeNotice({type:'',text:''});
    setTimeout(()=>document.getElementById('publicDisputeSection')?.scrollIntoView({behavior:'smooth',block:'center'}),0);
  };
  const dispute=async event=>{
    event.preventDefault();
    if(disputeBusy)return;
    if(!selected||!selected.dispute_eligible){setDisputeNotice({type:'error',text:'Select an eligible ticket before submitting a dispute.'});return;}
    if(!email.trim()||reason.trim().length<10){setDisputeNotice({type:'error',text:'Enter the owner email recorded on the ticket and a reason of at least 10 characters.'});return;}
    setDisputeBusy(true);setDisputeNotice({type:'',text:''});
    try{
      await API.publicDispute({ticketNumber:selected.ticket_number,email:email.trim().toLowerCase(),reason:reason.trim()});
      setSelected(null);setEmail('');setReason('');
      setDisputeNotice({type:'success',text:'Your dispute was submitted successfully for administrator review. The ticket list will update shortly.'});
      const filters=mode==='plate'?{plateNumber:normalizedQuery}:{ticketNumber:normalizedQuery};
      try{
        const refreshed=await API.publicTicketLookup(filters);
        setTickets(Array.isArray(refreshed.tickets)?refreshed.tickets:(Array.isArray(refreshed.data)?refreshed.data:[]));
      }catch{/* Keep the successful submission confirmation even if refreshing fails. */}
    }catch(error){setDisputeNotice({type:'error',text:error.message||'Unable to submit the dispute. Please try again.'});}
    finally{setDisputeBusy(false);}
  };

  return <main className="public-lookup-page">
    <div className="page-header">
      <Link to="/" className="back-to-home"><span className="back-icon" aria-hidden="true">←</span> Back to Home</Link>
      <div className="header-accent" />
      <div className="lgu-logo"><img src="/images/calape-logo.webp" alt="Calape Logo" /></div>
      <h1>Traffic Violation Ticketing and Management System</h1>
      <p>Ticket Lookup — No login required</p>
      <div className="public-badge">◆ Public Access</div>
    </div>

    <div className="container">
      <section className="lookup-card">
        <div className="lookup-top"><h2>Look up your ticket</h2><div className="lookup-sub">Fast, secure public lookup</div></div>
        <div className="search-tabs" role="tablist" aria-label="Ticket lookup mode">
          <button type="button" className={`tab-btn ${mode==='plate'?'active':''}`} role="tab" aria-selected={mode==='plate'} onClick={()=>switchMode('plate')}>By Plate Number</button>
          <button type="button" className={`tab-btn ${mode==='ticket'?'active':''}`} role="tab" aria-selected={mode==='ticket'} onClick={()=>switchMode('ticket')}>By Ticket Number</button>
        </div>
        <form className="search-panel active" onSubmit={search}>
          <div className="form-group">
            <label htmlFor="publicLookupInput">{mode==='plate'?'Plate Number':'Ticket Number'}</label>
            <input id="publicLookupInput" className="form-control" required minLength="2" maxLength="30" placeholder={mode==='plate'?'e.g. ABC1234':'e.g. TVT-2026-0001'} value={query} onChange={e=>setQuery(e.target.value.toUpperCase())}/>
            <div className="hint">{mode==='plate'?'Enter the plate number printed on your vehicle registration.':'The ticket number is printed at the top of your violation ticket slip.'}</div>
          </div>
          <button className="btn-search" disabled={busy}>{busy?'Checking…':mode==='plate'?'Search Tickets':'Find My Ticket'}</button>
        </form>
        <Notice type={notice.type}>{notice.text}</Notice>
      </section>

      <section className="results-section" aria-live="polite">
        {summary&&<div className="plate-summary">
          <div className="plate-summary-head"><h3>Plate Summary · {normalizedQuery}</h3></div>
          <div className="summary-grid">
            <div className="summary-item"><small>Historical Tickets</small><strong>{summary.historical_ticket_count??summary.total_violations??0}</strong></div>
            <div className="summary-item"><small>Non-Cancelled Tickets</small><strong>{summary.non_cancelled_ticket_count??summary.total_violations??0}</strong></div>
            <div className="summary-item"><small>Unpaid</small><strong>{summary.unpaid_count??0}</strong></div>
            <div className="summary-item"><small>Paid</small><strong>{summary.paid_count??0}</strong></div>
            <div className="summary-item"><small>Cancelled</small><strong>{summary.cancelled_count??0}</strong></div>
            <div className="summary-item"><small>Combined Outstanding</small><strong>{money(summary.total_outstanding_balance??summary.total_unpaid_amount)}</strong></div>
          </div>
        </div>}
        {tickets.map(ticket=><article className={`ticket-card status-${ticket.status||'unknown'}`} key={ticket.ticket_number}>
          <div className="ticket-header"><div><small>Ticket Number</small><h3>{ticket.ticket_number}</h3></div><StatusBadge value={ticket.payment_status??ticket.status}/></div>
          <dl className="details-grid">
            <div><dt>Date issued</dt><dd>{dateOnly(ticket.date_issued)}</dd></div><div><dt>Plate number</dt><dd>{ticket.plate_number||'—'}</dd></div>
            <div><dt>Violation</dt><dd>{ticket.violation_name||'—'}</dd></div><div><dt>Penalty</dt><dd>{money(ticket.penalty_amount)}</dd></div>
            <div><dt>Paid</dt><dd>{money(ticket.total_paid)}</dd></div><div><dt>Balance</dt><dd>{money(ticket.remaining_balance)}</dd></div>
            <div className="span-2"><dt>Notification Email</dt><dd>{ticket.has_notification_email?ticket.notification_email_masked:'No email recorded'}</dd></div>
            <div className="span-2"><dt>Location</dt><dd>{ticket.location||'—'}</dd></div>
          </dl>
          {ticket.dispute_eligible?<button type="button" className="dispute-trigger" onClick={()=>openDispute(ticket)}>File a Dispute</button>:ticket.dispute_message?<div className="dispute-ineligible"><strong>Dispute unavailable for this ticket.</strong><Notice type="info">{ticket.dispute_message}</Notice><p>If you need clarification, please contact the issuing office.</p></div>:null}
        </article>)}
      </section>

      <section id="publicDisputeSection" className="dispute-wrap" aria-live="polite">
        <div className="dispute-card">
          <div className="dispute-title">⚖ File a Dispute</div>
          <div className="dispute-desc">Choose an eligible ticket above. For an eligible ticket, enter the owner email recorded when it was issued and explain your reason.</div>
          <Notice type={disputeNotice.type}>{disputeNotice.text}</Notice>
          {selected?<form className="dispute-form" onSubmit={dispute}>
            <div className="selected-ticket-summary">Selected ticket: <strong>{selected.ticket_number}</strong> · {selected.violation_name}</div>
            <div className="field"><label htmlFor="disputeEmail">Owner Email *</label><input id="disputeEmail" type="email" maxLength="100" required disabled={disputeBusy} value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" placeholder="Email recorded on the ticket" /></div>
            <div className="field"><label htmlFor="disputeReason">Reason for Dispute *</label><textarea id="disputeReason" rows="4" minLength="10" maxLength="4000" required disabled={disputeBusy} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explain why you believe this ticket should be disputed (at least 10 characters)." /></div>
            <button type="submit" className="dispute-submit" disabled={disputeBusy||!email.trim()||reason.trim().length<10}>{disputeBusy?'Submitting…':'Submit Dispute'}</button>
          </form>:<div className="selected-ticket-summary"><strong>No ticket selected.</strong> Select an eligible ticket above to open the dispute form. If a ticket says the dispute period has ended, the online form is unavailable for that ticket.</div>}
        </div>
      </section>

      <div className="footer-note">Traffic Violation Ticketing and Management System · For inquiries, visit the Municipal Hall.<br/>This is a local government system — not affiliated with LTO national.</div>
    </div>
  </main>;
}
