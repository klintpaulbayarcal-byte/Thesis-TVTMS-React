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
  const [reason,setReason]=useState('');
  const [disputeNotice,setDisputeNotice]=useState({type:'',text:''});
  const [verificationStatus,setVerificationStatus]=useState('idle');
  const [challengeToken,setChallengeToken]=useState('');
  const [verificationCode,setVerificationCode]=useState('');
  const [notificationEmailMasked,setNotificationEmailMasked]=useState('');
  const normalizedQuery=useMemo(()=>query.toUpperCase(),[query]);

  const resetDispute=(clearSelection=true)=>{if(clearSelection)setSelected(null);setReason('');setDisputeNotice({type:'',text:''});setVerificationStatus('idle');setChallengeToken('');setVerificationCode('');setNotificationEmailMasked('');};

  const switchMode=(next)=>{setMode(next);setQuery('');setTickets([]);setSummary(null);resetDispute();setNotice({type:'',text:''});};

  const runLookup=async (reference,lookupMode)=>{
    const requestVersion=++lookupVersion.current;
    const value=reference.trim().toUpperCase();
    if(value.length<2||value.length>30){
      setNotice({type:'error',text:'Enter a valid reference (2–30 characters).'});
      return;
    }
    setBusy(true);setNotice({type:'',text:''});setTickets([]);setSummary(null);resetDispute();
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
    if(!ticket.dispute_eligible||!ticket.has_notification_email)return;
    resetDispute(false);setSelected(ticket);
    setTimeout(()=>document.getElementById('publicDisputeSection')?.scrollIntoView({behavior:'smooth',block:'center'}),0);
  };
  const requestVerification=async()=>{
    if(!selected?.dispute_eligible||!selected?.has_notification_email){setDisputeNotice({type:'error',text:'This ticket has no notification email available for verification.'});return;}
    setVerificationStatus('requesting');setChallengeToken('');setVerificationCode('');setDisputeNotice({type:'',text:''});
    try{
      const response=await API.publicDisputeRequestCode(selected.ticket_number);
      setChallengeToken(response.challengeToken||'');
      setNotificationEmailMasked(response.notificationEmailMasked||'');
      setVerificationStatus('code_sent');
      setDisputeNotice({type:'info',text:`A six-digit verification code was sent to ${response.notificationEmailMasked||'the recorded notification email'}.`});
    }catch(error){setVerificationStatus('idle');setDisputeNotice({type:'error',text:error.message||'Unable to send a verification code. Please try again.'});}
  };
  const verifyCode=async()=>{
    if(!selected||!challengeToken||!/^[0-9]{6}$/.test(verificationCode)){setDisputeNotice({type:'error',text:'Enter the six-digit verification code.'});return;}
    setVerificationStatus('verifying');setDisputeNotice({type:'',text:''});
    try{
      const response=await API.publicDisputeVerifyCode({ticketNumber:selected.ticket_number,challengeToken,code:verificationCode});
      if(!response.verified)throw new Error('The verification code could not be confirmed.');
      setVerificationCode('');setVerificationStatus('verified');setDisputeNotice({type:'success',text:'Email verified. You may now enter and submit your dispute reason.'});
    }catch(error){setVerificationStatus('code_sent');setDisputeNotice({type:'error',text:error.message||'Unable to verify the code. Please try again.'});}
  };
  const dispute=async event=>{
    event.preventDefault();
    if(verificationStatus==='submitting')return;
    if(!selected||!selected.dispute_eligible){setDisputeNotice({type:'error',text:'Select an eligible ticket before submitting a dispute.'});return;}
    if(verificationStatus!=='verified'||!challengeToken||reason.trim().length<10){setDisputeNotice({type:'error',text:'Verify the notification email and enter a reason of at least 10 characters.'});return;}
    setVerificationStatus('submitting');setDisputeNotice({type:'',text:''});
    try{
      await API.publicDispute({ticketNumber:selected.ticket_number,challengeToken,reason:reason.trim()});
      setVerificationStatus('submitted');setChallengeToken('');setVerificationCode('');setSelected(null);setReason('');
      setDisputeNotice({type:'success',text:'Your dispute was submitted successfully for administrator review. The ticket list will update shortly.'});
      const filters=mode==='plate'?{plateNumber:normalizedQuery}:{ticketNumber:normalizedQuery};
      try{
        const refreshed=await API.publicTicketLookup(filters);
        setTickets(Array.isArray(refreshed.tickets)?refreshed.tickets:(Array.isArray(refreshed.data)?refreshed.data:[]));
      }catch{/* Keep the successful submission confirmation even if refreshing fails. */}
    }catch(error){setVerificationStatus('verified');setDisputeNotice({type:'error',text:error.message||'Unable to submit the dispute. Please try again.'});}
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
            <input id="publicLookupInput" className="form-control" required minLength="2" maxLength="30" placeholder={mode==='plate'?'e.g. ABC1234':'e.g. TVT-2026-0001'} value={query} onChange={e=>{setQuery(e.target.value.toUpperCase());resetDispute();}}/>
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
          </dl>
          {ticket.dispute_eligible&&ticket.has_notification_email?<button type="button" className="dispute-trigger" onClick={()=>openDispute(ticket)}>File a Dispute</button>:<div className="dispute-ineligible"><strong>Dispute unavailable for this ticket.</strong><Notice type="info">{ticket.has_notification_email?ticket.dispute_message:'No notification email is recorded for verification.'}</Notice><p>If you need clarification, please contact the issuing office.</p></div>}
        </article>)}
      </section>

      <section id="publicDisputeSection" className="dispute-wrap" aria-live="polite">
        <div className="dispute-card">
          <div className="dispute-title">⚖ File a Dispute</div>
          <div className="dispute-desc">Choose an eligible ticket above, verify the masked notification email with a six-digit code, then explain your reason.</div>
          <Notice type={disputeNotice.type}>{disputeNotice.text}</Notice>
          {selected?<form className="dispute-form" onSubmit={dispute}>
            <div className="selected-ticket-summary">Selected ticket: <strong>{selected.ticket_number}</strong> · {selected.violation_name}</div>
            {notificationEmailMasked&&<div className="field"><label>Notification Email</label><div>{notificationEmailMasked}</div></div>}
            {verificationStatus!=='verified'&&verificationStatus!=='submitting'&&<div className="field"><button type="button" className="dispute-trigger" disabled={verificationStatus==='requesting'||verificationStatus==='verifying'} onClick={requestVerification}>{verificationStatus==='requesting'?'Sending code…':challengeToken?'Resend Code':'Send Verification Code'}</button></div>}
            {(verificationStatus==='code_sent'||verificationStatus==='verifying')&&<div className="field"><label htmlFor="disputeCode">Verification Code *</label><input id="disputeCode" inputMode="numeric" pattern="[0-9]{6}" minLength="6" maxLength="6" required disabled={verificationStatus==='verifying'} value={verificationCode} onChange={e=>setVerificationCode(e.target.value.replace(/\D/g,'').slice(0,6))} autoComplete="one-time-code" placeholder="6-digit code"/><button type="button" className="dispute-trigger" disabled={verificationStatus==='verifying'||verificationCode.length!==6} onClick={verifyCode}>{verificationStatus==='verifying'?'Verifying…':'Verify Code'}</button></div>}
            <div className="field"><label htmlFor="disputeReason">Reason for Dispute *</label><textarea id="disputeReason" rows="4" minLength="10" maxLength="4000" required disabled={verificationStatus!=='verified'} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explain why you believe this ticket should be disputed (at least 10 characters)." /></div>
            <button type="submit" className="dispute-submit" disabled={verificationStatus!=='verified'||reason.trim().length<10}>{verificationStatus==='submitting'?'Submitting…':'Submit Dispute'}</button>
          </form>:<div className="selected-ticket-summary"><strong>No ticket selected.</strong> Select an eligible ticket above to open the dispute form. If a ticket says the dispute period has ended, the online form is unavailable for that ticket.</div>}
        </div>
      </section>

      <div className="footer-note">Traffic Violation Ticketing and Management System · For inquiries, visit the Municipal Hall.<br/>This is a local government system — not affiliated with LTO national.</div>
    </div>
  </main>;
}
