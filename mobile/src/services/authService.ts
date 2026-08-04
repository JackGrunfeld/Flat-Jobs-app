import { apiFetch } from "./apiClient";
import type { User } from "../types";

type Session = { user: User; accessToken: string; refreshToken: string };

export const signup = (email: string, password: string, displayName: string, birthday: string) =>
  apiFetch<Session>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName, birthday }),
  });

export const login = (email: string, password: string) =>
  apiFetch<Session>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });

export const loginWithGoogle = (idToken: string) =>
  apiFetch<Session>("/auth/google", { method: "POST", body: JSON.stringify({ idToken }) });

export const loginWithApple = (identityToken: string, email?: string | null, fullName?: string | null) =>
  apiFetch<Session>("/auth/apple", { method: "POST", body: JSON.stringify({ identityToken, email, fullName }) });

export const logout = (refreshToken: string) =>
  apiFetch<{ success: true }>("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) });

export const fetchMe = () => apiFetch<{ user: User }>("/auth/me");

export const updateDisplayName = (displayName: string) =>
  apiFetch<{ user: User }>("/auth/me", { method: "PATCH", body: JSON.stringify({ displayName }) });
