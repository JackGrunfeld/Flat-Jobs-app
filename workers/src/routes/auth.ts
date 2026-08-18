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
  birthday: string | null;
  country: string | null;
  terms_accepted_at: number | null;
  terms_version: string | null;
};

// Bump when the terms materially change; `terms_version` on the row records
// which revision each user actually agreed to.
export const CURRENT_TERMS_VERSION = "1.0";

// YYYY-MM-DD, and not in the future.
function isValidBirthday(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() <= Date.now();
}

// ISO 3166-1 alpha-2. The client picks from a fixed list, so this only has to
// reject obvious junk rather than validate against the full registry.
function isValidCountry(value: string): boolean {
  return /^[A-Z]{2}$/.test(value);
}

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
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    birthday: row.birthday,
    country: row.country,
    termsAcceptedAt: row.terms_accepted_at,
    // The client routes to the profile step until every field the onboarding
    // form collects is on file. Derived here rather than in the app so the
    // rule lives in one place as fields get added.
    profileComplete: Boolean(row.display_name?.trim() && row.birthday && row.country),
  };
}

auth.post("/signup", async (c) => {
  // displayName/birthday are no longer collected here — they're part of the
  // post-signup profile step (along with country), so the sign-up form itself
  // is just credentials plus the terms checkbox.
  const { email, password, acceptedTerms } = await c.req.json<{
    email?: string;
    password?: string;
    acceptedTerms?: boolean;
  }>();
  if (!email || !password) {
    throw new HttpError(400, "email and password are required");
  }
  if (acceptedTerms !== true) {
    throw new HttpError(403, "You must accept the Terms & Conditions to create an account", "TERMS_REQUIRED");
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await c.env.DB.prepare("SELECT 1 FROM users WHERE email = ?")
    .bind(normalizedEmail)
    .first();
  if (existing) throw new HttpError(409, "An account with that email already exists");

  const { hash, salt, iterations } = await hashPassword(password);
  const userId = newId();
  // Placeholder display name from the email local part: the profile step
  // overwrites it before the user reaches the app, but the column is NOT NULL
  // and a flat invite could reference the row in between.
  const placeholderName = normalizedEmail.split("@")[0];
  const acceptedAt = now();
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, display_name, password_hash, password_salt, password_iterations, created_at, terms_accepted_at, terms_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(userId, normalizedEmail, placeholderName, hash, salt, iterations, now(), acceptedAt, CURRENT_TERMS_VERSION)
    .run();

  const session = await issueSession(c.env.DB, userId, c.env.JWT_SECRET);
  return c.json({
    user: {
      id: userId,
      email: normalizedEmail,
      displayName: placeholderName,
      birthday: null,
      country: null,
      termsAcceptedAt: acceptedAt,
      profileComplete: false,
    },
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
// `acceptedTerms` only matters on the branch that creates a brand new account.
// The client can't know in advance whether a given Google/Apple identity is a
// returning user or a first-time signup, so it optimistically calls without
// it; a TERMS_REQUIRED response tells it to show the terms and retry. That way
// existing users are never re-prompted and new ones can't slip through.
async function upsertOAuthUser(
  db: D1Database,
  provider: "google" | "apple",
  providerSub: string,
  email: string | null,
  displayName: string | null,
  acceptedTerms: boolean,
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
    if (!acceptedTerms) {
      throw new HttpError(
        403,
        "You must accept the Terms & Conditions to create an account",
        "TERMS_REQUIRED",
      );
    }
    const userId = newId();
    const resolvedName = displayName || email.split("@")[0];
    const acceptedAt = now();
    await db
      .prepare(
        `INSERT INTO users (id, email, display_name, created_at, terms_accepted_at, terms_version)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(userId, email, resolvedName, now(), acceptedAt, CURRENT_TERMS_VERSION)
      .run();
    user = {
      id: userId,
      email,
      display_name: resolvedName,
      password_hash: null,
      password_salt: null,
      password_iterations: null,
      birthday: null,
      country: null,
      terms_accepted_at: acceptedAt,
      terms_version: CURRENT_TERMS_VERSION,
    };
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
  const { idToken, acceptedTerms } = await c.req.json<{ idToken?: string; acceptedTerms?: boolean }>();
  if (!idToken) throw new HttpError(400, "idToken is required");

  const identity = await verifyGoogleIdToken(idToken, c.env.GOOGLE_CLIENT_IDS);
  const user = await upsertOAuthUser(
    c.env.DB,
    "google",
    identity.sub,
    identity.email,
    identity.name,
    acceptedTerms === true,
  );
  const session = await issueSession(c.env.DB, user.id, c.env.JWT_SECRET);
  return c.json({ user: userDto(user), ...session });
});

auth.post("/apple", async (c) => {
  // email/fullName are only sent by the client on the FIRST authorization —
  // Apple never returns them again on subsequent sign-ins for the same user.
  const { identityToken, email, fullName, acceptedTerms } = await c.req.json<{
    identityToken?: string;
    email?: string;
    fullName?: string;
    acceptedTerms?: boolean;
  }>();
  if (!identityToken) throw new HttpError(400, "identityToken is required");

  const identity = await verifyAppleIdentityToken(identityToken, c.env.APPLE_CLIENT_IDS);
  const resolvedEmail = identity.email || email || null;
  const user = await upsertOAuthUser(
    c.env.DB,
    "apple",
    identity.sub,
    resolvedEmail,
    fullName || null,
    acceptedTerms === true,
  );
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

// Partial update: the profile-setup step sends all three at once, while the
// settings screen still sends displayName alone. Any omitted field is left as
// it is, so the two callers can share the endpoint.
auth.patch("/me", requireAuth, async (c) => {
  const { displayName, birthday, country } = await c.req.json<{
    displayName?: string;
    birthday?: string;
    country?: string;
  }>();

  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (displayName !== undefined) {
    if (!displayName.trim()) throw new HttpError(400, "displayName cannot be empty");
    updates.push("display_name = ?");
    values.push(displayName.trim());
  }
  if (birthday !== undefined) {
    if (!isValidBirthday(birthday)) {
      throw new HttpError(400, "birthday must be a valid past date (YYYY-MM-DD)");
    }
    updates.push("birthday = ?");
    values.push(birthday);
  }
  if (country !== undefined) {
    const normalizedCountry = country.trim().toUpperCase();
    if (!isValidCountry(normalizedCountry)) {
      throw new HttpError(400, "country must be a 2-letter ISO 3166-1 code");
    }
    updates.push("country = ?");
    values.push(normalizedCountry);
  }

  if (updates.length === 0) {
    throw new HttpError(400, "At least one of displayName, birthday, or country is required");
  }

  const userId = c.get("userId");
  await c.env.DB.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`)
    .bind(...values, userId)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first<UserRow>();
  if (!row) throw new HttpError(404, "User not found");
  return c.json({ user: userDto(row) });
});

export default auth;
