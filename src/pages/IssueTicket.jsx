import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API } from '../services/api';
import PageHeader from '../components/PageHeader';
import Notice from '../components/Notice';
import StatusBadge from '../components/StatusBadge';
import Icon from '../components/Icon';
import Modal from '../components/Modal';
import { firstArray, money } from '../utils/format';
import { createRequestGate } from '../utils/requestGate';
import { citationContextReady, citationOfficerReady, citationDateTime, citationTotal } from '../utils/citationForm';
import '../styles/citation-form.css';

const initial = {
  ticket_number: '', plate_number: '', vehicle_type: '', vehicle_make: '',
  owner_name: '', owner_address: '', driver_first_name: '', driver_middle_name: '',
  driver_last_name: '', driver_address: '', driver_nationality: '', driver_email: '',
  license_type: '', license_type_other: '', driver_license_number: '',
  location: '', remarks: '', violation_ids: [], violation_descriptions: {},
  violation_latitude: null, violation_longitude: null,
};

export default function IssueTicket() {
  const [form, setForm] = useState(initial);
  const [violations, setViolations] = useState([]);
  const [catalogState, setCatalogState] = useState('loading');
  const [catalogError, setCatalogError] = useState('');
  const [context, setContext] = useState(null);
  const [contextError, setContextError] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [history, setHistory] = useState(null);
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [gpsText, setGpsText] = useState('');
  const [gpsBusy, setGpsBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const navigate = useNavigate();
  const submitLock = useRef(false);
  const reviewLock = useRef(false);
  const lookupGate = useRef(createRequestGate());
  const previewGate = useRef(createRequestGate());
  const pricingReady = citationContextReady(context);
  const officerReady = citationOfficerReady(context);

  useEffect(() => {
    let active = true;
    // The catalog is useful even when the new pricing/context RPC is unavailable.
    API.activeViolations().then(response => {
      if (!active) return;
      const choices = firstArray(response, ['violations']).filter(v => v.status == null || v.status === 'active');
      setViolations(choices);
      setCatalogState(choices.length ? 'ready' : 'empty');
    }).catch(error => {
      if (!active) return;
      setCatalogState('error');
      setCatalogError(error.message);
    });
    API.citationContext().then(response => {
      if (!active) return;
      const value = response.context ?? response.data;
      if (!citationContextReady(value)) throw new Error('The configured ₱150 citation penalty or Manila issuance time is unavailable.');
      setContext(value);
      setContextError(citationOfficerReady(value) ? '' : 'Your rank / designation is not recorded. Ask the Administrator to update your account before issuing citations.');
    }).catch(error => {
      if (!active) return;
      setContext(null);
      setContextError(`Citation pricing is unavailable. Confirm the revised database migration and try again. ${error.message}`);
    });
    return () => { active = false; lookupGate.current.invalidate(); previewGate.current.invalidate(); };
  }, []);

  useEffect(() => {
    const token = previewGate.current.begin();
    setPreview(null);
    setPreviewError('');
    if (!pricingReady || !form.plate_number.trim() || !form.violation_ids.length) {
      return () => previewGate.current.invalidate();
    }
    const timer = setTimeout(() => {
      Promise.all(form.violation_ids.map(id => API.penaltyPreview(id, form.plate_number)))
        .then(results => {
          if (!previewGate.current.isCurrent(token)) return;
          if (results.some(r => !r.penalty || Number(r.penalty.effectivePenalty) !== Number(context.flat_penalty))) {
            throw new Error('The configured violation penalty could not be verified.');
          }
          setPreview(Object.fromEntries(results.map(r => [r.penalty.violationId, r.penalty])));
        }).catch(error => {
          if (previewGate.current.isCurrent(token)) setPreviewError(error.message);
        });
    }, 350);
    return () => { clearTimeout(timer); previewGate.current.invalidate(); };
  }, [form.plate_number, form.violation_ids, pricingReady, context?.flat_penalty]);

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const plateChanged = event => {
    previewGate.current.invalidate(); lookupGate.current.invalidate();
    setPreview(null); setHistory(null); set('plate_number', event.target.value.toUpperCase());
  };
  const choose = (id, checked) => {
    previewGate.current.invalidate(); setPreview(null);
    setForm(current => ({ ...current, violation_ids: checked
      ? [...current.violation_ids, id] : current.violation_ids.filter(x => x !== id) }));
  };
  const lookup = async () => {
    const plate = form.plate_number.trim();
    if (!plate || busy || reviewOpen) return;
    const token = lookupGate.current.begin();
    try {
      const response = await API.vehicleLookup(plate);
      if (!lookupGate.current.isCurrent(token)) return;
      const vehicle = response.vehicle ?? response.data?.vehicle;
      // A matching plate never supplies a new driver's identity or email.
      if (vehicle) setForm(current => ({ ...current,
        vehicle_make: vehicle.vehicle_make || current.vehicle_make,
        owner_name: vehicle.owner_name || current.owner_name,
        owner_address: vehicle.owner_address || current.owner_address,
      }));
      setHistory({ vehicle, violations: response.violations ?? [], summary: response.summary ?? {} });
    } catch (error) {
      if (lookupGate.current.isCurrent(token)) {
        setHistory(null);
        if (error.status !== 404) setNotice({ type: 'error', text: error.message });
      }
    }
  };
  const fillGPS = async () => {
    if (!window.isSecureContext) { setGpsText('GPS requires HTTPS. Enter the place manually.'); return; }
    if (!navigator.geolocation) { setGpsText('GPS is unavailable. Enter the place manually.'); return; }
    if (navigator.permissions?.query) {
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        if (permission.state === 'denied') { setGpsText('Location permission is blocked. Enter the place manually.'); return; }
      } catch { /* Geolocation can work without the Permissions API. */ }
    }
    setGpsBusy(true); setGpsText('Getting GPS coordinates…');
    navigator.geolocation.getCurrentPosition(position => {
      const latitude = Number(position.coords.latitude.toFixed(6));
      const longitude = Number(position.coords.longitude.toFixed(6));
      setForm(current => ({ ...current, violation_latitude: latitude, violation_longitude: longitude }));
      setGpsText('GPS coordinates saved as supporting information. Enter a recognizable Place of Violation.');
      setGpsBusy(false);
    }, error => {
      const messages = { 1: 'Location permission was denied.', 2: 'Device location is unavailable.', 3: 'GPS timed out.' };
      setGpsText(`${messages[error.code] ?? 'GPS is unavailable.'} Enter the place manually.`);
      setGpsBusy(false);
    }, { timeout: 15000, maximumAge: 300000, enableHighAccuracy: false });
  };

  const selected = violations.filter(v => form.violation_ids.includes(Number(v.id)));
  const total = citationTotal(selected.length, context);
  const historyItems = history?.violations ?? [];
  const nextPlateTicketCount = Number(history?.summary?.next_plate_ticket_count ?? historyItems.length + 1);
  const plateOutstanding = Number(history?.summary?.outstanding_balance ?? 0);
  const ready = Boolean(pricingReady && officerReady && catalogState === 'ready' && selected.length && preview &&
    selected.every(v => preview[v.id]));
  const submit = async event => {
    event.preventDefault();
    if (!ready || reviewLock.current || submitLock.current || issued) return;
    reviewLock.current = true; setBusy(true); setNotice({ type: '', text: '' });
    try {
      // Refresh the Manila date/time for final review; issuance recalculates it again.
      const response = await API.citationContext();
      const fresh = response.context ?? response.data;
      if (!citationContextReady(fresh)) throw new Error('Citation pricing or time is unavailable.');
      setContext(fresh);
      if (!citationOfficerReady(fresh)) {
        setContextError('Your rank / designation is not recorded. Ask the Administrator to update your account before issuing citations.');
        return;
      }
      setContextError(''); lookupGate.current.invalidate(); setReviewOpen(true);
    } catch (error) {
      setContext(null);
      setContextError(`Citation pricing is unavailable. ${error.message}`);
    } finally { reviewLock.current = false; setBusy(false); }
  };
  const confirmSubmit = async () => {
    if (submitLock.current || issued || !ready) return;
    submitLock.current = true; setBusy(true); setNotice({ type: '', text: '' });
    try {
      const response = await API.createTicket({ ...form, expected_date: context.date_issued });
      const ticket = response.ticket ?? response.data;
      setIssued(true); setReviewOpen(false);
      setNotice({ type: 'success', text: `Citation ${ticket.ticket_number} issued. ${response.notification?.message ?? ''}` });
      if (ticket?.id) setTimeout(() => navigate(`/tickets/${ticket.id}`), 2500);
    } catch (error) {
      setNotice({ type: 'error', text: error.message }); setReviewOpen(false);
      if (error.code === 'STALE_REVIEW') {
        try {
          const response = await API.citationContext();
          const fresh = response.context ?? response.data;
          setContext(citationContextReady(fresh) ? fresh : null);
        } catch { setContext(null); }
      }
    } finally { submitLock.current = false; setBusy(false); }
  };
  const reset = () => {
    if (submitLock.current || issued) return;
    lookupGate.current.invalidate(); previewGate.current.invalidate();
    setForm({ ...initial }); setHistory(null); setPreview(null); setGpsText('');
  };
  const field = (key, label, { required = true, maxLength = 100, type = 'text', hint } = {}) =>
    <label className="field" key={key}><span>{label}{required ? ' *' : ''}</span>
      <input type={type} required={required} maxLength={maxLength} value={form[key]}
        onChange={event => set(key, event.target.value)}/>
      {hint && <small className="field-hint">{hint}</small>}
    </label>;
  const review = [
    ['Traffic Citation No.', form.ticket_number],
    ['Date & Time of Violation (Asia/Manila)', citationDateTime(context)],
    ['Cited driver', [form.driver_first_name, form.driver_middle_name, form.driver_last_name].filter(Boolean).join(' ')],
    ['Driver email — notice recipient', form.driver_email], ['Driver address', form.driver_address],
    ['Nationality', form.driver_nationality],
    ['License classification', form.license_type === 'Others' ? form.license_type_other : form.license_type || 'Not applicable / not recorded'],
    ['Driver license', form.driver_license_number || 'Not provided'],
    ['Plate', form.plate_number], ['Vehicle type / make', `${form.vehicle_type} / ${form.vehicle_make}`],
    ['Registered owner', form.owner_name], ['Owner address', form.owner_address],
    ['Place of Violation', form.location],
    ...(form.violation_latitude == null ? [] : [['Supporting GPS', `${form.violation_latitude}, ${form.violation_longitude}`]]),
    ['Report/appear by', context?.appearance_due_date], ['Apprehending Officer', context?.officer_name],
    ['Rank / Designation', context?.officer_rank || 'Not recorded'], ['Total Citation Penalty', total == null ? 'Unavailable' : money(total)],
  ];

  return <div className="issue-ticket-restored">
    <PageHeader title="Issue Traffic Citation" subtitle="Record the cited driver, vehicle, and traffic violations."/>
    <Notice type={notice.type}>{notice.text}</Notice>
    <section className="card ticket-entry-card"><div className="card-header"><h3 className="card-title">New Traffic Citation</h3></div><div className="card-body">
      <form onSubmit={submit} className="legacy-ticket-form"><fieldset disabled={busy || issued || reviewOpen}>
        <section className="citation-section"><h4 className="form-section-title"><Icon name="ticket"/> Citation Information</h4>
          <div className="form-grid">{field('ticket_number', 'TRAFFIC CITATION NO.', { maxLength: 30, hint: 'Enter the official Traffic Citation Ticket number.' })}
            <div className="field"><span>Date & Time of Violation (Asia/Manila)</span><strong>{citationDateTime(context)}</strong><small>Automatically recorded by the server when issued.</small></div>
          </div>
        </section>

        <section className="citation-section"><h4 className="form-section-title">Cited Driver Information</h4>
          <div className="form-grid">{field('driver_first_name', 'First Name')}{field('driver_middle_name', 'Middle Name', { required: false })}
            {field('driver_last_name', 'Last Name')}{field('driver_address', 'Address', { maxLength: 2000 })}
            {field('driver_nationality', 'Nationality')}{field('driver_email', 'Driver Email', { type: 'email', maxLength: 190 })}
            <label className="field"><span>License Classification / Type (if applicable)</span><select value={form.license_type} onChange={event => setForm(current => ({ ...current, license_type: event.target.value, license_type_other: '' }))}>
              <option value="">Select if applicable</option>
              {['Professional', 'Non-Professional', 'Student Permit / SP', 'Others'].map(value => <option key={value}>{value}</option>)}
            </select></label>
            {form.license_type === 'Others' && field('license_type_other', 'Specify License Classification')}
            {field('driver_license_number', 'Driver License Number', { required: false, maxLength: 30 })}
          </div>
        </section>

        <section className="citation-section"><h4 className="form-section-title"><Icon name="car"/> Vehicle / Registered Owner</h4>
          <div className="form-grid"><label className="field"><span>Plate Number *</span><div className="input-action">
            <input required maxLength="20" value={form.plate_number} onChange={plateChanged} onBlur={lookup}/>
            <button type="button" className="btn btn-secondary btn-sm" onClick={lookup}>Lookup</button>
          </div></label>
            <label className="field"><span>Vehicle Type *</span><select required value={form.vehicle_type} onChange={event => set('vehicle_type', event.target.value)}>
              <option value="" disabled>Select vehicle type</option>
              {['motorcycle', 'tricycle', 'car', 'truck', 'bus', 'van'].map(value => <option key={value} value={value}>{value}</option>)}
            </select></label>
            {field('vehicle_make', 'Make of Vehicle')}{field('owner_name', 'Owner Name')}
            {field('owner_address', 'Owner Address', { maxLength: 2000 })}
          </div>
          {history && <div className="plate-history-context"><div className="plate-context-metrics">
            <div><span>Plate Ticket Count at Issuance</span><strong>{nextPlateTicketCount}</strong></div>
            <div><span>Current Plate Outstanding</span><strong>{money(plateOutstanding)}</strong></div>
          </div><p>Plate history does not prove the same owner or driver, or repeat offending by a person.</p></div>}
          {historyItems.length > 0 && <div className="issue-history"><div className="table-wrap"><table><caption>Existing citations for this plate</caption><thead><tr>
            <th>Citation</th><th>Violations</th><th>Penalty</th><th>Paid</th><th>Balance</th><th>Status</th>
          </tr></thead><tbody>{historyItems.map(item => <tr key={item.id ?? item.ticket_number}>
            <td>{item.ticket_number}</td><td>{item.violations?.map(v => v.violation_name).join('; ') || item.violation_name}</td>
            <td>{money(item.penalty_amount)}</td><td>{money(item.total_paid)}</td>
            <td>{money(item.status === 'cancelled' ? 0 : item.remaining_balance)}</td>
            <td><StatusBadge value={item.payment_status ?? item.status}/></td>
          </tr>)}</tbody></table></div></div>}
        </section>

        <section className="citation-section"><h4 className="form-section-title"><Icon name="alert"/> Traffic Violations</h4>
          {catalogState === 'loading' && <p>Loading active violation choices…</p>}
          {catalogState === 'empty' && <Notice type="error">No active violations are available. Ask the Administrator to review the violation catalog.</Notice>}
          {catalogState === 'error' && <Notice type="error">Active violations could not be loaded. {catalogError}</Notice>}
          {contextError && <Notice type="error">{contextError}</Notice>}
          <div className="citation-checklist">{violations.map(violation => <div className="citation-choice" key={violation.id}>
            <label><input type="checkbox" checked={form.violation_ids.includes(Number(violation.id))}
              onChange={event => choose(Number(violation.id), event.target.checked)}/>
              <span><strong>{violation.violation_code} · {violation.violation_name}</strong>
                <small>{pricingReady ? `${money(context.flat_penalty)} per violation` : 'Penalty unavailable'}</small>
                {violation.description && <small>{violation.description}</small>}
                {form.violation_ids.includes(Number(violation.id)) && <small>Same-plate/same-violation occurrence: {preview?.[violation.id]?.nextOffenseCount ?? (previewError ? 'Unavailable' : 'Loading…')} (monitoring only)</small>}
              </span></label>
            {violation.requires_description && form.violation_ids.includes(Number(violation.id)) &&
              <label className="field"><span>Specify Other Violation *</span><textarea required maxLength="1000"
                value={form.violation_descriptions[violation.id] ?? ''}
                onChange={event => set('violation_descriptions', { ...form.violation_descriptions, [violation.id]: event.target.value })}/></label>}
          </div>)}</div>
          {previewError && <Notice type="error">Violation history or penalty could not be verified. {previewError}</Notice>}
          <div className="penalty-display"><span>Selected Violations: {selected.length}</span>
            {selected.length > 0 && <ul className="citation-selected-list">{selected.map(violation =>
              <li key={violation.id}><span>{violation.violation_name}</span><strong>{pricingReady ? money(context.flat_penalty) : 'Unavailable'}</strong></li>)}</ul>}
            <strong>Total Citation Penalty: {total == null ? 'Unavailable' : money(total)}</strong>
          </div>
        </section>

        <section className="citation-section"><h4 className="form-section-title">Violation Details</h4>
          <label className="field"><span>Place of Violation *</span><input required maxLength="200" value={form.location}
            placeholder="e.g. Poblacion, Calape, Bohol" onChange={event => set('location', event.target.value)}/></label>
          <div className="citation-gps-row"><button type="button" className="btn btn-secondary btn-sm" disabled={gpsBusy} onClick={fillGPS}>
            <Icon name="map"/>{gpsBusy ? 'Getting GPS…' : 'Use Current GPS'}</button>
            {form.violation_latitude != null && <button type="button" className="text-link" onClick={() => { setForm(current => ({ ...current, violation_latitude: null, violation_longitude: null })); setGpsText('GPS coordinates cleared.'); }}>Clear GPS</button>}
          </div>
          {form.violation_latitude != null && <small className="gps-status">Supporting coordinates: {form.violation_latitude}, {form.violation_longitude}</small>}
          {gpsText && <small className="gps-status">{gpsText}</small>}
          <div className="citation-readonly-time"><span>Date & Time of Violation</span><strong>{citationDateTime(context)}</strong><small>Automatically recorded at issuance.</small></div>
          <label className="field"><span>Remarks / Additional Information</span><textarea rows="3" maxLength="4000"
            value={form.remarks} onChange={event => set('remarks', event.target.value)}/></label>
        </section>

        <section className="citation-section"><h4 className="form-section-title">Appearance Requirement</h4>
          <p className="citation-deadline-note">Report/appear by <strong>{context?.appearance_due_date ?? 'Unavailable'}</strong> — seven calendar days after issuance, separate from payment.</p>
        </section>
        <section className="citation-section"><h4 className="form-section-title">Apprehending Officer</h4>
          <div className="form-grid"><div className="citation-readonly-time"><span>Officer Name</span><strong>{context?.officer_name ?? 'Unavailable'}</strong></div>
            <div className="citation-readonly-time"><span>Rank / Designation</span><strong>{context?.officer_rank || 'Not recorded'}</strong></div></div>
        </section>
        <div className="ticket-form-actions"><button className="btn btn-primary btn-lg" disabled={!ready || busy || gpsBusy}>
          <Icon name="ticket"/>Review Traffic Citation</button>
          <button type="button" className="btn btn-secondary btn-lg" onClick={reset}>Reset Form</button>
          <button type="button" className="btn btn-outline btn-lg" onClick={() => navigate('/officer/tickets')}>Back to Tickets</button>
        </div>
      </fieldset></form>
    </div></section>
    <Modal open={reviewOpen} title="Review Traffic Citation" onClose={() => !busy && setReviewOpen(false)}
      footer={<><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setReviewOpen(false)}>Back to Form</button>
        <button type="button" className="btn btn-primary" disabled={busy || issued || !ready} onClick={confirmSubmit}>{busy ? 'Issuing…' : 'Issue Traffic Citation'}</button></>}>
      <p>Confirm the cited driver email and all details. The server records the final Manila date/time when the citation is issued.</p>
      <div className="ticket-review-grid">{review.map(([label, value]) => <div key={label}><small>{label}</small><strong>{value || 'Not recorded'}</strong></div>)}</div>
      <h4>Selected Violations</h4><ul className="citation-review-list">{selected.map(violation => <li key={violation.id}>
        {violation.violation_code} · {violation.violation_name} — {pricingReady ? money(context.flat_penalty) : 'Unavailable'}
        {' · '}same-plate occurrence {preview?.[violation.id]?.nextOffenseCount ?? 'Unavailable'}
        {form.violation_descriptions[violation.id] && ` · ${form.violation_descriptions[violation.id]}`}
      </li>)}</ul>
      <p className="citation-deadline-note"><strong>Total Citation Penalty: {total == null ? 'Unavailable' : money(total)}</strong></p>
      <p className="citation-deadline-note">Email delivery failure will not undo a successfully issued citation.</p>
    </Modal>
  </div>;
}
