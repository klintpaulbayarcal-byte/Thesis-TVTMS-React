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
  const load=async(nextFilters=filters)=>{setLoading(true);setError('');try{const response=nextFilters.search?await API.searchTickets(nextFilters.search):await API.tickets(nextFilters);setRows(firstArray(response,['tickets']));}catch(problem){setError(problem.message);}finally{setLoading(false);}};
  useEffect(()=>{load();},[filters.status]);
  const submit=event=>{event.preventDefault();load();};
  const reset=()=>{const clearedFilters={search:'',status:'',page:1,pageSize:50};setFilters(clearedFilters);if(filters.status==='')load(clearedFilters);};
  const exportCsv=()=>{const data=[['Ticket','Date','Plate','Owner','Violation','Penalty','Status'],...rows.map(row=>[row.ticket_number,dateOnly(row.date_issued),row.plate_number,row.owner_name,row.violation_name,row.penalty_amount,row.payment_status??row.status])];const csv=data.map(line=>line.map(csvCell).join(',')).join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='tvtms-tickets.csv';a.click();URL.revokeObjectURL(url);};
  const columns=[{key:'ticket_number',label:'Ticket #'},{key:'date_issued',label:'Date',render:row=>dateOnly(row.date_issued)},{key:'plate_number',label:'Vehicle'},{key:'owner_name',label:'Owner'},{key:'violation_name',label:'Violation'},{key:'penalty_amount',label:'Penalty',render:row=>money(row.penalty_amount)},{key:'status',label:'Status',render:row=><StatusBadge value={row.payment_status??row.status}/>}];
  return <div className="restored-ticket-list-page">
    <div className="filter-section"><form onSubmit={submit}><div className="filter-group"><div className="form-group filter-search-wide"><label>Search Tickets</label><input placeholder="Ticket, plate, owner…" value={filters.search} onChange={event=>setFilters({...filters,search:event.target.value})}/></div><div className="form-group"><label>Status</label><select value={filters.status} onChange={event=>setFilters({...filters,status:event.target.value})}><option value="">All Status</option><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="cancelled">Cancelled</option></select></div><div className="form-group filter-buttons"><label>&nbsp;</label><button className="btn btn-primary"><Icon name="search"/> Apply Filters</button></div><div className="form-group filter-buttons"><label>&nbsp;</label><button type="button" className="btn btn-secondary" onClick={reset}>Reset</button></div></div></form></div>
    <div className="action-buttons">{user?.role==='apprehending_officer'&&<Link to="/officer/issue-ticket" className="btn btn-primary"><Icon name="plus"/> Issue New Ticket</Link>}<button type="button" className="btn btn-secondary" onClick={exportCsv}>Export to CSV</button><span className="ticket-scope-note">{user?.role==='admin'?'Administrator ticket view':'Officer ticket view'}</span></div>
    <Notice type="error">{error}</Notice>
    <section className="card"><div className="card-header"><h3 className="card-title">All Violation Tickets</h3></div><div className="card-body"><DataTable columns={columns} rows={rows} loading={loading} onRowClick={row=>navigate(`/tickets/${row.id}`)}/></div></section>
  </div>;
}
