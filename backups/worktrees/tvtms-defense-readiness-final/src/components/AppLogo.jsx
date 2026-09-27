export default function AppLogo({ compact=false }) {
  return <div className={`app-logo ${compact?'compact':''}`}><img src="/images/calape-logo.webp" alt="Calape seal"/><div><strong>{compact?'Calape Traffic Enforcement':'Traffic Violation'}</strong>{!compact && <small>Ticketing &amp; Management System</small>}</div></div>;
}
