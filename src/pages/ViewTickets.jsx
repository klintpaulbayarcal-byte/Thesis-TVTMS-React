import { effectivePaymentStatus } from '../utils/paymentStatus';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { API } from '../services/api';
import { useAuth } from '../context/AuthContext';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import Notice from '../components/Notice';
import Icon from '../components/Icon';
import { firstArray, dateOnly, money } from '../utils/format';
import { csvCell } from '../utils/csv';

export default function ViewTickets(){
  const [rows,setRows]=useState([]);const [filters,setFilters]=useState({search:'',status:'',page:1,pageSize:50});const [loading,setLoading]=useState(true);const [error,setError]=useState('');const navigate=useNavigate();const {user}=useAuth();
  const load=async(nextFilters=filters)=>{setLoading(true);setError('');try{const response=await API.tickets(nextFilters);setRows(firstArray(response,['tickets']));}catch(problem){setError(problem.message);}finally{setLoading(false);}};
  useEffect(()=>{load();},[filters.status]);
  const submit=event=>{event.preventDefault();load();};
  const reset=()=>{const clearedFilters={search:'',status:'',page:1,pageSize:50};setFilters(clearedFilters);if(filters.status==='')load(clearedFilters);};
  const exportCsv=()=>{const data=[['Ticket','Date','Plate','Owner','Violation','Penalty','Status'],...rows.map(row=>[row.ticket_number,dateOnly(row.date_issued),row.plate_number,row.owner_name,row.violations?.map(v=>v.violation_name).join('; ')||row.violation_name,row.penalty_amount,effectivePaymentStatus(row)])];const csv=data.map(line=>line.map(csvCell).join(',')).join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='tvtms-tickets.csv';a.click();URL.revokeObjectURL(url);};
  // Ticket management starts on the authenticated detail page so every mutation
  // uses the same role checks, confirmation dialog and protected-record guards.
  const admin=user?.role==='admin';
  const actionCell=row=>{
    const details=`/tickets/${row.id}`;
    const unpaid=row.status==='unpaid';
    const unsettled=effectivePaymentStatus(row)==='unpaid';
    return <div className="ticket-row-management" style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center',minWidth:220}} onClick={event=>event.stopPropagation()}>
      <Link className="btn btn-secondary btn-sm" to={details} aria-label={`Manage citation ${row.ticket_number}`}>{admin?'Manage':'View'}</Link>
      {admin&&unpaid&&<Link className="btn btn-ghost btn-sm" to={`${details}?action=edit`} aria-label={`Edit citation ${row.ticket_number}`}>Edit</Link>}
      {admin&&unsettled&&<Link className="btn btn-ghost btn-sm" to={`${details}?action=cancel`} aria-label={`Cancel citation ${row.ticket_number}`}>Cancel</Link>}
      {admin&&row.delete_eligible===true&&<Link className="btn btn-ghost btn-sm" to={`${details}?action=delete`} aria-label={`Review deletion of citation ${row.ticket_number}`}>Delete</Link>}
      {admin&&row.delete_eligible!==true&&<span className="ticket-delete-restricted" role="note" title={row.delete_block_reason||'Deletion eligibility is unavailable. Use Manage to review.'} style={{fontSize:12,color:'var(--text-muted, #667085)',maxWidth:210}}>Delete restricted · {row.delete_block_reason||'Open Manage to review'}</span>}
    </div>;
  };
  const columns=[{key:'ticket_number',label:'Citation Number'},{key:'date_issued',label:'Date',render:row=>dateOnly(row.date_issued)},{key:'plate_number',label:'Vehicle'},{key:'owner_name',label:'Owner'},{key:'violation_name',label:'Violations',render:row=>row.violations?.map(v=>v.violation_name).join('; ')||row.violation_name},{key:'penalty_amount',label:'Penalty',render:row=>money(row.penalty_amount)},{key:'status',label:'Status',render:row=><StatusBadge value={effectivePaymentStatus(row)}/>} ,{key:'manage',label:'Actions',render:actionCell}];
  return <div className="restored-ticket-list-page">
    <div className="filter-section"><form onSubmit={submit}><div className="filter-group"><div className="form-group filter-search-wide"><label>Search Tickets</label><input placeholder="Ticket, plate, owner…" value={filters.search} onChange={event=>setFilters({...filters,search:event.target.value})}/></div><div className="form-group"><label>Status</label><select value={filters.status} onChange={event=>setFilters({...filters,status:event.target.value})}><option value="">All Status</option><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="cancelled">Cancelled</option></select></div><div className="form-group filter-buttons"><label>&nbsp;</label><button className="btn btn-primary"><Icon name="search"/> Apply Filters</button></div><div className="form-group filter-buttons"><label>&nbsp;</label><button type="button" className="btn btn-secondary" onClick={reset}>Reset</button></div></div></form></div>
    <div className="action-buttons">{user?.role==='apprehending_officer'&&<Link to="/officer/issue-ticket" className="btn btn-primary"><Icon name="plus"/> Issue Traffic Citation</Link>}<button type="button" className="btn btn-secondary" onClick={exportCsv}>Export to CSV</button><span className="ticket-scope-note">{admin?'Administrator · Manage all existing citations':'Officer ticket view'}</span></div>
    <Notice type="error">{error}</Notice>
    <section className="card"><div className="card-header"><h3 className="card-title">All Violation Tickets</h3></div><div className="card-body"><DataTable columns={columns} rows={rows} loading={loading} onRowClick={row=>navigate(`/tickets/${row.id}`)}/></div></section>
  </div>;
}
