// Pure date maths for the home screen calendar strip — no React, no services.
// Birthdays are the only event source today: they're derived from each
// member's signup birthdate rather than stored as rows, so they recur every
// year for free and need no backend of their own.

import type { CalendarEvent, EventRecurrence, FlatEvent, FlatMember, User } from "../types";

const pad = (n: number) => String(n).padStart(2, "0");

// Local-time ISO date. Deliberately not `toISOString().slice(0, 10)` — that
// converts to UTC first, which lands on the wrong day either side of midnight.
export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Parses a stored YYYY-MM-DD as a LOCAL midnight. Deliberately not `new
// Date(iso)`, which reads a bare date as UTC and lands on the previous day for
// anyone behind it.
export function fromISODate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

export const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

// Day-of-month is clamped to the target month's length, so stepping from the
// 31st into a 30-day month lands on the 30th instead of rolling into the next
// month the way `setMonth` would.
export function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  target.setDate(Math.min(date.getDate(), daysInMonth(target.getFullYear(), target.getMonth())));
  target.setHours(0, 0, 0, 0);
  return target;
}

type MonthDay = { month: number; day: number };

function parseBirthday(birthday: string): MonthDay | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday);
  if (!match) return null;

  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (month < 0 || month > 11 || day < 1 || day > daysInMonth(2000, month)) return null;
  return { month, day };
}

// Feb 29 birthdays fall back to Feb 28 in common years rather than silently
// rolling into March, which is what `new Date(year, 1, 29)` would do on its own.
function occurrenceIn({ month, day }: MonthDay, year: number): Date {
  const safeDay = month === 1 && day === 29 && !isLeapYear(year) ? 28 : day;
  return new Date(year, month, safeDay);
}

// The next time this birthday comes round on/after `from`.
export function nextBirthdayOccurrence(birthday: string, from: Date): Date | null {
  const parsed = parseBirthday(birthday);
  if (!parsed) return null;

  const thisYear = occurrenceIn(parsed, from.getFullYear());
  return thisYear.getTime() >= from.getTime() ? thisYear : occurrenceIn(parsed, from.getFullYear() + 1);
}

const firstNameOf = (displayName: string) => displayName.trim().split(/\s+/)[0] || displayName;

type BirthdayPerson = { id: string; displayName: string; birthday: string | null; color: string | null };

// Flat members are the source of truth for names/colours, but the signed-in
// user's own birthday is only guaranteed on the `User` record — the members
// payload only carries it once the Workers API deploy exposing it is live, so
// merge both and let the user record win for their own row.
function peopleFor(members: FlatMember[], currentUser: User | null): BirthdayPerson[] {
  const people = new Map<string, BirthdayPerson>();

  for (const member of members) {
    people.set(member.userId, {
      id: member.userId,
      displayName: member.displayName,
      birthday: member.birthday ?? null,
      color: member.color,
    });
  }

  if (currentUser?.birthday) {
    const existing = people.get(currentUser.id);
    people.set(currentUser.id, {
      id: currentUser.id,
      displayName: existing?.displayName ?? currentUser.displayName,
      birthday: currentUser.birthday,
      color: existing?.color ?? null,
    });
  }

  return [...people.values()];
}

// Every yearly occurrence falling inside [from, to] — not just the next one.
// The calendar can be swiped back into months that have already passed, and
// those months still need their birthday rings.
export function buildBirthdayEventsInRange(
  members: FlatMember[],
  currentUser: User | null,
  from: Date,
  to: Date,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const person of peopleFor(members, currentUser)) {
    if (!person.birthday) continue;
    const parsed = parseBirthday(person.birthday);
    if (!parsed) continue;

    const isMe = person.id === currentUser?.id;
    for (let year = from.getFullYear(); year <= to.getFullYear(); year++) {
      const occurrence = occurrenceIn(parsed, year);
      if (occurrence.getTime() < from.getTime() || occurrence.getTime() > to.getTime()) continue;

      events.push({
        id: `birthday:${person.id}:${toISODate(occurrence)}`,
        date: toISODate(occurrence),
        title: isMe ? "Your birthday" : `${firstNameOf(person.displayName)}'s birthday`,
        kind: "birthday",
        color: person.color,
        time: null,
        // A birthday is its own kind of thing rather than one of the flat's
        // billing categories, and it never spans or is anything but its own
        // first day.
        // A birthday recurs yearly by its nature, but saying so in the banner
        // would be telling someone that birthdays happen every year.
        category: null,
        recurrence: null,
        isStart: true,
        spanDays: 1,
      });
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const byDate = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const existing = byDate.get(event.date);
    if (existing) existing.push(event);
    else byDate.set(event.date, [event]);
  }
  return byDate;
}

// Date first, then time — with all-day ahead of timed events on the same day,
// since an all-day thing is context for the whole date rather than a slot in
// it. Empty string sorts before any "HH:MM", which is exactly that order.
const byDateThenTime = (a: CalendarEvent, b: CalendarEvent) =>
  a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "");

// One step of a recurrence rule. Monthly and yearly go through the calendar
// rather than through arithmetic on days, so "the 1st of every month" stays on
// the 1st instead of drifting, and a 31st clamps to the length of a short month
// the way addMonths already handles.
function stepOccurrence(start: Date, recurrence: EventRecurrence, n: number): Date {
  switch (recurrence) {
    case "weekly":
      return addDays(start, n * 7);
    case "fortnightly":
      return addDays(start, n * 14);
    case "monthly":
      return addMonths(start, n);
    case "yearly":
      return addMonths(start, n * 12);
  }
}

// A repeat is stored as a rule with no end, so expansion is bounded by the
// window asked for rather than by the data. This is the belt-and-braces cap in
// case a window and a cadence ever combine into something absurd — a year of
// weekly events is 53, so anything approaching this is a bug rather than a
// calendar.
const MAX_OCCURRENCES = 2000;

// Turns stored events — which are rules, possibly spanning days and possibly
// repeating — into one entry per day they actually cover inside [from, to].
//
// Every day of a span gets its own entry so the grid can mark all of them
// without having to know about spans at all; `isStart` is what distinguishes
// the day the thing begins, which is the one the banner announces and the one
// "next up" counts. An event is tinted by whoever put it on the calendar, in
// the colour that flatmate picked for their account — unless it has a category,
// in which case what it *is* matters more than who added it, and the strip
// colours it accordingly.
export function toCalendarEvents(
  events: FlatEvent[],
  members: FlatMember[],
  from: Date,
  to: Date,
): CalendarEvent[] {
  const colorByUser = new Map(members.map((member) => [member.userId, member.color]));
  const out: CalendarEvent[] = [];

  for (const event of events) {
    const start = fromISODate(event.date);
    if (!start) continue;
    const end = event.endDate ? (fromISODate(event.endDate) ?? start) : start;
    // Inclusive, so a single-day event is 1 and a Fri–Sun event is 3.
    const spanDays = Math.max(1, daysBetween(start, end) + 1);
    const color = colorByUser.get(event.createdBy) ?? null;

    const emitOccurrence = (occurrenceStart: Date, index: number) => {
      for (let day = 0; day < spanDays; day++) {
        const date = addDays(occurrenceStart, day);
        if (date.getTime() < from.getTime() || date.getTime() > to.getTime()) continue;
        out.push({
          // Unique per day and per occurrence — two entries of the same event
          // are on screen at once whenever it spans or repeats.
          id: `event:${event.id}:${index}:${day}`,
          date: toISODate(date),
          title: event.title,
          kind: "event",
          color,
          time: event.time,
          category: event.category,
          recurrence: event.recurrence,
          isStart: day === 0,
          spanDays,
        });
      }
    };

    if (!event.recurrence) {
      emitOccurrence(start, 0);
      continue;
    }

    // Walk forward from the first occurrence. A span means an occurrence can
    // still be running inside the window after starting before it, so stepping
    // stops once even the *end* of an occurrence has passed `to`.
    for (let index = 0; index < MAX_OCCURRENCES; index++) {
      const occurrenceStart = stepOccurrence(start, event.recurrence, index);
      if (occurrenceStart.getTime() > to.getTime()) break;
      if (addDays(occurrenceStart, spanDays - 1).getTime() >= from.getTime()) {
        emitOccurrence(occurrenceStart, index);
      }
    }
  }

  return out;
}

export function mergeCalendarEvents(...lists: CalendarEvent[][]): CalendarEvent[] {
  return lists.flat().sort(byDateThenTime);
}

// Only the first day of an occurrence counts as "next up": the middle of a
// four-day event isn't a thing that's about to happen, it's a thing already
// under way, and announcing it as upcoming on each of its days would bury
// whatever genuinely comes next.
export function nextEvent(events: CalendarEvent[], from: Date): CalendarEvent | null {
  const todayISO = toISODate(from);
  return events.filter((e) => e.isStart && e.date >= todayISO).sort(byDateThenTime)[0] ?? null;
}

// "19:30" -> "7:30 pm". Hand-rolled rather than via toLocaleTimeString because
// the stored value is a wall-clock string with no date attached to build a
// Date from — and inventing one would drag timezone conversion back in.
export function formatTime(time: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return time;

  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours < 12 ? "am" : "pm";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${minutes} ${suffix}`;
}

// Handles both directions: selecting a day in the grid can point the banner at
// something already past, where a forward-only phrasing would read "in -3 days".
export function relativeDayLabel(date: Date, from: Date): string {
  const diff = daysBetween(from, date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";

  const magnitude = Math.abs(diff);
  const phrase =
    magnitude < 7
      ? `${magnitude} days`
      : magnitude < 14
        ? "a week"
        : `${Math.round(magnitude / 7)} weeks`;

  return diff > 0 ? `in ${phrase}` : `${phrase} ago`;
}

export const monthLabel = (date: Date) =>
  date.toLocaleDateString(undefined, { month: "short" }).toUpperCase();

export const weekdayLabel = (date: Date) =>
  date.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase();

// Single-letter weekday headings, Sunday first — 2023-01-01 was a Sunday, so
// the seven days from it are one week in order. Taken from the locale rather
// than hard-coded so the header isn't stuck in English, and indexed to match
// `Date.getDay()`.
export const WEEKDAY_INITIALS = Array.from({ length: 7 }, (_, i) =>
  new Date(2023, 0, 1 + i).toLocaleDateString(undefined, { weekday: "narrow" }).toUpperCase(),
);
