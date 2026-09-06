import { Hono } from "hono";
import type { AppEnv } from "../types";
import { HttpError, newId, now } from "../types";
import { requireAuth } from "../middleware/auth";
import { requireFlatMembership } from "../middleware/flatMembership";
import { notifyUsers } from "../lib/pushNotify";
import { defaultListId } from "./shoppingLists";

// Mounted in index.ts at /flats/:flatId/shopping-list-items. A plain shared
// checklist — deliberately separate from /shopping-items (the Splitwise-
// style expense ledger): no cost, no split, just name + purchased (+ votes).
const shoppingListItems = new Hono<AppEnv>();
shoppingListItems.use("*", requireAuth, requireFlatMembership);

type ListItemRow = {
  id: string;
  flat_id: string;
  list_id: string | null;
  name: string;
  added_by_user_id: string;
  purchased: number;
  created_at: number;
  position: number;
  upvote_count: number;
  upvoter_ids: string | null;
};

// Every SELECT below joins in vote counts so the DTO always carries
// upvoteCount/upvotedByUserIds — the mobile list sorts on these client-side
// too, but this is the order it gets on initial load. Upvotes are the primary
// sort; `position` (drag-chosen, see /reorder) only breaks ties between
// items with the same vote count — so a manual reorder can never outrank a
// more-upvoted item, only settle where things land alongside equally-voted
// ones.
const SELECT_WITH_VOTES = `
  SELECT sli.*, COUNT(u.user_id) AS upvote_count, GROUP_CONCAT(u.user_id) AS upvoter_ids
  FROM shopping_list_items sli
  LEFT JOIN shopping_list_item_upvotes u ON u.item_id = sli.id
`;
const ORDER_BY_VOTES_THEN_POSITION = "upvote_count DESC, sli.position ASC, sli.created_at DESC";

function toDto(row: ListItemRow) {
  return {
    id: row.id,
    name: row.name,
    listId: row.list_id,
    addedByUserId: row.added_by_user_id,
    purchased: row.purchased === 1,
    createdAt: row.created_at,
    position: row.position,
    upvoteCount: row.upvote_count,
    upvotedByUserIds: row.upvoter_ids ? row.upvoter_ids.split(",") : [],
  };
}

async function fetchItem(db: D1Database, flatId: string, itemId: string) {
  const row = await db
    .prepare(`${SELECT_WITH_VOTES} WHERE sli.id = ? AND sli.flat_id = ? GROUP BY sli.id`)
    .bind(itemId, flatId)
    .first<ListItemRow>();
  if (!row) throw new HttpError(404, "Item not found");
  return toDto(row);
}

// `?listId=` scopes the response to one category (what the mobile bar does);
// without it you get the flat's whole checklist across every list.
shoppingListItems.get("/", async (c) => {
  const flatId = c.req.param("flatId");
  const listId = c.req.query("listId");
  const where = listId ? "sli.flat_id = ? AND sli.list_id = ?" : "sli.flat_id = ?";
  const binds = listId ? [flatId, listId] : [flatId];
  const { results } = await c.env.DB.prepare(
    `${SELECT_WITH_VOTES} WHERE ${where} GROUP BY sli.id ORDER BY ${ORDER_BY_VOTES_THEN_POSITION}`,
  )
    .bind(...binds)
    .all<ListItemRow>();
  return c.json({ items: (results ?? []).map(toDto) });
});

shoppingListItems.post("/", async (c) => {
  const flatId = c.req.param("flatId")!;
  const userId = c.get("userId");
  const { name, listId } = await c.req.json<{ name?: string; listId?: string }>();
  const trimmed = name?.trim();
  if (!trimmed) throw new HttpError(400, "name is required");

  // Fall back to the flat's first list rather than 400ing, so an older app
  // build that doesn't know about categories still adds items successfully.
  let targetListId = listId;
  if (targetListId) {
    const owned = await c.env.DB.prepare("SELECT 1 FROM shopping_lists WHERE id = ? AND flat_id = ?")
      .bind(targetListId, flatId)
      .first();
    if (!owned) throw new HttpError(404, "List not found");
  } else {
    targetListId = await defaultListId(c.env.DB, flatId);
  }

  // Adding a name that's already on the list (and not yet bought) reads as
  // "me too" rather than a second row — cast a vote for the existing item
  // instead of creating a duplicate. Scoped to the one list, so the same
  // name can legitimately sit in "Drinks" and "Household" at once.
  const existing = await c.env.DB.prepare(
    "SELECT id FROM shopping_list_items WHERE flat_id = ? AND list_id = ? AND purchased = 0 AND LOWER(name) = LOWER(?)",
  )
    .bind(flatId, targetListId, trimmed)
    .first<{ id: string }>();

  if (existing) {
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO shopping_list_item_upvotes (id, item_id, flat_id, user_id, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(newId(), existing.id, flatId, userId, now())
      .run();
    return c.json({ item: await fetchItem(c.env.DB, flatId, existing.id), duplicate: true });
  }

  const itemId = newId();
  // New items land at the end of their list's manual order — the same
  // "append" behaviour /reorder gives everything else its position from.
  await c.env.DB.prepare(
    `INSERT INTO shopping_list_items (id, flat_id, list_id, name, added_by_user_id, purchased, created_at, position)
     VALUES (?, ?, ?, ?, ?, 0, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM shopping_list_items WHERE list_id = ?))`,
  )
    .bind(itemId, flatId, targetListId, trimmed, userId, now(), targetListId)
    .run();

  return c.json({ item: await fetchItem(c.env.DB, flatId, itemId), duplicate: false }, 201);
});

shoppingListItems.post("/clear", async (c) => {
  const flatId = c.req.param("flatId")!;
  const userId = c.get("userId");
  const { listId } = await c.req.json<{ listId?: string }>().catch(() => ({ listId: undefined }));

  // Delete every item on the flat's list (or just one category when scoped).
  if (listId) {
    await c.env.DB.prepare("DELETE FROM shopping_list_items WHERE flat_id = ? AND list_id = ?")
      .bind(flatId, listId)
      .run();
  } else {
    await c.env.DB.prepare("DELETE FROM shopping_list_items WHERE flat_id = ?")
      .bind(flatId)
      .run();
  }

  const user = await c.env.DB.prepare("SELECT display_name FROM users WHERE id = ?")
    .bind(userId)
    .first<{ display_name: string }>();

  const { results: members } = await c.env.DB.prepare(
    "SELECT user_id FROM flat_members WHERE flat_id = ?",
  )
    .bind(flatId)
    .all<{ user_id: string }>();

  const memberIds = (members ?? []).map((m) => m.user_id).filter((id) => id !== userId);

  await notifyUsers(
    c.env.DB,
    memberIds,
    "Shopping list cleared",
    `${user?.display_name || "A flatmate"} has completed the shopping list`,
    { type: "shopping-list-cleared", flatId },
  );

  return c.json({ success: true });
});

// Drag-and-drop on the mobile list: carries the full order for one category
// (which is also how a cross-list move lands the item, since `orderedIds`
// includes it at wherever it was dropped) — same shape as /shopping-lists's
// own reorder. `position` only ever breaks ties between same-vote items, so
// this never needs to touch any list but the one being reordered.
shoppingListItems.post("/reorder", async (c) => {
  const flatId = c.req.param("flatId")!;
  const { listId, orderedIds } = await c.req.json<{ listId?: string; orderedIds?: string[] }>();
  if (!listId || !Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new HttpError(400, "listId and orderedIds are required");
  }

  const owned = await c.env.DB.prepare("SELECT 1 FROM shopping_lists WHERE id = ? AND flat_id = ?")
    .bind(listId, flatId)
    .first();
  if (!owned) throw new HttpError(404, "List not found");

  await c.env.DB.batch(
    orderedIds.map((id, index) =>
      c.env.DB.prepare("UPDATE shopping_list_items SET list_id = ?, position = ? WHERE id = ? AND flat_id = ?").bind(
        listId,
        index,
        id,
        flatId,
      ),
    ),
  );

  return c.json({ success: true });
});

shoppingListItems.post("/:itemId/upvote", async (c) => {
  const flatId = c.req.param("flatId")!;
  const itemId = c.req.param("itemId");
  const userId = c.get("userId");

  const existingVote = await c.env.DB.prepare(
    "SELECT 1 FROM shopping_list_item_upvotes WHERE item_id = ? AND user_id = ?",
  )
    .bind(itemId, userId)
    .first();

  if (existingVote) {
    await c.env.DB.prepare("DELETE FROM shopping_list_item_upvotes WHERE item_id = ? AND user_id = ?")
      .bind(itemId, userId)
      .run();
  } else {
    await c.env.DB.prepare(
      "INSERT INTO shopping_list_item_upvotes (id, item_id, flat_id, user_id, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(newId(), itemId, flatId, userId, now())
      .run();
  }

  return c.json({ item: await fetchItem(c.env.DB, flatId, itemId!) });
});

shoppingListItems.patch("/:itemId", async (c) => {
  const { purchased, name, listId } = await c.req.json<{ purchased?: boolean; name?: string; listId?: string }>();
  const flatId = c.req.param("flatId")!;
  const itemId = c.req.param("itemId");

  if (typeof purchased === "boolean") {
    await c.env.DB.prepare("UPDATE shopping_list_items SET purchased = ? WHERE id = ? AND flat_id = ?")
      .bind(purchased ? 1 : 0, itemId, flatId)
      .run();
  }

  if (typeof name === "string") {
    const trimmed = name.trim();
    if (!trimmed) throw new HttpError(400, "name cannot be empty");
    await c.env.DB.prepare("UPDATE shopping_list_items SET name = ? WHERE id = ? AND flat_id = ?")
      .bind(trimmed, itemId, flatId)
      .run();
  }

  // Drag-to-move between categories on the mobile list — the target has to
  // belong to the same flat, same as picking a list on add.
  if (typeof listId === "string") {
    const owned = await c.env.DB.prepare("SELECT 1 FROM shopping_lists WHERE id = ? AND flat_id = ?")
      .bind(listId, flatId)
      .first();
    if (!owned) throw new HttpError(404, "List not found");
    await c.env.DB.prepare("UPDATE shopping_list_items SET list_id = ? WHERE id = ? AND flat_id = ?")
      .bind(listId, itemId, flatId)
      .run();
  }

  if (typeof purchased !== "boolean" && typeof name !== "string" && typeof listId !== "string") {
    throw new HttpError(400, "purchased, name, or listId is required");
  }

  return c.json({ item: await fetchItem(c.env.DB, flatId, itemId!) });
});

shoppingListItems.delete("/:itemId", async (c) => {
  await c.env.DB.prepare("DELETE FROM shopping_list_items WHERE id = ? AND flat_id = ?")
    .bind(c.req.param("itemId"), c.req.param("flatId"))
    .run();
  return c.json({ success: true });
});

export default shoppingListItems;
