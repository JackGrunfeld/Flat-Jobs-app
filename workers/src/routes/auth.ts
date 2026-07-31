import { Hono } from "hono";
import type { AppEnv } from "../types";
import { HttpError, newId, now } from "../types";
import { hashPassword, verifyPassword } from "../lib/password";
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  REFRESH_TOKEN_TTL_SECONDS,
} from "../lib/jwt";
import { verifyGoogleIdToken } from "../lib/googleAuth";
import { verifyAppleIdentityToken } from "../lib/appleAuth";
import { requireAuth } from "../middleware/auth";

const auth = new Hono<AppEnv>();

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  password_hash: string | null;
  password_salt: string | null;
  password_iterations: number | null;
};

async function issueSession(db: D1Database, userId: string, jwtSecret: string) {
  const accessToken = await signAccessToken(userId, jwtSecret);
  const refreshToken = generateRefreshToken();
  await db
    .prepare(
      "INSERT INTO refresh_tokens (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(
      newId(),
      userId,
      await hashRefreshToken(refreshToken),
      now(),
      now() + REFRESH_TOKEN_TTL_SECONDS * 1000,
    )
    .run();
  return { accessToken, refreshToken };
}

function userDto(row: UserRow) {
  return { id: row.id, email: row.email, displayName: row.display_name };
}

auth.post("/signup", async (c) => {
  const { email, password, displayName } = await c.req.json<{
    email?: string;
    password?: string;
    displayName?: string;
  }>();
  if (!email || !password || !displayName) {
    throw new HttpError(400, "email, password, and displayName are required");
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await c.env.DB.prepare("SELECT 1 FROM users WHERE email = ?")
    .bind(normalizedEmail)
    .first();
  if (existing) throw new HttpError(409, "An account with that email already exists");

  const { hash, salt, iterations } = await hashPassword(password);
  const userId = newId();
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, display_name, password_hash, password_salt, password_iterations, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(userId, normalizedEmail, displayName.trim(), hash, salt, iterations, now())
    .run();

  const session = await issueSession(c.env.DB, userId, c.env.JWT_SECRET);
  return c.json({
    user: { id: userId, email: normalizedEmail, displayName: displayName.trim() },
    ...session,
  });
});

auth.post("/login", async (c) => {
  const { email, password } = await c.req.json<{ email?: string; password?: string }>();
  if (!email || !password) throw new HttpError(400, "email and password are required");

  const row = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?")
    .bind(email.toLowerCase().trim())
    .first<UserRow>();

  if (!row || !row.password_hash || !row.password_salt || !row.password_iterations) {
    throw new HttpError(401, "Invalid email or password");
  }
  const valid = await verifyPassword(password, row.password_hash, row.password_salt, row.password_iterations);
  if (!valid) throw new HttpError(401, "Invalid email or password");

  const session = await issueSession(c.env.DB, row.id, c.env.JWT_SECRET);
  return c.json({ user: userDto(row), ...session });
});

// Shared upsert for both OAuth providers: find-or-create a user by
// (provider, provider_sub), falling back to matching an existing account by
// email so a user who signed up with email/password can also link Google/Apple.
async function upsertOAuthUser(
  db: D1Database,
  provider: "google" | "apple",
  providerSub: string,
  email: string | null,
  displayName: string | null,
): Promise<UserRow> {
  const linked = await db
    .prepare(
      `SELECT u.* FROM users u
       JOIN auth_identities ai ON ai.user_id = u.id
       WHERE ai.provider = ? AND ai.provider_sub = ?`,
    )
    .bind(provider, providerSub)
    .first<UserRow>();
  if (linked) return linked;

  let user: UserRow | null = null;
  if (email) {
    user = await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<UserRow>();
  }

  if (!user) {
    if (!email) {
      throw new HttpError(400, `${provider} did not provide an email and no existing account was found`);
    }
    const userId = newId();
    await db
      .prepare("INSERT INTO users (id, email, display_name, created_at) VALUES (?, ?, ?, ?)")
      .bind(userId, email, displayName || email.split("@")[0], now())
      .run();
    user = { id: userId, email, display_name: displayName || email.split("@")[0], password_hash: null, password_salt: null, password_iterations: null };
  }

  await db
    .prepare(
      "INSERT INTO auth_identities (id, user_id, provider, provider_sub, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(newId(), user.id, provider, providerSub, now())
    .run();

  return user;
}

auth.post("/google", async (c) => {
  const { idToken } = await c.req.json<{ idToken?: string }>();
  if (!idToken) throw new HttpError(400, "idToken is required");

  const identity = await verifyGoogleIdToken(idToken, c.env.GOOGLE_CLIENT_IDS);
  const user = await upsertOAuthUser(c.env.DB, "google", identity.sub, identity.email, identity.name);
  const session = await issueSession(c.env.DB, user.id, c.env.JWT_SECRET);
  return c.json({ user: userDto(user), ...session });
});

auth.post("/apple", async (c) => {
  // email/fullName are only sent by the client on the FIRST authorization —
  // Apple never returns them again on subsequent sign-ins for the same user.
  const { identityToken, email, fullName } = await c.req.json<{
    identityToken?: string;
    email?: string;
    fullName?: string;
  }>();
  if (!identityToken) throw new HttpError(400, "identityToken is required");

  const identity = await verifyAppleIdentityToken(identityToken, c.env.APPLE_CLIENT_IDS);
  const resolvedEmail = identity.email || email || null;
  const user = await upsertOAuthUser(c.env.DB, "apple", identity.sub, resolvedEmail, fullName || null);
  const session = await issueSession(c.env.DB, user.id, c.env.JWT_SECRET);
  return c.json({ user: userDto(user), ...session });
});

auth.post("/refresh", async (c) => {
  const { refreshToken } = await c.req.json<{ refreshToken?: string }>();
  if (!refreshToken) throw new HttpError(400, "refreshToken is required");

  const tokenHash = await hashRefreshToken(refreshToken);
  const row = await c.env.DB.prepare(
    "SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = ?",
  )
    .bind(tokenHash)
    .first<{ id: string; user_id: string; expires_at: number; revoked_at: number | null }>();

  if (!row || row.revoked_at || row.expires_at < now()) {
    throw new HttpError(401, "Invalid or expired refresh token");
  }

  // Rotate: revoke the old refresh token and issue a brand new pair.
  await c.env.DB.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?")
    .bind(now(), row.id)
    .run();
  const session = await issueSession(c.env.DB, row.user_id, c.env.JWT_SECRET);
  return c.json(session);
});

auth.post("/logout", async (c) => {
  const { refreshToken } = await c.req.json<{ refreshToken?: string }>();
  if (refreshToken) {
    const tokenHash = await hashRefreshToken(refreshToken);
    await c.env.DB.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
      .bind(now(), tokenHash)
      .run();
  }
  return c.json({ success: true });
});

auth.get("/me", requireAuth, async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(c.get("userId"))
    .first<UserRow>();
  if (!row) throw new HttpError(404, "User not found");
  return c.json({ user: userDto(row) });
});

export default auth;
