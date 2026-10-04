import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { clearSession, getStoredCustomer, getToken, setSession } from './tokenStore';
import { authLogin, authLogout, authMe, authSignup, getAuthConfig } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [customer, setCustomer] = useState(() => (getToken() ? getStoredCustomer() : null));
  const [requireAuth, setRequireAuth] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    getAuthConfig().then((r) => { if (alive) setRequireAuth(!!r.data.requireAuth); }).catch(() => {});
    if (getToken()) {
      authMe()
        .then((r) => { if (alive) setCustomer(r.data); })
        .catch((e) => { if (alive && e.status === 401) { clearSession(); setCustomer(null); } })
        .finally(() => { if (alive) setReady(true); });
    } else {
      setReady(true);
    }
    const onExpired = () => { clearSession(); setCustomer(null); };
    window.addEventListener('inquest:auth-expired', onExpired);
    return () => { alive = false; window.removeEventListener('inquest:auth-expired', onExpired); };
  }, []);

  const signup = useCallback(async (payload) => {
    const r = await authSignup(payload);
    setSession(r.data.token, r.data.customer);
    setCustomer(r.data.customer);
    return r.data.customer;
  }, []);

  const login = useCallback(async (payload) => {
    const r = await authLogin(payload);
    setSession(r.data.token, r.data.customer);
    setCustomer(r.data.customer);
    return r.data.customer;
  }, []);

  const logout = useCallback(async () => {
    try { await authLogout(); } catch { /* token may already be dead */ }
    clearSession();
    setCustomer(null);
  }, []);

  return (
    <AuthContext.Provider value={{ customer, requireAuth, ready, signup, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
