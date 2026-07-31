import { apiFetch } from "./apiClient";
import type { Chore, Frequency } from "../types";

export const fetchChores = (flatId: string) => apiFetch<{ chores: Chore[] }>(`/flats/${flatId}/chores`);

export const addChore = (
  flatId: string,
  input: { name: string; description?: string; frequency: Frequency; memberIds: string[] },
) =>
  apiFetch<{ chore: Chore }>(`/flats/${flatId}/chores`, { method: "POST", body: JSON.stringify(input) });

export const updateChore = (
  flatId: string,
  choreId: string,
  updates: Partial<{ name: string; description: string; frequency: Frequency; memberIds: string[] }>,
) =>
  apiFetch<{ chore: Chore }>(`/flats/${flatId}/chores/${choreId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });

export const deleteChore = (flatId: string, choreId: string) =>
  apiFetch<{ success: true }>(`/flats/${flatId}/chores/${choreId}`, { method: "DELETE" });
