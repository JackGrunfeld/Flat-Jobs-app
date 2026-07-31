import { apiFetch } from "./apiClient";
import type { Completion } from "../types";

export const fetchCompletions = (flatId: string) =>
  apiFetch<{ completions: Completion[] }>(`/flats/${flatId}/completions`);

export const saveCompletion = (
  flatId: string,
  input: { choreId: string; week: number; assignedUserId: string; done: boolean },
) =>
  apiFetch<{ success: true }>(`/flats/${flatId}/completions`, { method: "PUT", body: JSON.stringify(input) });
