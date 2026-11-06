import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [unread, setUnread] = useState(0);

  const refreshUnread = useCallback(async () => {
    try {
      const d = await api.get('/user/notifications');
      setUnread(d.unread || 0);
    } catch { setUnread(0); }
  }, []);

  useEffect(() => {
    let alive = true;
    api.get('/auth/me')
      .then((d) => { if (alive) { setUser(d.user); if (d.user) refreshUnread(); } })
      .catch(() => {})
      .finally(() => { if (alive) setBooting(false); });
    return () => { alive = false; };
  }, [refreshUnread]);

  useEffect(() => {
    if (!user) return;
    const t = setInterval(refreshUnread, 60_000);
    return () => clearInterval(t);
  }, [user, refreshUnread]);

  const login = async (email, password) => {
    const d = await api.post('/auth/login', { email, password });
    setUser(d.user);
    refreshUnread();
    return d;
  };
  const register = async (payload) => {
    const d = await api.post('/auth/register', payload);
    // Registration now ends in a confirmation email rather than a session: the
    // account exists, but stays signed out until the link is opened. The caller
    // renders the "check your inbox" state from the returned payload.
    if (d.pending_verification) return d;
    setUser(d.user);
    refreshUnread();
    return d;
  };
  // Used by the /verify screen: redeeming the link opens a session server-side,
  // and this adopts it so the app does not bounce straight back to /login.
  const adoptSession = (user) => { setUser(user); refreshUnread(); };
  const logout = async () => {
    try { await api.post('/auth/logout', {}); } catch { /* ignore */ }
    setUser(null);
    setUnread(0);
  };
  const updateProfile = async (payload) => {
    const d = await api.patch('/auth/profile', payload);
    setUser(d.user);
    return d;
  };
  const changePassword = (current_password, new_password) =>
    api.post('/auth/change-password', { current_password, new_password });

  const isAdmin = user?.role === 'admin';
  const homePath = isAdmin ? '/admin/dashboard' : '/home';

  return (
    <AuthCtx.Provider value={{ user, booting, unread, setUnread, refreshUnread, login, register, logout, updateProfile, changePassword, adoptSession, isAdmin, homePath }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
