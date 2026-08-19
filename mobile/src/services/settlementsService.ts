import { apiFetch } from "./apiClient";
import type { Balance, Settlement } from "../types";

export const fetchBalances = (flatId: string) => apiFetch<{ balances: Balance[] }>(`/flats/${flatId}/balances`);

export const fetchSettlements = (flatId: string) =>
  apiFetch<{ settlements: Settlement[] }>(`/flats/${flatId}/settlements`);

export const settleUp = (flatId: string, input: { toUserId: string; amountCents: number; note?: string }) =>
  apiFetch<{ id: string }>(`/flats/${flatId}/settlements`, { method: "POST", body: JSON.stringify(input) });

// `delivered` is the number of the debtor's devices the push reached: zero
// means they have no device registered or notifications turned off, which the
// caller has to say out loud rather than claim a reminder went out.
export const remindDebtor = (flatId: string, input: { toUserId: string; amountCents: number }) =>
  apiFetch<{ success: boolean; delivered: number }>(`/flats/${flatId}/settlements/remind`, {
    method: "POST",
    body: JSON.stringify(input),
  });
