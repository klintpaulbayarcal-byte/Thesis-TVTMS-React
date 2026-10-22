import { useEffect, useRef, useState } from 'react';
import { API } from '../services/api';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import Notice from '../components/Notice';
import Modal from '../components/Modal';
import Icon from '../components/Icon';
import { firstArray, dateTime } from '../utils/format';

export default function Disputes(){
  const [rows,setRows]=useState([]);const [status,setStatus]=useState('');const [selected,setSelected]=useState(null);const [resolution,setResolution]=useState({status:'under_review',resolution_notes:''});const [notice,setNotice]=useState({type:'',text:''});const [saving,setSaving]=useState(false);
  const [modalError,setModalError]=useState('');
  const savingRef=useRef(false);
  const load=()=>API.disputes(status?{status}:{}).then(response=>setRows(firstArray(response,['disputes'])));
  useEffect(()=>{load().catch(error=>setNotice({type:'error',text:error.message}));},[status]);
  const review=row=>{if(savingRef.current)return;setModalError('');setSelected(row);setResolution({status:row.status==='submitted'?'under_review':row.status,resolution_notes:row.resolution_notes||''});};
  const save=async()=>{
    if(saving||savingRef.current||!selected)return;
    setModalError('');
    if(['approved','rejected','closed'].includes(resolution.status)&&resolution.resolution_notes.trim().length<5){setModalError('Enter resolution notes of at least 5 characters.');return;}
    savingRef.current=true;setSaving(true);
    try{
      await API.resolveDispute(selected.id,resolution);
      setSelected(null);setNotice({type:'success',text:'Dispute updated.'});
      try{await load();}catch(error){setNotice({type:'info',text:'Dispute changes were saved, but the queue could not refresh. Reload the page to see the result.'});}
    }catch(error){setModalError(error.message||'Unable to update dispute.');}
    finally{savingRef.current=false;setSaving(false);}
  };
  const columns=[{key:'id',label:'ID'},{key:'ticket_number',label:'Ticket'},{key:'contact_name',label:'Submitted by',render:row=>row.contact_name||row.owner_name||'Staff user'},{key:'reason',label:'Reason'},{key:'status',label:'Status',render:row=><StatusBadge value={row.status}/>},{key:'created_at',label:'Submitted',render:row=>dateTime(row.created_at)},{key:'action',label:'Action',render:row=><button className="text-link" onClick={event=>{event.stopPropagation();review(row);}}>Review</button>}];
  return <div className="restored-disputes-page">
    <Notice type={notice.type}>{notice.text}</Notice>
    <section className="card"><div className="card-header"><div><h3 className="card-title">Dispute Queue</h3><p>Review and resolve ticket appeals submitted through authorized TVTMS workflows.</p></div><div className="queue-filter"><Icon name="filter"/><select value={status} onChange={event=>setStatus(event.target.value)}><option value="">All statuses</option><option value="submitted">Submitted</option><option value="under_review">Under review</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="closed">Closed</option></select></div></div><div className="card-body"><DataTable columns={columns} rows={rows}/></div></section>
    <Modal open={Boolean(selected)} title={`Resolve Dispute #${selected?.id||''}`} onClose={()=>setSelected(null)} footer={<><button className="btn btn-secondary" onClick={()=>setSelected(null)}>Cancel</button><button className="btn btn-primary" disabled={saving} onClick={save}>{saving?'Saving…':'Save Decision'}</button></>}><Notice type="error">{modalError}</Notice><div className="dispute-review-summary"><p><strong>Ticket:</strong> {selected?.ticket_number}</p><p><strong>Reason:</strong> {selected?.reason}</p></div><div className="form-grid"><label className="field"><span>Status</span><select value={resolution.status} onChange={event=>setResolution({...resolution,status:event.target.value})}><option value="under_review">Under review</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="closed">Closed</option></select></label><label className="field span-2"><span>Resolution notes</span><textarea rows="5" value={resolution.resolution_notes} onChange={event=>setResolution({...resolution,resolution_notes:event.target.value})}/></label></div></Modal>
  </div>;
}
