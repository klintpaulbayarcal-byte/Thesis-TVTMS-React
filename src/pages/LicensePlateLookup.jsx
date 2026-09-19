import { useState } from 'react';
import { API } from '../services/api';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import Notice from '../components/Notice';
import Icon from '../components/Icon';
import { dateOnly, money } from '../utils/format';

const normalizePlate=value=>String(value||'').replace(/[\s-]+/g,'').toUpperCase();

export default function LicensePlateLookup(){
  const [mode,setMode]=useState('plate');
  const [query,setQuery]=useState('');
  const [results,setResults]=useState([]);
  const [vehicle,setVehicle]=useState(null);
  const [violations,setViolations]=useState([]);
  const [stats,setStats]=useState(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);

  const clearDetail=()=>{setVehicle(null);setViolations([]);setStats(null);};
  const loadVehicle=async plateNumber=>{const plate=normalizePlate(plateNumber);const [lookup,summary]=await Promise.all([API.vehicleLookup(plate),API.vehicleStats(plate)]);setVehicle(lookup.vehicle??lookup.data?.vehicle??null);setViolations(lookup.violations??lookup.data?.violations??[]);setStats(summary.stats??summary.data??null);setResults([]);};
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
        if(mode==='license'&&raw.length<5)throw new Error('Enter a valid driver license number.');
        if(mode==='owner'&&raw.length<2)throw new Error('Enter at least 2 characters of the owner name.');
        const filters=mode==='license'?{license_number:raw.toUpperCase()}:{owner_name:raw};
        const response=await API.vehicleSearch(filters);
        const items=response.vehicles??response.data??[];
        if(!items.length)throw new Error(mode==='license'?'No records found for this license number.':'No records found for this owner name.');
        if(items.length===1)await loadVehicle(items[0].plate_number);else setResults(items);
      }
    }catch(problem){setError(problem.message);}
    finally{setBusy(false);}
  };

  const openResult=async row=>{setBusy(true);setError('');try{await loadVehicle(row.plate_number);}catch(problem){setError(problem.message);}finally{setBusy(false);}};
  const onQueryChange=event=>{const value=event.target.value;setQuery(mode==='owner'?value:value.toUpperCase());};
  const resultColumns=[{key:'plate_number',label:'Plate'},{key:'vehicle_type',label:'Type'},{key:'owner_name',label:'Owner'},{key:'driver_license_number',label:'License'},{key:'violation_count',label:'Plate tickets'}];
  const historyColumns=[{key:'ticket_number',label:'Ticket'},{key:'violation_name',label:'Violation'},{key:'date_issued',label:'Date Issued',render:row=>dateOnly(row.date_issued)},{key:'location',label:'Location'},{key:'penalty_amount',label:'Penalty',render:row=>money(row.penalty_amount)},{key:'status',label:'Status',render:row=><StatusBadge value={row.status}/>},{key:'remaining_balance',label:'Balance',render:row=>money(row.remaining_balance)}];

  return <div className="lookup-container restored-violator-lookup">
    <section className="lookup-section">
      <div className="section-title"><Icon name="search"/> License Plate Lookup</div>
      <div className="validation-info"><p><strong>Philippine License Plate Format:</strong></p><p>Format examples: ABC 1234, ABC1234, 59525MV</p><p>System accepts 6–8 alphanumeric characters.</p></div>
      <div className="search-tabs" role="tablist" aria-label="Violator search type">
        <button type="button" className={`search-tab ${mode==='plate'?'active':''}`} onClick={()=>switchMode('plate')}><Icon name="car"/> By Plate Number</button>
        <button type="button" className={`search-tab ${mode==='owner'?'active':''}`} onClick={()=>switchMode('owner')}><Icon name="user"/> By Owner Name</button>
        <button type="button" className={`search-tab ${mode==='license'?'active':''}`} onClick={()=>switchMode('license')}><Icon name="profile"/> By License Number</button>
      </div>
      <form className="search-form" onSubmit={search}>
        <div className="search-input-group"><label htmlFor="violatorLookupInput">{mode==='plate'?'Plate Number':mode==='owner'?"Vehicle Owner's Full Name":"Driver's License Number"}</label><input id="violatorLookupInput" required minLength={mode==='license'?5:2} placeholder={mode==='plate'?'Enter license plate (e.g., XYZ 1234)':mode==='license'?"Enter driver's license number (e.g., N01-23-456789)":"Enter vehicle owner's full name"} value={query} onChange={onQueryChange}/></div>
        <button type="submit" className="lookup-search-button" disabled={busy}><Icon name="search"/>{busy?'Searching…':'Search Records'}</button>
      </form>
      <Notice type="error">{error}</Notice>
    </section>

    {results.length>0&&<section className="lookup-section lookup-results-matches"><div className="section-title"><Icon name="car"/> Matching Vehicles</div><p className="lookup-helper">Multiple vehicles matched your search. Select a row to open the complete record.</p><DataTable columns={resultColumns} rows={results} onRowClick={openResult}/></section>}

    {vehicle&&<div className="results-section">
      <section className="lookup-section"><div className="section-title"><Icon name="car"/> Vehicle Information</div><div className="vehicle-info">
        <div className="info-row"><span className="label">License Plate:</span><span className="value">{vehicle.plate_number||'—'}</span></div>
        <div className="info-row"><span className="label">Vehicle Type:</span><span className="value">{vehicle.vehicle_type||'—'}</span></div>
        <div className="info-row"><span className="label">Owner Name:</span><span className="value">{vehicle.owner_name||'—'}</span></div>
        <div className="info-row"><span className="label">Driver License:</span><span className="value">{vehicle.driver_license_number||'—'}</span></div>
        <div className="info-row"><span className="label">Owner Email:</span><span className="value">{vehicle.owner_email||'—'}</span></div>
        <div className="info-row"><span className="label">Owner Address:</span><span className="value">{vehicle.owner_address||'—'}</span></div>
        <div className="info-row"><span className="label">Status:</span><span className="value"><StatusBadge value={vehicle.status||'active'}/></span></div>
        <div className="info-row"><span className="label">Registered Date:</span><span className="value">{vehicle.registered_date?dateOnly(vehicle.registered_date):'—'}</span></div>
      </div></section>

      <section className="lookup-section"><div className="section-title"><Icon name="analytics"/> Plate Ticket Summary</div><div className="summary-cards">
        <div className="summary-card"><div className="card-label">Total Violations</div><div className="card-value">{stats?.total_violations??violations.length}</div></div>
        <div className="summary-card paid"><div className="card-label">Paid Violations</div><div className="card-value">{stats?.paid_count??0}</div></div>
        <div className="summary-card unpaid"><div className="card-label">Unpaid Violations</div><div className="card-value">{stats?.unpaid_count??0}</div></div>
        <div className="summary-card"><div className="card-label">Total Outstanding</div><div className="card-value">{money(stats?.outstanding_balance)}</div></div>
      </div></section>

      <section className="lookup-section"><div className="section-title"><Icon name="history"/> Violation Tickets</div><DataTable columns={historyColumns} rows={violations}/></section>
    </div>}
  </div>;
}
