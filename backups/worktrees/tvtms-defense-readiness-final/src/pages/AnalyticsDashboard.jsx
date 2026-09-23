import { useCallback, useEffect, useMemo, useState } from 'react';
import { API } from '../services/api';
import MetricBars from '../components/MetricBars';
import Notice from '../components/Notice';
import Icon from '../components/Icon';
import { money } from '../utils/format';

const iso = date => date.toISOString().slice(0,10);
const rangeFor = period => {
  const end = new Date();
  const start = new Date(end);
  if (period === '7') start.setDate(start.getDate()-6);
  else if (period === '30') start.setDate(start.getDate()-29);
  else if (period === '90') start.setDate(start.getDate()-89);
  else { start.setMonth(0,1); }
  return { startDate: iso(start), endDate: iso(end) };
};

export default function AnalyticsDashboard(){
  const [data,setData]=useState({collections:{},payment:{},tickets:{},disputes:{},monthly:[]});
  const [period,setPeriod]=useState('7');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [available,setAvailable]=useState({collections:false,payment:false,tickets:false,disputes:false,monthly:false});
  const [updatedAt,setUpdatedAt]=useState('');

  const load=useCallback(async()=>{
    setLoading(true); setError('');
    try{
      const range=rangeFor(period);
      const results=await Promise.allSettled([
        API.report('analytics/collections',range),
        API.report('analytics/payment-status',range),
        API.report('analytics/tickets-summary',range),
        API.report('analytics/dispute-rate',range),
        API.report('analytics/monthly-revenue')
      ]);
      const [c,p,t,d,m]=results;
      const successes=results.filter(result=>result.status==='fulfilled');
      setData(current=>({
        collections:c.status==='fulfilled'?c.value.data||{}:current.collections,
        payment:p.status==='fulfilled'?p.value.data||{}:current.payment,
        tickets:t.status==='fulfilled'?t.value.data||{}:current.tickets,
        disputes:d.status==='fulfilled'?d.value.data||{}:current.disputes,
        monthly:m.status==='fulfilled'?m.value.data||[]:current.monthly,
      }));
      setAvailable(current=>({
        collections:current.collections||c.status==='fulfilled',
        payment:current.payment||p.status==='fulfilled',
        tickets:current.tickets||t.status==='fulfilled',
        disputes:current.disputes||d.status==='fulfilled',
        monthly:current.monthly||m.status==='fulfilled',
      }));
      if(successes.length){setLoaded(true);setUpdatedAt(new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}));}
      const failed=results.filter(result=>result.status==='rejected');
      if(failed.length)setError(failed.length===results.length?'Analytics could not be loaded. Existing figures, if any, remain from the last successful refresh.':`Some analytics could not be refreshed: ${failed.map(result=>result.reason?.message||'Request failed').join('; ')}. Available figures are from the last successful response for each section.`);
    }catch(e){setError(e.message);}finally{setLoading(false);}
  },[period]);

  useEffect(()=>{load();},[load]);

  const breakdown=data.payment.breakdown||{};
  const top=data.tickets.topViolations||[];
  const daily=data.collections.dailyData||[];
  const paymentRows=useMemo(()=>[
    {label:'Paid',value:breakdown.paid||0},
    {label:'Unpaid',value:breakdown.unpaid||0},
    {label:'Disputed',value:breakdown.disputed||0},
    {label:'Cancelled',value:breakdown.cancelled||0}
  ],[breakdown]);

  const exportCsv=()=>{
    const rows=[['Metric','Value'],['Total Collections',available.collections?data.collections.totalAmount??0:'Unavailable'],['Outstanding Balance',available.payment?data.payment.unpaidTotal??0:'Unavailable'],['Dispute Resolution Rate',available.disputes?data.disputes.resolutionRate??0:'Unavailable'],['Total Tickets Issued',available.tickets?data.tickets.totalIssued??0:'Unavailable']];
    const blob=new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='tvtms-analytics.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),5000);
  };

  return <div className="analytics-container restored-analytics-page">
    <section className="analytics-hero">
      <div className="analytics-title"><Icon name="analytics" size={27}/><div><span className="section-kicker">PERFORMANCE MONITORING</span><h1>Analytics & KPI Dashboard</h1><p>Collections, ticket status, violations, and dispute performance.</p></div></div>
      <div className="analytics-controls"><div className="time-period-selector">{[['7','Last 7 Days'],['30','Last 30 Days'],['90','Last 90 Days'],['year','This Year']].map(([value,label])=><button key={value} className={period===value?'active':''} onClick={()=>setPeriod(value)}>{label}</button>)}</div><div className="analytics-refresh-row"><span>Last updated: {updatedAt||'—'}</span><button className="btn btn-primary btn-sm" disabled={loading} onClick={load}><Icon name="repeat" size={14}/>{loading?'Refreshing…':'Refresh'}</button></div></div>
    </section>

    <Notice type="error">{error}</Notice>
    {!loaded&&loading?<section className="card" role="status">Loading analytics…</section>:null}
    {!loaded&&!loading?<section className="card" role="status">Analytics unavailable. No unverified zero totals are displayed.</section>:null}
    {loaded&&<>
    <section className="export-section card">
      <div className="card-header"><div><h3 className="card-title">Export Analytics</h3><p>Download or print the current operational summary.</p></div></div>
      <div className="export-buttons"><button className="btn-export" onClick={exportCsv}><Icon name="report" size={14}/> Export CSV</button><button className="btn-export pdf" onClick={()=>window.print()}><Icon name="report" size={14}/> Export to PDF</button><button className="btn-export" onClick={()=>window.print()}><Icon name="report" size={14}/> Print Report</button></div>
    </section>

    <section className="kpi-metrics">
      <article className="kpi-card collections"><div className="kpi-label">Total Collections</div><div className="kpi-value">{available.collections?money(data.collections.totalAmount||0):'—'}</div><div className="kpi-subtitle">{available.collections?`${data.collections.paymentCount??0} payments processed`:'Data unavailable'}</div></article>
      <article className="kpi-card unpaid"><div className="kpi-label">Outstanding Balance</div><div className="kpi-value">{available.payment?money(data.payment.unpaidTotal||0):'—'}</div><div className="kpi-subtitle">{available.payment?`${data.payment.unpaidCount??breakdown.unpaid??0} unpaid tickets`:'Data unavailable'}</div></article>
      <article className="kpi-card disputes"><div className="kpi-label">Dispute Resolution Rate</div><div className="kpi-value">{available.disputes?`${data.disputes.resolutionRate??0}%`:'—'}</div><div className="kpi-subtitle">{available.disputes?`${data.disputes.resolvedCount??0} disputes resolved`:'Data unavailable'}</div></article>
      <article className="kpi-card"><div className="kpi-label">Total Tickets Issued</div><div className="kpi-value">{available.tickets?data.tickets.totalIssued??0:'—'}</div><div className="kpi-subtitle">{available.tickets?`${data.tickets.pendingPayment??breakdown.unpaid??0} pending payment`:'Data unavailable'}</div></article>
    </section>

    <section className="charts-grid">
      <article className="chart-container"><h2 className="chart-title"><Icon name="payment" size={18}/> Daily Collections Trend</h2><div className="chart-canvas-wrapper">{available.collections?<MetricBars rows={daily.map(r=>({label:r.collection_date||r.date||'Date',value:Number(r.total_collected??r.amount??r.totalAmount??0)}))}/>:<p>Data unavailable.</p>}</div></article>
      <article className="chart-container"><h2 className="chart-title"><Icon name="analytics" size={18}/> Payment Status Distribution</h2><div className="chart-canvas-wrapper">{available.payment?<MetricBars rows={paymentRows}/>:<p>Data unavailable.</p>}</div></article>
      <article className="chart-container"><h2 className="chart-title"><Icon name="alert" size={18}/> Top Violations</h2><div className="chart-canvas-wrapper">{available.tickets?<MetricBars rows={top.map(r=>({label:r.violation_name||r.label||r.violation_code||'Violation',value:Number(r.count||r.total||0)}))}/>:<p>Data unavailable.</p>}</div></article>
      <article className="chart-container"><h2 className="chart-title"><Icon name="payment" size={18}/> Monthly Revenue</h2><div className="chart-canvas-wrapper">{available.monthly?<MetricBars rows={(data.monthly||[]).map(r=>({label:r.month,value:Number(r.totalAmount||r.total_amount||0)}))}/>:<p>Data unavailable.</p>}</div></article>
    </section>
    </>}
  </div>;
}
