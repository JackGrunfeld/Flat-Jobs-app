import { Hono } from "hono";
import type { AppEnv } from "../types";
import { now } from "../types";
import { requireAuth } from "../middleware/auth";
import { loadFlatDto, getUserFlatId } from "./flats";

const invites = new Hono<AppEnv>();
invites.use("*", requireAuth);

// Mirrors flatService.js's checkEmailInvite, called on login/signup and by the
// FlatSetup screen's pending-invite poll. Auto-joins the user if their email
// has a pending invite. flat_invites.email is globally unique, so there's no
// "which flat did this belong to" ambiguity the old Firestore version had.
invites.get("/pending", async (c) => {
  const userId = c.get("userId");

  // Already in a flat — nothing to do (mirrors checkEmailInvite's early exit).
  if (await getUserFlatId(c.env.DB, userId)) {
    return c.json({ flat: null });
  }

  const user = await c.env.DB.prepare("SELECT email FROM users WHERE id = ?").bind(userId).first<{ email: string }>();
  if (!user) return c.json({ flat: null });

  const invite = await c.env.DB.prepare("SELECT flat_id FROM flat_invites WHERE email = ?")
    .bind(user.email)
    .first<{ flat_id: string }>();
  if (!invite) return c.json({ flat: null });

  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO flat_members (flat_id, user_id, joined_at) VALUES (?, ?, ?)").bind(
      invite.flat_id,
      userId,
      now(),
    ),
    c.env.DB.prepare("DELETE FROM flat_invites WHERE flat_id = ? AND email = ?").bind(invite.flat_id, user.email),
  ]);

  return c.json({ flat: await loadFlatDto(c.env.DB, invite.flat_id) });
});

export default invites;
