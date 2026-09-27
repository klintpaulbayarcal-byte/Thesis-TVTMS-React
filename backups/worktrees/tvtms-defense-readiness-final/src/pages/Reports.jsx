import { useState } from 'react';
import { API } from '../services/api';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import StatCard from '../components/StatCard';
import Notice from '../components/Notice';
import StatusBadge from '../components/StatusBadge';
import { dateOnly, money } from '../utils/format';

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = days => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

const advancedOptions = [
  ['collections', 'Collections summary'],
  ['hotspots', 'Violation hotspots'],
  ['productivity', 'Officer productivity'],
  ['officer-performance', 'Officer performance'],
  ['aging', 'Unpaid-ticket aging'],
  ['barangay', 'Barangay / location summary'],
];

function advancedRows(type, response) {
  if (!response) return [];
  if (type === 'collections') return response.dailyCollections || [];
  if (type === 'hotspots') return response.hotspots || [];
  if (type === 'productivity') return response.productivity || response.performance || [];
  return response.data || [];
}

function advancedColumns(type) {
  if (type === 'collections') return [
    { key: 'payment_date', label: 'Date', render: r => dateOnly(r.payment_date || r.collection_date) },
    { key: 'payment_count', label: 'Payments' },
    { key: 'settled_tickets', label: 'Tickets' },
    { key: 'total_collected', label: 'Collected', render: r => money(r.total_collected ?? r.amount ?? 0) },
  ];
  if (type === 'hotspots') return [
    { key: 'location', label: 'Location' },
    { key: 'total_violations', label: 'Violations' },
    { key: 'paid_count', label: 'Paid' },
    { key: 'unpaid_count', label: 'Unpaid' },
  ];
  if (type === 'productivity') return [
    { key: 'name', label: 'Officer' },
    { key: 'tickets_issued', label: 'Tickets', render: r => r.tickets_issued ?? r.total_tickets ?? 0 },
    { key: 'paid_tickets', label: 'Paid' },
    { key: 'unpaid_tickets', label: 'Unpaid' },
    { key: 'paid_value', label: 'Collections', render: r => money(r.paid_value ?? r.total_revenue ?? 0) },
  ];
  if (type === 'officer-performance') return [
    { key: 'officer_name', label: 'Officer' },
    { key: 'total_tickets', label: 'Tickets' },
    { key: 'paid_tickets', label: 'Paid' },
    { key: 'unpaid_tickets', label: 'Unpaid' },
    { key: 'collection_rate_pct', label: 'Collection rate', render: r => `${r.collection_rate_pct ?? 0}%` },
    { key: 'total_value', label: 'Ticket value', render: r => money(r.total_value) },
  ];
  if (type === 'aging') return [
    { key: 'plate_number', label: 'Plate' },
    { key: 'owner_name', label: 'Owner' },
    { key: 'unpaid_tickets', label: 'Unpaid tickets' },
    { key: 'total_due', label: 'Total due', render: r => money(r.total_due) },
    { key: 'oldest_unpaid_date', label: 'Oldest', render: r => dateOnly(r.oldest_unpaid_date) },
    { key: 'days_overdue', label: 'Days overdue' },
    { key: 'aging_bucket', label: 'Bucket' },
  ];
  return [
    { key: 'barangay', label: 'Barangay / location' },
    { key: 'total_tickets', label: 'Tickets' },
    { key: 'paid', label: 'Paid' },
    { key: 'unpaid', label: 'Unpaid' },
    { key: 'total_value', label: 'Ticket value', render: r => money(r.total_value) },
    { key: 'top_violations', label: 'Violations' },
  ];
}

export default function Reports() {
  const now = new Date();
  const [type, setType] = useState('daily');
  const [filters, setFilters] = useState({
    date: today(),
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    startDate: '',
    endDate: '',
  });
  const [report, setReport] = useState(null);
  const [advancedType, setAdvancedType] = useState('collections');
  const [advancedRange, setAdvancedRange] = useState({ startDate: daysAgo(29), endDate: today() });
  const [advanced, setAdvanced] = useState(null);
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);
  const [advancedBusy, setAdvancedBusy] = useState(false);

  const params = () => type === 'daily'
    ? { date: filters.date }
    : type === 'monthly'
      ? { year: filters.year, month: filters.month }
      : type === 'yearly'
        ? { year: filters.year }
        : { startDate: filters.startDate, endDate: filters.endDate };

  const generate = async () => {
    setBusy(true);
    setNotice({ type: '', text: '' });
    try {
      if (type === 'custom' && (!filters.startDate || !filters.endDate || filters.startDate > filters.endDate)) {
        throw new Error('Choose a valid custom start and end date.');
      }
      const r = await API.report(type, params());
      setReport(r);
    } catch (e) {
      setNotice({ type: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const pdf = async () => {
    try {
      const blob = await API.reportPdf({ type, ...params() });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-report.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setNotice({ type: 'error', text: e.message });
    }
  };

  const loadAdvanced = async () => {
    setAdvancedBusy(true);
    setNotice({ type: '', text: '' });
    try {
      const needsRange = ['collections', 'hotspots', 'productivity'].includes(advancedType);
      if (needsRange && (!advancedRange.startDate || !advancedRange.endDate || advancedRange.startDate > advancedRange.endDate)) {
        throw new Error('Choose a valid report date range.');
      }
      const r = await API.report(advancedType, needsRange ? advancedRange : {});
      setAdvanced(r);
    } catch (e) {
      setNotice({ type: 'error', text: e.message });
    } finally {
      setAdvancedBusy(false);
    }
  };

  const tickets = report?.tickets || report?.data?.tickets || [];
  const stats = report?.stats || report?.data?.stats || {};
  const rows = advancedRows(advancedType, advanced);
  const summary = advanced?.summary || {};
  const needsAdvancedRange = ['collections', 'hotspots', 'productivity'].includes(advancedType);

  return <div className="restored-reports-page">
    <PageHeader
      title="Reports"
      subtitle="Generate operational, collection, enforcement, and LGU reports from live TVTMS records."
      actions={<button className="btn btn-secondary" onClick={pdf} disabled={!report}>Export PDF</button>}
    />

    <section className="card report-generator-card">
      <div className="card-header report-card-header">
        <div><span className="section-kicker">OPERATIONAL REPORTING</span><h3 className="card-title">Generate Report</h3><p>Choose a reporting period, then generate a live ticket summary from the enforcement database.</p></div>
      </div>
      <div className="card-body report-generator-body">
        <div className="form-grid report-filter-grid">
          <label className="field"><span>Report type</span><select value={type} onChange={e=>{setType(e.target.value);setReport(null)}}><option value="daily">Daily</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="custom">Custom range</option></select></label>
          {type==='daily'&&<label className="field"><span>Date</span><input type="date" value={filters.date} onChange={e=>setFilters({...filters,date:e.target.value})}/></label>}
          {type==='monthly'&&<><label className="field"><span>Year</span><input type="number" min="2000" max="2200" value={filters.year} onChange={e=>setFilters({...filters,year:e.target.value})}/></label><label className="field"><span>Month</span><input type="number" min="1" max="12" value={filters.month} onChange={e=>setFilters({...filters,month:e.target.value})}/></label></>}
          {type==='yearly'&&<label className="field"><span>Year</span><input type="number" min="2000" max="2200" value={filters.year} onChange={e=>setFilters({...filters,year:e.target.value})}/></label>}
          {type==='custom'&&<><label className="field"><span>Start date</span><input type="date" value={filters.startDate} onChange={e=>setFilters({...filters,startDate:e.target.value})}/></label><label className="field"><span>End date</span><input type="date" value={filters.endDate} onChange={e=>setFilters({...filters,endDate:e.target.value})}/></label></>}
        </div>
        <div className="report-primary-action"><button className="btn btn-primary" disabled={busy} onClick={generate}>{busy?'Generating…':'Generate Report'}</button></div>
      </div>
    </section>

    <Notice type={notice.type}>{notice.text}</Notice>

    {report&&<section className="report-results-section">
      <div className="section-title-row"><div><span className="section-kicker">RESULTS</span><h2>Report Results</h2><p>Summary and ticket records for the selected reporting period.</p></div></div>
      <div className="stats-grid report-stats"><StatCard label="Total tickets" value={stats.total??tickets.length}/><StatCard label="Paid" value={stats.paid??0} tone="green"/><StatCard label="Unpaid" value={stats.unpaid??0} tone="amber"/><StatCard label="Cancelled" value={stats.cancelled??0} tone="navy"/><StatCard label="Collections" value={money(stats.totalRevenue??0)} tone="green"/></div>
      <section className="card report-table-card"><div className="card-header"><div><h3 className="card-title">Operational Insights</h3><p>Detailed citations included in this report.</p></div></div><div className="card-body"><DataTable columns={[{key:'ticket_number',label:'Ticket'},{key:'date_issued',label:'Date',render:r=>dateOnly(r.date_issued)},{key:'plate_number',label:'Plate'},{key:'violation_name',label:'Violation'},{key:'penalty_amount',label:'Penalty',render:r=>money(r.penalty_amount)},{key:'status',label:'Status',render:r=><StatusBadge value={r.status}/> }]} rows={tickets}/></div></section>
    </section>}

    <section className="card lgu-report-card">
      <div className="card-header report-card-header"><div><span className="section-kicker">ADVANCED REPORTING</span><h3 className="card-title">LGU Special Reports</h3><p>Collections, hotspots, officer productivity, unpaid aging, and barangay/location summaries.</p></div></div>
      <div className="card-body">
        <div className="form-grid report-filter-grid">
          <label className="field"><span>Report</span><select value={advancedType} onChange={e=>{setAdvancedType(e.target.value);setAdvanced(null)}}>{advancedOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          {needsAdvancedRange&&<><label className="field"><span>Start date</span><input type="date" value={advancedRange.startDate} onChange={e=>setAdvancedRange({...advancedRange,startDate:e.target.value})}/></label><label className="field"><span>End date</span><input type="date" value={advancedRange.endDate} onChange={e=>setAdvancedRange({...advancedRange,endDate:e.target.value})}/></label></>}
        </div>
        <div className="report-primary-action"><button className="btn btn-primary" disabled={advancedBusy} onClick={loadAdvanced}>{advancedBusy?'Loading…':'Load LGU Report'}</button></div>
      </div>
    </section>

    {advanced&&<section className="report-results-section lgu-results">
      {advancedType==='collections'&&<div className="stats-grid report-stats"><StatCard label="Collected" value={money(summary.total_collected??0)} tone="green"/><StatCard label="Payments" value={summary.payment_count??0}/><StatCard label="Settled tickets" value={summary.settled_tickets??0} tone="navy"/></div>}
      <section className="card report-table-card"><div className="card-header"><div><h3 className="card-title">Operational Insights</h3><p>{advancedOptions.find(([value])=>value===advancedType)?.[1] || 'LGU report'} results.</p></div></div><div className="card-body"><DataTable columns={advancedColumns(advancedType)} rows={rows}/></div></section>
    </section>}
  </div>;
}
