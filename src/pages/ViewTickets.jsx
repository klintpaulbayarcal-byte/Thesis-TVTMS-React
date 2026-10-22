import PlateCitationGroup from '../components/PlateCitationGroup';
import { groupCitationsByPlate } from '../utils/plateCitationGroups';
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
  const [rows,setRows]=useState([]);
  const [groupByPlate,setGroupByPlate]=useState(true);
  const [filters,setFilters]=useState({search:'',status:''});
  const [query,setQuery]=useState({search:'',status:'',page:1,pageSize:50});
  const [pagination,setPagination]=useState({page:1,pageSize:50,total:0,totalPages:1});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const navigate=useNavigate();const {user}=useAuth();
  useEffect(()=>{
    let active=true;
    setLoading(true);setError('');
    API.tickets(query).then(response=>{
      if(!active)return;
      setRows(firstArray(response,['tickets']));
      setPagination(response.pagination||{page:query.page,pageSize:query.pageSize,total:0,totalPages:1});
    }).catch(problem=>{
      if(!active)return;
      setRows([]);setError(problem.message||'Unable to load citations.');
    }).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[query]);
  const submit=event=>{
    event.preventDefault();
    setQuery({search:filters.search.trim(),status:filters.status,page:1,pageSize:50});
  };
  const reset=()=>{
    setFilters({search:'',status:''});
    setQuery({search:'',status:'',page:1,pageSize:50});
  };
  const changePage=page=>{
    if(loading)return;
    setQuery(previous=>({...previous,page:Math.max(1,Math.min(Number(pagination.totalPages)||1,page))}));
  };
  // CSV intentionally contains only the loaded page, never silently claims to include all records.
  const exportCsv=()=>{
    if(loading||!rows.length)return;
    const data=[['Ticket','Date','Plate','Owner','Violation','Penalty','Status'],
      ...rows.map(row=>[row.ticket_number,dateOnly(row.date_issued),row.plate_number,row.owner_name,
        row.violations?.map(v=>v.violation_name).join('; ')||row.violation_name,
        row.penalty_amount,effectivePaymentStatus(row)])];
    const csv=data.map(line=>line.map(csvCell).join(',')).join('\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const anchor=document.createElement('a');
    anchor.href=url;anchor.download=`tvtms-tickets-page-${query.page}.csv`;anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
  };
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
      {admin&&row.delete_eligible!==true&&<><span className="ticket-delete-restricted" role="note" title={row.delete_block_reason||'Protected record: normal permanent deletion is not permitted.'} style={{fontSize:12,color:'var(--text-muted, #667085)',maxWidth:210}}>Protected · {row.delete_block_reason||'Review for archive/removal'}</span><Link className="btn btn-ghost btn-sm" to={`${details}?action=archive`} aria-label={`Archive protected citation ${row.ticket_number}`}>Archive / Remove</Link></>}
    </div>;
  };
  const columns=[{key:'ticket_number',label:'Citation Number'},{key:'date_issued',label:'Date',render:row=>dateOnly(row.date_issued)},{key:'plate_number',label:'Vehicle'},{key:'owner_name',label:'Owner'},{key:'violation_name',label:'Violations',render:row=>row.violations?.map(v=>v.violation_name).join('; ')||row.violation_name},{key:'penalty_amount',label:'Penalty',render:row=>money(row.penalty_amount)},{key:'status',label:'Status',render:row=><StatusBadge value={effectivePaymentStatus(row)}/>} ,{key:'manage',label:'Actions',render:actionCell}];
  return <div className="restored-ticket-list-page">
    <div className="filter-section"><form onSubmit={submit}><div className="filter-group"><div className="form-group filter-search-wide"><label>Search Tickets</label><input placeholder="Ticket, plate, owner…" value={filters.search} onChange={event=>setFilters({...filters,search:event.target.value})}/></div><div className="form-group"><label>Status</label><select value={filters.status} onChange={event=>setFilters({...filters,status:event.target.value})}><option value="">All Status</option><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="cancelled">Cancelled</option></select></div><div className="form-group filter-buttons"><label>&nbsp;</label><button className="btn btn-primary"><Icon name="search"/> Apply Filters</button></div><div className="form-group filter-buttons"><label>&nbsp;</label><button type="button" className="btn btn-secondary" onClick={reset}>Reset</button></div></div></form></div>
    <div className="action-buttons">{user?.role==='apprehending_officer'&&<Link to="/officer/issue-ticket" className="btn btn-primary"><Icon name="plus"/> Issue Traffic Citation</Link>}<button type="button" className="btn btn-secondary" disabled={loading||rows.length===0} onClick={exportCsv} title="Exports citations displayed on the current page only">Export Current Page CSV</button><span className="ticket-scope-note">{admin?'Administrator · Manage all existing citations':'Officer ticket view'}</span></div>
    <Notice type="error">{error}</Notice>
    <label className="ticket-group-toggle" style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}><input type="checkbox" checked={groupByPlate} onChange={event=>setGroupByPlate(event.target.checked)}/> Group by vehicle plate (current page)</label>
    <section className="card"><div className="card-header"><h3 className="card-title">All Violation Tickets</h3></div><div className="card-body">{groupByPlate&&!loading?groupCitationsByPlate(rows).map((group,index)=><PlateCitationGroup key={group.plate||index} plate={group.plate} citations={group.citations} note="Grouped only for display on this page. Each citation remains a separate record.">
       {group.citations.map(row=><details className="plate-citation-item" key={row.id??row.ticket_number}>
         <summary><strong>Citation {row.ticket_number}</strong><span>{dateOnly(row.date_issued)} · {money(row.penalty_amount)} · {effectivePaymentStatus(row)}</span></summary>
         <div className="plate-citation-item__details">
           <ul className="plate-citation-item__violations">{(row.violations?.length?row.violations:[{violation_name:row.violation_name,penalty_amount:row.penalty_amount}]).map((v,i)=><li key={v.violation_id??i}>{v.violation_name} · {money(v.penalty_amount)}</li>)}</ul>
           <p>Registered owner at issuance: {row.owner_name||'Not recorded'}</p>
           {actionCell(row)}
         </div>
       </details>)}
     </PlateCitationGroup>):<DataTable columns={columns} rows={rows} loading={loading} onRowClick={row=>navigate(`/tickets/${row.id}`)}/>}
     {groupByPlate&&<p className="ticket-scope-note">Vehicles are grouped within the current page only; pagination and CSV still work with individual citations.</p>}<div className="ticket-pagination" style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap',marginTop:16}}><span role="status">Page {pagination.page} of {pagination.totalPages} · {pagination.total} matching citations</span><div style={{display:'flex',gap:8}}><button type="button" className="btn btn-secondary btn-sm" disabled={loading||query.page<=1} onClick={()=>changePage(query.page-1)}>Previous</button><button type="button" className="btn btn-secondary btn-sm" disabled={loading||query.page>=pagination.totalPages} onClick={()=>changePage(query.page+1)}>Next</button></div></div></div></section>
  </div>;
}
