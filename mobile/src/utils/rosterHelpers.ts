// Ported from frontend/src/utils/rosterHelpers.js — pure date/rotation math,
// framework-agnostic. `getAssignments` and the cleaningData-backed legacy
// roster logic were dead code in the web app (nothing called them) and are
// deliberately not ported.

export const baseDate = new Date(2026, 4, 4);

// Which rotation week any given date falls in. The roster is worked out a week
// at a time, so this is what lets a UI that picks a *day* drive it.
export function getWeekForDate(date: Date): number {
  // Normalised to local midnight before the arithmetic: the caller's date may
  // carry a time, and a part-day would otherwise land in the day difference.
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = monday.getDay(); // Sunday = 0
  monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));

  // Rounded, not floored: both ends are local midnights, but a DST boundary
  // between them makes the span 23 or 25 hours rather than a clean multiple.
  const diffDays = Math.round((monday.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7);
}

export function getCurrentWeek(): number {
  return getWeekForDate(new Date());
}

// Whole days from baseDate. Rounded off two local midnights for the same
// reason getWeekForDate is — a DST boundary in between makes the span 23 or
// 25 hours rather than a clean multiple.
export function getDayIndex(date: Date): number {
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((midnight.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
}

export function getMonthIndex(date: Date): number {
  return (date.getFullYear() - baseDate.getFullYear()) * 12 + (date.getMonth() - baseDate.getMonth());
}

export type Frequency = "Daily" | "Weekly" | "Monthly";

// Which slot of its own cadence a chore is in on a given date. This is the one
// number a frequency reduces to, and it does two jobs: it drives the rotation
// (see assigneeFor), and it's the key a completion is stored under. Those two
// must be the same number or a chore rotates on one clock and remembers being
// done on another.
//
// It takes a date rather than a week index because a daily chore has to be
// able to tell Monday from Tuesday, which a week index cannot. Previously
// "daily" mapped to weekIndex * 7 — a value that only moves once a week, so a
// daily chore sat with one flatmate for seven days and then jumped seven
// places. Monthly had the mirror-image fault at the completion end: it rotated
// correctly by month but was *stored* against the week, so ticking it off in
// the first week of a month left it looking undone for the other three.
export function getPeriodIndex(frequency: Frequency | string | undefined, date: Date): number {
  switch ((frequency || "Weekly").toLowerCase()) {
    case "monthly":
      return getMonthIndex(date);
    case "daily":
      return getDayIndex(date);
    default:
      return getWeekForDate(date);
  }
}

// Which flatmate a chore falls to, given its place in the rotation.
//
// `periodIndex` alone is a function of the week and the frequency, so on its
// own it hands every chore of the same frequency to the same person — three
// weekly chores meant one flatmate did all three and everyone else did none,
// then it swapped wholesale the week after. `offset` is what fans them out:
// consecutive chores start on consecutive members, so N chores over M members
// split as evenly as N/M allows and the odd one moves along by one each period.
export function assigneeFor(
  pool: string[],
  frequency: Frequency | string | undefined,
  date: Date,
  offset: number,
): string | null {
  if (pool.length === 0) return null;
  const period = getPeriodIndex(frequency, date);
  // Twice, because JS `%` takes the sign of its left operand: weeks before
  // baseDate make `period` negative, which indexed off the front of the array
  // and left those chores with no assignee at all.
  return pool[(((period + offset) % pool.length) + pool.length) % pool.length];
}

type RotatingChore = { id: string; frequency: Frequency | string; memberIds: string[] };

// Every chore's assignee for one week, keyed by chore id. The single place the
// rotation is worked out — the roster and the dashboard's "chores waiting on
// you" both read from this, and any disagreement between them would show up as
// a chore that's assigned to you on one screen and not the other.
//
// Chores are numbered within their own frequency rather than across the whole
// list, because that's the group they share a cadence with: a monthly chore
// sitting between two weeklies would otherwise push those two onto the same
// person. Order comes from the API (`ORDER BY created_at ASC`), so the numbering
// is stable from week to week — and a new chore added to the end shifts nobody
// else's place in the rotation.
export function assignChores(
  chores: RotatingChore[],
  flatMemberIds: string[],
  date: Date,
): Map<string, string | null> {
  const nextOffset = new Map<string, number>();
  const assignments = new Map<string, string | null>();

  for (const chore of chores) {
    const cadence = (chore.frequency || "Weekly").toLowerCase();
    const offset = nextOffset.get(cadence) ?? 0;
    nextOffset.set(cadence, offset + 1);

    const pool = chore.memberIds.length > 0 ? chore.memberIds : flatMemberIds;
    assignments.set(chore.id, assigneeFor(pool, chore.frequency, date, offset));
  }

  return assignments;
}

export function getWeekDates(weekIndex: number): string {
  const start = new Date(baseDate);
  const day = start.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diffToMonday + weekIndex * 7);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const format = (date: Date) => date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" });

  return `${format(start)} – ${format(end)}`;
}
