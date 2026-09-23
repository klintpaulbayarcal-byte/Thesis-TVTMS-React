import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Icon from './Icon';
const names={
 '/admin':'Dashboard','/admin/overview':'System Overview','/admin/tickets':'All Tickets','/admin/users':'Manage Users','/admin/violations':'Manage Violations','/admin/payments':'Payments','/admin/disputes':'Disputes','/admin/reports':'Reports','/admin/analytics':'Analytics','/admin/audit-logs':'Audit Trail','/admin/settings':'System Settings','/officer':'Dashboard','/officer/issue-ticket':'Issue Ticket','/officer/tickets':'My Tickets','/officer/lookup':'Search Violator','/notifications':'Notifications','/profile':'My Profile'
};
export default function Topbar({ onMenu }) {
  const { user, logout }=useAuth(); const {pathname}=useLocation();
  const title=pathname.startsWith('/tickets/')?'Ticket Details':(names[pathname]||'TVTMS');
  return <header className="topbar"><div className="topbar-left"><button className="menu-btn" onClick={onMenu} aria-label="Open navigation"><Icon name="menu"/></button><h2>{title}</h2></div><div className="topbar-right"><Link className="topbar-user" to="/profile"><span className="avatar">{(user?.name||user?.email||'U').slice(0,1).toUpperCase()}</span><span><strong>{user?.name||'User'}</strong><small>{user?.role==='admin'?'Administrator':'Apprehending Officer'}</small></span></Link><button className="btn btn-secondary btn-sm" onClick={logout}><Icon name="logout" size={14}/> Logout</button></div></header>;
}
