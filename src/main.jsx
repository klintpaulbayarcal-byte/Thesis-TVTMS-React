import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import App from './App';
import './styles/app.css';
import './styles/restored-dashboard.css';
import './styles/restored-landing.css';
import './styles/restored-login.css';
import './styles/restored-public-lookup.css';
import './styles/landing-anchor-offset.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
