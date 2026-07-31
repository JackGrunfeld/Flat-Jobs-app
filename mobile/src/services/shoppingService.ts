import { apiFetch } from "./apiClient";
import type { ShoppingItem } from "../types";

export const fetchShoppingItems = (flatId: string) =>
  apiFetch<{ items: ShoppingItem[] }>(`/flats/${flatId}/shopping-items`);

export const addShoppingItem = (
  flatId: string,
  input: { name: string; costCents: number; splitWith: string[] },
) =>
  apiFetch<{ item: ShoppingItem }>(`/flats/${flatId}/shopping-items`, {
    method: "POST",
    body: JSON.stringify(input),
  });

export const deleteShoppingItem = (flatId: string, itemId: string) =>
  apiFetch<{ success: true }>(`/flats/${flatId}/shopping-items/${itemId}`, { method: "DELETE" });
