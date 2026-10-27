import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { API } from '../services/api';
import Icon from '../components/Icon';
import Notice from '../components/Notice';
import DevelopmentTeam from '../components/DevelopmentTeam';
import { firstArray, firstObject, money } from '../utils/format';

const capabilities=['Role-Based Access Control','Same-Plate Violation Tracking','Audit Trail & Accountability','Digital Ticket Issuance','Dispute Management','Analytics & Reports','Payment Tracking','Photo Evidence Upload'];
const workflow=[
  ['01','Roadside Apprehension','The apprehending officer verifies the vehicle and driver record before creating a citation.'],
  ['02','Digital Ticket Issuance','Violation, location, penalty, and evidence are recorded in one centralized enforcement record.'],
  ['03','Tracking & Resolution','Payments, disputes, notifications, and status changes remain linked to the same ticket.'],
  ['04','Reporting & Accountability','Administrators review trends, audit activity, collections, and enforcement reports.'],
];
const features=[
  ['shield','Role-Based Access','Separate Administrator and Apprehending Officer workspaces protect authorized functions.'],
  ['repeat','Same-Plate Violation Tracking','Plate history is shown for monitoring without assuming the same owner or driver; new citations use a flat penalty per violation.'],
  ['ticket','Digital Ticketing','Create searchable municipal citation records with consistent ticket identifiers.'],
  ['payment','Payment Monitoring','Track recorded payments, receipt numbers, balances, and ticket settlement status.'],
  ['dispute','Dispute Management','Public and staff workflows document dispute submission and resolution.'],
  ['report','Reports & Analytics','Generate operational views for violations, collections, hotspots, aging, and performance.'],
];
const faqs=[
  ['Do I need an account to check a ticket?','No. The public lookup lets motorists check limited ticket information using a plate number or citation number.'],
  ['Can the public portal show private owner information?','No. Public results are intentionally limited and do not display private owner identity, email, address, or license details.'],
  ['Who can issue traffic tickets in the system?','Authorized Apprehending Officer accounts can issue citations. Administrators manage records, reports, configuration, and oversight.'],
  ['How are disputes handled?','Eligible tickets can be submitted for review, then an administrator records the resulting decision and resolution notes.'],
];
const heroFeatures=[
  ['users','Efficient Enforcement','Supports organized and systematic traffic management.'],
  ['ticket','Accurate Records','Improves data accuracy and record keeping.'],
  ['analytics','Transparent Process','Provides accessible and reliable violation information.'],
  ['shield','Safer Communities','Promotes discipline and accountability for safer roads in Calape, Bohol.'],
];

export default function Landing() {
  const [stats,setStats]=useState({}); const [violations,setViolations]=useState([]); const [notice,setNotice]=useState('');
  const [contact,setContact]=useState({fullName:'',email:'',subject:'',message:''}); const [sending,setSending]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);
  const [activeSection,setActiveSection]=useState('top');
  const [lookupOpen,setLookupOpen]=useState(false);
  const [mode,setMode]=useState('plate'); const [query,setQuery]=useState(''); const [lookup,setLookup]=useState([]); const [lookupBusy,setLookupBusy]=useState(false); const [lookupError,setLookupError]=useState('');
  useEffect(()=>{Promise.allSettled([API.publicStats(),API.publicViolations()]).then(([s,v])=>{if(s.status==='fulfilled') setStats(firstObject(s.value,['stats']));if(v.status==='fulfilled') setViolations(firstArray(v.value,['violations']));});},[]);
  useEffect(()=>{
    let frame=0;
    const updateActiveSection=()=>{
      frame=0;
      const navHeight=document.querySelector('.approved-landing-nav')?.getBoundingClientRect().height||76;
      const threshold=navHeight+Math.min(window.innerHeight*.25,160);
      let visible='top';
      document.querySelectorAll('main section[id]').forEach(section=>{
        if(section.getBoundingClientRect().top<=threshold) visible=section.id;
      });
      setActiveSection(visible);
    };
    const onScroll=()=>{if(!frame) frame=window.requestAnimationFrame(updateActiveSection);};
    updateActiveSection();
    window.addEventListener('scroll',onScroll,{passive:true});
    window.addEventListener('resize',onScroll);
    return()=>{window.removeEventListener('scroll',onScroll);window.removeEventListener('resize',onScroll);window.cancelAnimationFrame(frame);};
  },[lookupOpen]);
  const publicStatsKeys=['total_paid','total_unpaid'];
  const normalized=useMemo(()=>query.trim().toUpperCase(),[query]);
  const openLookup=e=>{e?.preventDefault();setMobileOpen(false);setLookupOpen(true);window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>document.getElementById('search-card')?.scrollIntoView({behavior:'smooth',block:'start'})));};
  const quickLookup=async e=>{e?.preventDefault();if(!normalized){setLookupError(mode==='plate'?'Enter a plate number.':'Enter a ticket number.');return;}setLookupBusy(true);setLookupError('');setLookup([]);try{const filters=mode==='plate'?{plateNumber:normalized}:{ticketNumber:normalized};const r=await API.publicTicketLookup(filters);const rows=Array.isArray(r.tickets)?r.tickets:(Array.isArray(r.data)?r.data:[]);setLookup(rows);if(!rows.length)setLookupError('No matching ticket record was found.');}catch(err){setLookupError(err.message);}finally{setLookupBusy(false);}};
  const submit=async e=>{e.preventDefault();setSending(true);setNotice('');try{await API.publicContact(contact);setNotice('Your message was sent successfully.');setContact({fullName:'',email:'',subject:'',message:''});}catch(err){setNotice(err.message);}finally{setSending(false);}};
  return <div className="legacy-landing">
    <nav className="landing-nav approved-landing-nav">
      <a className="landing-brand" href="#top"><img src="/images/calape-logo.webp" alt="Calape logo"/><div><strong>TVTMS</strong><span>Calape, Bohol</span></div></a>
      <button className="landing-nav-toggle" onClick={()=>setMobileOpen(v=>!v)} aria-label="Toggle menu"><Icon name={mobileOpen?'close':'menu'}/></button>
      <div className={`landing-nav-links ${mobileOpen?'open':''}`}><a className={activeSection==='top'?'active':undefined} aria-current={activeSection==='top'?'location':undefined} href="#top" onClick={()=>setMobileOpen(false)}>Home</a><a className={activeSection==='features'?'active':undefined} aria-current={activeSection==='features'?'location':undefined} href="#features" onClick={()=>setMobileOpen(false)}>Services</a><a className={activeSection==='violations'?'active':undefined} aria-current={activeSection==='violations'?'location':undefined} href="#violations" onClick={()=>setMobileOpen(false)}>Violations</a><a className={activeSection==='how-it-works'?'active':undefined} aria-current={activeSection==='how-it-works'?'location':undefined} href="#how-it-works" onClick={()=>setMobileOpen(false)}>How It Works</a><a className={activeSection==='about'?'active':undefined} aria-current={activeSection==='about'?'location':undefined} href="#about" onClick={()=>setMobileOpen(false)}>About</a><a className={activeSection==='faq'?'active':undefined} aria-current={activeSection==='faq'?'location':undefined} href="#faq" onClick={()=>setMobileOpen(false)}>FAQ</a><a className={activeSection==='search-card'?'active':undefined} aria-current={activeSection==='search-card'?'location':undefined} href="#search-card" onClick={openLookup} aria-controls="search-card" aria-expanded={lookupOpen}>Ticket Lookup</a><Link className="landing-login-btn" to="/login"><Icon name="user" size={15}/> Staff Portal</Link></div>
    </nav>

    <main id="top">
      <section className="hero legacy-hero approved-landing-hero">
        <div className="hero-left approved-hero-content">
          <div className="hero-chip"><span/> Official Traffic Enforcement Platform</div>
          <p className="hero-tagline">SAFE ROADS. STRONGER COMMUNITIES.</p>
          <h1 className="hero-title"><span>Traffic Violation</span><span>Ticketing and</span><span>Management System</span></h1>
          <p className="hero-sub">A digital platform supporting traffic citation management, public ticket verification, and enforcement record monitoring for Calape, Bohol.</p>
          <div className="hero-actions"><a href="#search-card" className="landing-btn-primary" onClick={openLookup} aria-controls="search-card" aria-expanded={lookupOpen}><Icon name="ticket" size={16}/> Check My Ticket <Icon name="arrow" size={15}/></a><a href="#how-it-works" className="landing-btn-ghost"><Icon name="history" size={16}/> How It Works</a></div>
        </div>
      </section>

      <section className="landing-hero-feature-band" aria-label="TVTMS public-service benefits"><div className="landing-hero-feature-grid">{heroFeatures.map(([icon,title,description])=><article className="landing-hero-feature-card" key={title}><span className="landing-hero-feature-icon"><Icon name={icon} size={24}/></span><div><h2>{title}</h2><p>{description}</p></div></article>)}</div></section>

      {lookupOpen&&(
      <section className="landing-lookup-section" id="search-card" aria-labelledby="quick-lookup-title"><div className="landing-lookup-inner"><div className="hero-right relocated-lookup"><div className="search-card"><span className="sc-label">Quick Lookup</span><h2 className="sc-title" id="quick-lookup-title">Check Violation Status</h2><p className="sc-desc">Enter your citation number or plate number to instantly view public-safe violation details and payment status.</p><div className="sc-tabs"><button className={`sc-tab ${mode==='plate'?'active':''}`} onClick={()=>{setMode('plate');setLookup([]);setLookupError('')}}><Icon name="car"/> Plate Number</button><button className={`sc-tab ${mode==='ticket'?'active':''}`} onClick={()=>{setMode('ticket');setLookup([]);setLookupError('')}}><Icon name="ticket"/> Citation Number</button></div><form onSubmit={quickLookup}><div className="sc-input-wrap"><Icon name="search"/><input className="sc-input" value={query} onChange={e=>setQuery(e.target.value.toUpperCase())} placeholder={mode==='plate'?'e.g., ABC 1234':'e.g., 7258'} aria-label="Lookup reference"/></div><button className="sc-search-btn" disabled={lookupBusy}><Icon name="search"/>{lookupBusy?'Checking…':mode==='plate'?'Search Plate':'Search Citation'}</button></form><p className="sc-privacy">Public lookup displays limited citation information only. Personal owner details are not shown.</p>{lookupError&&<div className="sc-error"><Icon name="alert"/>{lookupError}</div>}{lookup.length>0&&<div className="sc-results">{lookup.map(t=><Link to={`/ticket-lookup?ticket=${encodeURIComponent(t.ticket_number)}`} key={t.ticket_number} className="sc-result-row"><div><strong>{t.ticket_number}</strong><span>{t.plate_number} · {t.violations?.map(v=>v.violation_name).join('; ')||t.violation_name}</span><span>Penalty {money(t.penalty_amount)} · Balance {money(t.remaining_balance)} · {t.status||'record'}</span></div><b>View</b></Link>)}{mode==='plate'&&<Link to={`/ticket-lookup?plate=${encodeURIComponent(normalized)}`} className="sc-full-plate">View full plate history</Link>}</div>}<div className="sc-divider">or</div><Link to="/login" className="sc-portal"><Icon name="shield"/> Admin &amp; Apprehending Officer Portal <Icon name="arrow"/></Link></div></div></div></section>
      )}

      <div className="ticker"><div className="ticker-track">{[0,1].map(copy=><div className="ticker-group" key={copy} aria-hidden={copy===1?true:undefined}>{capabilities.map((x,i)=><span className="ticker-item" key={`${x}-${i}`}><i/> {x}</span>)}</div>)}</div></div>

      <section className="landing-section overview-section"><div className="landing-max"><div className="landing-heading left"><span className="landing-eyebrow">Public Service Snapshot</span><h2>A clearer way to check and manage traffic records.</h2><p>TVTMS connects public-safe ticket lookup with authorized enforcement workflows, keeping each step easier to find and review.</p></div><div className="overview-grid"><article><Icon name="search"/><strong>Public-safe lookup</strong><p>Check a ticket by plate number or ticket number without exposing private owner details.</p></article><article><Icon name="ticket"/><strong>Connected records</strong><p>Keep citation, violation, payment, dispute, and evidence information linked to the same record.</p></article><article><Icon name="shield"/><strong>Authorized access</strong><p>Separate staff workspaces protect administrative and apprehending-officer functions.</p></article></div></div></section>

      <section className="landing-section"><div className="landing-max"><div className="landing-heading"><span className="landing-eyebrow">System Advantage</span><h2>Traditional Process vs TVTMS Digital Workflow</h2><p>See how TVTMS streamlines traffic-violation record management compared with traditional paper-based workflows.</p></div><div className="process-comparison-grid"><article className="process-card manual"><h3><Icon name="report"/> Traditional Process</h3>{['Paper-based tickets that can be lost or damaged','Re-enter data for every apprehension','No central history for repeat offenders','Audit trails are manual and incomplete','Reporting takes hours of manual work','Disputes are recorded informally'].map(x=><p key={x}>× <span>{x}</span></p>)}</article><article className="process-card digital"><h3><Icon name="check"/> TVTMS Digital Workflow</h3>{['Digital tickets with unique identifiers and instant lookup','Search by plate or ticket and view history immediately','Same-plate history and centralized record linking','Audit trail for actions with timestamps and user records','Built-in reporting for daily, monthly, and operational summaries','Formal dispute workflow with documented status updates'].map(x=><p key={x}>✓ <span>{x}</span></p>)}</article></div></div></section>

      <section className="landing-section" id="how-it-works"><div className="landing-max"><div className="landing-heading left"><span className="landing-eyebrow">Workflow</span><h2>From Violation to Resolution</h2><p>From roadside apprehension to digital enforcement record: fast, secure, and fully accountable for both officers and citizens.</p></div><div className="timeline">{workflow.map(([n,t,d])=><article className="timeline-item" key={n}><div className="ghost-numeral">{n}</div><div><h3>{t}</h3><p>{d}</p></div></article>)}</div></div></section>

      <section className="landing-section roles-section"><div className="landing-max"><div className="landing-heading"><span className="landing-eyebrow">Access Model</span><h2>Two Staff Roles. Clear Public Access.</h2><p>Authenticated workspaces keep operational tools separate from the public portal.</p></div><div className="role-grid"><article><Icon name="settings"/><span>Administrator</span><h3>Oversight &amp; Management</h3><p>Manage accounts, violations, payments, disputes, reports, analytics, audit logs, and system settings.</p></article><article><Icon name="shield"/><span>Apprehending Officer</span><h3>Field Enforcement</h3><p>Issue citations, search violator history, review tickets, upload evidence, and receive notifications.</p></article><article><Icon name="search"/><span>Public Portal</span><h3>Transparent Lookup</h3><p>Check ticket status, review configured violation references, and submit eligible disputes without an account.</p></article></div></div></section>

      <section className="landing-section" id="features"><div className="landing-max"><div className="landing-heading left"><span className="landing-eyebrow">Core Capabilities</span><h2>Designed for field and office traffic workflows.</h2><p>The system keeps enforcement records connected from apprehension through resolution and reporting.</p></div><div className="feature-grid">{features.map(([icon,t,d])=><article key={t}><Icon name={icon}/><h3>{t}</h3><p>{d}</p></article>)}</div></div></section>

      <section className="landing-section" id="violations"><div className="landing-max"><div className="landing-heading"><span className="landing-eyebrow">Reference Catalog</span><h2>Violation Types & Penalties</h2><p>Official traffic citation choices for new citations, at ₱150 per violation. Official ordinances and notices remain controlling.</p></div><div className="landing-violation-grid">{violations.map((v,index)=><article key={`${v.id??v.violation_code??v.violation_name??'violation'}-${index}`}><div><span>{v.violation_code}</span><b>{money(v.penalty_amount)}</b></div><h3>{v.violation_name}</h3><p>{v.description||'Municipal traffic violation reference.'}</p></article>)}</div></div></section>

      <section className="landing-section about-section" id="about"><div className="landing-max about-grid"><div><span className="landing-eyebrow">About the System</span><h2>Serving the Municipality of Calape, Bohol</h2><p>TVTMS centralizes municipal traffic citation records to support faster retrieval, clearer accountability, payment monitoring, same-plate history, dispute documentation, evidence, notifications, and operational reports.</p><div className="about-points"><span><Icon name="shield"/> Centralized records</span><span><Icon name="history"/> Auditable workflows</span><span><Icon name="analytics"/> Decision-support reports</span></div></div><article className="about-panel"><div className="about-media"><img src="/images/background.webp" alt="Calape Municipal Police Station hotline poster"/></div><div className="about-panel-copy"><span>Connected recordkeeping</span><strong>Centralized Traffic Records</strong><p>Authorized staff work from linked ticket, violation, payment, dispute, and evidence records instead of scattered paper files.</p><div className="about-panel-meta"><Icon name="shield"/><span>One connected workflow for authorized staff</span></div></div></article></div></section>

      <section className="landing-section" id="faq"><div className="landing-max faq-grid"><div className="landing-heading left"><span className="landing-eyebrow">FAQ</span><h2>Questions, answered plainly.</h2><p>Common questions from Calape residents and motorists about the ticketing and management system.</p></div><div className="faq-list">{faqs.map(([q,a])=><details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}</div></div></section>

      <section className="landing-section contact-wrap" id="contact"><div className="landing-max"><div className="landing-heading left"><span className="landing-eyebrow">Contact</span><h2>Have questions about a ticket or the portal?</h2><p>For citation inquiries or system-related concerns, send a message through the public portal.</p></div><div className="contact-grid"><div className="contact-info"><span className="contact-kicker">Public assistance</span><h3>TVTMS Public Assistance</h3><p><Icon name="map"/> Calape, Bohol, Philippines</p><p><Icon name="shield"/> Public lookup protects personal owner information.</p><p><Icon name="history"/> Messages are recorded for follow-up.</p></div><form className="landing-contact-form" onSubmit={submit}><div><label htmlFor="contactFullName">Full name</label><input id="contactFullName" required maxLength="120" placeholder="Full name" value={contact.fullName} onChange={e=>setContact({...contact,fullName:e.target.value})}/></div><div><label htmlFor="contactEmail">Email address</label><input id="contactEmail" required type="email" maxLength="254" placeholder="Email address" value={contact.email} onChange={e=>setContact({...contact,email:e.target.value})}/></div><div className="wide"><label htmlFor="contactSubject">Subject</label><input id="contactSubject" required maxLength="150" placeholder="Subject" value={contact.subject} onChange={e=>setContact({...contact,subject:e.target.value})}/></div><div className="wide"><label htmlFor="contactMessage">Message</label><textarea id="contactMessage" required minLength="10" maxLength="3000" rows="5" placeholder="Message" value={contact.message} onChange={e=>setContact({...contact,message:e.target.value})}/></div><div className="wide">{notice&&<Notice type={notice.includes('success')?'success':'info'}>{notice}</Notice>}<button disabled={sending} className="landing-btn-primary">{sending?'Sending…':'Send Message'} <Icon name="arrow"/></button></div></form></div></div></section>
    </main>

    <footer className="landing-footer"><div className="landing-footer-grid"><div><div className="landing-brand footer-brand"><img src="/images/calape-logo.webp" alt="Calape logo"/><div><strong>Traffic Violation Ticketing and Management System</strong><span>Calape, Bohol</span></div></div><p>Digital traffic enforcement and citation management for the Municipality of Calape, Bohol.</p></div><div><h4>Quick Links</h4><a href="#features">Services</a><a href="#violations">Violations</a><a href="#faq">FAQ</a><Link to="/ticket-lookup">Ticket Lookup</Link></div><div><h4>Authorized Access</h4><Link to="/login">Staff Login</Link><p>Administrator &amp; Apprehending Officer portal</p></div><div><h4>Academic Project</h4><DevelopmentTeam/><p>BS Computer Science thesis project · Bohol Island State University — Calape Campus</p></div></div><div className="landing-footer-bottom"><strong>Traffic Violation Ticketing and Management System</strong><span>Calape, Bohol · 2026</span></div></footer>
  </div>;
}
