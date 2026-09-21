import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { API } from '../services/api';
import StatCard from '../components/StatCard';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import Notice from '../components/Notice';
import Icon from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { firstArray, firstObject, dateOnly, money } from '../utils/format';

export default function OfficerDashboard(){
 const [stats,setStats]=useState({});const [tickets,setTickets]=useState([]);const [error,setError]=useState('');const [loading,setLoading]=useState(true);const [statsLoaded,setStatsLoaded]=useState(false);const nav=useNavigate();const {user}=useAuth();
 useEffect(()=>{let active=true;Promise.allSettled([API.ticketStats(),API.tickets({page:1,pageSize:8})]).then(results=>{
   if(!active)return;
   const [s,t]=results;
   if(s.status==='fulfilled'){setStats(firstObject(s.value,['stats']));setStatsLoaded(true);}
   if(t.status==='fulfilled')setTickets(firstArray(t.value,['tickets']));
   const failed=results.filter(result=>result.status==='rejected');
   if(failed.length)setError(failed.length===results.length?'Unable to load dashboard data.':`Some dashboard information could not be loaded: ${failed.map(result=>result.reason?.message||'Request failed').join('; ')}`);
   setLoading(false);
 });return()=>{active=false;};},[]);
 const today=useMemo(()=>{const key=new Date().toISOString().slice(0,10);return tickets.filter(t=>String(t.date_issued||'').slice(0,10)===key).length},[tickets]);
 const cols=[{key:'ticket_number',label:'Ticket #'},{key:'date_issued',label:'Date',render:r=>dateOnly(r.date_issued)},{key:'owner_name',label:'Violator'},{key:'plate_number',label:'Plate Number'},{key:'violation_name',label:'Violation'},{key:'penalty_amount',label:'Penalty',render:r=>money(r.penalty_amount_at_issue??r.penalty_amount)},{key:'status',label:'Status',render:r=><StatusBadge value={r.status}/>}];
 return <div className="officer-dashboard-restored"><Notice type="error">{error}</Notice><section className="officer-welcome-banner"><div><div className="welcome-kicker"><Icon name="shield" size={13}/> Apprehending Officer</div><h2 className="welcome-title">Welcome back, {user?.name?.split(' ')[0]||'Officer'}</h2><p className="welcome-subtitle">{new Intl.DateTimeFormat('en-PH',{weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date())}</p></div><div className="welcome-actions"><Link className="btn" to="/officer/issue-ticket"><Icon name="plus"/> Issue New Ticket</Link><Link className="btn secondary" to="/officer/lookup"><Icon name="search"/> Search Violator</Link></div></section>{loading?<section className="card" role="status">Loading dashboard statistics…</section>:statsLoaded?<div className="stats-grid"><StatCard label="Tickets Issued Today" value={stats.today??stats.todayTickets??today} hint="Today's Activity" icon="overview"/><StatCard label="My Total Tickets" value={stats.total??0} hint="Issued by you" icon="ticket"/><StatCard label="Paid Tickets" value={stats.paid??0} tone="green" hint="Collected" icon="check"/><StatCard label="Unpaid Tickets" value={stats.unpaid??0} tone="red" hint="Pending" icon="alert"/><StatCard label="Repeat Offender Cases" value={stats.repeatOffenders??stats.repeat_offenders??0} tone="amber" hint="Previous ticket history found" icon="repeat"/></div>:<section className="card" role="status">Statistics unavailable. Please refresh the page.</section>}<section className="card" style={{marginBottom:16}}><div className="card-header"><div className="bento-head"><h3 className="card-title">My Recent Tickets</h3><Link to="/officer/tickets" className="btn btn-primary btn-sm">View All</Link></div></div><div className="card-body" style={{padding:0}}><DataTable columns={cols} rows={tickets} onRowClick={r=>nav(`/tickets/${r.id}`)}/></div></section><section className="card"><div className="card-header"><h3 className="card-title">Quick Actions</h3></div><div className="card-body officer-quick-grid"><Link to="/officer/issue-ticket" className="officer-action primary"><Icon name="plus"/><div><strong>Issue New Ticket</strong><span>Create a new municipal traffic citation.</span></div><Icon name="arrow"/></Link><Link to="/officer/lookup" className="officer-action"><Icon name="search"/><div><strong>Search Violator</strong><span>Review plate, license, vehicle, and repeat-offender history.</span></div><Icon name="arrow"/></Link><Link to="/officer/tickets" className="officer-action"><Icon name="ticket"/><div><strong>View My Tickets</strong><span>Review citation records and ticket details.</span></div><Icon name="arrow"/></Link></div></section></div>;
}
