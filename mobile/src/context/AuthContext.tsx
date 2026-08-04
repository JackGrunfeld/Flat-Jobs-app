import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import type { User, Flat } from "../types";
import * as authService from "../services/authService";
import * as flatService from "../services/flatService";
import { getTokens, setTokens, clearTokens } from "../storage/secureStore";
import { setSessionExpiredHandler } from "../services/apiClient";
import { registerForPushNotificationsAsync } from "../notifications/registerPushToken";

type AuthContextValue = {
  currentUser: User | null;
  userFlat: Flat | null;
  authLoading: boolean;
  signup: (name: string, email: string, password: string, birthday: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  loginWithApple: (identityToken: string, email?: string | null, fullName?: string | null) => Promise<void>;
  logout: () => Promise<void>;
  refreshFlat: () => Promise<Flat | null>;
  leaveFlat: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userFlat, setUserFlat] = useState<Flat | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const refreshTokenRef = useRef<string | null>(null);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setCurrentUser(null);
      setUserFlat(null);
    });
  }, []);

  // Equivalent of the web version's onAuthStateChanged bootstrap: on cold
  // start, validate any stored session against the API instead of trusting
  // it blindly (the token may have been revoked or expired server-side).
  useEffect(() => {
    (async () => {
      const { accessToken, refreshToken } = await getTokens();
      refreshTokenRef.current = refreshToken;
      if (!accessToken) {
        setAuthLoading(false);
        return;
      }
      try {
        const { user } = await authService.fetchMe();
        setCurrentUser(user);
        await refreshFlat();
        registerForPushNotificationsAsync().catch(() => {});
      } catch {
        await clearTokens();
      } finally {
        setAuthLoading(false);
      }
    })();
  }, []);

  const refreshFlat = async (): Promise<Flat | null> => {
    const { flat } = await flatService.getMyFlat();
    setUserFlat(flat);
    return flat;
  };

  const establishSession = async (session: { user: User; accessToken: string; refreshToken: string }) => {
    await setTokens(session.accessToken, session.refreshToken);
    refreshTokenRef.current = session.refreshToken;
    setCurrentUser(session.user);
    await refreshFlat();
    registerForPushNotificationsAsync().catch(() => {});
  };

  const signup = async (name: string, email: string, password: string, birthday: string) => {
    const session = await authService.signup(email, password, name, birthday);
    await establishSession(session);
    // Best-effort: pick up a pending invite immediately. FlatSetupScreen
    // handles the retry-poll for the case where the invite hasn't propagated
    // yet — see its own useEffect for why that race exists.
    if (!(await flatService.checkPendingInvite()).flat) return;
    await refreshFlat();
  };

  const login = async (email: string, password: string) => {
    const session = await authService.login(email, password);
    await establishSession(session);
  };

  const loginWithGoogle = async (idToken: string) => {
    const session = await authService.loginWithGoogle(idToken);
    await establishSession(session);
  };

  const loginWithApple = async (identityToken: string, email?: string | null, fullName?: string | null) => {
    const session = await authService.loginWithApple(identityToken, email, fullName);
    await establishSession(session);
  };

  const logout = async () => {
    if (refreshTokenRef.current) {
      await authService.logout(refreshTokenRef.current).catch(() => {});
    }
    await clearTokens();
    refreshTokenRef.current = null;
    setCurrentUser(null);
    setUserFlat(null);
  };

  const leaveFlat = async () => {
    if (!userFlat) return;
    await flatService.leaveFlat(userFlat.id);
    setUserFlat(null);
  };

  const updateDisplayName = async (name: string) => {
    const { user } = await authService.updateDisplayName(name);
    setCurrentUser(user);
    // Flatmate/chore-rotation names are joined server-side from users.display_name,
    // so this client's own flat view needs a refetch to pick up the change too.
    await refreshFlat();
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userFlat,
        authLoading,
        signup,
        login,
        loginWithGoogle,
        loginWithApple,
        logout,
        refreshFlat,
        leaveFlat,
        updateDisplayName,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
