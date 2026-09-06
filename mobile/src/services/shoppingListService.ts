import { apiFetch } from "./apiClient";
import type { ShoppingList, ShoppingListItem } from "../types";

// Omitting `listId` returns the flat's whole checklist; passing one scopes
// it to that category, which is what the screen does.
export const fetchShoppingListItems = (flatId: string, listId?: string) =>
  apiFetch<{ items: ShoppingListItem[] }>(
    `/flats/${flatId}/shopping-list-items${listId ? `?listId=${encodeURIComponent(listId)}` : ""}`,
  );

// `duplicate: true` means the API matched an existing (unpurchased) item by
// name and cast a vote on it instead of creating a new row.
export const addShoppingListItem = (flatId: string, input: { name: string; listId?: string }) =>
  apiFetch<{ item: ShoppingListItem; duplicate: boolean }>(`/flats/${flatId}/shopping-list-items`, {
    method: "POST",
    body: JSON.stringify(input),
  });

// The GET auto-creates the default "Shopping" list, so this never comes
// back empty for a flat the caller is a member of.
export const fetchShoppingLists = (flatId: string) =>
  apiFetch<{ lists: ShoppingList[] }>(`/flats/${flatId}/shopping-lists`);

export const createShoppingList = (flatId: string, name: string) =>
  apiFetch<{ list: ShoppingList }>(`/flats/${flatId}/shopping-lists`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });

export const renameShoppingList = (flatId: string, listId: string, name: string) =>
  apiFetch<{ success: true }>(`/flats/${flatId}/shopping-lists/${listId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });

// Takes the list's items with it — the caller warns first.
export const deleteShoppingList = (flatId: string, listId: string) =>
  apiFetch<{ success: true }>(`/flats/${flatId}/shopping-lists/${listId}`, { method: "DELETE" });

// Must carry every one of the flat's list ids, in the new order.
export const reorderShoppingLists = (flatId: string, orderedIds: string[]) =>
  apiFetch<{ success: true }>(`/flats/${flatId}/shopping-lists/reorder`, {
    method: "POST",
    body: JSON.stringify({ orderedIds }),
  });

export const toggleShoppingListItemUpvote = (flatId: string, itemId: string) =>
  apiFetch<{ item: ShoppingListItem }>(`/flats/${flatId}/shopping-list-items/${itemId}/upvote`, {
    method: "POST",
  });

export const setShoppingListItemPurchased = (flatId: string, itemId: string, purchased: boolean) =>
  apiFetch<{ item: ShoppingListItem }>(`/flats/${flatId}/shopping-list-items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ purchased }),
  });

export const renameShoppingListItem = (flatId: string, itemId: string, name: string) =>
  apiFetch<{ item: ShoppingListItem }>(`/flats/${flatId}/shopping-list-items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });

// Hold-and-drag an item to reorder it within a list, or onto another list
// entirely — `orderedIds` carries that whole list's items in their new
// order (the moved item included, wherever it landed), same shape as
// reordering the category chips themselves.
export const reorderShoppingListItems = (flatId: string, listId: string, orderedIds: string[]) =>
  apiFetch<{ success: true }>(`/flats/${flatId}/shopping-list-items/reorder`, {
    method: "POST",
    body: JSON.stringify({ listId, orderedIds }),
  });

export const deleteShoppingListItem = (flatId: string, itemId: string) =>
  apiFetch<{ success: true }>(`/flats/${flatId}/shopping-list-items/${itemId}`, { method: "DELETE" });

export const clearShoppingList = (flatId: string, listId?: string) =>
  apiFetch<{ success: true }>(`/flats/${flatId}/shopping-list-items/clear`, {
    method: "POST",
    body: JSON.stringify({ listId }),
  });
