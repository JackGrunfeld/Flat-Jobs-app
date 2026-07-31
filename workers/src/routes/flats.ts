import { Hono } from "hono";
import type { AppEnv } from "../types";
import { HttpError, newId, now } from "../types";
import { requireAuth } from "../middleware/auth";
import { requireFlatMembership } from "../middleware/flatMembership";
import { uniqueFlatCode } from "../lib/flatCodes";
import { sendFlatInviteEmail } from "../lib/email";
import { computeBalances } from "./settlements";

const flats = new Hono<AppEnv>();
flats.use("*", requireAuth);

type MemberRow = { user_id: string; display_name: string; color: string | null };

async function loadFlatDto(db: D1Database, flatId: string) {
  const flat = await db.prepare("SELECT * FROM flats WHERE id = ?").bind(flatId).first<{
    id: string;
    name: string;
    code: string;
    owner_id: string;
    created_at: number;
  }>();
  if (!flat) return null;

  const { results: memberRows } = await db
    .prepare(
      `SELECT fm.user_id, u.display_name, fm.color
       FROM flat_members fm JOIN users u ON u.id = fm.user_id
       WHERE fm.flat_id = ?`,
    )
    .bind(flatId)
    .all<MemberRow>();

  const { results: inviteRows } = await db
    .prepare("SELECT email FROM flat_invites WHERE flat_id = ?")
    .bind(flatId)
    .all<{ email: string }>();

  return {
    id: flat.id,
    name: flat.name,
    code: flat.code,
    ownerId: flat.owner_id,
    members: (memberRows ?? []).map((m) => ({ userId: m.user_id, displayName: m.display_name, color: m.color })),
    invitedEmails: (inviteRows ?? []).map((r) => r.email),
  };
}

async function getUserFlatId(db: D1Database, userId: string): Promise<string | null> {
  const row = await db.prepare("SELECT flat_id FROM flat_members WHERE user_id = ?").bind(userId).first<{ flat_id: string }>();
  return row?.flat_id ?? null;
}

flats.post("/", async (c) => {
  const userId = c.get("userId");
  const { name } = await c.req.json<{ name?: string }>();
  if (!name?.trim()) throw new HttpError(400, "name is required");

  if (await getUserFlatId(c.env.DB, userId)) {
    throw new HttpError(409, "You're already in a flat — leave it before creating a new one");
  }

  const flatId = newId();
  const code = await uniqueFlatCode(c.env.DB);
  const timestamp = now();

  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO flats (id, name, code, owner_id, created_at) VALUES (?, ?, ?, ?, ?)").bind(
      flatId,
      name.trim(),
      code,
      userId,
      timestamp,
    ),
    c.env.DB.prepare("INSERT INTO flat_members (flat_id, user_id, joined_at) VALUES (?, ?, ?)").bind(
      flatId,
      userId,
      timestamp,
    ),
  ]);

  return c.json({ flat: await loadFlatDto(c.env.DB, flatId) }, 201);
});

flats.post("/join", async (c) => {
  const userId = c.get("userId");
  const { code } = await c.req.json<{ code?: string }>();
  if (!code?.trim()) throw new HttpError(400, "code is required");

  if (await getUserFlatId(c.env.DB, userId)) {
    throw new HttpError(409, "You're already in a flat — leave it before joining another");
  }

  const flat = await c.env.DB.prepare("SELECT id FROM flats WHERE code = ?")
    .bind(code.toUpperCase().trim())
    .first<{ id: string }>();
  if (!flat) throw new HttpError(404, "No flat found with that code");

  await c.env.DB.prepare("INSERT INTO flat_members (flat_id, user_id, joined_at) VALUES (?, ?, ?)")
    .bind(flat.id, userId, now())
    .run();

  // Clear any pending email invite for this user now that they've joined directly.
  const user = await c.env.DB.prepare("SELECT email FROM users WHERE id = ?").bind(userId).first<{ email: string }>();
  if (user) {
    await c.env.DB.prepare("DELETE FROM flat_invites WHERE flat_id = ? AND email = ?").bind(flat.id, user.email).run();
  }

  return c.json({ flat: await loadFlatDto(c.env.DB, flat.id) });
});

flats.get("/me", async (c) => {
  const flatId = await getUserFlatId(c.env.DB, c.get("userId"));
  if (!flatId) return c.json({ flat: null });
  return c.json({ flat: await loadFlatDto(c.env.DB, flatId) });
});

flats.post("/:flatId/invites", requireFlatMembership, async (c) => {
  const flatId = c.req.param("flatId");
  const inviterId = c.get("userId");
  const { email } = await c.req.json<{ email?: string }>();
  if (!email?.trim()) throw new HttpError(400, "email is required");
  const normalized = email.toLowerCase().trim();

  const existing = await c.env.DB.prepare("SELECT flat_id FROM flat_invites WHERE email = ?").bind(normalized).first<{ flat_id: string }>();
  if (existing && existing.flat_id !== flatId) {
    throw new HttpError(409, "That email already has a pending invite to another flat");
  }
  if (!existing) {
    await c.env.DB.prepare(
      "INSERT INTO flat_invites (id, flat_id, email, invited_by, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(newId(), flatId, normalized, inviterId, now())
      .run();
  }

  const [flat, inviter] = await Promise.all([
    c.env.DB.prepare("SELECT name, code FROM flats WHERE id = ?").bind(flatId).first<{ name: string; code: string }>(),
    c.env.DB.prepare("SELECT display_name FROM users WHERE id = ?").bind(inviterId).first<{ display_name: string }>(),
  ]);
  if (flat) {
    await sendFlatInviteEmail(c.env, {
      toEmail: normalized,
      flatName: flat.name,
      flatCode: flat.code,
      inviterName: inviter?.display_name || "Your flatmate",
    });
  }

  return c.json({ success: true });
});

flats.post("/:flatId/leave", requireFlatMembership, async (c) => {
  await c.env.DB.prepare("DELETE FROM flat_members WHERE flat_id = ? AND user_id = ?")
    .bind(c.req.param("flatId"), c.get("userId"))
    .run();
  return c.json({ success: true });
});

flats.patch("/:flatId", requireFlatMembership, async (c) => {
  const { name } = await c.req.json<{ name?: string }>();
  if (!name?.trim()) throw new HttpError(400, "name is required");
  await c.env.DB.prepare("UPDATE flats SET name = ? WHERE id = ?").bind(name.trim(), c.req.param("flatId")).run();
  return c.json({ success: true });
});

flats.get("/:flatId/balances", requireFlatMembership, async (c) => {
  return c.json({ balances: await computeBalances(c.env.DB, c.req.param("flatId")) });
});

flats.patch("/:flatId/members/me", requireFlatMembership, async (c) => {
  const { color } = await c.req.json<{ color?: string }>();
  if (!color) throw new HttpError(400, "color is required");
  await c.env.DB.prepare("UPDATE flat_members SET color = ? WHERE flat_id = ? AND user_id = ?")
    .bind(color, c.req.param("flatId"), c.get("userId"))
    .run();
  return c.json({ success: true });
});

export default flats;
export { loadFlatDto, getUserFlatId };
