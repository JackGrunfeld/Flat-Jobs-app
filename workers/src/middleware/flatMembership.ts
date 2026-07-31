import type { MiddlewareHandler } from "hono";
import { HttpError, type AppEnv } from "../types";

// Verifies the authenticated user is a member of the :flatId in the URL
// before any flat-scoped route runs. The old Firestore-direct-from-client
// model had no equivalent server-side check — this closes that gap.
export const requireFlatMembership: MiddlewareHandler<AppEnv> = async (c, next) => {
  const userId = c.get("userId");
  const flatId = c.req.param("flatId");
  if (!flatId) throw new HttpError(400, "Missing flatId");

  const membership = await c.env.DB.prepare(
    "SELECT 1 FROM flat_members WHERE flat_id = ? AND user_id = ?",
  )
    .bind(flatId, userId)
    .first();

  if (!membership) {
    throw new HttpError(403, "Not a member of this flat");
  }
  await next();
};
