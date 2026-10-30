import './DriverPortal.css';
import {useEffect,useState} from 'react';
import {API} from '../services/api';
import {useAuth} from '../context/AuthContext';
import {money,dateOnly} from '../utils/format';
import {Link} from 'react-router-dom';
export default function DriverDashboard(){
 const {user,logout}=useAuth();const [citations,setCitations]=useState([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 useEffect(()=>{let active=true;API.driverPortal().then(r=>{if(active)setCitations(r.citations||[]);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 return <main className="driver-portal"><header className="driver-portal-header"><div><h1>Driver Dashboard</h1><p>Welcome, {user?.name}. Your official records are view-only.</p></div><button className="btn btn-secondary" onClick={()=>logout()}>Sign Out</button></header>
 {error&&<p role="alert">{error}</p>}{loading&&<p>Loading your driver information…</p>}
 {!loading&&!error&&citations.length===0&&<section className="driver-portal-card"><h2>No linked citations</h2><p>No citation was found under your verified email address. This does not mean a vehicle or person has no traffic citations. Contact the issuing office if your citation was recorded using another email.</p><Link to="/ticket-lookup">Open general citation lookup</Link></section>}
 {citations.map(item=><article key={item.ticketNumber} className="driver-portal-card">
  <h2>Citation {item.ticketNumber}</h2><p>Issued {dateOnly(item.dateIssued)} · {item.status}</p>
  <h3>Driver Details (Read Only)</h3>
  <div className="driver-portal-fields">
  <div><small>Cited Driver</small><strong>{item.citedDriverName||'Not recorded'}</strong></div>
  <div><small>Driver Address (recorded)</small><strong>{item.driverAddress||'Not recorded'}</strong></div>
  <div><small>Nationality (recorded)</small><strong>{item.driverNationality||'Not recorded'}</strong></div>
  </div>
  <h3>Driver License (Recorded at Issuance)</h3>
  <div className="driver-portal-fields">
  <div><small>License Type / Classification</small><strong>{item.licenseTypeOther && ['other','others'].includes(String(item.licenseType||'').trim().toLowerCase()) ? `Other — ${item.licenseTypeOther}` : item.licenseType||'Not recorded'}</strong></div>
  <div><small>License Number (as recorded)</small><strong>{item.licenseNumber||'Not recorded'}</strong></div>
  </div>
  <h3>Vehicle Registration Details (As Recorded)</h3>
  <p className="driver-portal-note">These details were recorded on your linked citation. They are not an LTO registration verification or proof of current vehicle ownership.</p>
  <div className="driver-portal-fields">
  <div><small>Registered Owner at Issuance</small><strong>{item.registeredOwnerName||'Not recorded'}</strong></div>
  <div><small>Plate Number / Registration Identifier</small><strong>{item.plateNumber||'Not recorded'}</strong></div>
  <div><small>Vehicle Type / Make</small><strong>{[item.vehicleType,item.vehicleMake].filter(Boolean).join(' / ')||'Not recorded'}</strong></div>
  </div>
  <h3>Citation and Payment Summary</h3>
  <div className="driver-portal-fields">
  <div><small>Penalty</small><strong>{money(item.penaltyAmount)}</strong></div>
  <div><small>Total Paid</small><strong>{money(item.totalPaid)}</strong></div>
  <div><small>Remaining Balance</small><strong>{money(item.remainingBalance)}</strong></div>
  </div><h3>Violations</h3><ul>{(item.violations||[]).map((v,i)=><li key={i}>{v.name||'Not recorded'} · {money(v.penalty)}</li>)}</ul>
  <p className="driver-portal-note">All information is view-only and reflects the issued citation. Contact the issuing office to request correction of an official record.</p>
 </article>)}
 </main>;
}
