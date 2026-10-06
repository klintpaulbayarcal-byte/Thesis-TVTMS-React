import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API } from '../services/api';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import Notice from '../components/Notice';
import Icon from '../components/Icon';
import { dateOnly, money } from '../utils/format';

const normalizePlate=value=>String(value||'').replace(/[\s-]+/g,'').toUpperCase();
const driverName=row=>[row.driver_first_name,row.driver_middle_name,row.driver_last_name].filter(Boolean).join(' ')||'Not recorded';
const violationsText=row=>row.violations?.map(v=>v.violation_name).filter(Boolean).join('; ')||row.violation_name||'Not recorded';

export default function LicensePlateLookup(){
  const [mode,setMode]=useState('citation');
  const [query,setQuery]=useState('');
  const [results,setResults]=useState([]);
  const [vehicle,setVehicle]=useState(null);
  const [violations,setViolations]=useState([]);
  const [stats,setStats]=useState(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const navigate=useNavigate();

  const clearDetail=()=>{setVehicle(null);setViolations([]);setStats(null);};
  const loadVehicle=async plateNumber=>{
    const plate=normalizePlate(plateNumber);
    const [lookup,summary]=await Promise.all([API.vehicleLookup(plate),API.vehicleStats(plate)]);
    setVehicle(lookup.vehicle??lookup.data?.vehicle??null);
    setViolations(lookup.violations??lookup.data?.violations??[]);
    setStats(summary.stats??summary.data??null);
    setResults([]);
  };
  const switchMode=next=>{setMode(next);setQuery('');clearDetail();setResults([]);setError('');};

  const search=async event=>{
    event.preventDefault();setBusy(true);setError('');clearDetail();setResults([]);
    try{
      const raw=query.trim();
      if(mode==='plate'){
        const plate=normalizePlate(raw);
        if(!/^[A-Z0-9]{6,8}$/.test(plate))throw new Error('Enter a valid plate number (6–8 letters/numbers).');
        await loadVehicle(plate);
      }else{
        if(mode==='citation'&&!/^[A-Z0-9][A-Z0-9\/-]{0,29}$/i.test(raw))throw new Error('Enter a valid citation number.');
        if(mode==='license'&&raw.length<5)throw new Error('Enter a valid driver license number.');
        if(mode==='name'&&raw.length<2)throw new Error('Enter at least part of the registered owner or driver name.');
        const response=await API.searchTickets(raw,mode);
        const items=response.tickets??response.data??[];
        setResults(Array.isArray(items)?items:[]);
        if(!items.length)throw new Error(
          mode==='license'?'No citation history was found for this driver license number.':
          mode==='name'?'No citation record matched that owner or driver name.':
          'No citation record matched that citation number.'
        );
      }
    }catch(problem){setError(problem.message);}
    finally{setBusy(false);}
  };

  const onQueryChange=event=>setQuery(mode==='name'?event.target.value:event.target.value.toUpperCase());
  const searchColumns=[
    {key:'ticket_number',label:'Citation Number'},
    {key:'date_issued',label:'Date',render:row=>dateOnly(row.date_issued)},
    {key:'plate_number',label:'Plate',render:row=>row.plate_number||'—'},
    {key:'driver_name',label:'Cited Driver',render:driverName},
    {key:'owner_name',label:'Registered Owner',render:row=>row.owner_name||'Not recorded'},
    {key:'violation_name',label:'Violation(s)',render:violationsText},
    {key:'penalty_amount',label:'Penalty',render:row=>money(row.penalty_amount_at_issue??row.penalty_amount)},
    {key:'status',label:'Status',render:row=><StatusBadge value={row.payment_status??row.status}/>}
  ];
  const historyColumns=[
    {key:'ticket_number',label:'Citation Number'},
    {key:'violation_name',label:'Violations',render:violationsText},
    {key:'date_issued',label:'Date Issued',render:row=>dateOnly(row.date_issued)},
    {key:'location',label:'Location',render:row=>row.location||'Not recorded'},
    {key:'penalty_amount',label:'Penalty',render:row=>money(row.penalty_amount)},
    {key:'status',label:'Status',render:row=><StatusBadge value={row.payment_status??row.status}/>},
    {key:'remaining_balance',label:'Balance',render:row=>money(row.remaining_balance)}
  ];

  const labels={
    citation:['Citation Number','Enter citation number'],
    plate:['Plate Number','Enter license plate (e.g., XYZ 1234)'],
    license:["Driver's License Number","Enter driver's license number"],
    name:['Registered Owner / Driver Name','Enter at least part of the name']
  };

  return <div className="lookup-container restored-violator-lookup">
    <section className="lookup-section">
      <div className="section-title"><Icon name="search"/> Search Ticket</div>
      <p className="lookup-helper">Find citation records by citation number, plate number, driver's license number, or registered owner/driver name.</p>
      <div className="search-tabs" role="tablist" aria-label="Ticket search type">
        <button type="button" className={`search-tab ${mode==='citation'?'active':''}`} onClick={()=>switchMode('citation')}><Icon name="ticket"/> By Citation Number</button>
        <button type="button" className={`search-tab ${mode==='plate'?'active':''}`} onClick={()=>switchMode('plate')}><Icon name="car"/> By Plate Number</button>
        <button type="button" className={`search-tab ${mode==='license'?'active':''}`} onClick={()=>switchMode('license')}><Icon name="profile"/> By License Number</button>
        <button type="button" className={`search-tab ${mode==='name'?'active':''}`} onClick={()=>switchMode('name')}><Icon name="user"/> By Owner / Driver Name</button>
      </div>
      <form className="search-form" onSubmit={search}>
        <div className="search-input-group">
          <label htmlFor="ticketLookupInput">{labels[mode][0]}</label>
          <input id="ticketLookupInput" required minLength={mode==='license'?5:mode==='name'?2:1}
            placeholder={labels[mode][1]} value={query} onChange={onQueryChange}/>
        </div>
        <button type="submit" className="lookup-search-button" disabled={busy}><Icon name="search"/>{busy?'Searching…':'Search Ticket'}</button>
      </form>
      <Notice type="error">{error}</Notice>
    </section>

    {results.length>0&&<section className="lookup-section lookup-results-matches">
      <div className="section-title"><Icon name="history"/> {mode==='license'?'Driver Citation History':'Matching Citation Records'}</div>
      {mode==='license'&&<p className="lookup-helper">History is matched by the driver's license number recorded on issued citations, including citations involving different vehicles.</p>}
      {mode==='name'&&<p className="lookup-helper">Name search is a finding aid only. Open the citation to verify the recorded driver and vehicle details.</p>}
      <DataTable columns={searchColumns} rows={results} onRowClick={row=>navigate(`/tickets/${row.id}`)}/>
    </section>}

    {vehicle&&<div className="results-section">
      <section className="lookup-section"><div className="section-title"><Icon name="car"/> Vehicle Information</div><div className="vehicle-info">
        <div className="info-row"><span className="label">License Plate:</span><span className="value">{vehicle.plate_number||'Not recorded'}</span></div>
        <div className="info-row"><span className="label">Vehicle Type:</span><span className="value">{vehicle.vehicle_type||'Not recorded'}</span></div>
        <div className="info-row"><span className="label">Vehicle Make:</span><span className="value">{vehicle.vehicle_make||'Not recorded'}</span></div>
        <div className="info-row"><span className="label">Registered Owner:</span><span className="value">{vehicle.owner_name||'Not recorded'}</span></div>
        <div className="info-row"><span className="label">Driver License:</span><span className="value">{vehicle.driver_license_number||'Not recorded'}</span></div>
        <div className="info-row"><span className="label">Owner Email:</span><span className="value">{vehicle.owner_email||'Not recorded'}</span></div>
        <div className="info-row"><span className="label">Owner Address:</span><span className="value">{vehicle.owner_address||'Not recorded'}</span></div>
        <div className="info-row"><span className="label">Status:</span><span className="value"><StatusBadge value={vehicle.status||'active'}/></span></div>
        <div className="info-row"><span className="label">Registered Date:</span><span className="value">{vehicle.registered_date?dateOnly(vehicle.registered_date):'Not recorded'}</span></div>
      </div></section>

      <section className="lookup-section"><div className="section-title"><Icon name="analytics"/> Plate Ticket Summary</div><div className="summary-cards">
        <div className="summary-card"><div className="card-label">Total Violations</div><div className="card-value">{stats?.total_violations??violations.length}</div></div>
        <div className="summary-card paid"><div className="card-label">Paid Violations</div><div className="card-value">{stats?.paid_count??0}</div></div>
        <div className="summary-card unpaid"><div className="card-label">Unpaid Violations</div><div className="card-value">{stats?.unpaid_count??0}</div></div>
        <div className="summary-card"><div className="card-label">Total Outstanding</div><div className="card-value">{money(stats?.outstanding_balance)}</div></div>
      </div></section>

      <section className="lookup-section"><div className="section-title"><Icon name="history"/> Plate Citation History</div><p className="lookup-helper">Plate history is vehicle history and does not by itself prove that the same person was driving.</p><DataTable columns={historyColumns} rows={violations} onRowClick={row=>row.id&&navigate(`/tickets/${row.id}`)}/></section>
    </div>}
  </div>;
}
