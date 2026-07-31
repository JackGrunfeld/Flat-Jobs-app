import { apiFetch } from "./apiClient";

export const registerPushToken = (token: string, platform: "ios" | "android") =>
  apiFetch<{ success: true }>("/users/me/push-tokens", { method: "POST", body: JSON.stringify({ token, platform }) });
