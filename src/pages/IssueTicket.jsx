import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API } from '../services/api';
import PageHeader from '../components/PageHeader';
import Notice from '../components/Notice';
import StatusBadge from '../components/StatusBadge';
import Icon from '../components/Icon';
import Modal from '../components/Modal';
import { firstArray, money } from '../utils/format';

const initial = {plate_number:'',vehicle_type:'motorcycle',owner_name:'',driver_license_number:'',owner_email:'',owner_address:'',violation_id:'',location:'',remarks:''};

export default function IssueTicket(){
  const [form,setForm]=useState(initial);
  const [violations,setViolations]=useState([]);
  const [preview,setPreview]=useState(null);
  const [history,setHistory]=useState(null);
  const [notice,setNotice]=useState({type:'',text:''});
  const [gpsText,setGpsText]=useState('');
  const [gpsBusy,setGpsBusy]=useState(false);
  const [busy,setBusy]=useState(false);
  const [reviewOpen,setReviewOpen]=useState(false);
  const navigate=useNavigate();

  useEffect(()=>{API.activeViolations().then(response=>setViolations(firstArray(response,['violations']))).catch(error=>setNotice({type:'error',text:error.message}));},[]);
  useEffect(()=>{
    const violationId=Number(form.violation_id);
    if(!violationId||!form.plate_number.trim()){setPreview(null);return;}
    const timer=setTimeout(()=>{API.penaltyPreview(violationId,form.plate_number).then(response=>setPreview(response.penalty??response.data??null)).catch(()=>setPreview(null));},350);
    return()=>clearTimeout(timer);
  },[form.violation_id,form.plate_number]);

  const lookup=async()=>{
    if(!form.plate_number.trim())return;
    try{
      const response=await API.vehicleLookup(form.plate_number);
      const vehicle=response.vehicle??response.data?.vehicle;
      const items=response.violations??response.data?.violations??[];
      const summary=response.summary??response.data?.summary??{};
      if(vehicle)setForm(current=>({...current,vehicle_type:vehicle.vehicle_type||current.vehicle_type,owner_name:vehicle.owner_name||current.owner_name,owner_email:vehicle.owner_email||current.owner_email,owner_address:vehicle.owner_address||current.owner_address,driver_license_number:vehicle.driver_license_number||current.driver_license_number}));
      setHistory({vehicle,violations:items,summary});
    }catch{setHistory(null);}
  };

  const fillGPS=async()=>{
    if(!window.isSecureContext){setGpsText('GPS requires HTTPS. Enter the location manually while testing on an insecure address.');return;}
    if(!navigator.geolocation){setGpsText('This browser cannot provide GPS. Enter the location manually.');return;}
    if(navigator.permissions?.query){try{const permission=await navigator.permissions.query({name:'geolocation'});if(permission.state==='denied'){setGpsText('Location permission is blocked. Allow Location in your browser settings, then try again.');return;}}catch{/* Browser supports GPS without Permissions API. */}}
    setGpsBusy(true);setGpsText('Acquiring GPS location…');
    navigator.geolocation.getCurrentPosition(position=>{const {latitude,longitude}=position.coords;setForm(current=>({...current,location:`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`}));setGpsText(`GPS location added (${latitude.toFixed(4)}, ${longitude.toFixed(4)}). You can still edit it manually.`);setGpsBusy(false);},error=>{const messages={1:'Location permission was denied. Allow Location in your browser settings, then try again.',2:'Device location is unavailable. Turn on Location Services or enter the location manually.',3:'GPS timed out. Move near a window, retry, or enter the location manually.'};setGpsText(messages[error.code]||'GPS is currently unavailable. Enter the location manually.');setGpsBusy(false);},{timeout:15000,maximumAge:300000,enableHighAccuracy:false});
  };

  const submit=event=>{
    event.preventDefault();
    setNotice({type:'',text:''});
    setReviewOpen(true);
  };

  const confirmSubmit=async()=>{
    setBusy(true);setNotice({type:'',text:''});
    try{const response=await API.createTicket({...form,violation_id:Number(form.violation_id)});const ticket=response.ticket??response.data;setNotice({type:'success',text:`Ticket ${ticket?.ticket_number||''} issued successfully.`});if(ticket?.id)setTimeout(()=>navigate(`/tickets/${ticket.id}`),500);}
    catch(error){setNotice({type:'error',text:error.message});}
    finally{setBusy(false);}
  };

  const reset=()=>{setForm(initial);setPreview(null);setHistory(null);setGpsText('');setNotice({type:'',text:''});};
  const selected=useMemo(()=>violations.find(violation=>String(violation.id)===String(form.violation_id)),[violations,form.violation_id]);
  const historyItems=history?.violations||[];
  const historySummary=history?.summary||{};
  const nextPlateTicketCount=Number(historySummary.next_plate_ticket_count??historyItems.length+1);
  const sameViolationLevel=Number(preview?.nextOffenseCount??1);
  const plateOutstanding=Number(historySummary.outstanding_balance??historyItems.reduce((sum,item)=>sum+Number(item.status==='cancelled'?0:item.remaining_balance||0),0));
  const displayedPenalty=preview?.effectivePenalty??selected?.penalty_amount??0;
  const plateChanged=event=>{setForm({...form,plate_number:event.target.value.toUpperCase()});setHistory(null);};

  return <div className="issue-ticket-restored">
    <PageHeader title="Issue Violation Ticket" subtitle="Record a violation using the finalized enforcement workflow."/>
    <Notice type={notice.type}>{notice.text}</Notice>

    <section className="card ticket-entry-card">
      <div className="card-header"><h3 className="card-title">New Violation Ticket</h3></div>
      <div className="card-body">
        <form onSubmit={submit} className="legacy-ticket-form">
          <h4 className="form-section-title"><Icon name="car"/> Vehicle Information</h4>
          <div className="form-grid">
            <label className="field"><span>Plate Number *</span><div className="input-action"><input required maxLength="20" placeholder="e.g., ABC1234" value={form.plate_number} onBlur={lookup} onChange={plateChanged}/><button type="button" className="btn btn-secondary btn-sm" onClick={lookup}>Lookup</button></div><small className="field-hint">Use the vehicle registration plate. Lookup fills known vehicle details and prior history.</small></label>
            <label className="field"><span>Vehicle Type *</span><select required value={form.vehicle_type} onChange={event=>setForm({...form,vehicle_type:event.target.value})}>{['motorcycle','tricycle','car','truck','bus','van'].map(value=><option key={value} value={value}>{value[0].toUpperCase()+value.slice(1)}</option>)}</select></label>
            <label className="field"><span>Owner Name</span><input maxLength="100" placeholder="e.g., Juan Dela Cruz" value={form.owner_name} onChange={event=>setForm({...form,owner_name:event.target.value})}/></label>
            <label className="field"><span>Driver's License Number</span><input maxLength="30" placeholder="e.g., N01-23-456789" value={form.driver_license_number} onChange={event=>setForm({...form,driver_license_number:event.target.value.toUpperCase()})}/><small className="field-hint">Used for repeat-offender tracking when available.</small></label>
            <label className="field"><span>Owner Email Address</span><input type="email" maxLength="100" placeholder="e.g., juan@email.com" value={form.owner_email} onChange={event=>setForm({...form,owner_email:event.target.value})}/></label>
            <label className="field"><span>Owner Address</span><input maxLength="2000" placeholder="e.g., Poblacion, Calape, Bohol" value={form.owner_address} onChange={event=>setForm({...form,owner_address:event.target.value})}/></label>
          </div>

          <h4 className="form-section-title violation-heading"><Icon name="alert"/> Violation Information</h4>
          {history&&<div className="plate-history-context"><div className="plate-context-metrics"><div><span>Plate Ticket Count at Issuance</span><strong>{nextPlateTicketCount}</strong></div><div><span>Current Plate Outstanding</span><strong>{money(plateOutstanding)}</strong></div></div><p>Plate-based ticket history does not prove the same owner or driver. The penalty level below is calculated only from the same plate and the selected violation type.</p></div>}
          <div className="violation-penalty-grid">
            <label className="field"><span>Violation Type *</span><select required value={form.violation_id} onChange={event=>setForm({...form,violation_id:event.target.value})}><option value="">-- Select Violation --</option>{violations.map(violation=><option value={violation.id} key={violation.id}>{violation.violation_code} · {violation.violation_name}</option>)}</select>{selected&&<small className="field-hint">{selected.description||'Selected violation from the active catalog.'}</small>}</label>
            <div className="penalty-display"><span>New Ticket Penalty</span><strong>{money(displayedPenalty)}</strong>{preview&&<small>Same-Plate/Same-Violation Penalty Level: {sameViolationLevel}{preview.usedEscalationRule?' · escalated rule':' · base rule'}</small>}</div>
          </div>

          {historyItems.length>0&&<section className="issue-history"><div className="issue-history-head"><h4>Existing Tickets for This Plate</h4><span>{historyItems.length} historical record(s)</span></div><div className="table-wrap"><table><thead><tr><th>Ticket</th><th>Violation</th><th>Penalty</th><th>Paid</th><th>Balance</th><th>Payment Status</th></tr></thead><tbody>{historyItems.map(item=><tr key={item.id??item.ticket_number}><td>{item.ticket_number}</td><td>{item.violation_name}</td><td>{money(item.penalty_amount)}</td><td>{money(item.total_paid)}</td><td>{money(item.status==='cancelled'?0:item.remaining_balance)}</td><td><StatusBadge value={item.payment_status??item.status}/></td></tr>)}</tbody></table></div></section>}

          <label className="field location-field"><span>Place of Apprehension / Violation Location *</span><div className="input-action"><input required maxLength="200" placeholder="e.g., National Highway near Municipal Hall, Calape" value={form.location} onChange={event=>setForm({...form,location:event.target.value})}/><button type="button" className="btn btn-secondary btn-sm gps-button" disabled={gpsBusy} onClick={fillGPS}><Icon name="map"/>{gpsBusy?'Getting…':'GPS'}</button></div><small className="field-hint">Enter the exact place where the violation occurred and the ticket was issued.</small>{gpsText&&<small className="gps-status">{gpsText}</small>}</label>
          <label className="field"><span>Remarks / Additional Information</span><textarea rows="4" maxLength="4000" placeholder="Enter any additional notes about this violation..." value={form.remarks} onChange={event=>setForm({...form,remarks:event.target.value})}/></label>

          <div className="ticket-form-actions">
            <button className="btn btn-primary btn-lg" disabled={busy}><Icon name="ticket"/>{busy?'Issuing…':'Issue Ticket'}</button>
            <button type="button" className="btn btn-secondary btn-lg" onClick={reset}>Reset Form</button>
            <button type="button" className="btn btn-outline btn-lg" onClick={()=>navigate('/officer/tickets')}>Back to Tickets</button>
          </div>
        </form>
      </div>
    </section>

    <Modal open={reviewOpen} title="Review Violation Ticket" onClose={()=>!busy&&setReviewOpen(false)} footer={<><button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>setReviewOpen(false)}>Back to Form</button><button type="button" className="btn btn-primary" disabled={busy} onClick={confirmSubmit}><Icon name="ticket"/>{busy?'Issuing…':'Confirm and Issue Ticket'}</button></>}>
      <p>Review the citation details before the single ticket-creation request is sent.</p>
      <div className="ticket-review-grid">
        <div><small>Plate number</small><strong>{form.plate_number || '—'}</strong></div>
        <div><small>Vehicle type</small><strong>{form.vehicle_type || '—'}</strong></div>
        <div><small>Owner</small><strong>{form.owner_name || 'Not provided'}</strong></div>
        <div><small>Driver license</small><strong>{form.driver_license_number || 'Not provided'}</strong></div>
        <div><small>Violation</small><strong>{selected ? `${selected.violation_code} · ${selected.violation_name}` : '—'}</strong></div>
        <div><small>Plate Ticket Count at Issuance</small><strong>{nextPlateTicketCount}</strong></div>
        <div><small>Same-Plate/Same-Violation Penalty Level</small><strong>{sameViolationLevel}</strong></div>
        <div><small>New Ticket Penalty</small><strong>{money(displayedPenalty)}</strong></div>
        <div><small>Current Plate Outstanding</small><strong>{money(plateOutstanding)}</strong></div>
        <div className="span-2"><small>Location</small><strong>{form.location || '—'}</strong></div>
      </div>
    </Modal>

    <section className="card instructions-card">
      <div className="card-header"><h3 className="card-title">ⓘ Instructions</h3></div>
      <div className="card-body"><ol className="instruction-list"><li>Enter the vehicle's plate number and type.</li><li>Fill in the vehicle owner information when available.</li><li>Select the type of violation committed.</li><li>The applicable penalty amount is displayed automatically.</li><li>Specify the exact location where the violation occurred.</li><li>Add any relevant remarks or observations.</li><li>Click “Issue Ticket” to record the citation.</li><li>Open the ticket details after issuance for evidence, status, payment, and dispute history.</li></ol></div>
    </section>
  </div>;
}
