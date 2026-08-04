import { Hono } from "hono";
import type { AppEnv } from "../types";
import { HttpError, newId, now } from "../types";
import { requireAuth } from "../middleware/auth";
import { requireFlatMembership } from "../middleware/flatMembership";

// Mounted in index.ts at /flats/:flatId/shopping-items.
const shopping = new Hono<AppEnv>();
shopping.use("*", requireAuth, requireFlatMembership);

const CATEGORIES = ["Food", "Utilities", "Household", "Other"] as const;
type Category = (typeof CATEGORIES)[number];

type ItemRow = {
  id: string;
  flat_id: string;
  name: string;
  cost_cents: number;
  added_by_user_id: string;
  category: Category;
  created_at: number;
};

async function loadItemDto(db: D1Database, item: ItemRow) {
  const { results } = await db
    .prepare("SELECT user_id FROM shopping_item_splits WHERE item_id = ?")
    .bind(item.id)
    .all<{ user_id: string }>();
  return {
    id: item.id,
    name: item.name,
    costCents: item.cost_cents,
    addedByUserId: item.added_by_user_id,
    category: item.category,
    splitWith: (results ?? []).map((r) => r.user_id),
    createdAt: item.created_at,
  };
}

shopping.get("/", async (c) => {
  const flatId = c.req.param("flatId");
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM shopping_items WHERE flat_id = ? ORDER BY created_at DESC",
  )
    .bind(flatId)
    .all<ItemRow>();
  const dtos = await Promise.all((results ?? []).map((row) => loadItemDto(c.env.DB, row)));
  return c.json({ items: dtos });
});

shopping.post("/", async (c) => {
  const flatId = c.req.param("flatId");
  const userId = c.get("userId");
  const { name, costCents, splitWith, category } = await c.req.json<{
    name?: string;
    costCents?: number;
    splitWith?: string[];
    category?: string;
  }>();
  if (!name?.trim()) throw new HttpError(400, "name is required");
  if (!Number.isInteger(costCents) || costCents! <= 0) throw new HttpError(400, "costCents must be a positive integer");
  const resolvedCategory: Category = CATEGORIES.includes(category as Category) ? (category as Category) : "Other";

  const itemId = newId();
  const createdAt = now();
  await c.env.DB.prepare(
    "INSERT INTO shopping_items (id, flat_id, name, cost_cents, added_by_user_id, category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(itemId, flatId, name.trim(), costCents, userId, resolvedCategory, createdAt)
    .run();

  const splits = splitWith && splitWith.length > 0 ? splitWith : [userId];
  await c.env.DB.batch(
    splits.map((uid) =>
      c.env.DB.prepare("INSERT INTO shopping_item_splits (item_id, user_id) VALUES (?, ?)").bind(itemId, uid),
    ),
  );

  return c.json(
    {
      item: await loadItemDto(c.env.DB, {
        id: itemId,
        flat_id: flatId!,
        name: name.trim(),
        cost_cents: costCents!,
        added_by_user_id: userId,
        category: resolvedCategory,
        created_at: createdAt,
      }),
    },
    201,
  );
});

shopping.delete("/:itemId", async (c) => {
  await c.env.DB.prepare("DELETE FROM shopping_items WHERE id = ? AND flat_id = ?")
    .bind(c.req.param("itemId"), c.req.param("flatId"))
    .run();
  return c.json({ success: true });
});

export default shopping;
