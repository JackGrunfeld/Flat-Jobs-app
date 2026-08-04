import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./types";
import { HttpError } from "./types";

import authRoutes from "./routes/auth";
import invitesRoutes from "./routes/invites";
import flatsRoutes from "./routes/flats";
import choresRoutes from "./routes/chores";
import completionsRoutes from "./routes/completions";
import shoppingRoutes from "./routes/shopping";
import shoppingListItemsRoutes from "./routes/shoppingListItems";
import settlementsRoutes from "./routes/settlements";
import pushTokensRoutes from "./routes/pushTokens";

const app = new Hono<AppEnv>();

app.use(
  "*",
  cors({
    origin: (origin, c) => c.env.CORS_ORIGIN === "*" ? origin : c.env.CORS_ORIGIN,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json({ error: err.message }, err.status as 400 | 401 | 403 | 404 | 409);
  }
  console.error("[unhandled]", err);
  return c.json({ error: "Internal server error" }, 500);
});

app.get("/", (c) => c.json({ ok: true }));

app.route("/auth", authRoutes);
app.route("/invites", invitesRoutes);
app.route("/users/me/push-tokens", pushTokensRoutes);

app.route("/flats", flatsRoutes);
app.route("/flats/:flatId/chores", choresRoutes);
app.route("/flats/:flatId/completions", completionsRoutes);
app.route("/flats/:flatId/shopping-items", shoppingRoutes);
app.route("/flats/:flatId/shopping-list-items", shoppingListItemsRoutes);
app.route("/flats/:flatId/settlements", settlementsRoutes);

export default app;
