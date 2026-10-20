import { effectivePaymentStatus } from '../utils/paymentStatus';
import { useEffect, useRef, useState } from 'react';
import { API } from '../services/api';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import Notice from '../components/Notice';
import Modal from '../components/Modal';
import Icon from '../components/Icon';
import { firstArray, money, dateOnly, manilaDateKey } from '../utils/format';

const blankPayment=()=>({amount_paid:'',official_receipt_number:'',payment_method:'cash',payment_date:manilaDateKey(),notes:''});
export default function Payments(){
  const [tickets,setTickets]=useState([]);const [selected,setSelected]=useState(null);const [payments,setPayments]=useState([]);const [notice,setNotice]=useState({type:'',text:''});const [open,setOpen]=useState(false);const [saving,setSaving]=useState(false);const [form,setForm]=useState(blankPayment());
  const [modalError,setModalError]=useState('');const savingRef=useRef(false);const selectionVersion=useRef(0);
  const load=()=>API.tickets({status:'unpaid',pageSize:100}).then(response=>setTickets(firstArray(response,['tickets'])));
  useEffect(()=>{load().catch(error=>setNotice({type:'error',text:error.message}));},[]);
  const select=async row=>{
    if(savingRef.current)return;
    const version=++selectionVersion.current;
    setSelected(row);setPayments([]);setForm(blankPayment());setModalError('');setOpen(false);
    try{const response=await API.paymentsForTicket(row.id);if(version===selectionVersion.current)setPayments(firstArray(response,['payments']));}
    catch(error){if(version===selectionVersion.current)setNotice({type:'error',text:error.message});}
  };
  const record=async()=>{
    if(saving||savingRef.current||!selected)return;
    setModalError('');
    const amount=Number(form.amount_paid);
    if(!Number.isFinite(amount)||amount<=0||amount>Number(selected.remaining_balance??0)||!form.official_receipt_number.trim()){
      setModalError('Enter a valid amount within the remaining balance and an official receipt number.');return;
    }
    savingRef.current=true;setSaving(true);
    try{
      await API.recordPayment({ticket_id:selected.id,...form,amount_paid:Number(form.amount_paid)});
      setOpen(false);setForm(blankPayment());
      setNotice({type:'success',text:'Payment recorded successfully.'});
      try{
        const fresh=await API.ticket(selected.id);setSelected(fresh?.ticket||fresh?.data||selected);
        const paymentResponse=await API.paymentsForTicket(selected.id);setPayments(firstArray(paymentResponse,['payments']));
        await load();
      }catch(error){setNotice({type:'info',text:'Payment was recorded, but the balance or history could not refresh. Reload the page before recording another payment.'});}
    }catch(error){setModalError(error.message||'Unable to record payment.');}
    finally{savingRef.current=false;setSaving(false);}
  };
  const columns=[{key:'ticket_number',label:'Ticket'},{key:'plate_number',label:'Plate'},{key:'owner_name',label:'Owner'},{key:'penalty_amount',label:'Penalty',render:row=>money(row.penalty_amount)},{key:'total_paid',label:'Paid',render:row=>money(row.total_paid)},{key:'remaining_balance',label:'Balance',render:row=>money(row.remaining_balance)},{key:'status',label:'Status',render:row=><StatusBadge value={effectivePaymentStatus(row)}/>}];
  return <div className="restored-payments-page">
    <Notice type={notice.type}>{notice.text}</Notice>
    <section className="card"><div className="card-header"><div><h3 className="card-title">Record Ticket Payment</h3><p>Select an unpaid ticket to review its balance and record an official payment.</p></div></div><div className="card-body"><DataTable columns={columns} rows={tickets} onRowClick={select}/></div></section>
    <section className={`card payment-history-card ${selected?'':'is-muted'}`}><div className="card-header"><div><h3 className="card-title">Payment History</h3><p>{selected?`Ticket ${selected.ticket_number} · Remaining balance ${money(selected.remaining_balance)}`:'Select a ticket above to view its payment history.'}</p></div>{selected&&Number(selected.remaining_balance||0)>0&&<button className="btn btn-primary" onClick={()=>{setModalError('');setOpen(true);}}><Icon name="payment"/> Record Payment</button>}</div><div className="card-body"><DataTable columns={[{key:'official_receipt_number',label:'Official Receipt'},{key:'amount_paid',label:'Amount',render:row=>money(row.amount_paid)},{key:'payment_method',label:'Method'},{key:'payment_date',label:'Date',render:row=>dateOnly(row.payment_date)},{key:'payment_status',label:'State',render:row=><StatusBadge value={row.payment_status}/>}]} rows={payments}/></div></section>
    <Modal open={open} title={`Record Payment · ${selected?.ticket_number||''}`} onClose={()=>setOpen(false)} footer={<><button className="btn btn-secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={saving || !selected || !form.official_receipt_number.trim() || !(Number(form.amount_paid)>0)} onClick={record}>{saving?'Saving…':'Save Payment'}</button></>}><Notice type="error">{modalError}</Notice><div className="form-grid"><label className="field"><span>Amount *</span><input type="number" min="0.01" step="0.01" value={form.amount_paid} onChange={event=>setForm({...form,amount_paid:event.target.value})}/></label><label className="field"><span>Official receipt *</span><input value={form.official_receipt_number} onChange={event=>setForm({...form,official_receipt_number:event.target.value.toUpperCase()})}/></label><label className="field"><span>Method</span><select value={form.payment_method} onChange={event=>setForm({...form,payment_method:event.target.value})}><option value="cash">Cash</option><option value="gcash">GCash</option><option value="maya">Maya</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></label><label className="field"><span>Date</span><input type="date" value={form.payment_date} onChange={event=>setForm({...form,payment_date:event.target.value})}/></label><label className="field span-2"><span>Notes</span><textarea rows="3" value={form.notes} onChange={event=>setForm({...form,notes:event.target.value})}/></label></div></Modal>
  </div>;
}
