import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { API } from '../services/api';
import Notice from '../components/Notice';

export default function ResetPassword(){
  const [params]=useSearchParams();
  const token=useMemo(()=>params.get('token')||'',[params]);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [confirm,setConfirm]=useState('');
  const [notice,setNotice]=useState({type:'',text:''});
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    document.body.classList.add('login-modern');
    return()=>document.body.classList.remove('login-modern');
  },[]);

  const request=async event=>{
    event.preventDefault();setBusy(true);
    try{const result=await API.requestPasswordReset(email);setNotice({type:'success',text:result.message});}
    catch(error){setNotice({type:'error',text:error.message});}
    finally{setBusy(false);}
  };
  const reset=async event=>{
    event.preventDefault();
    if(password!==confirm){setNotice({type:'error',text:'Passwords do not match.'});return;}
    setBusy(true);
    try{const result=await API.resetPassword(token,password);setNotice({type:'success',text:result.message});}
    catch(error){setNotice({type:'error',text:error.message});}
    finally{setBusy(false);}
  };

  return <>
    <Link to="/" className="back-home-btn" aria-label="Back to Home">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M19 12H5M5 12l6-6M5 12l6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Back to Home
    </Link>
    <main className="login-shell" aria-label="TVTMS password recovery">
    <section className="login-visual-panel">
      <div className="panel-chip">Secure Account Recovery</div>
      <h1 className="login-title">Recover access to the TVTMS securely.</h1>
      <p className="login-subtitle">Password recovery is available only for authorized staff accounts. Reset links and credentials remain protected by the server-side authentication workflow.</p>
      <div className="feature-list" aria-label="Recovery safeguards">
        <div className="feature-item">Authorized staff accounts only</div>
        <div className="feature-item">Time-limited password reset workflow</div>
        <div className="feature-item">Secure server-side account verification</div>
      </div>
      <div className="route-preview" aria-hidden="true">
        <svg viewBox="0 0 400 110" xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'auto',display:'block',overflow:'visible'}}>
          <defs><linearGradient id="recoveryRoute" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#60a5fa" stopOpacity="0.18"/><stop offset="55%" stopColor="#93c5fd" stopOpacity="0.62"/><stop offset="100%" stopColor="#fbbf24" stopOpacity="0.55"/></linearGradient></defs>
          <path d="M 12 82 C 100 82, 118 30, 198 30 S 300 75, 388 22" fill="none" stroke="url(#recoveryRoute)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 10"/>
          <circle cx="12" cy="82" r="5" fill="#bfdbfe"/><circle cx="198" cy="30" r="5" fill="#fde68a"/><circle cx="388" cy="22" r="6" fill="#eff6ff"/>
        </svg>
      </div>
      <div className="visual-meta"><span>TVTMS Security</span><span>Calape Operations</span></div>
    </section>

    <section className="login-form-panel">
      <div className="access-badge"><span className="system-online-dot" aria-hidden="true"/> Secure Recovery</div>
      <div className="login-header">
        <div className="login-logo"><img src="/images/calape-logo.webp" alt="TVTMS logo"/></div>
        <h2>{token?'Create a New Password':'Reset Password'}</h2>
        <p>{token?'Choose a strong password for your staff account.':'Enter the email address of your active staff account.'}</p>
      </div>
      <Notice type={notice.type}>{notice.text}</Notice>
      {token?
        <form className="login-form" onSubmit={reset}>
          <div className="form-group"><label className="required" htmlFor="newPassword">New Password</label><input id="newPassword" type="password" minLength="12" required placeholder="Enter a new password" value={password} onChange={event=>setPassword(event.target.value)}/></div>
          <div className="form-group"><label className="required" htmlFor="confirmPassword">Confirm Password</label><input id="confirmPassword" type="password" minLength="12" required placeholder="Confirm your new password" value={confirm} onChange={event=>setConfirm(event.target.value)}/><div className="hint">Use at least 12 characters with uppercase, lowercase, number, and symbol.</div></div>
          <button className="btn btn-primary btn-lg login-submit" disabled={busy}>{busy?'Updating…':'Update Password'}</button>
        </form>:
        <form className="login-form" onSubmit={request}>
          <div className="form-group"><label className="required" htmlFor="recoveryEmail">Email Address</label><input id="recoveryEmail" type="email" required placeholder="name@agency.gov.ph" value={email} onChange={event=>setEmail(event.target.value)}/></div>
          <button className="btn btn-primary btn-lg login-submit" disabled={busy}>{busy?'Sending…':'Send Reset Instructions'}</button>
        </form>}
      <p className="register-line"><Link className="forgot-link" to="/login">← Back to Sign In</Link></p>
      <div className="form-footer"><p>© 2026 Traffic Violation Ticketing and Management System.<br/>BS Computer Science academic thesis project.</p></div>
    </section>
  </main>
  </>;
}
