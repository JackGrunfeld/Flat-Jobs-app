import { apiFetch } from "./apiClient";
import type { Flat } from "../types";

export const createFlat = (name: string) =>
  apiFetch<{ flat: Flat }>("/flats", { method: "POST", body: JSON.stringify({ name }) });

export const joinFlatByCode = (code: string) =>
  apiFetch<{ flat: Flat }>("/flats/join", { method: "POST", body: JSON.stringify({ code }) });

export const getMyFlat = () => apiFetch<{ flat: Flat | null }>("/flats/me");

// Mirrors the old checkEmailInvite poll — auto-joins if the user's email has
// a pending invite, returns the joined flat (or null if none).
export const checkPendingInvite = () => apiFetch<{ flat: Flat | null }>("/invites/pending");

export const inviteByEmail = (flatId: string, email: string) =>
  apiFetch<{ success: true }>(`/flats/${flatId}/invites`, { method: "POST", body: JSON.stringify({ email }) });

export const leaveFlat = (flatId: string) =>
  apiFetch<{ success: true }>(`/flats/${flatId}/leave`, { method: "POST" });

export const updateFlatName = (flatId: string, name: string) =>
  apiFetch<{ success: true }>(`/flats/${flatId}`, { method: "PATCH", body: JSON.stringify({ name }) });

export const updateMemberColor = (flatId: string, color: string) =>
  apiFetch<{ success: true }>(`/flats/${flatId}/members/me`, { method: "PATCH", body: JSON.stringify({ color }) });
