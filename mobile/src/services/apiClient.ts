import { API_BASE_URL } from "../config/env";
import { getTokens, setAccessToken, clearTokens } from "../storage/secureStore";

export class ApiError extends Error {
  status: number;
  // Machine-readable discriminator, set by the server for the cases a caller
  // has to branch on rather than just display — currently TERMS_REQUIRED,
  // which tells the sign-in screen to prompt for terms and retry.
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Set by AuthContext so apiClient can force a sign-out when the refresh
// token itself is invalid/expired, without apiClient importing AuthContext
// (which would be circular — AuthContext is what calls apiClient).
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

async function rawFetch(path: string, options: RequestInit, accessToken: string | null) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = await getTokens();
  if (!refreshToken) return null;

  const res = await rawFetch("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken }) }, null);
  if (!res.ok) return null;

  const data = (await res.json()) as { accessToken: string; refreshToken: string };
  await setAccessToken(data.accessToken);
  return data.accessToken;
}

// Bearer-token fetch wrapper with 401 -> refresh-and-retry-once, per the
// plan's apiClient.ts spec. Callers pass a JSON-serializable body, get back
// parsed JSON.
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { accessToken } = await getTokens();
  let res = await rawFetch(path, options, accessToken);

  if (res.status === 401 && accessToken) {
    refreshInFlight ??= refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
    const newAccessToken = await refreshInFlight;

    if (!newAccessToken) {
      await clearTokens();
      onSessionExpired?.();
      throw new ApiError(401, "Session expired");
    }
    res = await rawFetch(path, options, newAccessToken);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: res.statusText }))) as {
      error?: string;
      code?: string;
    };
    throw new ApiError(res.status, body.error || "Request failed", body.code);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
