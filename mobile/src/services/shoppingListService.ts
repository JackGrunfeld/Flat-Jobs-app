import { apiFetch } from "./apiClient";
import type { ShoppingListItem } from "../types";

export const fetchShoppingListItems = (flatId: string) =>
  apiFetch<{ items: ShoppingListItem[] }>(`/flats/${flatId}/shopping-list-items`);

// `duplicate: true` means the API matched an existing (unpurchased) item by
// name and cast a vote on it instead of creating a new row.
export const addShoppingListItem = (flatId: string, input: { name: string }) =>
  apiFetch<{ item: ShoppingListItem; duplicate: boolean }>(`/flats/${flatId}/shopping-list-items`, {
    method: "POST",
    body: JSON.stringify(input),
  });

export const toggleShoppingListItemUpvote = (flatId: string, itemId: string) =>
  apiFetch<{ item: ShoppingListItem }>(`/flats/${flatId}/shopping-list-items/${itemId}/upvote`, {
    method: "POST",
  });

export const setShoppingListItemPurchased = (flatId: string, itemId: string, purchased: boolean) =>
  apiFetch<{ success: true }>(`/flats/${flatId}/shopping-list-items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ purchased }),
  });

export const deleteShoppingListItem = (flatId: string, itemId: string) =>
  apiFetch<{ success: true }>(`/flats/${flatId}/shopping-list-items/${itemId}`, { method: "DELETE" });
