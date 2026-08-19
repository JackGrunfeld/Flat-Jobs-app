import { Hono } from "hono";
import type { AppEnv } from "../types";
import { HttpError, now } from "../types";
import { requireAuth } from "../middleware/auth";
import { requireFlatMembership } from "../middleware/flatMembership";
import { notifyUsers } from "../lib/pushNotify";

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

  const chore = await c.env.DB.prepare("SELECT name FROM chores WHERE id = ? AND flat_id = ?")
    .bind(choreId, flatId)
    .first<{ name: string }>();
  if (!chore) throw new HttpError(404, "Chore not found in this flat");

  // Read before the write so the push below can fire on the *transition* to
  // done. The app re-saves the same state on a refresh, and without this every
  // one of those would tell the flat again that the chore was finished.
  const previous = await c.env.DB.prepare(
    "SELECT done FROM chore_completions WHERE chore_id = ? AND week = ?",
  )
    .bind(choreId, week)
    .first<{ done: number }>();

  await c.env.DB.prepare(
    `INSERT INTO chore_completions (chore_id, week, assigned_user_id, done, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(chore_id, week) DO UPDATE SET assigned_user_id = excluded.assigned_user_id, done = excluded.done, updated_at = excluded.updated_at`,
  )
    .bind(choreId, week, assignedUserId, done ? 1 : 0, now())
    .run();

  if (done && !previous?.done) {
    // Everyone but whoever pressed the button: they watched the tick animate,
    // so a notification telling them what they just did is noise. This replaces
    // the local "Nice work!" alert the app used to raise for itself.
    c.executionCtx.waitUntil(announceCompletion(c.env.DB, flatId!, c.get("userId"), chore.name));
  }

  return c.json({ success: true });
});

// Told to the rest of the flat, not to the person who ticked it. Deliberately
// not awaited by the request — the tick shouldn't wait on Expo to answer.
async function announceCompletion(db: D1Database, flatId: string, actorId: string, choreName: string) {
  const [actor, members] = await Promise.all([
    db.prepare("SELECT display_name FROM users WHERE id = ?").bind(actorId).first<{ display_name: string }>(),
    db
      .prepare("SELECT user_id FROM flat_members WHERE flat_id = ? AND user_id != ?")
      .bind(flatId, actorId)
      .all<{ user_id: string }>(),
  ]);

  const others = (members.results ?? []).map((r) => r.user_id);
  if (others.length === 0) return;

  const who = actor?.display_name?.split(/\s+/)[0] || "A flatmate";
  await notifyUsers(db, others, "Chore done", `${who} ticked off ${choreName}.`, {
    type: "chore-completed",
    flatId,
    choreName,
  });
}

export default completions;
