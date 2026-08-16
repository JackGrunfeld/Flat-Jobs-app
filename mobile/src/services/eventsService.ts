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

export const updateEvent = (flatId: string, eventId: string, input: NewFlatEvent) => {
  // Accept either a raw row id or a calendar-derived id like
  // `event:<rowId>:<occurrence>:<day>` and normalise to the row id.
  const normalised = eventId.startsWith("event:") ? eventId.split(":")[1] : eventId;
  // eslint-disable-next-line no-console
  console.debug(`[eventsService] updateEvent -> /flats/${flatId}/events/${normalised}`);
  return apiFetch<{ event: FlatEvent }>(`/flats/${flatId}/events/${normalised}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
};

export const deleteEvent = (flatId: string, eventId: string) => {
  // Normalise calendar ids such as `event:<rowId>:...` to the stored row id.
  const normalised = eventId.startsWith("event:") ? eventId.split(":")[1] : eventId;
  // Log for debugging when deletes are performed.
  // eslint-disable-next-line no-console
  console.debug(`[eventsService] deleteEvent -> /flats/${flatId}/events/${normalised}`);
  return apiFetch<{ success: boolean }>(`/flats/${flatId}/events/${normalised}`, {
    method: "DELETE",
  });
};
