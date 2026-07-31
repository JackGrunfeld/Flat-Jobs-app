import { Hono } from "hono";
import type { AppEnv } from "../types";
import { HttpError, now } from "../types";
import { requireAuth } from "../middleware/auth";

// Mounted in index.ts at /users/me/push-tokens.
const pushTokens = new Hono<AppEnv>();
pushTokens.use("*", requireAuth);

pushTokens.post("/", async (c) => {
  const userId = c.get("userId");
  const { token, platform } = await c.req.json<{ token?: string; platform?: string }>();
  if (!token || !["ios", "android"].includes(platform || "")) {
    throw new HttpError(400, "token and platform (ios|android) are required");
  }

  await c.env.DB.prepare(
    `INSERT INTO push_tokens (user_id, token, platform, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, token) DO UPDATE SET platform = excluded.platform`,
  )
    .bind(userId, token, platform, now())
    .run();

  return c.json({ success: true });
});

export default pushTokens;
