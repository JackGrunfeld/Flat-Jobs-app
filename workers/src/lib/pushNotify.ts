import type { D1Database } from "@cloudflare/workers-types";

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

// One ticket comes back per message, in the order they were sent.
type ExpoPushTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

// Expo rejects anything larger in a single call.
const EXPO_CHUNK = 100;

// Sends via the Expo Push API. No APNs/FCM credentials needed here — Expo's
// push service holds those and fans out to the real platform push services.
//
// Returns how many messages Expo actually accepted, and reports the ones it
// didn't. This used to be fire-and-forget, which meant a rejected token, a
// 4xx from Expo, or an outage all looked exactly like a delivered push: the
// caller got no signal and neither did the logs.
async function sendExpoPush(db: D1Database, messages: ExpoPushMessage[]): Promise<number> {
  if (messages.length === 0) return 0;

  let accepted = 0;
  // Tokens Expo says are dead — the app was uninstalled, or the token was
  // reissued. They'll never work again, so they come out of the table rather
  // than being retried on every future push.
  const staleTokens: string[] = [];

  for (let i = 0; i < messages.length; i += EXPO_CHUNK) {
    const chunk = messages.slice(i, i + EXPO_CHUNK);
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
      });

      if (!res.ok) {
        console.error("[push] Expo rejected the request", res.status, await res.text().catch(() => ""));
        continue;
      }

      const body = (await res.json()) as { data?: ExpoPushTicket[]; errors?: unknown };
      const tickets = body.data ?? [];
      tickets.forEach((ticket, index) => {
        if (ticket.status === "ok") {
          accepted += 1;
          return;
        }
        console.error("[push] Expo returned an error ticket", ticket.details?.error, ticket.message);
        if (ticket.details?.error === "DeviceNotRegistered") staleTokens.push(chunk[index].to);
      });
    } catch (err) {
      console.error("[push] Could not reach Expo", err);
    }
  }

  if (staleTokens.length > 0) {
    const placeholders = staleTokens.map(() => "?").join(", ");
    await db
      .prepare(`DELETE FROM push_tokens WHERE token IN (${placeholders})`)
      .bind(...staleTokens)
      .run();
  }

  return accepted;
}

// Looks up every registered device for a user and pushes to all of them
// (a user may be signed in on more than one device). Resolves to the number
// of devices the push actually reached — 0 means the user has no device
// registered, or every one of them was rejected, which callers that report
// back to a person need to be able to tell apart from success.
export async function notifyUser(
  db: D1Database,
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<number> {
  const { results } = await db
    .prepare("SELECT token FROM push_tokens WHERE user_id = ?")
    .bind(userId)
    .all<{ token: string }>();

  const messages = (results ?? []).map((row) => ({ to: row.token, title, body, data }));
  return sendExpoPush(db, messages);
}

// The same push to several people at once — one token lookup and one call to
// Expo rather than one of each per recipient, which is what the fan-outs below
// (a chore ticked off, the morning digests) would otherwise do.
export async function notifyUsers(
  db: D1Database,
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<number> {
  if (userIds.length === 0) return 0;

  const placeholders = userIds.map(() => "?").join(", ");
  const { results } = await db
    .prepare(`SELECT token FROM push_tokens WHERE user_id IN (${placeholders})`)
    .bind(...userIds)
    .all<{ token: string }>();

  return sendExpoPush(db, (results ?? []).map((row) => ({ to: row.token, title, body, data })));
}
