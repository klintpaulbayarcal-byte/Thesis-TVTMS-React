import './DriverPortal.css';
import {useRef,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {API} from '../services/api';

export default function DriverActivate(){
 const [params]=useSearchParams();
 const token=params.get('token')||'';
 const validToken=/^[a-f0-9]{64}$/.test(token);
 const [message,setMessage]=useState('');
 const [success,setSuccess]=useState(false);
 const [busy,setBusy]=useState(false);
 const activating=useRef(false);

 async function activate(){
  if(!validToken||activating.current||success)return;
  activating.current=true;
  setBusy(true);
  setMessage('');
  try{
   const response=await API.activateDriver(token);
   setMessage(response.message||'Your Driver account was activated successfully.');
   setSuccess(true);
  }catch(error){
   setMessage(error.message||'Activation failed. Please request a new link if yours has expired.');
  }finally{
   activating.current=false;
   setBusy(false);
  }
 }

 return <main className="driver-access"><div className="driver-access-card">
  <h1>Driver Account Activation</h1>
  {!validToken?<p role="alert">Invalid activation link.</p>:!success&&<p>Confirm your activation below. Your email link can be used only once and expires after 30 minutes.</p>}
  {message&&<p role="status">{message}</p>}
  {success?<Link to="/login" className="btn btn-primary">Sign In</Link>:validToken&&<button type="button" className="btn btn-primary" disabled={busy} onClick={activate}>{busy?'Activating…':'Activate Account'}</button>}
  {!success&&<p><Link to="/driver/register">Request a new activation link</Link></p>}
 </div></main>;
}
