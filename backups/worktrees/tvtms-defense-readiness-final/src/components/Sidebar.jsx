import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Icon from './Icon';

const adminSections = [
  ['MAIN', [['/admin','Dashboard','dashboard'],['/admin/overview','Overview','overview']]],
  ['ENFORCEMENT', [['/admin/tickets','All Tickets','ticket'],['/officer/lookup','Search Violator','search']]],
  ['MANAGEMENT', [['/admin/violations','Violations','alert'],['/admin/users','Users','users'],['/admin/payments','Payments','payment'],['/admin/disputes','Disputes','dispute']]],
  ['ANALYTICS', [['/admin/reports','Reports','report'],['/admin/analytics','Analytics','analytics']]],
  ['ADMIN TOOLS', [['/admin/audit-logs','Audit Trail','history'],['/notifications','Notifications','bell'],['/admin/settings','Settings','settings']]],
  ['ACCOUNT', [['/profile','My Profile','user']]],
];
const officerSections = [
  ['MAIN', [['/officer','Dashboard','dashboard']]],
  ['ENFORCEMENT', [['/officer/issue-ticket','Issue Ticket','plus'],['/officer/tickets','My Tickets','ticket'],['/officer/lookup','Search Violator','search']]],
  ['ACCOUNT', [['/notifications','Notifications','bell'],['/profile','My Profile','user']]],
];

export default function Sidebar({ role, open, onNavigate }) {
  const { user, logout }=useAuth();
  const sections=role==='admin'?adminSections:officerSections;
  return <aside className={`sidebar ${open?'open':''}`}>
    <div className="sidebar-header"><div className="sidebar-logo"><img src="/images/calape-logo.webp" alt="Municipality of Calape logo"/><div className="sidebar-logo-text"><h3>Traffic Violation</h3><p>Ticketing &amp; Management System</p></div></div></div>
    <nav className="sidebar-nav">
      {sections.map(([section,links])=><div className="nav-section" key={section}><div className="nav-section-title">{section}</div>{links.map(([to,label,icon])=><NavLink key={`${section}-${to}`} end={to==='/admin'||to==='/officer'} to={to} onClick={onNavigate} className={({isActive})=>`nav-item ${isActive?'active':''}`}><Icon name={icon}/><span>{label}</span></NavLink>)}</div>)}
    </nav>
    <div className="sidebar-footer"><div className="user-info"><div className="user-avatar">{(user?.name||user?.email||'U').slice(0,1).toUpperCase()}</div><div className="user-details"><h4>{user?.name||user?.email||'TVTMS User'}</h4><p>{role==='admin'?'Administrator':'Apprehending Officer'}</p></div><button className="sidebar-logout-button" onClick={logout} aria-label="Logout"><Icon name="logout" size={16}/></button></div></div>
  </aside>;
}
