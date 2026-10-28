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
  <div className="driver-portal-fields">
  <div><small>Cited Driver</small><strong>{item.citedDriverName||'Not recorded'}</strong></div>
  <div><small>License Type</small><strong>{item.licenseType||'Not recorded'}</strong></div>
  <div><small>License Number (as recorded)</small><strong>{item.licenseNumber||'Not recorded'}</strong></div>
  <div><small>Plate Number</small><strong>{item.plateNumber||'Not recorded'}</strong></div>
  <div><small>Vehicle Type / Make</small><strong>{[item.vehicleType,item.vehicleMake].filter(Boolean).join(' / ')||'Not recorded'}</strong></div>
  <div><small>Penalty</small><strong>{money(item.penaltyAmount)}</strong></div>
  <div><small>Total Paid</small><strong>{money(item.totalPaid)}</strong></div>
  </div><h3>Violations</h3><ul>{(item.violations||[]).map((v,i)=><li key={i}>{v.name||'Not recorded'} · {money(v.penalty)}</li>)}</ul>
  <p className="driver-portal-note">Information is from the issued citation snapshot. This page does not validate LTO license or registration records.</p>
 </article>)}
 </main>;
}
