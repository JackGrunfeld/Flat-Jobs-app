import { apiFetch } from "./apiClient";
import type { Balance, Settlement } from "../types";

export const fetchBalances = (flatId: string) => apiFetch<{ balances: Balance[] }>(`/flats/${flatId}/balances`);

export const fetchSettlements = (flatId: string) =>
  apiFetch<{ settlements: Settlement[] }>(`/flats/${flatId}/settlements`);

export const settleUp = (flatId: string, input: { toUserId: string; amountCents: number; note?: string }) =>
  apiFetch<{ id: string }>(`/flats/${flatId}/settlements`, { method: "POST", body: JSON.stringify(input) });
