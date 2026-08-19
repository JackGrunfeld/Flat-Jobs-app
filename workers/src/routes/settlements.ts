import { Hono } from "hono";
import type { AppEnv } from "../types";
import { HttpError, newId, now } from "../types";
import { requireAuth } from "../middleware/auth";
import { requireFlatMembership } from "../middleware/flatMembership";
import { notifyUser } from "../lib/pushNotify";

type SettlementRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  amount_cents: number;
  note: string | null;
  created_at: number;
};

const pairKey = (debtor: string, creditor: string) => `${debtor}|${creditor}`;

// Computes net per-pair balances: how much each shopping-item split member
// owes the item's payer, minus settlements already recorded between that
// pair, netted down to a single directional amount per pair. Replaces
// ShoppingListPage.jsx's client-side calcOwes.
export async function computeBalances(db: D1Database, flatId: string) {
  const [{ results: items }, { results: splits }, { results: paidSettlements }] = await Promise.all([
    db
      .prepare("SELECT id, cost_cents, added_by_user_id FROM shopping_items WHERE flat_id = ?")
      .bind(flatId)
      .all<{ id: string; cost_cents: number; added_by_user_id: string }>(),
    db
      .prepare(
        `SELECT sis.item_id, sis.user_id
         FROM shopping_item_splits sis
         JOIN shopping_items si ON si.id = sis.item_id
         WHERE si.flat_id = ?`,
      )
      .bind(flatId)
      .all<{ item_id: string; user_id: string }>(),
    db
      .prepare("SELECT from_user_id, to_user_id, amount_cents FROM settlements WHERE flat_id = ?")
      .bind(flatId)
      .all<{ from_user_id: string; to_user_id: string; amount_cents: number }>(),
  ]);

  const membersByItem = new Map<string, string[]>();
  for (const split of splits ?? []) {
    const list = membersByItem.get(split.item_id) ?? [];
    list.push(split.user_id);
    membersByItem.set(split.item_id, list);
  }

  // owed[debtor|creditor] = amount debtor owes creditor, before settlements.
  const owed = new Map<string, number>();
  for (const item of items ?? []) {
    const members = membersByItem.get(item.id) ?? [];
    if (members.length === 0) continue;

    const shareCents = Math.round(item.cost_cents / members.length);
    for (const member of members) {
      if (member === item.added_by_user_id) continue; // payer's own share isn't a debt
      const k = pairKey(member, item.added_by_user_id);
      owed.set(k, (owed.get(k) ?? 0) + shareCents);
    }
  }

  for (const s of paidSettlements ?? []) {
    const k = pairKey(s.from_user_id, s.to_user_id);
    owed.set(k, (owed.get(k) ?? 0) - s.amount_cents);
  }

  const settledPairs = new Set<string>();
  const balances: { userId: string; owesUserId: string; amountCents: number }[] = [];
  for (const k of owed.keys()) {
    const [a, b] = k.split("|");
    const unordered = [a, b].sort().join("|");
    if (settledPairs.has(unordered)) continue;
    settledPairs.add(unordered);

    const net = (owed.get(pairKey(a, b)) ?? 0) - (owed.get(pairKey(b, a)) ?? 0);
    if (net > 0) balances.push({ userId: a, owesUserId: b, amountCents: net });
    else if (net < 0) balances.push({ userId: b, owesUserId: a, amountCents: -net });
  }
  return balances;
}

// Mounted in index.ts at /flats/:flatId/settlements.
const settlements = new Hono<AppEnv>();
settlements.use("*", requireAuth, requireFlatMembership);

settlements.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM settlements WHERE flat_id = ? ORDER BY created_at DESC",
  )
    .bind(c.req.param("flatId"))
    .all<SettlementRow>();

  return c.json({
    settlements: (results ?? []).map((r) => ({
      id: r.id,
      fromUserId: r.from_user_id,
      toUserId: r.to_user_id,
      amountCents: r.amount_cents,
      note: r.note,
      createdAt: r.created_at,
    })),
  });
});

settlements.post("/remind", async (c) => {
  const flatId = c.req.param("flatId");
  const fromUserId = c.get("userId");
  const { toUserId, amountCents } = await c.req.json<{
    toUserId?: string;
    amountCents?: number;
  }>();
  if (!toUserId || !Number.isInteger(amountCents) || amountCents! <= 0) {
    throw new HttpError(400, "toUserId and a positive integer amountCents are required");
  }
  const recipientIsMember = await c.env.DB.prepare(
    "SELECT 1 FROM flat_members WHERE flat_id = ? AND user_id = ?",
  )
    .bind(flatId, toUserId)
    .first();
  if (!recipientIsMember) throw new HttpError(400, "toUserId is not a member of this flat");

  const creditor = await c.env.DB.prepare("SELECT display_name FROM users WHERE id = ?").bind(fromUserId).first<{ display_name: string }>();
  const amountDisplay = (amountCents! / 100).toFixed(2);
  // How many of the debtor's devices took the push. Passed back so the app can
  // tell "sent" apart from "they have no device registered / notifications
  // off" — before, both came back as success and the button looked like it had
  // done something either way.
  const delivered = await notifyUser(
    c.env.DB,
    toUserId,
    "Payment reminder",
    `${creditor?.display_name || "A flatmate"} reminded you that you owe $${amountDisplay}`,
    { type: "settlement-reminder", flatId },
  );

  return c.json({ success: delivered > 0, delivered });
});

settlements.post("/", async (c) => {
  const flatId = c.req.param("flatId");
  const fromUserId = c.get("userId");
  const { toUserId, amountCents, note } = await c.req.json<{
    toUserId?: string;
    amountCents?: number;
    note?: string;
  }>();
  if (!toUserId || !Number.isInteger(amountCents) || amountCents! <= 0) {
    throw new HttpError(400, "toUserId and a positive integer amountCents are required");
  }
  const recipientIsMember = await c.env.DB.prepare(
    "SELECT 1 FROM flat_members WHERE flat_id = ? AND user_id = ?",
  )
    .bind(flatId, toUserId)
    .first();
  if (!recipientIsMember) throw new HttpError(400, "toUserId is not a member of this flat");

  const settlementId = newId();
  await c.env.DB.prepare(
    "INSERT INTO settlements (id, flat_id, from_user_id, to_user_id, amount_cents, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(settlementId, flatId, fromUserId, toUserId, amountCents, note || null, now())
    .run();

  const payer = await c.env.DB.prepare("SELECT display_name FROM users WHERE id = ?").bind(fromUserId).first<{ display_name: string }>();
  const amountDisplay = (amountCents! / 100).toFixed(2);
  await notifyUser(
    c.env.DB,
    toUserId,
    "Debt settled",
    `${payer?.display_name || "A flatmate"} marked that they paid you $${amountDisplay}`,
    { type: "settlement", settlementId, flatId },
  );

  return c.json({ id: settlementId }, 201);
});

export default settlements;
