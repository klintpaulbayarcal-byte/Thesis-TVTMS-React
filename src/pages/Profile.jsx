import { useEffect, useState } from 'react';
import { API } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Notice from '../components/Notice';
import Icon from '../components/Icon';

const emptyDriver = { driver_license_number: '', driver_license_expiry: '', plate_number: '', vehicle_registration_number: '', vehicle_registration_expiry: '', vehicle_type: 'car', vehicle_make: '' };
export default function Profile() {
  const { user, refreshProfile } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', contact_number: '', ...emptyDriver });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [notice, setNotice] = useState({ type: '', text: '' });
  const driver = user?.role === 'driver';
  useEffect(() => { if (user) setForm({ name: user.name || '', email: user.email || '', contact_number: user.contact_number || '', ...emptyDriver, ...user }); }, [user]);
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const save = async event => { event.preventDefault(); try { await API.updateMe(form); await refreshProfile(); setNotice({ type: 'success', text: 'Profile updated.' }); } catch (error) { setNotice({ type: 'error', text: error.message }); } };
  const change = async event => { event.preventDefault(); if (pw.newPassword !== pw.confirm) { setNotice({ type: 'error', text: 'New passwords do not match.' }); return; } try { await API.changePassword({ currentPassword: pw.currentPassword, newPassword: pw.newPassword }); setPw({ currentPassword: '', newPassword: '', confirm: '' }); setNotice({ type: 'success', text: 'Password changed successfully.' }); } catch (error) { setNotice({ type: 'error', text: error.message }); } };
  return <div className="restored-profile-page">
    <section className="card profile-hero-card"><div className="card-body profile-hero-content"><div><p className="section-kicker">{driver ? 'Public Driver Account' : 'Account Management'}</p><h3 className="card-title">{driver ? 'Manage your driver profile' : 'Manage your profile and password'}</h3><p>Keep your account details updated for accurate records and secure access.</p></div></div></section>
    <Notice type={notice.type}>{notice.text}</Notice>
    <div className="two-col profile-columns">
      <section className="card"><div className="card-header"><h3 className="card-title">Update Profile</h3></div><div className="card-body"><form className="stack-form" onSubmit={save}>
        <label>Full Name<input required value={form.name} onChange={e => set('name', e.target.value)} /></label><label>Email<input type="email" required value={form.email} onChange={e => set('email', e.target.value)} /></label><label>Contact Number<input required={driver} value={form.contact_number} onChange={e => set('contact_number', e.target.value)} /></label><label>Role<input disabled value={driver ? 'Public Driver' : user?.role === 'admin' ? 'Administrator' : 'Apprehending Officer'} /></label>
        {driver && <><div className="profile-form-divider"><h4>Driver's license</h4></div><label>License Number<input required value={form.driver_license_number} onChange={e => set('driver_license_number', e.target.value)} /></label><label>License Expiry<input required type="date" value={form.driver_license_expiry} onChange={e => set('driver_license_expiry', e.target.value)} /></label><div className="profile-form-divider"><h4>Vehicle registration</h4></div><label>Plate Number<input required value={form.plate_number} onChange={e => set('plate_number', e.target.value.toUpperCase())} /></label><label>Registration Number<input required value={form.vehicle_registration_number} onChange={e => set('vehicle_registration_number', e.target.value)} /></label><label>Registration Expiry<input required type="date" value={form.vehicle_registration_expiry} onChange={e => set('vehicle_registration_expiry', e.target.value)} /></label><label>Vehicle Type<select required value={form.vehicle_type} onChange={e => set('vehicle_type', e.target.value)}><option value="car">Car</option><option value="motorcycle">Motorcycle</option><option value="tricycle">Tricycle</option><option value="truck">Truck</option><option value="bus">Bus</option><option value="van">Van</option></select></label><label>Vehicle Make/Model<input required value={form.vehicle_make} onChange={e => set('vehicle_make', e.target.value)} /></label></>}
        <button className="btn btn-primary"><Icon name="user" /> Update Account</button>
      </form></div></section>
      <section className="card"><div className="card-header"><h3 className="card-title">Change Password</h3></div><div className="card-body"><form className="stack-form" onSubmit={change}><label>Current Password<input type="password" required value={pw.currentPassword} onChange={e => setPw({ ...pw, currentPassword: e.target.value })} /></label><label>New Password<input type="password" minLength="12" required value={pw.newPassword} onChange={e => setPw({ ...pw, newPassword: e.target.value })} /></label><label>Confirm New Password<input type="password" minLength="12" required value={pw.confirm} onChange={e => setPw({ ...pw, confirm: e.target.value })} /></label><small className="field-hint">Use at least 12 characters with uppercase, lowercase, number, and symbol.</small><button className="btn btn-secondary"><Icon name="settings" /> Update Password</button></form></div></section>
    </div>
  </div>;
}
