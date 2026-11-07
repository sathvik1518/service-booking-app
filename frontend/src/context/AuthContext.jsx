import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as api from "../api";

const AuthContext = createContext(null);

/** Keeps "who is logged in" for the whole app. */
export function AuthProvider({ children, onSessionExpired }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(api.getToken()));

  const logout = useCallback(() => {
    api.setToken(null);
    setUser(null);
  }, []);

  // When the app opens with a saved token, check with the server that it is still valid.
  useEffect(() => {
    if (!api.getToken()) return;
    api
      .getMe()
      .then(setUser)
      .catch(() => api.setToken(null))
      .finally(() => setLoading(false));
  }, []);

  // If any later call comes back 401, log out and tell the person why.
  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      logout();
      onSessionExpired?.();
    });
  }, [logout, onSessionExpired]);

  const signIn = useCallback(async (data) => {
    api.setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const login = useCallback(async (email, password) => signIn(await api.login({ email, password })), [signIn]);
  const register = useCallback(async (fields) => signIn(await api.register(fields)), [signIn]);

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
