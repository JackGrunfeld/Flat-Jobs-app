import { Hono } from "hono";
import type { AppEnv } from "../types";
import { HttpError, newId, now } from "../types";
import { requireAuth } from "../middleware/auth";
import { requireFlatMembership } from "../middleware/flatMembership";

// Mounted in index.ts at /flats/:flatId/events. The flat's communal calendar —
// anything a flatmate deliberately added. Birthdays are not rows here; the
// client derives those from each member's stored birthday.
//
// A row is a *rule*, not a date: it may span days (`end_date`) and it may come
// back (`recurrence`). Working out which days that lands on is the client's
// job, because the calendar already expands birthdays the same way and the
// window it wants changes as you swipe it. See utils/calendarEvents.ts.
const events = new Hono<AppEnv>();
events.use("*", requireAuth, requireFlatMembership);

type EventRow = {
  id: string;
  flat_id: string;
  title: string;
  date: string;
  end_date: string | null;
  time: string | null;
  recurrence: string | null;
  category: string | null;
  created_by: string;
  created_at: number;
};

const TITLE_MAX = 120;
const RECURRENCES = ["weekly", "fortnightly", "monthly", "yearly"];
const CATEGORIES = ["rent", "power", "internet", "water", "rubbish", "social"];

// Wall-clock strings, deliberately not epochs — see migrations/0006_events.sql.
const isValidDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const isValidTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

function toDto(row: EventRow) {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    endDate: row.end_date,
    time: row.time,
    recurrence: row.recurrence,
    category: row.category,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

// `from`/`to` are optional and inclusive. The calendar asks for the window it
// can actually be swiped across rather than the flat's whole history.
events.get("/", async (c) => {
  const flatId = c.req.param("flatId");
  const from = c.req.query("from");
  const to = c.req.query("to");

  if (from && !isValidDate(from)) throw new HttpError(400, "from must be YYYY-MM-DD");
  if (to && !isValidDate(to)) throw new HttpError(400, "to must be YYYY-MM-DD");

  const conditions = ["flat_id = ?"];
  const bindings: (string | number)[] = [flatId!];
  // Nothing that starts after the window can appear in it, repeating or not.
  if (to) {
    conditions.push("date <= ?");
    bindings.push(to);
  }
  // The lower bound is the subtle one: a repeating event that started months
  // before the window still lands inside it, so only NON-repeating rows can be
  // excluded by their own dates. For those, it's the end of the span that has
  // to clear `from` — a week-long event beginning before the window is still
  // running during it.
  if (from) {
    conditions.push("(recurrence IS NOT NULL OR COALESCE(end_date, date) >= ?)");
    bindings.push(from);
  }

  const { results } = await c.env.DB.prepare(
    // All-day events sort before timed ones on the same date: NULL time
    // collates first, which is the order the client renders them in too.
    `SELECT * FROM events WHERE ${conditions.join(" AND ")} ORDER BY date ASC, time ASC`,
  )
    .bind(...bindings)
    .all<EventRow>();

  return c.json({ events: (results ?? []).map(toDto) });
});

events.post("/", async (c) => {
  const flatId = c.req.param("flatId")!;
  const userId = c.get("userId");
  const { title, date, endDate, time, recurrence, category } = await c.req.json<{
    title?: string;
    date?: string;
    endDate?: string | null;
    time?: string | null;
    recurrence?: string | null;
    category?: string | null;
  }>();

  const trimmed = title?.trim();
  if (!trimmed) throw new HttpError(400, "title is required");
  if (trimmed.length > TITLE_MAX) throw new HttpError(400, `title must be ${TITLE_MAX} characters or fewer`);
  if (!date || !isValidDate(date)) throw new HttpError(400, "date is required and must be YYYY-MM-DD");

  // Empty string is what a cleared field sends — treat it as absent rather
  // than rejecting it.
  const normalizedTime = time ? time : null;
  if (normalizedTime && !isValidTime(normalizedTime)) {
    throw new HttpError(400, "time must be HH:MM (24-hour)");
  }

  // Stored as NULL when it matches the start: "ends the day it starts" and
  // "has no end" are the same thing, and keeping one representation means the
  // client never has to compare the two to know whether a span is real.
  let normalizedEnd = endDate ? endDate : null;
  if (normalizedEnd) {
    if (!isValidDate(normalizedEnd)) throw new HttpError(400, "endDate must be YYYY-MM-DD");
    if (normalizedEnd < date) throw new HttpError(400, "endDate can't be before date");
    if (normalizedEnd === date) normalizedEnd = null;
  }

  const normalizedRecurrence = recurrence ? recurrence.toLowerCase() : null;
  if (normalizedRecurrence && !RECURRENCES.includes(normalizedRecurrence)) {
    throw new HttpError(400, `recurrence must be one of ${RECURRENCES.join(", ")}`);
  }

  const normalizedCategory = category ? category.toLowerCase() : null;
  if (normalizedCategory && !CATEGORIES.includes(normalizedCategory)) {
    throw new HttpError(400, `category must be one of ${CATEGORIES.join(", ")}`);
  }

  const id = newId();
  const createdAt = now();
  await c.env.DB.prepare(
    `INSERT INTO events (id, flat_id, title, date, end_date, time, recurrence, category, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      flatId,
      trimmed,
      date,
      normalizedEnd,
      normalizedTime,
      normalizedRecurrence,
      normalizedCategory,
      userId,
      createdAt,
    )
    .run();

  return c.json({
    event: {
      id,
      title: trimmed,
      date,
      endDate: normalizedEnd,
      time: normalizedTime,
      recurrence: normalizedRecurrence,
      category: normalizedCategory,
      createdBy: userId,
      createdAt,
    },
  });
});

// Update an existing event row. Any flat member may edit an event.
events.put("/:id", async (c) => {
  const flatId = c.req.param("flatId")!;
  const id = c.req.param("id")!;
  const { title, date, endDate, time, recurrence, category } = await c.req.json<{
    title?: string;
    date?: string;
    endDate?: string | null;
    time?: string | null;
    recurrence?: string | null;
    category?: string | null;
  }>();

  const trimmed = title?.trim();
  if (!trimmed) throw new HttpError(400, "title is required");
  if (!date || !isValidDate(date)) throw new HttpError(400, "date is required and must be YYYY-MM-DD");

  const normalizedTime = time ? time : null;
  if (normalizedTime && !isValidTime(normalizedTime)) {
    throw new HttpError(400, "time must be HH:MM (24-hour)");
  }

  let normalizedEnd = endDate ? endDate : null;
  if (normalizedEnd) {
    if (!isValidDate(normalizedEnd)) throw new HttpError(400, "endDate must be YYYY-MM-DD");
    if (normalizedEnd < date) throw new HttpError(400, "endDate can't be before date");
    if (normalizedEnd === date) normalizedEnd = null;
  }

  const normalizedRecurrence = recurrence ? recurrence.toLowerCase() : null;
  if (normalizedRecurrence && !RECURRENCES.includes(normalizedRecurrence)) {
    throw new HttpError(400, `recurrence must be one of ${RECURRENCES.join(", ")}`);
  }

  const normalizedCategory = category ? category.toLowerCase() : null;
  if (normalizedCategory && !CATEGORIES.includes(normalizedCategory)) {
    throw new HttpError(400, `category must be one of ${CATEGORIES.join(", ")}`);
  }

  await c.env.DB.prepare(
    `UPDATE events SET title = ?, date = ?, end_date = ?, time = ?, recurrence = ?, category = ? WHERE id = ? AND flat_id = ?`
  )
    .bind(trimmed, date, normalizedEnd, normalizedTime, normalizedRecurrence, normalizedCategory, id, flatId)
    .run();

  // Return the updated row to the client in the same shape as POST did.
  return c.json({
    event: {
      id,
      title: trimmed,
      date,
      endDate: normalizedEnd,
      time: normalizedTime,
      recurrence: normalizedRecurrence,
      category: normalizedCategory,
      // createdBy/createdAt not changed by update; fetch if needed.
    },
  });
});

// Delete an event row.
events.delete("/:id", async (c) => {
  const flatId = c.req.param("flatId")!;
  const id = c.req.param("id")!;

  await c.env.DB.prepare(`DELETE FROM events WHERE id = ? AND flat_id = ?`).bind(id, flatId).run();

  return c.json({ success: true });
});

export default events;
