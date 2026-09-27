export default function MetricBars({ rows=[], labelKey='label', valueKey='value' }) {
  const max=Math.max(1,...rows.map(r=>Number(r[valueKey]||0)));
  return <div className="metric-bars">{rows.map((r,i)=><div className="metric-row" key={r[labelKey]??i}><div><span>{r[labelKey]}</span><strong>{r[valueKey]??0}</strong></div><div className="bar-track"><div className="bar-fill" style={{width:`${Math.min(100,(Number(r[valueKey]||0)/max)*100)}%`}}/></div></div>)}</div>;
}
