// Pure date maths for the home screen calendar strip — no React, no services.
// Birthdays are the only event source today: they're derived from each
// member's signup birthdate rather than stored as rows, so they recur every
// year for free and need no backend of their own.

import type { CalendarEvent, FlatEvent, FlatMember, User } from "../types";

const pad = (n: number) => String(n).padStart(2, "0");

// Local-time ISO date. Deliberately not `toISOString().slice(0, 10)` — that
// converts to UTC first, which lands on the wrong day either side of midnight.
export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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

export function toCalendarEvents(events: FlatEvent[]): CalendarEvent[] {
  return events.map((event) => ({
    id: `event:${event.id}`,
    date: event.date,
    title: event.title,
    kind: "event" as const,
    // Communal events have no owner colour — the strip falls back to its
    // default ring so they still read as "something's on".
    color: null,
    time: event.time,
  }));
}

export function mergeCalendarEvents(...lists: CalendarEvent[][]): CalendarEvent[] {
  return lists.flat().sort(byDateThenTime);
}

export function nextEvent(events: CalendarEvent[], from: Date): CalendarEvent | null {
  const todayISO = toISODate(from);
  return events.filter((e) => e.date >= todayISO).sort(byDateThenTime)[0] ?? null;
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
