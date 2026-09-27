import { useEffect, useState } from 'react';
import { API } from '../services/api';
import StatCard from '../components/StatCard';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import Notice from '../components/Notice';
import { firstArray } from '../utils/format';

export default function AdminOverview(){
  const [users,setUsers]=useState([]);const [violations,setViolations]=useState([]);const [vehicles,setVehicles]=useState([]);const [error,setError]=useState('');
  useEffect(()=>{Promise.all([API.users(),API.violations(),API.vehicles()]).then(([userResponse,violationResponse,vehicleResponse])=>{setUsers(firstArray(userResponse,['users']));setViolations(firstArray(violationResponse,['violations']));setVehicles(firstArray(vehicleResponse,['vehicles']));}).catch(problem=>setError(problem.message));},[]);
  const officers=users.filter(user=>user.role==='apprehending_officer');
  return <div className="restored-overview-page">
    <section className="card profile-hero-card"><div className="card-body profile-hero-content"><div><p className="section-kicker">Performance Dashboard</p><h3 className="card-title">Real-time system metrics</h3><p>Monitor key account, violation catalog, and vehicle record indicators across TVTMS operations.</p></div></div></section>
    <Notice type="error">{error}</Notice>
    <div className="stats-grid"><StatCard label="Staff accounts" value={users.length}/><StatCard label="Active officers" value={officers.filter(officer=>officer.status==='active').length} tone="green"/><StatCard label="Violation catalog" value={violations.length} tone="navy"/><StatCard label="Known vehicles" value={vehicles.length} tone="amber"/></div>
    <div className="two-col"><section className="card"><div className="card-header"><h3 className="card-title">Apprehending Officers</h3></div><div className="card-body"><DataTable columns={[{key:'name',label:'Name'},{key:'email',label:'Email'},{key:'status',label:'Status',render:row=><StatusBadge value={row.status}/>}]} rows={officers.slice(0,10)}/></div></section><section className="card"><div className="card-header"><h3 className="card-title">Active Violations</h3></div><div className="card-body"><DataTable columns={[{key:'violation_code',label:'Code'},{key:'violation_name',label:'Violation'},{key:'status',label:'Status',render:row=><StatusBadge value={row.status}/>}]} rows={violations.filter(violation=>violation.status==='active').slice(0,10)}/></div></section></div>
  </div>;
}
