import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { API, clearSession, getStoredToken, getStoredUser, saveSession } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(getStoredToken());
  const [user, setUser] = useState(getStoredUser());
  const [checking, setChecking] = useState(Boolean(token));

  const login = useCallback(async credentials => {
    const result = await API.login(credentials);
    saveSession(result.token, result.user);
    setToken(result.token); setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try { await API.logout(); } catch { /* local logout remains authoritative */ }
    clearSession(); setToken(null); setUser(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!getStoredToken()) return null;
    try {
      const result = await API.profile();
      const next = result.user ?? result.data ?? null;
      if (next) {
        setUser(next);
        saveSession(getStoredToken(), next);
      }
      return next;
    } catch (error) {
      if (error.status === 401) { clearSession(); setToken(null); setUser(null); }
      throw error;
    }
  }, []);

  useEffect(() => {
    if (!token) { setChecking(false); return; }
    refreshProfile().catch(() => null).finally(() => setChecking(false));
  }, [token, refreshProfile]);

  const value = useMemo(() => ({ token, user, checking, login, logout, refreshProfile, isAdmin: user?.role === 'admin', isOfficer: user?.role === 'apprehending_officer' }), [token,user,checking,login,logout,refreshProfile]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
