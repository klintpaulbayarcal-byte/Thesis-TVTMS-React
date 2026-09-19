import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

export default function ProtectedRoute({ roles, children }) {
  const { token, user, checking } = useAuth();
  const location = useLocation();
  if (checking) return <div className="center-screen"><LoadingSpinner label="Checking session…" /></div>;
  if (!token || !user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles?.length && !roles.includes(user.role)) return <Navigate to={user.role === 'admin' ? '/admin' : '/officer'} replace />;
  return children;
}
