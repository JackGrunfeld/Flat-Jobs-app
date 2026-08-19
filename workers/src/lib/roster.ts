// The chore rotation, on the server.
//
// A straight port of mobile/src/utils/rosterHelpers.ts, and it has to stay a
// straight port: the app works out who a chore falls to on the client, so a
// digest that computed it differently here would name the wrong flatmate in
// the notification and then be contradicted by the roster the moment they
// opened the app.
//
// The one deliberate difference is how a date is represented. The client works
// in the device's local timezone; a Worker has no local timezone at all. Every
// function here takes a *civil* date — a bare year/month/day with no time and
// no zone — and does its arithmetic in UTC, which yields the same integers the
// client's local-midnight arithmetic does for the same calendar day.

export type Frequency = "Daily" | "Weekly" | "Monthly";

/** A calendar day. `month` is 1-12, unlike Date's 0-11. */
export type CivilDate = { year: number; month: number; day: number };

// mobile's `baseDate = new Date(2026, 4, 4)` — a Monday, which is what makes
// week boundaries land where they should.
const BASE = Date.UTC(2026, 4, 4);
const DAY_MS = 86_400_000;
const BASE_YEAR = 2026;
const BASE_MONTH = 5; // 1-based, matching CivilDate

const stamp = (d: CivilDate) => Date.UTC(d.year, d.month - 1, d.day);

export const getDayIndex = (d: CivilDate): number => Math.round((stamp(d) - BASE) / DAY_MS);

export function getWeekForDate(d: CivilDate): number {
  const t = stamp(d);
  const dow = new Date(t).getUTCDay(); // Sunday = 0
  const monday = t + (dow === 0 ? -6 : 1 - dow) * DAY_MS;
  return Math.floor(Math.round((monday - BASE) / DAY_MS) / 7);
}

export const getMonthIndex = (d: CivilDate): number =>
  (d.year - BASE_YEAR) * 12 + (d.month - BASE_MONTH);

// Which slot of its own cadence a chore is in on a given day. Doubles as the
// key a completion is stored under (chore_completions.week), so this and the
// client must agree exactly or a chore rotates on one clock and remembers
// being done on another.
export function getPeriodIndex(frequency: Frequency | string | undefined, date: CivilDate): number {
  switch ((frequency || "Weekly").toLowerCase()) {
    case "monthly":
      return getMonthIndex(date);
    case "daily":
      return getDayIndex(date);
    default:
      return getWeekForDate(date);
  }
}

export function assigneeFor(
  pool: string[],
  frequency: Frequency | string | undefined,
  date: CivilDate,
  offset: number,
): string | null {
  if (pool.length === 0) return null;
  const period = getPeriodIndex(frequency, date);
  // Twice, because `%` takes the sign of its left operand and dates before
  // BASE make `period` negative.
  return pool[(((period + offset) % pool.length) + pool.length) % pool.length];
}

export type RotatingChore = { id: string; frequency: Frequency | string; memberIds: string[] };

// Every chore's assignee for one day, keyed by chore id. Chores are numbered
// within their own frequency, in the order the API returns them (created_at
// ascending), so consecutive chores of a cadence start on consecutive members.
export function assignChores(
  chores: RotatingChore[],
  flatMemberIds: string[],
  date: CivilDate,
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

// --- civil dates from a real instant ---------------------------------------

const PARTS = new Map<string, Intl.DateTimeFormat>();
const formatter = (timeZone: string) => {
  let f = PARTS.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    });
    PARTS.set(timeZone, f);
  }
  return f;
};

export type LocalMoment = CivilDate & {
  /** 0-23, in the given zone. */
  hour: number;
  /** 0 = Sunday, matching Date#getDay. */
  weekday: number;
};

// What day and hour it is *in the flat's zone*. Going through Intl rather than
// a fixed UTC offset is what keeps the morning digest at 8am across a daylight
// saving change — the cron fires hourly and this decides which of those firings
// is the morning one.
export function localMoment(at: Date, timeZone: string): LocalMoment {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const date: CivilDate = {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
  return {
    ...date,
    // "24" rather than "00" is legal in en-GB's hourCycle for midnight.
    hour: Number(parts.hour) % 24,
    weekday: new Date(stamp(date)).getUTCDay(),
  };
}

export const addDays = (d: CivilDate, days: number): CivilDate => {
  const t = new Date(stamp(d) + days * DAY_MS);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
};
