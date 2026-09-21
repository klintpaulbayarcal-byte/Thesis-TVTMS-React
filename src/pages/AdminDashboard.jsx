import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { API } from '../services/api';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import Notice from '../components/Notice';
import StatCard from '../components/StatCard';
import Icon from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { firstArray, firstObject, dateOnly, money } from '../utils/format';
import { displayLocation } from '../utils/locationLabel';

export default function AdminDashboard(){
 const [stats,setStats]=useState({}); const [tickets,setTickets]=useState([]); const [barangays,setBarangays]=useState([]); const [hotspots,setHotspots]=useState([]); const [error,setError]=useState(''); const nav=useNavigate(); const {user}=useAuth();
 useEffect(()=>{
   Promise.allSettled([API.ticketStats(),API.tickets({page:1,pageSize:8}),API.report('barangay'),API.report('hotspots',{startDate:new Date(Date.now()-30*86400000).toISOString().slice(0,10),endDate:new Date().toISOString().slice(0,10)})]).then(results=>{
     const [s,t,b,h]=results;
     if(s.status==='fulfilled') setStats(firstObject(s.value,['stats']));
     if(t.status==='fulfilled') setTickets(firstArray(t.value,['tickets']));
     if(b.status==='fulfilled') setBarangays(firstArray(b.value,['data','barangays']).slice(0,5));
     if(h.status==='fulfilled') setHotspots(firstArray(h.value,['hotspots','data']).slice(0,5));
     const failed=results.find(x=>x.status==='rejected'); if(failed&&!s.value&&!t.value) setError(failed.reason?.message||'Unable to load dashboard data.');
   });
 },[]);
 const riskRows=useMemo(()=>{
   const source=barangays.length?barangays:hotspots;
   const rows=source.map((r,i)=>({name:displayLocation(r.barangay||r.location||''),count:Number(r.total_tickets??r.total_violations??r.count??0)})).slice(0,5);
   return rows.filter(row=>row.count>0);
 },[barangays,hotspots]);
 const maxRisk=Math.max(1,...riskRows.map(r=>r.count));
 const columns=[{key:'ticket_number',label:'Ticket #'},{key:'date_issued',label:'Date',render:r=>dateOnly(r.date_issued)},{key:'plate_number',label:'Plate Number'},{key:'violation_name',label:'Violation'},{key:'penalty_amount',label:'Penalty',render:r=>money(r.penalty_amount_at_issue??r.penalty_amount)},{key:'status',label:'Status',render:r=><StatusBadge value={r.status}/>}];
 const repeat=stats.repeatOffenders??stats.repeat_offenders??0; const unpaid=Number(stats.unpaid??0); const paid=Number(stats.paid??0); const total=Number(stats.total??0); const revenue=Number(stats.revenue??0);
 return <div className="admin-dashboard-restored">
   <Notice type="error">{error}</Notice>
   <section className="map-hero"><div className="map-head"><div><p className="section-kicker">Operations View</p><h3>Recorded Citations by Location</h3></div><Link to="/officer/lookup" className="btn btn-primary btn-sm"><Icon name="search"/> Live Plate Lookup</Link></div><div className="map-canvas"><div className="map-grid-overlay"/><div className="skyline-axis-labels"><span>High</span><span>Medium</span><span>Low</span></div><div className="risk-skyline" aria-label="Recorded tickets by area">{!riskRows.length&&<p className="empty-state">No location data available. Recorded citation counts will appear here when the data is available.</p>}{riskRows.map((r,i)=>{const pct=Math.max(18,Math.round((r.count/maxRisk)*100));const level=pct>=70?'high':pct>=42?'medium':'low';return <div key={`${r.name}-${i}`} className={`risk-column risk-${level}`} style={{height:`${pct}%`}}><em>{level}</em><strong className="risk-value">{r.count}</strong><small>{r.name}</small></div>})}</div><div className="intervention-ribbon"><span>{riskRows[0]?.count>0?`${riskRows[0].name} currently has the highest recorded activity in this dashboard view.`:'Recorded citation counts will appear when location data is available.'}</span></div></div><div className="map-meta-row"><div className="map-meta"><span className="dot high"/>Higher relative count</div><div className="map-meta"><span className="dot medium"/>Moderate relative count</div><div className="map-meta"><span className="dot low"/>Lower relative count</div></div></section>

   <section className="admin-welcome-banner"><div><div className="welcome-kicker"><Icon name="shield" size={13}/> System Administrator</div><h2 className="welcome-title">Welcome back, {user?.name?.split(' ')[0]||'Administrator'}</h2><p className="welcome-subtitle">Traffic Violation Ticketing and Management System · {new Intl.DateTimeFormat('en-PH',{weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date())}</p></div><div className="welcome-actions"><Link className="btn secondary" to="/admin/reports"><Icon name="report"/> Reports</Link><Link className="btn secondary" to="/admin/analytics"><Icon name="analytics"/> Analytics</Link><Link className="btn" to="/admin/audit-logs"><Icon name="history"/> Audit Trail</Link></div></section>

   <div className="stats-grid"><StatCard label="Total Tickets" value={total} hint="All time" icon="ticket"/><StatCard label="Paid Tickets" value={paid} tone="green" hint="Collected" icon="check"/><StatCard label="Unpaid Tickets" value={unpaid} tone="red" hint="Pending" icon="alert"/><StatCard label="Total Revenue" value={money(revenue)} tone="amber" hint="Collected fines" icon="peso"/></div>

   <section className="card" style={{marginBottom:16}}><div className="card-header"><h3 className="card-title"><Icon name="report" size={16}/> Executive Summary</h3></div><div className="card-body executive-summary-grid"><div><span>Ticket Resolution</span><strong>{total?Math.round((paid/total)*100):0}%</strong><small>Paid tickets compared with all issued records.</small></div><div><span>Outstanding Cases</span><strong>{unpaid}</strong><small>Tickets still requiring payment or follow-up.</small></div><div><span>Repeat Offender Cases</span><strong>{repeat}</strong><small>Records with previous ticket history detected.</small></div><div><span>Recorded Collections</span><strong>{money(revenue)}</strong><small>Total collections returned by the ticket statistics service.</small></div></div></section>

   <section className="card" style={{marginBottom:16}}><div className="card-header"><h3 className="card-title"><Icon name="bell" size={16}/> Action Required</h3></div><div className="card-body action-required-grid"><Link to="/admin/tickets"><span className="action-dot danger"/><div><strong>{unpaid} unpaid ticket{unpaid===1?'':'s'}</strong><small>Review unsettled citations and payment status.</small></div><Icon name="arrow"/></Link><Link to="/admin/disputes"><span className="action-dot warning"/><div><strong>Review dispute queue</strong><small>Resolve submitted ticket disputes and document decisions.</small></div><Icon name="arrow"/></Link><Link to="/notifications"><span className="action-dot info"/><div><strong>System notifications</strong><small>Check enforcement alerts and workflow updates.</small></div><Icon name="arrow"/></Link></div></section>

   <div className="bento-grid"><section className="card bento-panel panel-tickets"><div className="card-header"><div className="bento-head"><h3 className="card-title">Recent Violation Tickets</h3><Link to="/admin/tickets" className="btn btn-primary btn-sm">View All</Link></div></div><div className="card-body" style={{padding:0}}><DataTable columns={columns} rows={tickets} onRowClick={r=>nav(`/tickets/${r.id}`)}/></div></section><section className="card bento-panel panel-hotspots"><div className="card-header"><h3 className="card-title">Top Hotspot Violations</h3></div><div className="card-body"><div className="hotspot-list">{(hotspots.length?hotspots:riskRows).slice(0,5).map((r,i)=><div className="hotspot-item" key={i}><div className="hotspot-row"><span>{displayLocation(r.location||r.barangay||r.name||'')}</span><strong>{r.total_violations??r.total_tickets??r.count??0}</strong></div></div>)}</div></div></section><section className="card bento-panel panel-actions"><div className="card-header"><h3 className="card-title">Quick Actions</h3></div><div className="card-body action-pill-grid"><Link to="/admin/tickets" className="action-pill"><Icon name="ticket"/><span>All Tickets</span></Link><Link to="/admin/analytics" className="action-pill"><Icon name="analytics"/><span>Analytics</span></Link><Link to="/admin/reports" className="action-pill"><Icon name="report"/><span>Reports</span></Link><Link to="/admin/payments" className="action-pill"><Icon name="payment"/><span>Payments</span></Link><Link to="/admin/disputes" className="action-pill"><Icon name="dispute"/><span>Disputes</span></Link><Link to="/notifications" className="action-pill"><Icon name="bell"/><span>Alerts</span></Link></div></section><section className="card bento-panel panel-system"><div className="card-header"><h3 className="card-title">System</h3></div><div className="card-body system-summary"><p><strong>Architecture:</strong> React + PHP + Supabase</p><p><strong>Data status:</strong> Check dashboard metrics and API health before relying on live data</p><Link to="/admin/settings" className="btn btn-secondary btn-sm"><Icon name="settings"/> System Settings</Link></div></section></div>
 </div>;
}
