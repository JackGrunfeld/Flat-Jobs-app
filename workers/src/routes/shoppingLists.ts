import { Hono } from "hono";
import type { AppEnv } from "../types";
import { HttpError, newId, now } from "../types";
import { requireAuth } from "../middleware/auth";
import { requireFlatMembership } from "../middleware/flatMembership";

// Mounted in index.ts at /flats/:flatId/shopping-lists. The named categories
// the shared checklist is split into — items (/shopping-list-items) each
// belong to exactly one of these.
const shoppingLists = new Hono<AppEnv>();
shoppingLists.use("*", requireAuth, requireFlatMembership);

const DEFAULT_LIST_NAME = "Shopping";

type ListRow = {
  id: string;
  flat_id: string;
  name: string;
  position: number;
  created_at: number;
};

function toDto(row: ListRow) {
  return { id: row.id, name: row.name, position: row.position, createdAt: row.created_at };
}

// A flat with no lists has nowhere to put items, so the default is created
// lazily on first read rather than at flat-creation time — that way flats
// made before this feature existed (and any the migration's backfill somehow
// missed) heal themselves instead of 404ing forever. Orphaned items are
// adopted at the same time, since `list_id` is nullable by necessity.
export async function ensureDefaultList(db: D1Database, flatId: string) {
  const existing = await db
    .prepare("SELECT COUNT(*) AS n FROM shopping_lists WHERE flat_id = ?")
    .bind(flatId)
    .first<{ n: number }>();
  if ((existing?.n ?? 0) > 0) return;

  const id = `list-default-${flatId}`;
  await db
    .prepare(
      "INSERT OR IGNORE INTO shopping_lists (id, flat_id, name, position, created_at) VALUES (?, ?, ?, 0, ?)",
    )
    .bind(id, flatId, DEFAULT_LIST_NAME, now())
    .run();
  await db
    .prepare("UPDATE shopping_list_items SET list_id = ? WHERE flat_id = ? AND list_id IS NULL")
    .bind(id, flatId)
    .run();
}

// The list an item belongs to when the client doesn't name one (older app
// builds posting without a listId) — the flat's first list by position.
export async function defaultListId(db: D1Database, flatId: string) {
  await ensureDefaultList(db, flatId);
  const row = await db
    .prepare("SELECT id FROM shopping_lists WHERE flat_id = ? ORDER BY position ASC LIMIT 1")
    .bind(flatId)
    .first<{ id: string }>();
  if (!row) throw new HttpError(500, "Flat has no shopping list");
  return row.id;
}

shoppingLists.get("/", async (c) => {
  const flatId = c.req.param("flatId")!;
  await ensureDefaultList(c.env.DB, flatId);
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM shopping_lists WHERE flat_id = ? ORDER BY position ASC, created_at ASC",
  )
    .bind(flatId)
    .all<ListRow>();
  return c.json({ lists: (results ?? []).map(toDto) });
});

shoppingLists.post("/", async (c) => {
  const flatId = c.req.param("flatId")!;
  const { name } = await c.req.json<{ name?: string }>();
  const trimmed = name?.trim();
  if (!trimmed) throw new HttpError(400, "name is required");

  const clash = await c.env.DB.prepare(
    "SELECT 1 FROM shopping_lists WHERE flat_id = ? AND LOWER(name) = LOWER(?)",
  )
    .bind(flatId, trimmed)
    .first();
  if (clash) throw new HttpError(409, "A list with that name already exists");

  // New lists append to the end of the bar — the mobile side scrolls to
  // reveal them, and they can be dragged elsewhere afterwards.
  const max = await c.env.DB.prepare("SELECT MAX(position) AS p FROM shopping_lists WHERE flat_id = ?")
    .bind(flatId)
    .first<{ p: number | null }>();
  const position = (max?.p ?? -1) + 1;

  const id = newId();
  const createdAt = now();
  await c.env.DB.prepare(
    "INSERT INTO shopping_lists (id, flat_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, flatId, trimmed, position, createdAt)
    .run();

  return c.json({ list: { id, name: trimmed, position, createdAt } }, 201);
});

// Declared before /:listId so "reorder" can't be read as a list id.
shoppingLists.post("/reorder", async (c) => {
  const flatId = c.req.param("flatId")!;
  const { orderedIds } = await c.req.json<{ orderedIds?: string[] }>();
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new HttpError(400, "orderedIds must be a non-empty array");
  }

  // Reject a partial or foreign set outright rather than writing half an
  // order — the client always sends the flat's complete list.
  const { results } = await c.env.DB.prepare("SELECT id FROM shopping_lists WHERE flat_id = ?")
    .bind(flatId)
    .all<{ id: string }>();
  const owned = new Set((results ?? []).map((r) => r.id));
  if (orderedIds.length !== owned.size || !orderedIds.every((id) => owned.has(id))) {
    throw new HttpError(400, "orderedIds must contain exactly this flat's lists");
  }

  await c.env.DB.batch(
    orderedIds.map((id, i) =>
      c.env.DB.prepare("UPDATE shopping_lists SET position = ? WHERE id = ? AND flat_id = ?").bind(i, id, flatId),
    ),
  );
  return c.json({ success: true });
});

shoppingLists.patch("/:listId", async (c) => {
  const flatId = c.req.param("flatId")!;
  const listId = c.req.param("listId")!;
  const { name } = await c.req.json<{ name?: string }>();
  const trimmed = name?.trim();
  if (!trimmed) throw new HttpError(400, "name is required");

  const clash = await c.env.DB.prepare(
    "SELECT 1 FROM shopping_lists WHERE flat_id = ? AND LOWER(name) = LOWER(?) AND id != ?",
  )
    .bind(flatId, trimmed, listId)
    .first();
  if (clash) throw new HttpError(409, "A list with that name already exists");

  const res = await c.env.DB.prepare("UPDATE shopping_lists SET name = ? WHERE id = ? AND flat_id = ?")
    .bind(trimmed, listId, flatId)
    .run();
  if (!res.meta.changes) throw new HttpError(404, "List not found");
  return c.json({ success: true });
});

shoppingLists.delete("/:listId", async (c) => {
  const flatId = c.req.param("flatId")!;
  const listId = c.req.param("listId")!;

  const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM shopping_lists WHERE flat_id = ?")
    .bind(flatId)
    .first<{ n: number }>();
  if ((count?.n ?? 0) <= 1) throw new HttpError(400, "A flat needs at least one list");

  const list = await c.env.DB.prepare("SELECT id FROM shopping_lists WHERE id = ? AND flat_id = ?")
    .bind(listId, flatId)
    .first();
  if (!list) throw new HttpError(404, "List not found");

  // Deleting the list takes its items (and their votes) with it. Done
  // explicitly rather than leaning on ON DELETE CASCADE, since `list_id`
  // was added by ALTER TABLE and enforcement isn't worth betting the data on.
  await c.env.DB.batch([
    c.env.DB.prepare(
      "DELETE FROM shopping_list_item_upvotes WHERE item_id IN (SELECT id FROM shopping_list_items WHERE list_id = ?)",
    ).bind(listId),
    c.env.DB.prepare("DELETE FROM shopping_list_items WHERE list_id = ? AND flat_id = ?").bind(listId, flatId),
    c.env.DB.prepare("DELETE FROM shopping_lists WHERE id = ? AND flat_id = ?").bind(listId, flatId),
  ]);

  return c.json({ success: true });
});

export default shoppingLists;
