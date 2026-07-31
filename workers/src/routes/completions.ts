import { Hono } from "hono";
import type { AppEnv } from "../types";
import { HttpError, now } from "../types";
import { requireAuth } from "../middleware/auth";
import { requireFlatMembership } from "../middleware/flatMembership";

// Mounted in index.ts at /flats/:flatId/completions.
// Replaces api.js's fetchHistory/saveTask, which stored history keyed by
// `${week}_${task-name}` — here it's keyed by (chore_id, week) FKs instead,
// so renaming a chore no longer orphans its completion history.
const completions = new Hono<AppEnv>();
completions.use("*", requireAuth, requireFlatMembership);

type CompletionRow = {
  chore_id: string;
  week: number;
  assigned_user_id: string;
  done: number;
};

completions.get("/", async (c) => {
  const flatId = c.req.param("flatId");
  const { results } = await c.env.DB.prepare(
    `SELECT cc.chore_id, cc.week, cc.assigned_user_id, cc.done
     FROM chore_completions cc
     JOIN chores ch ON ch.id = cc.chore_id
     WHERE ch.flat_id = ?`,
  )
    .bind(flatId)
    .all<CompletionRow>();

  return c.json({
    completions: (results ?? []).map((r) => ({
      choreId: r.chore_id,
      week: r.week,
      assignedUserId: r.assigned_user_id,
      done: !!r.done,
    })),
  });
});

completions.put("/", async (c) => {
  const flatId = c.req.param("flatId");
  const { choreId, week, assignedUserId, done } = await c.req.json<{
    choreId?: string;
    week?: number;
    assignedUserId?: string;
    done?: boolean;
  }>();
  if (!choreId || week === undefined || !assignedUserId) {
    throw new HttpError(400, "choreId, week, and assignedUserId are required");
  }

  const chore = await c.env.DB.prepare("SELECT 1 FROM chores WHERE id = ? AND flat_id = ?")
    .bind(choreId, flatId)
    .first();
  if (!chore) throw new HttpError(404, "Chore not found in this flat");

  await c.env.DB.prepare(
    `INSERT INTO chore_completions (chore_id, week, assigned_user_id, done, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(chore_id, week) DO UPDATE SET assigned_user_id = excluded.assigned_user_id, done = excluded.done, updated_at = excluded.updated_at`,
  )
    .bind(choreId, week, assignedUserId, done ? 1 : 0, now())
    .run();

  return c.json({ success: true });
});

export default completions;
