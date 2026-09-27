import { useEffect, useState } from 'react';
import { API } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Notice from '../components/Notice';
import Icon from '../components/Icon';

export default function Profile(){
  const {user,refreshProfile}=useAuth();
  const [form,setForm]=useState({name:'',email:'',contact_number:''});
  const [pw,setPw]=useState({currentPassword:'',newPassword:'',confirm:''});
  const [notice,setNotice]=useState({type:'',text:''});
  useEffect(()=>{if(user)setForm({name:user.name||'',email:user.email||'',contact_number:user.contact_number||''});},[user]);
  const save=async event=>{event.preventDefault();try{await API.updateMe(form);await refreshProfile();setNotice({type:'success',text:'Profile updated.'});}catch(error){setNotice({type:'error',text:error.message});}};
  const change=async event=>{event.preventDefault();if(pw.newPassword!==pw.confirm){setNotice({type:'error',text:'New passwords do not match.'});return;}try{await API.changePassword({currentPassword:pw.currentPassword,newPassword:pw.newPassword});setPw({currentPassword:'',newPassword:'',confirm:''});setNotice({type:'success',text:'Password changed successfully.'});}catch(error){setNotice({type:'error',text:error.message});}};
  return <div className="restored-profile-page">
    <section className="card profile-hero-card"><div className="card-body profile-hero-content"><div><p className="section-kicker">Account Management</p><h3 className="card-title">Manage your profile and password</h3><p>Keep your account details updated for audit accuracy and secure access.</p></div></div></section>
    <Notice type={notice.type}>{notice.text}</Notice>
    <div className="two-col profile-columns">
      <section className="card"><div className="card-header"><h3 className="card-title">Update Profile</h3></div><div className="card-body"><form className="stack-form" onSubmit={save}><label>Full Name<input required value={form.name} onChange={event=>setForm({...form,name:event.target.value})}/></label><label>Email<input type="email" required value={form.email} onChange={event=>setForm({...form,email:event.target.value})}/></label><label>Contact Number<input value={form.contact_number} onChange={event=>setForm({...form,contact_number:event.target.value})}/></label><label>Role<input disabled value={user?.role==='admin'?'Administrator':'Apprehending Officer'}/></label><button className="btn btn-primary"><Icon name="user"/> Update Account</button></form></div></section>
      <section className="card"><div className="card-header"><h3 className="card-title">Change Password</h3></div><div className="card-body"><form className="stack-form" onSubmit={change}><label>Current Password<input type="password" required value={pw.currentPassword} onChange={event=>setPw({...pw,currentPassword:event.target.value})}/></label><label>New Password<input type="password" minLength="12" required value={pw.newPassword} onChange={event=>setPw({...pw,newPassword:event.target.value})}/></label><label>Confirm New Password<input type="password" minLength="12" required value={pw.confirm} onChange={event=>setPw({...pw,confirm:event.target.value})}/></label><small className="field-hint">Use at least 12 characters with uppercase, lowercase, number, and symbol.</small><button className="btn btn-secondary"><Icon name="settings"/> Update Password</button></form></div></section>
    </div>
  </div>;
}
