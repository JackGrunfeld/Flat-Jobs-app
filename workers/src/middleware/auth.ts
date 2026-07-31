import type { MiddlewareHandler } from "hono";
import { verifyAccessToken } from "../lib/jwt";
import { HttpError, type AppEnv } from "../types";

// Verifies the Bearer JWT access token and sets `userId` on the context.
// Stateless — no D1 read required per request, which is why access tokens
// are the primary auth mechanism rather than a KV-backed session lookup.
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new HttpError(401, "Missing bearer token");
  }
  const token = header.slice("Bearer ".length);
  try {
    const userId = await verifyAccessToken(token, c.env.JWT_SECRET);
    c.set("userId", userId);
  } catch {
    throw new HttpError(401, "Invalid or expired token");
  }
  await next();
};
