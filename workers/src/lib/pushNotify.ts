import type { D1Database } from "@cloudflare/workers-types";

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

// Sends via the Expo Push API. No APNs/FCM credentials needed here — Expo's
// push service holds those and fans out to the real platform push services.
async function sendExpoPush(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });
}

// Looks up every registered device for a user and pushes to all of them
// (a user may be signed in on more than one device).
export async function notifyUser(
  db: D1Database,
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const { results } = await db
    .prepare("SELECT token FROM push_tokens WHERE user_id = ?")
    .bind(userId)
    .all<{ token: string }>();

  const messages = (results ?? []).map((row) => ({ to: row.token, title, body, data }));
  await sendExpoPush(messages);
}
