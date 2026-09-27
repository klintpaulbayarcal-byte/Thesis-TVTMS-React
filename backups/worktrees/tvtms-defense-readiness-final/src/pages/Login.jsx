import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Notice from '../components/Notice';

export default function Login(){
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    document.body.classList.add('login-modern');
    const notice = sessionStorage.getItem('auth_notice');
    if (notice) {
      setError(notice);
      sessionStorage.removeItem('auth_notice');
    }
    return () => document.body.classList.remove('login-modern');
  }, []);

  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/officer'} replace />;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const authenticated = await login(form);
      const fallback = authenticated.role === 'admin' ? '/admin' : '/officer';
      const from = location.state?.from?.pathname;
      navigate(from && from !== '/login' ? from : fallback, { replace: true });
    } catch (authError) {
      setError(authError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Link to="/" className="back-home-btn" aria-label="Back to Home">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M19 12H5M5 12l6-6M5 12l6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to Home
      </Link>
      <main className="login-shell" aria-label="Traffic Violation Ticketing and Management System login">
      <section className="login-visual-panel">
        <div className="panel-chip">Secure System Access</div>
        <h1 className="login-title">Traffic Violation Ticketing and Management System</h1>
        <p className="login-subtitle">
          A centralized platform for violation monitoring, ticket management, and enforcement operations.
        </p>

        <div className="feature-list" aria-label="System highlights">
          <div className="feature-item">Live ticketing and violation records</div>
          <div className="feature-item">Role-based access for Administrators and Apprehending Officers</div>
          <div className="feature-item">Fast search for plates, tickets, and reports</div>
        </div>

        <div className="route-preview" aria-hidden="true">
          <svg viewBox="0 0 400 110" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
            <defs>
              <linearGradient id="routeLineGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.15" />
                <stop offset="50%" stopColor="#93c5fd" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.5" />
              </linearGradient>
              <radialGradient id="nodeGlowBlue" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#93c5fd" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="nodeGlowGold" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
              </radialGradient>
            </defs>
            <path d="M 10 85 C 90 85, 110 30, 190 30 S 290 78, 390 20" fill="none" stroke="url(#routeLineGrad)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 10" />
            <circle cx="10" cy="85" r="14" fill="url(#nodeGlowBlue)" />
            <circle cx="10" cy="85" r="4.5" fill="#bfdbfe" />
            <circle cx="190" cy="30" r="14" fill="url(#nodeGlowGold)" />
            <circle cx="190" cy="30" r="4.5" fill="#fde68a" />
            <circle cx="390" cy="20" r="16" fill="url(#nodeGlowBlue)" />
            <circle cx="390" cy="20" r="5.5" fill="#eff6ff" />
          </svg>
        </div>

        <div className="visual-meta">
          <span>Traffic Violation Ticketing and Management System</span>
          <span>Calape Operations</span>
        </div>
      </section>

      <section className="login-form-panel">
        <div className="access-badge">
          <span className="system-online-dot" aria-hidden="true" />
          System Online
        </div>

        <div className="login-header">
          <div className="login-logo">
            <img src="/images/calape-logo.webp" alt="Traffic Violation Ticketing and Management System logo" />
          </div>
          <h2>Sign In</h2>
          <p>Use your authorized account to continue.</p>
        </div>

        <Notice type="error">{error}</Notice>

        <form className="login-form" onSubmit={submit} noValidate>
          <div className="form-group">
            <label htmlFor="email" className="required">Email Address</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="name@agency.gov.ph"
              autoComplete="username"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="required">Password</label>
            <div className={`password-field${showPassword ? ' is-visible' : ''}`}>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Enter your password"
                autoComplete="current-password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
              />
              <button
                type="button"
                className="toggle-password"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((value) => !value)}
              >
                <svg className="eye-icon eye-open" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c-5.5 0-9.5 4.2-11 7 1.5 2.8 5.5 7 11 7s9.5-4.2 11-7c-1.5-2.8-5.5-7-11-7Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z" /></svg>
                <svg className="eye-icon eye-closed" viewBox="0 0 24 24" aria-hidden="true"><path d="m2 4.3 2.3 2.3C2.7 8.2 1.4 10 1 12c1.5 2.8 5.5 7 11 7 1.7 0 3.3-.3 4.7-.9L21 22l1.4-1.4L3.4 2.9 2 4.3Zm10 13.2c-4.2 0-7.5-3.1-8.8-5.5.5-1 1.4-2.2 2.6-3.2l2 2c0 .3-.1.5-.1.8a4.3 4.3 0 0 0 4.3 4.3c.3 0 .6 0 .8-.1l1.7 1.7c-1 .6-2.1 1-3.5 1Zm1.7-5.5-4.4-4.4a4 4 0 0 1 4.4 4.4Zm9.3-1c-1.5-2.8-5.5-7-11-7-.9 0-1.8.1-2.6.3l1.8 1.8c.3 0 .6-.1.8-.1 4.2 0 7.5 3.1 8.8 5.5-.4.8-1 1.8-2 2.7l1.4 1.4c1.4-1.3 2.6-2.8 3-4.6Z" /></svg>
              </button>
            </div>
          </div>

          <div className="form-row">
            <label className="remember-me" htmlFor="rememberMe">
              <input type="checkbox" id="rememberMe" />
              <span>Remember me</span>
            </label>
            <Link className="forgot-link" to="/reset-password">Forgot Password?</Link>
          </div>

          <button type="submit" className="btn btn-primary btn-lg login-submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="register-line">
          Need to check a traffic citation?{' '}
          <Link className="public-lookup-link" to="/ticket-lookup">Open the public lookup</Link>
        </p>

        <div className="form-footer">
          <p>© 2026 Traffic Violation Ticketing and Management System.<br />BS Computer Science academic thesis project.</p>
        </div>
      </section>
    </main>
    </>
  );
}
