export default function Notice({ type='info', children, onClose }) {
  if (!children) return null;
  return <div className={`notice notice-${type}`} role={type==='error' ? 'alert' : 'status'}><span>{children}</span>{onClose && <button className="icon-btn" onClick={onClose} aria-label="Dismiss">×</button>}</div>;
}
