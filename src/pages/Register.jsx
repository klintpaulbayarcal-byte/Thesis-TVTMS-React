import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Notice from '../components/Notice';
import { API } from '../services/api';

const initial = {
  name: '', email: '', password: '', confirmPassword: '', contact_number: '',
  driver_license_number: '', driver_license_expiry: '', plate_number: '',
  vehicle_registration_number: '', vehicle_registration_expiry: '', vehicle_type: 'car', vehicle_make: '',
};

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = async event => {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      const { confirmPassword, ...data } = form;
      await API.register(data);
      navigate('/login', { replace: true, state: { registered: true } });
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };
  return <main className="account-form-shell">
    <section className="account-form-card">
      <Link to="/login" className="account-back-link">← Back to sign in</Link>
      <p className="section-kicker">Public Driver Account</p>
      <h1>Create your account</h1>
      <p className="account-intro">Register your driver, license, and vehicle details to manage your TVTMS account.</p>
      <Notice type="error">{error}</Notice>
      <form className="stack-form" onSubmit={submit}>
        <div className="form-grid">
          <label className="field span-2">Full name<input required value={form.name} onChange={e => set('name', e.target.value)} autoComplete="name" /></label>
          <label className="field">Email address<input required type="email" value={form.email} onChange={e => set('email', e.target.value)} autoComplete="email" /></label>
          <label className="field">Contact number<input required value={form.contact_number} onChange={e => set('contact_number', e.target.value)} autoComplete="tel" /></label>
          <label className="field">Password<input required type="password" minLength="8" value={form.password} onChange={e => set('password', e.target.value)} autoComplete="new-password" /><small>At least 8 characters.</small></label>
          <label className="field">Confirm password<input required type="password" minLength="8" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} autoComplete="new-password" /></label>
        </div>
        <div className="account-form-section"><h2>Driver's license</h2><div className="form-grid">
          <label className="field">License number<input required value={form.driver_license_number} onChange={e => set('driver_license_number', e.target.value)} /></label>
          <label className="field">Expiry date<input required type="date" value={form.driver_license_expiry} onChange={e => set('driver_license_expiry', e.target.value)} /></label>
        </div></div>
        <div className="account-form-section"><h2>Vehicle registration</h2><div className="form-grid">
          <label className="field">Plate number<input required value={form.plate_number} onChange={e => set('plate_number', e.target.value.toUpperCase())} /></label>
          <label className="field">Registration number<input required value={form.vehicle_registration_number} onChange={e => set('vehicle_registration_number', e.target.value)} /></label>
          <label className="field">Registration expiry<input required type="date" value={form.vehicle_registration_expiry} onChange={e => set('vehicle_registration_expiry', e.target.value)} /></label>
          <label className="field">Vehicle type<select required value={form.vehicle_type} onChange={e => set('vehicle_type', e.target.value)}><option value="car">Car</option><option value="motorcycle">Motorcycle</option><option value="tricycle">Tricycle</option><option value="truck">Truck</option><option value="bus">Bus</option><option value="van">Van</option></select></label>
          <label className="field span-2">Vehicle make/model<input required value={form.vehicle_make} onChange={e => set('vehicle_make', e.target.value)} /></label>
        </div></div>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Creating account…' : 'Create public account'}</button>
      </form>
    </section>
  </main>;
}
