"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getMe,
  logout as logoutRequest,
  type AuthUser,
} from "@/lib/auth";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  refresh: () => Promise<AuthUser | null>;
  setUser: (user: AuthUser | null) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const inflight = useRef<Promise<AuthUser | null> | null>(null);

  const setUser = useCallback((next: AuthUser | null) => {
    setUserState(next);
    setStatus(next ? "authenticated" : "anonymous");
  }, []);

  const refresh = useCallback(async (): Promise<AuthUser | null> => {
    if (inflight.current) return inflight.current;
    const promise = (async () => {
      try {
        const me = await getMe();
        setUser(me);
        return me;
      } catch {
        setUser(null);
        return null;
      } finally {
        inflight.current = null;
      }
    })();
    inflight.current = promise;
    return promise;
  }, [setUser]);

  const signOut = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // ignore network errors on logout
    } finally {
      setUser(null);
    }
  }, [setUser]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, refresh, setUser, signOut }),
    [status, user, refresh, setUser, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
