import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { db, logAction } from './db';
import { authApi, ApiError } from './api';
import { tokenStore } from './tokenStore';
import { runSync } from './sync';
import { toast } from 'sonner';
import { hashOfflinePassword, isOfflinePasswordHash, verifyOfflinePassword } from './offlineCredentials';

export type UserRole = 'admin' | 'operator' | 'supervisor' | 'auditor';

export interface AuthUser {
  id: number;
  username: string;
  role: UserRole;
  displayName: string;
}

interface AuthContextType {
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAdmin: boolean;
  loading: boolean;
  updateUser: (updates: Partial<AuthUser>) => void;
  /** True when logged in via local Dexie fallback (backend unreachable). */
  offlineMode: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: async () => false,
  logout: () => {},
  isAdmin: false,
  loading: true,
  updateUser: () => {},
  offlineMode: false,
});

const SESSION_TIMEOUT_MINUTES = 30;
const SESSION_KEY = 'vortex_session';

/** Token getter exposed for api.ts (per contract §9). Delegates to tokenStore. */
export function getAccessToken(): string | null {
  return tokenStore.getAccessToken();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [offlineMode, setOfflineMode] = useState(false);

  // Restore only after the backend revalidates the session; localStorage is not
  // trusted for user identity or role. Offline users must authenticate again.
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      let sessionExpiresAt = 0;
      try {
        const stored = localStorage.getItem(SESSION_KEY);
        if (stored) {
          const session = JSON.parse(stored);
          sessionExpiresAt = Date.parse(session.expiresAt);
          if (!Number.isFinite(sessionExpiresAt) || sessionExpiresAt <= Date.now()) {
            localStorage.removeItem(SESSION_KEY);
            tokenStore.clear();
            sessionExpiresAt = 0;
          }
        }
      } catch {
        localStorage.removeItem(SESSION_KEY);
        tokenStore.clear();
      }

      if (sessionExpiresAt && tokenStore.getRefreshToken() && navigator.onLine) {
        try {
          const serverUser = await authApi.me();
          if (!cancelled) {
            setUser({
              id: serverUser.id,
              username: serverUser.username,
              role: serverUser.role as UserRole,
              displayName: serverUser.displayName || serverUser.username,
            });
            setOfflineMode(false);
            setLastActivity(Math.max(Date.now() - SESSION_TIMEOUT_MINUTES * 60 * 1000, sessionExpiresAt - SESSION_TIMEOUT_MINUTES * 60 * 1000));
            void runSync();
          }
        } catch {
          // A network failure leaves the login screen available for offline login.
        }
      }
      if (!cancelled) setLoading(false);
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  // Session timeout enforcement (30 min idle cap per contract §1)
  useEffect(() => {
    if (!user) return;
    const checkTimeout = () => {
      const inactive = Date.now() - lastActivity;
      if (inactive > SESSION_TIMEOUT_MINUTES * 60 * 1000) {
        logout();
      }
    };
    const interval = setInterval(checkTimeout, 60000);
    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    const updateActivity = () => setLastActivity(Date.now());
    activityEvents.forEach((e) => window.addEventListener(e, updateActivity));
    return () => {
      clearInterval(interval);
      activityEvents.forEach((e) => window.removeEventListener(e, updateActivity));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, lastActivity]);

  const persistSession = () => {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + SESSION_TIMEOUT_MINUTES);
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ expiresAt: expiresAt.toISOString() }));
    } catch {
      // ignore
    }
  };

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    // 1. Try backend login first (per contract §9)
    try {
      const res = await authApi.login(username, password);
      if (res?.accessToken && res?.user) {
        tokenStore.setAccessToken(res.accessToken);
        tokenStore.setRefreshToken(res.refreshToken ?? null);
        try {
          const localUser = await db.users.where('username').equals(username).first();
          if (localUser?.id && localUser.password) {
            const matchesLocalPassword = await verifyOfflinePassword(password, localUser.password);
            await db.users.update(localUser.id, {
              password: matchesLocalPassword
                ? (isOfflinePasswordHash(localUser.password) ? localUser.password : await hashOfflinePassword(password))
                : '',
            });
          }
        } catch {
          toast.warning('Could not update the local offline credential.');
        }
        const u: AuthUser = {
          id: res.user.id,
          username: res.user.username,
          role: (res.user.role as UserRole) || 'operator',
          displayName: res.user.displayName || res.user.username,
        };
        persistSession();
        setUser(u);
        setOfflineMode(false);
        setLastActivity(Date.now());
        await logAction('LOGIN', `User ${username} logged in (online)`, u.displayName);
        // Kick off initial pull/push now that we have a valid token.
        void runSync();
        return true;
      }
      return false;
    } catch (err) {
      // Network failure (backend unreachable) → fall back to local Dexie users.
      // Non-network auth errors (401 invalid credentials) do NOT fall back.
      const isNetwork =
        err instanceof ApiError && (err.code === 'NETWORK_ERROR' || err.status === 0);
      if (!isNetwork) {
        return false;
      }
    }

    // 2. Offline fallback: verify the local PBKDF2 credential; upgrade legacy
    //    plaintext records after a successful login.
    try {
      const found = await db.users.where('username').equals(username).first();
      if (found?.id && await verifyOfflinePassword(password, found.password)) {
        if (!isOfflinePasswordHash(found.password)) {
          await db.users.update(found.id, { password: await hashOfflinePassword(password) });
        }
        const u: AuthUser = {
          id: found.id,
          username: found.username,
          role: found.role as UserRole,
          displayName: found.displayName,
        };
        tokenStore.clear();
        persistSession();
        setUser(u);
        setOfflineMode(true);
        setLastActivity(Date.now());
        await logAction('LOGIN', `User ${username} logged in (offline mode)`, found.displayName);
        toast('Offline mode — local login', {
          description: 'Changes will sync when the backend is reachable.',
        });
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    if (user) {
      void logAction('LOGOUT', `User ${user.username} logged out`, user.displayName);
    }
    // Best-effort server-side logout (revoke refresh token). Never blocks.
    void authApi.logout();
    tokenStore.clear();
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
    setUser(null);
    setOfflineMode(false);
  }, [user]);

  const updateUser = useCallback((updates: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return null;
      return { ...prev, ...updates };
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAdmin: user?.role === 'admin',
        loading,
        updateUser,
        offlineMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
