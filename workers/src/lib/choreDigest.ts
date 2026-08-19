import type { Bindings } from "../types";
import { notifyUsers } from "./pushNotify";
import {
  assignChores,
  getPeriodIndex,
  localMoment,
  type CivilDate,
  type RotatingChore,
} from "./roster";

// The morning chore digests, driven by the hourly cron in index.ts.
//
// Three messages, all sent at MORNING_HOUR in the flat's own timezone:
//
//   every day   — the daily chores standing on you today
//   Monday      — everything you're down for over the week ahead
//   Sunday      — a nudge about anything from the week that's still not ticked
//
// The cron runs every hour rather than three times a day at fixed UTC times so
// that "morning" survives daylight saving: the handler asks what the local hour
// is and does nothing 23 times out of 24.

const DEFAULT_TIMEZONE = "Pacific/Auckland";
const MORNING_HOUR = 8;

/** Enough names to be useful in a notification; past this it trails off. */
const MAX_NAMED = 3;

type ChoreRow = { id: string; name: string; frequency: string };
type Assignment = { chore: ChoreRow; userId: string; done: boolean };

function nameList(chores: ChoreRow[]): string {
  const names = chores.map((c) => c.name);
  if (names.length <= MAX_NAMED) {
    if (names.length <= 1) return names[0] ?? "";
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, MAX_NAMED).join(", ")} +${names.length - MAX_NAMED} more`;
}

// One flat's roster for one day: every chore, who it falls to, and whether
// that period is already ticked off. The completions are read for the exact
// (chore, period) pairs the day resolves to, so a daily chore's tick from
// yesterday doesn't count for today.
function assignmentsFor(
  chores: RotatingChore[],
  rows: Map<string, ChoreRow>,
  memberIds: string[],
  date: CivilDate,
  doneKeys: Set<string>,
): Assignment[] {
  const assigned = assignChores(chores, memberIds, date);
  const out: Assignment[] = [];
  for (const chore of chores) {
    const userId = assigned.get(chore.id);
    if (!userId) continue;
    const row = rows.get(chore.id)!;
    out.push({
      chore: row,
      userId,
      done: doneKeys.has(`${chore.id}:${getPeriodIndex(row.frequency, date)}`),
    });
  }
  return out;
}

function groupByUser(items: Assignment[]): Map<string, ChoreRow[]> {
  const byUser = new Map<string, ChoreRow[]>();
  for (const item of items) {
    if (!byUser.has(item.userId)) byUser.set(item.userId, []);
    byUser.get(item.userId)!.push(item.chore);
  }
  return byUser;
}

// A digest is per-person, so each distinct message goes to exactly one user —
// but they all go out together rather than one flat at a time waiting on the
// last.
type Message = { userIds: string[]; title: string; body: string; data: Record<string, unknown> };

// Exported for the digest harness in the repo's scratch tests.
export async function digestForFlat(db: D1Database, flatId: string, today: CivilDate, weekday: number) {
  const [choreRes, memberRes, completionRes] = await Promise.all([
    db
      .prepare("SELECT id, name, frequency FROM chores WHERE flat_id = ? ORDER BY created_at ASC")
      .bind(flatId)
      .all<ChoreRow & { created_at: number }>(),
    // Same ordering the API hands the app (see loadFlatDto) — the rotation is
    // an index into this list, so the two orders have to match.
    db
      .prepare("SELECT user_id FROM flat_members WHERE flat_id = ? ORDER BY joined_at ASC, user_id ASC")
      .bind(flatId)
      .all<{ user_id: string }>(),
    db
      .prepare(
        `SELECT cc.chore_id, cc.week FROM chore_completions cc
         JOIN chores ch ON ch.id = cc.chore_id
         WHERE ch.flat_id = ? AND cc.done = 1`,
      )
      .bind(flatId)
      .all<{ chore_id: string; week: number }>(),
  ]);

  const choreRows = choreRes.results ?? [];
  const memberIds = (memberRes.results ?? []).map((r) => r.user_id);
  if (choreRows.length === 0 || memberIds.length === 0) return [];

  const { results: memberLinks } = await db
    .prepare(
      `SELECT cm.chore_id, cm.user_id FROM chore_members cm
       JOIN chores c ON c.id = cm.chore_id WHERE c.flat_id = ?`,
    )
    .bind(flatId)
    .all<{ chore_id: string; user_id: string }>();

  const poolByChore = new Map<string, string[]>();
  for (const link of memberLinks ?? []) {
    if (!poolByChore.has(link.chore_id)) poolByChore.set(link.chore_id, []);
    poolByChore.get(link.chore_id)!.push(link.user_id);
  }

  const rows = new Map(choreRows.map((c) => [c.id, { id: c.id, name: c.name, frequency: c.frequency }]));
  const chores: RotatingChore[] = choreRows.map((c) => ({
    id: c.id,
    frequency: c.frequency,
    memberIds: poolByChore.get(c.id) ?? [],
  }));
  const doneKeys = new Set((completionRes.results ?? []).map((r) => `${r.chore_id}:${r.week}`));

  const todays = assignmentsFor(chores, rows, memberIds, today, doneKeys);
  const messages: Message[] = [];

  // --- every morning: today's daily chores ---------------------------------
  const dailyByUser = groupByUser(todays.filter((a) => a.chore.frequency === "Daily" && !a.done));
  for (const [userId, list] of dailyByUser) {
    messages.push({
      userIds: [userId],
      title: "Today's chores",
      body:
        list.length === 1
          ? `Today's daily chore is: ${list[0].name}`
          : `Today's daily chores are: ${nameList(list)}`,
      data: { type: "chores-daily", flatId },
    });
  }

  // --- Monday: the week ahead ----------------------------------------------
  // Weekly chores hold all week, so today's assignment is the week's. Monthly
  // ones are included only on the first Monday of the month, where they're
  // news rather than a fourth repeat.
  if (weekday === 1) {
    const firstMonday = today.day <= 7;
    const weekly = todays.filter(
      (a) => a.chore.frequency === "Weekly" || (firstMonday && a.chore.frequency === "Monthly"),
    );
    for (const [userId, list] of groupByUser(weekly)) {
      messages.push({
        userIds: [userId],
        title: "Your week",
        body:
          list.length === 1
            ? `Your chore for the week: ${list[0].name}`
            : `Your chores for the week are: ${nameList(list)}`,
        data: { type: "chores-weekly", flatId },
      });
    }
  }

  // --- Sunday: what's still outstanding ------------------------------------
  // The weekly and monthly ones only — the daily digest an hour's worth of
  // scrolling above already covers today's.
  if (weekday === 0) {
    const outstanding = todays.filter((a) => !a.done && a.chore.frequency !== "Daily");
    for (const [userId, list] of groupByUser(outstanding)) {
      messages.push({
        userIds: [userId],
        title: "Still on your list",
        body:
          list.length === 1
            ? `Hey — make sure you've checked off ${list[0].name} before the week's out.`
            : `Hey — make sure you've checked off ${nameList(list)} before the week's out.`,
        data: { type: "chores-reminder", flatId },
      });
    }
  }

  return messages;
}

// Called from the scheduled handler. `at` is the instant the cron fired.
export async function runChoreDigests(env: Bindings, at: Date): Promise<void> {
  const timeZone = env.NOTIFY_TIMEZONE || DEFAULT_TIMEZONE;
  const moment = localMoment(at, timeZone);
  if (moment.hour !== MORNING_HOUR) return;

  const today: CivilDate = { year: moment.year, month: moment.month, day: moment.day };
  const { results: flats } = await env.DB.prepare("SELECT id FROM flats").all<{ id: string }>();

  for (const flat of flats ?? []) {
    try {
      const messages = await digestForFlat(env.DB, flat.id, today, moment.weekday);
      for (const m of messages) {
        await notifyUsers(env.DB, m.userIds, m.title, m.body, m.data);
      }
    } catch (err) {
      // One flat's bad data shouldn't cost every other flat its digest.
      console.error("[digest] flat", flat.id, err);
    }
  }
}
