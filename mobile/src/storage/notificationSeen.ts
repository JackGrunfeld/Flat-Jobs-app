import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Chore, Completion, ShoppingListItem, ShoppingItem } from "../types";

// Per-flat, per-user "what have I already looked at" bookkeeping for the
// Home screen's notification count. Nothing here is server state — it's
// purely local, so it resets if the app is reinstalled, which is fine: an
// empty seen-set just means everything currently on the flat reads as new
// once, the same way a fresh inbox would.
const KEY_PREFIX = "flatjobs.notifSeen";

type NotifState = {
  // choreId -> a signature of that chore's own fields + its completions, as
  // of the last time the House tab was open. A mismatch (or a missing entry)
  // means something about that chore has changed since.
  choreSeen: Record<string, string>;
  // choreId -> epoch ms the change was first noticed. Captured once per
  // change (not recomputed on every read) so "which category changed most
  // recently" stays stable across reloads instead of always reading "now".
  chorePending: Record<string, number>;
  shoppingSeenIds: string[];
  billsSeenIds: string[];
};

const EMPTY_STATE: NotifState = { choreSeen: {}, chorePending: {}, shoppingSeenIds: [], billsSeenIds: [] };

function keyFor(flatId: string, userId: string) {
  return `${KEY_PREFIX}.${flatId}.${userId}`;
}

async function getState(flatId: string, userId: string): Promise<NotifState> {
  const raw = await AsyncStorage.getItem(keyFor(flatId, userId));
  if (!raw) return { ...EMPTY_STATE, choreSeen: {}, chorePending: {}, shoppingSeenIds: [], billsSeenIds: [] };
  try {
    const parsed = JSON.parse(raw);
    return {
      choreSeen: parsed.choreSeen ?? {},
      chorePending: parsed.chorePending ?? {},
      shoppingSeenIds: parsed.shoppingSeenIds ?? [],
      billsSeenIds: parsed.billsSeenIds ?? [],
    };
  } catch {
    return { choreSeen: {}, chorePending: {}, shoppingSeenIds: [], billsSeenIds: [] };
  }
}

async function saveState(flatId: string, userId: string, state: NotifState): Promise<void> {
  await AsyncStorage.setItem(keyFor(flatId, userId), JSON.stringify(state));
}

// A chore "changing" covers both its own fields (renamed, reassigned,
// rescheduled) and its completions (someone ticked or unticked it) — so the
// signature is the chore's fields plus every completion recorded against it.
function choreSignature(chore: Chore, completions: Completion[]): string {
  const relevant = completions
    .filter((c) => c.choreId === chore.id)
    .sort((a, b) => a.week - b.week)
    .map((c) => `${c.week}:${c.assignedUserId}:${c.done}`)
    .join(",");
  return [chore.name, chore.frequency, chore.memberIds.slice().sort().join(","), relevant].join("|");
}

// Call when the House tab loads its chores — whatever's current becomes the
// new baseline, so nothing on it still reads as unseen.
export async function markChoresSeen(
  flatId: string,
  userId: string,
  chores: Chore[],
  completions: Completion[],
): Promise<void> {
  const state = await getState(flatId, userId);
  const choreSeen: Record<string, string> = {};
  for (const chore of chores) choreSeen[chore.id] = choreSignature(chore, completions);
  await saveState(flatId, userId, { ...state, choreSeen, chorePending: {} });
}

// Call when the Shopping tab loads a list's items — merges rather than
// replaces, since only one list's worth of items is in view at a time and
// the others' seen state shouldn't be lost.
export async function markShoppingSeen(flatId: string, userId: string, items: ShoppingListItem[]): Promise<void> {
  const state = await getState(flatId, userId);
  const seen = new Set(state.shoppingSeenIds);
  for (const item of items) seen.add(item.id);
  await saveState(flatId, userId, { ...state, shoppingSeenIds: Array.from(seen) });
}

// Call when the Bills tab loads its expenses.
export async function markBillsSeen(flatId: string, userId: string, items: ShoppingItem[]): Promise<void> {
  const state = await getState(flatId, userId);
  const seen = new Set(state.billsSeenIds);
  for (const item of items) seen.add(item.id);
  await saveState(flatId, userId, { ...state, billsSeenIds: Array.from(seen) });
}

export type NotifTarget = "House" | "Shopping" | "Bills";

export type NotifSummary = {
  count: number;
  // Whichever category's change is the most recent, so the Home screen's
  // "Flat Hub" link can point straight at it. Null once everything's seen.
  latest: { target: NotifTarget; label: string } | null;
};

// Reads the flat's current chores/shopping/bills against what's already been
// seen and returns a count plus where the newest change lives. Chore changes
// with no prior `chorePending` entry are timestamped now (first sighting) and
// persisted, so the "most recent" comparison stays stable on the next call
// rather than always reading as brand new.
export async function computeNotifications(
  flatId: string,
  userId: string,
  data: {
    chores: Chore[];
    completions: Completion[];
    shoppingItems: ShoppingListItem[];
    billItems: ShoppingItem[];
  },
): Promise<NotifSummary> {
  const state = await getState(flatId, userId);

  let choreCount = 0;
  let choresChanged = false;
  const chorePending = { ...state.chorePending };
  const now = Date.now();
  const liveChoreIds = new Set(data.chores.map((c) => c.id));
  for (const id of Object.keys(chorePending)) {
    if (!liveChoreIds.has(id)) delete chorePending[id];
  }
  for (const chore of data.chores) {
    const sig = choreSignature(chore, data.completions);
    if (state.choreSeen[chore.id] === sig) {
      delete chorePending[chore.id];
      continue;
    }
    choreCount += 1;
    choresChanged = true;
    if (chorePending[chore.id] === undefined) chorePending[chore.id] = now;
  }
  if (choresChanged || Object.keys(chorePending).length !== Object.keys(state.chorePending).length) {
    await saveState(flatId, userId, { ...state, chorePending });
  }
  const choreLatestAt = Math.max(0, ...Object.values(chorePending));

  // Only a flatmate's own addition counts against them — you don't need to
  // be told about the thing you just put on the list yourself.
  const unseenShopping = data.shoppingItems.filter(
    (item) => item.addedByUserId !== userId && !state.shoppingSeenIds.includes(item.id),
  );
  const shoppingLatestAt = Math.max(0, ...unseenShopping.map((i) => i.createdAt));

  const unseenBills = data.billItems.filter((item) => !state.billsSeenIds.includes(item.id));
  const billsLatestAt = Math.max(0, ...unseenBills.map((i) => i.createdAt));

  const count = choreCount + unseenShopping.length + unseenBills.length;

  const candidates: { target: NotifTarget; label: string; at: number }[] = (
    [
      { target: "House", label: "Chores", at: choreCount > 0 ? choreLatestAt : -1 },
      { target: "Shopping", label: "Shopping", at: unseenShopping.length > 0 ? shoppingLatestAt : -1 },
      { target: "Bills", label: "Bills", at: unseenBills.length > 0 ? billsLatestAt : -1 },
    ] as { target: NotifTarget; label: string; at: number }[]
  ).filter((c) => c.at >= 0);

  const latest = candidates.length
    ? candidates.reduce((a, b) => (b.at > a.at ? b : a))
    : null;

  return { count, latest: latest ? { target: latest.target, label: latest.label } : null };
}
