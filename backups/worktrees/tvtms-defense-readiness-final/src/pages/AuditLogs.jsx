import { useEffect, useState } from 'react';
import { API } from '../services/api';
import DataTable from '../components/DataTable';
import Notice from '../components/Notice';
import Icon from '../components/Icon';
import { dateTime } from '../utils/format';
import { csvCell } from '../utils/csv';

export default function AuditLogs(){
  const [rows,setRows]=useState([]);const [search,setSearch]=useState('');const [notice,setNotice]=useState({type:'',text:''});
  const load=()=>API.auditLogs(500).then(result=>setRows(result.logs||result.data||[])).catch(error=>setNotice({type:'error',text:error.message}));
  useEffect(()=>{load();},[]);
  const filtered=rows.filter(row=>!search||[row.action,row.actor_name,row.actor_email,row.entity_type,String(row.entity_id||'')].some(value=>String(value||'').toLowerCase().includes(search.toLowerCase())));
  const exportCsv=()=>{const lines=[['Time','Action','Actor','Entity','ID','IP'],...filtered.map(row=>[dateTime(row.created_at),row.action,row.actor_name||row.actor_email||'System',row.entity_type,row.entity_id||'',row.ip_address||''])].map(line=>line.map(csvCell).join(','));const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='tvtms-audit-logs.csv';a.click();URL.revokeObjectURL(url);};
  return <div className="restored-audit-page">
    <section className="card profile-hero-card"><div className="card-body profile-hero-content"><div><p className="section-kicker">Governance and Transparency</p><h3 className="card-title">System activity monitoring</h3><p>Review sensitive actions for accountability and compliance reporting.</p></div></div></section>
    <div className="filter-section"><div className="filter-group audit-filter-group"><div className="form-group"><label>Action, Actor, or Entity</label><input placeholder="e.g. TICKET, USER, LOGIN" value={search} onChange={event=>setSearch(event.target.value)}/></div><div className="filter-action-group"><button type="button" className="btn btn-secondary" onClick={()=>setSearch('')}>Reset</button><button type="button" className="btn btn-primary" onClick={load}><Icon name="history"/> Refresh</button></div></div></div>
    <Notice type={notice.type}>{notice.text}</Notice>
    <section className="card"><div className="card-header"><div className="legacy-card-header-row"><h3 className="card-title">Recent Logs</h3><button className="btn btn-secondary btn-sm" type="button" onClick={exportCsv}>Export CSV</button></div></div><div className="card-body"><DataTable columns={[{key:'created_at',label:'Time',render:row=>dateTime(row.created_at)},{key:'action',label:'Action'},{key:'actor_name',label:'Actor',render:row=>row.actor_name||row.actor_email||'System'},{key:'entity_type',label:'Entity'},{key:'entity_id',label:'ID'},{key:'ip_address',label:'IP'}]} rows={filtered}/></div></section>
  </div>;
}
