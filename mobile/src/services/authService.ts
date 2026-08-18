import { apiFetch } from "./apiClient";
import type { User } from "../types";

type Session = { user: User; accessToken: string; refreshToken: string };

// Name/birthday/country aren't collected here — the sign-up form is
// credentials plus the terms checkbox, and ProfileSetupScreen fills the rest
// in via updateProfile once the account exists.
export const signup = (email: string, password: string, acceptedTerms: boolean) =>
  apiFetch<Session>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, acceptedTerms }),
  });

export const login = (email: string, password: string) =>
  apiFetch<Session>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });

// `acceptedTerms` is only consulted server-side when the identity turns out to
// be a brand new account; returning users are signed straight in. See the
// TERMS_REQUIRED retry in AuthScreen.
export const loginWithGoogle = (idToken: string, acceptedTerms = false) =>
  apiFetch<Session>("/auth/google", { method: "POST", body: JSON.stringify({ idToken, acceptedTerms }) });

export const loginWithApple = (
  identityToken: string,
  email?: string | null,
  fullName?: string | null,
  acceptedTerms = false,
) =>
  apiFetch<Session>("/auth/apple", {
    method: "POST",
    body: JSON.stringify({ identityToken, email, fullName, acceptedTerms }),
  });

export const logout = (refreshToken: string) =>
  apiFetch<{ success: true }>("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) });

export const fetchMe = () => apiFetch<{ user: User }>("/auth/me");

export const updateDisplayName = (displayName: string) =>
  apiFetch<{ user: User }>("/auth/me", { method: "PATCH", body: JSON.stringify({ displayName }) });

// Partial by design — the same endpoint backs both the profile-setup step
// (all three fields) and Settings' rename (displayName alone).
export const updateProfile = (profile: { displayName?: string; birthday?: string; country?: string }) =>
  apiFetch<{ user: User }>("/auth/me", { method: "PATCH", body: JSON.stringify(profile) });

// Permanent, immediate, and not undoable — see the Worker's DELETE /auth/me
// for exactly what goes. The caller is responsible for having asked twice.
export const deleteAccount = () => apiFetch<{ success: true }>("/auth/me", { method: "DELETE" });
