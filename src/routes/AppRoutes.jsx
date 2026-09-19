import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import PublicLayout from '../layouts/PublicLayout';
import AppLayout from '../layouts/AppLayout';
import Landing from '../pages/Landing';
import Login from '../pages/Login';
import ResetPassword from '../pages/ResetPassword';
import PublicTicketLookup from '../pages/PublicTicketLookup';
import AdminDashboard from '../pages/AdminDashboard';
import AdminOverview from '../pages/AdminOverview';
import AdminSettings from '../pages/AdminSettings';
import AnalyticsDashboard from '../pages/AnalyticsDashboard';
import AuditLogs from '../pages/AuditLogs';
import Disputes from '../pages/Disputes';
import IssueTicket from '../pages/IssueTicket';
import LicensePlateLookup from '../pages/LicensePlateLookup';
import ManageUsers from '../pages/ManageUsers';
import ManageViolations from '../pages/ManageViolations';
import Notifications from '../pages/Notifications';
import OfficerDashboard from '../pages/OfficerDashboard';
import Payments from '../pages/Payments';
import Profile from '../pages/Profile';
import Reports from '../pages/Reports';
import TicketDetails from '../pages/TicketDetails';
import ViewTickets from '../pages/ViewTickets';

const secure = (roles, node) => <ProtectedRoute roles={roles}>{node}</ProtectedRoute>;

export default function AppRoutes(){
  return <Routes>
    <Route element={<PublicLayout/>}>
      <Route path="/" element={<Landing/>}/>
      <Route path="/ticket-lookup" element={<PublicTicketLookup/>}/>
    </Route>
    <Route path="/login" element={<Login/>}/>
    <Route path="/reset-password" element={<ResetPassword/>}/>

    <Route element={secure(['admin','apprehending_officer'], <AppLayout/>)}>
      <Route path="/profile" element={<Profile/>}/>
      <Route path="/notifications" element={<Notifications/>}/>
      <Route path="/tickets/:id" element={<TicketDetails/>}/>

      <Route path="/admin" element={secure(['admin'], <AdminDashboard/>)}/>
      <Route path="/admin/overview" element={secure(['admin'], <AdminOverview/>)}/>
      <Route path="/admin/users" element={secure(['admin'], <ManageUsers/>)}/>
      <Route path="/admin/violations" element={secure(['admin'], <ManageViolations/>)}/>
      <Route path="/admin/payments" element={secure(['admin'], <Payments/>)}/>
      <Route path="/admin/disputes" element={secure(['admin'], <Disputes/>)}/>
      <Route path="/admin/reports" element={secure(['admin'], <Reports/>)}/>
      <Route path="/admin/analytics" element={secure(['admin'], <AnalyticsDashboard/>)}/>
      <Route path="/admin/audit-logs" element={secure(['admin'], <AuditLogs/>)}/>
      <Route path="/admin/settings" element={secure(['admin'], <AdminSettings/>)}/>
      <Route path="/admin/tickets" element={secure(['admin'], <ViewTickets/>)}/>

      <Route path="/officer" element={secure(['apprehending_officer'], <OfficerDashboard/>)}/>
      <Route path="/officer/issue-ticket" element={secure(['apprehending_officer'], <IssueTicket/>)}/>
      <Route path="/officer/tickets" element={secure(['admin','apprehending_officer'], <ViewTickets/>)}/>
      <Route path="/officer/lookup" element={secure(['admin','apprehending_officer'], <LicensePlateLookup/>)}/>
    </Route>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes>;
}
