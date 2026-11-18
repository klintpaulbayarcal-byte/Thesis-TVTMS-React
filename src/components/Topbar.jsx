import { useLocation } from 'react-router-dom';
import Icon from './Icon';
const names={
 '/admin':'Dashboard','/admin/overview':'System Overview','/admin/tickets':'All Tickets','/admin/users':'Manage Users','/admin/violations':'Manage Violations','/admin/payments':'Payments','/admin/disputes':'Disputes','/admin/reports':'Reports','/admin/audit-logs':'Audit Trail','/admin/settings':'System Settings','/officer':'Dashboard','/officer/issue-ticket':'Issue Traffic Citation','/officer/tickets':'My Tickets','/officer/lookup':'Search Ticket','/notifications':'Notifications','/ticket-lookup':'Ticket Lookup','/my-tickets':'My Tickets','/profile':'My Profile'
};
export default function Topbar({ onMenu }) {
  const {pathname}=useLocation();
  const title=pathname.startsWith('/tickets/')?'Ticket Details':(names[pathname]||'TVTMS');
  return <header className="topbar"><div className="topbar-left"><button className="menu-btn" onClick={onMenu} aria-label="Open navigation"><Icon name="menu"/></button><h2>{title}</h2></div></header>;
}
