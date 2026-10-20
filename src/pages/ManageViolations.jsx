import { useEffect, useRef, useState } from 'react';
import { API } from '../services/api';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import Notice from '../components/Notice';
import Modal from '../components/Modal';
import Icon from '../components/Icon';
import { firstArray, money } from '../utils/format';
const blank={violation_code:'',violation_name:'',description:'',penalty_amount:'',requires_description:false,demerit_points:0,status:'active'};
export default function ManageViolations(){
 const [rows,setRows]=useState([]);const [form,setForm]=useState(blank);const [editing,setEditing]=useState(null);
 const [open,setOpen]=useState(false);const [saving,setSaving]=useState(false);
 const [modalError,setModalError]=useState('');const [notice,setNotice]=useState({type:'',text:''});
 const savingRef=useRef(false);
 const official=Boolean(editing?.is_citation_selectable);
 const refresh=async()=>{const response=await API.violations();setRows(firstArray(response,['violations']));};
 useEffect(()=>{refresh().catch(error=>setNotice({type:'error',text:error.message}));},[]);
 const start=row=>{setEditing(row||null);setForm(row?{...blank,...row}:{...blank});setModalError('');setOpen(true);};
 const save=async()=>{
   if(saving)return;
   if(savingRef.current)return;
   setModalError('');
   const points=Number(form.demerit_points);
   if(!Number.isInteger(points)||points<0||points>100){setModalError('Demerit points must be a whole number from 0 to 100.');return;}
   const code=String(form.violation_code||'').trim().toUpperCase();
   const name=String(form.violation_name||'').trim();
   if(!official&&(!/^[A-Z0-9_-]{2,20}$/.test(code)||name.length<1||name.length>150)){
     setModalError('Enter a unique violation code (2–20 letters/numbers) and a name (1–150 characters).');return;
   }
   savingRef.current=true;
   setSaving(true);
   try{
     // Official citation identity is deliberately immutable. Only descriptive
     // metadata and demerit points can be maintained by an Administrator.
     const payload=official?{description:String(form.description||'').trim(),demerit_points:points}
       :{violation_code:code,violation_name:name,description:String(form.description||'').trim(),
         demerit_points:points,requires_description:Boolean(form.requires_description),status:form.status};
     if(editing)await API.updateViolation(editing.id,payload);else await API.createViolation(payload);
     setOpen(false);
     setNotice({type:'success',text:editing?'Violation changes saved.':'Administrative violation created. The 18 official citation choices are unchanged.'});
     try{await refresh();}catch(error){setNotice({type:'info',text:'Changes were saved, but the list could not refresh. Reload the page to see the result.'});}
   }catch(error){setModalError(error.message||'Unable to save violation.');}
   finally{savingRef.current=false;setSaving(false);}
 };
 const remove=async row=>{
   if(row.is_citation_selectable)return;
   if(!confirm(`Delete ${row.violation_code}? Referenced violations cannot be removed.`))return;
   try{await API.deleteViolation(row.id);}
   catch(error){setNotice({type:'error',text:error.message});return;}
   setNotice({type:'success',text:'Administrative violation deleted.'});
   try{await refresh();}
   catch(error){setNotice({type:'info',text:'Administrative violation deleted, but the list could not refresh. Reload the page to see the result.'});}
 };
 const columns=[{key:'violation_code',label:'Code'},{key:'violation_name',label:'Violation'},{key:'penalty_amount',label:'Penalty',render:row=>money(row.penalty_amount)},{key:'is_citation_selectable',label:'Catalog',render:row=>row.is_citation_selectable?'Official citation choice':'Legacy / Admin'},{key:'demerit_points',label:'Demerit'},{key:'status',label:'Status',render:row=><StatusBadge value={row.status}/>},{key:'actions',label:'Actions',render:row=><div className="table-actions"><button className="text-link" onClick={event=>{event.stopPropagation();start(row);}}>Edit</button><button disabled={row.is_citation_selectable} title={row.is_citation_selectable?'Official citation choice is protected':undefined} className="text-link danger-link" onClick={event=>{event.stopPropagation();remove(row);}}>Delete</button></div>}];
 return <div className="restored-management-page"><Notice type={notice.type}>{notice.text}</Notice><section className="card"><div className="card-header management-card-header"><div><h3 className="card-title">Violation Types</h3><p>The 18 official citation choices are protected: Administrators may edit description and demerit points, but not their codes, names or selection status. New administrative entries do not appear in the Officer citation checklist.</p></div><button className="btn btn-primary" onClick={()=>start(null)}><Icon name="plus"/> Add New Violation</button></div><div className="card-body"><DataTable columns={columns} rows={rows}/></div></section><Modal open={open} title={editing?'Edit Violation':'Add New Violation'} onClose={()=>setOpen(false)} footer={<><button className="btn btn-secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={saving} onClick={save}>{saving?'Saving…':'Save'}</button></>}><div className="form-grid">{modalError&&<div className="span-2"><Notice type="error">{modalError}</Notice></div>}{!editing&&<p className="span-2">New entries are for administrative reference only. They will not change the 18 official selectable citation violations or the approved flat penalty.</p>}{official&&<p className="span-2">Official citation: you may update the description and demerit points only. The code, name, status, selection behavior and fixed penalty are protected.</p>}<label className="field"><span>Code</span><input required disabled={official} value={form.violation_code} onChange={event=>setForm({...form,violation_code:event.target.value.toUpperCase()})}/></label><label className="field"><span>Name</span><input required disabled={official} value={form.violation_name} onChange={event=>setForm({...form,violation_name:event.target.value})}/></label><label className="field"><span>Penalty amount</span><input readOnly value={editing?money(form.penalty_amount):'Configured flat penalty (set by server)'}/><small>History does not increase this penalty.</small></label><label className="field"><span>Demerit points</span><input type="number" min="0" value={form.demerit_points} onChange={event=>setForm({...form,demerit_points:event.target.value})}/></label><label className="field span-2"><span><input type="checkbox" disabled={official} checked={form.requires_description} onChange={event=>setForm({...form,requires_description:event.target.checked})}/> Require an additional description when selected (e.g. Others)</span></label><label className="field span-2"><span>Description</span><textarea rows="4" value={form.description||''} onChange={event=>setForm({...form,description:event.target.value})}/></label>{editing&&<label className="field"><span>Status</span><select disabled={official} value={form.status} onChange={event=>setForm({...form,status:event.target.value})}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>}</div></Modal></div>;
}
