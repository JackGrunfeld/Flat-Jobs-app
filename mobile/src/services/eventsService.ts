import { apiFetch } from "./apiClient";
import type { FlatEvent, NewFlatEvent } from "../types";

// `from`/`to` are inclusive YYYY-MM-DD bounds — the calendar asks only for the
// window it can be swiped across rather than the flat's whole history.
export const fetchEvents = (flatId: string, from: string, to: string) =>
  apiFetch<{ events: FlatEvent[] }>(
    `/flats/${flatId}/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );

export const createEvent = (flatId: string, input: NewFlatEvent) =>
  apiFetch<{ event: FlatEvent }>(`/flats/${flatId}/events`, {
    method: "POST",
    body: JSON.stringify(input),
  });
