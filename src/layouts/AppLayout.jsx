import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
export default function AppLayout() {
  const { user }=useAuth(); const [menu,setMenu]=useState(false);
  return <div className="dashboard-layout app-shell"><Sidebar role={user?.role} open={menu} onNavigate={()=>setMenu(false)}/>{menu&&<button className="sidebar-overlay active" onClick={()=>setMenu(false)} aria-label="Close navigation"/>}<div className="main-content app-main"><Topbar onMenu={()=>setMenu(v=>!v)}/><main className="dashboard-content content"><Outlet/></main></div></div>;
}
