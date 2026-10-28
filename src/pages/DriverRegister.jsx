import './DriverPortal.css';
import {useState} from 'react';
import {Link} from 'react-router-dom';
import {API} from '../services/api';
import Notice from '../components/Notice';
export default function DriverRegister(){
 const [form,setForm]=useState({name:'',email:'',password:''});
 const [busy,setBusy]=useState(false);const [notice,setNotice]=useState({type:'',text:''});
 const [resend,setResend]=useState(false);
 async function submit(e){e.preventDefault();if(busy)return;setBusy(true);setNotice({type:'',text:''});
  try{const r=await (resend?API.resendDriverActivation({email:form.email,password:form.password}):API.registerDriver(form));setNotice({type:'success',text:r.message||'Check your email for the activation link.'});setForm(x=>({...x,password:''}));}
  catch(err){setNotice({type:'error',text:err.message});}finally{setBusy(false);}
 }
 return <main className="driver-access"><div className="driver-access-card">
 <Link to="/login">← Back to Sign In</Link><h1>{resend?'Resend Activation':'Create Driver Account'}</h1>
 <p>Drivers can view citation records after verifying their email. Official license, vehicle and citation records cannot be edited here.</p>
 <Notice type={notice.type}>{notice.text}</Notice>
 <form onSubmit={submit}>
  {!resend&&<label>Full name<input required maxLength="100" autoComplete="name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>}
  <label>Email used for traffic citations<input required type="email" maxLength="100" autoComplete="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
  <label>Password<input required minLength={12} type="password" autoComplete="new-password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label>
  <small>Use at least 12 characters, with uppercase, lowercase, number and symbol.</small>
  <button className="btn btn-primary" disabled={busy}>{busy?'Submitting…':resend?'Resend Activation Link':'Create Account'}</button>
 </form><p><button type="button" className="btn btn-secondary" onClick={()=>{setResend(!resend);setNotice({type:'',text:''});}}>{resend?'Back to Registration':'Activation link expired or missing?'}</button></p><p>Already registered? <Link to="/login">Sign in</Link>.</p>
 </div></main>;
}
