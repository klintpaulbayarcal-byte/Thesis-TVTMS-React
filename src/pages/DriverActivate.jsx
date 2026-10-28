import './DriverPortal.css';
import {useEffect,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {API} from '../services/api';
export default function DriverActivate(){
 const [params]=useSearchParams();const token=params.get('token')||'';
 const [message,setMessage]=useState('Checking activation link…');const [success,setSuccess]=useState(false);
 useEffect(()=>{let active=true;if(!/^[a-f0-9]{64}$/.test(token)){setMessage('Invalid activation link.');return;}
 API.activateDriver(token).then(r=>{if(active){setMessage(r.message);setSuccess(true);}}).catch(err=>{if(active)setMessage(err.message||'Activation failed.');});return()=>{active=false;};},[token]);
 return <main className="driver-access"><div className="driver-access-card"><h1>Driver Account Activation</h1><p role="status">{message}</p>{success&&<Link to="/login" className="btn btn-primary">Sign In</Link>}</div></main>;
}
