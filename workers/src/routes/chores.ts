import { Hono } from "hono";
import type { AppEnv } from "../types";
import { HttpError, newId, now } from "../types";
import { requireAuth } from "../middleware/auth";
import { requireFlatMembership } from "../middleware/flatMembership";

// Mounted in index.ts at /flats/:flatId/chores — :flatId comes from the mount path.
const chores = new Hono<AppEnv>();
chores.use("*", requireAuth, requireFlatMembership);

type ChoreRow = {
  id: string;
  flat_id: string;
  name: string;
  description: string | null;
  frequency: string;
  created_at: number;
};

async function loadChoreDto(db: D1Database, chore: ChoreRow) {
  const { results } = await db
    .prepare("SELECT user_id FROM chore_members WHERE chore_id = ?")
    .bind(chore.id)
    .all<{ user_id: string }>();
  return {
    id: chore.id,
    name: chore.name,
    description: chore.description,
    frequency: chore.frequency,
    memberIds: (results ?? []).map((r) => r.user_id),
    createdAt: chore.created_at,
  };
}

async function setChoreMembers(db: D1Database, choreId: string, memberIds: string[]) {
  await db.prepare("DELETE FROM chore_members WHERE chore_id = ?").bind(choreId).run();
  if (memberIds.length === 0) return;
  await db.batch(
    memberIds.map((userId) =>
      db.prepare("INSERT INTO chore_members (chore_id, user_id) VALUES (?, ?)").bind(choreId, userId),
    ),
  );
}

chores.get("/", async (c) => {
  const flatId = c.req.param("flatId");
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM chores WHERE flat_id = ? ORDER BY created_at ASC",
  )
    .bind(flatId)
    .all<ChoreRow>();
  const dtos = await Promise.all((results ?? []).map((row) => loadChoreDto(c.env.DB, row)));
  return c.json({ chores: dtos });
});

chores.post("/", async (c) => {
  const flatId = c.req.param("flatId");
  const { name, description, frequency, memberIds } = await c.req.json<{
    name?: string;
    description?: string;
    frequency?: string;
    memberIds?: string[];
  }>();
  if (!name?.trim()) throw new HttpError(400, "name is required");
  if (!["Daily", "Weekly", "Monthly"].includes(frequency || "")) {
    throw new HttpError(400, "frequency must be Daily, Weekly, or Monthly");
  }

  const choreId = newId();
  const createdAt = now();
  await c.env.DB.prepare(
    "INSERT INTO chores (id, flat_id, name, description, frequency, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(choreId, flatId, name.trim(), description || null, frequency, createdAt)
    .run();
  await setChoreMembers(c.env.DB, choreId, memberIds || []);

  return c.json(
    {
      chore: await loadChoreDto(c.env.DB, {
        id: choreId,
        flat_id: flatId!,
        name: name.trim(),
        description: description || null,
        frequency: frequency!,
        created_at: createdAt,
      }),
    },
    201,
  );
});

chores.patch("/:choreId", async (c) => {
  const { choreId } = c.req.param();
  const { name, description, frequency, memberIds } = await c.req.json<{
    name?: string;
    description?: string;
    frequency?: string;
    memberIds?: string[];
  }>();

  const existing = await c.env.DB.prepare("SELECT * FROM chores WHERE id = ? AND flat_id = ?")
    .bind(choreId, c.req.param("flatId"))
    .first<ChoreRow>();
  if (!existing) throw new HttpError(404, "Chore not found");

  await c.env.DB.prepare(
    "UPDATE chores SET name = ?, description = ?, frequency = ? WHERE id = ?",
  )
    .bind(
      name?.trim() ?? existing.name,
      description !== undefined ? description : existing.description,
      frequency ?? existing.frequency,
      choreId,
    )
    .run();

  if (memberIds !== undefined) {
    await setChoreMembers(c.env.DB, choreId, memberIds);
  }

  const updated = await c.env.DB.prepare("SELECT * FROM chores WHERE id = ?").bind(choreId).first<ChoreRow>();
  return c.json({ chore: await loadChoreDto(c.env.DB, updated!) });
});

chores.delete("/:choreId", async (c) => {
  const { choreId } = c.req.param();
  await c.env.DB.prepare("DELETE FROM chores WHERE id = ? AND flat_id = ?")
    .bind(choreId, c.req.param("flatId"))
    .run();
  return c.json({ success: true });
});

export default chores;
