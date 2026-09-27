import { Link, Outlet, useLocation } from 'react-router-dom';
import AppLogo from '../components/AppLogo';
export default function PublicLayout(){
  const {pathname}=useLocation();
  if(pathname==='/' || pathname==='/ticket-lookup') return <Outlet/>;
  return <div className="public-shell restored-public-shell"><header className="public-nav"><Link to="/" className="brand-link"><AppLogo compact/></Link><nav><Link to="/">Home</Link><Link to="/ticket-lookup">Ticket Lookup</Link><Link to="/login" className="btn btn-primary btn-sm">Staff Login</Link></nav></header><Outlet/><footer className="public-footer"><strong>TVTMS</strong><span>Municipality of Calape · Traffic Violation Ticketing and Management System</span></footer></div>;
}
