import Icon from './Icon';
const iconFor={blue:'ticket',green:'check',amber:'clock',navy:'repeat',red:'alert'};
export default function StatCard({ label, value, hint, tone='blue', icon }) {
  const legacyTone=tone==='green'?'success':tone==='amber'?'warning':tone==='red'?'danger':tone==='navy'?'info':'';
  return <article className={`stat-card ${legacyTone}`}><div className="stat-header"><div className="stat-icon"><Icon name={icon||iconFor[tone]||'ticket'}/></div></div><div className="stat-label">{label}</div><h2 className="stat-value">{value ?? '—'}</h2><div className="stat-footer"><Icon name={tone==='green'?'check':tone==='amber'?'clock':'overview'} size={11}/>{hint||'Current records'}</div></article>;
}
