-- The flat's communal calendar, surfaced by the home screen calendar widget.
-- Birthdays are NOT stored here: they're derived client-side from users.birthday
-- so they recur yearly for free (see mobile/src/utils/calendarEvents.ts). This
-- table is only for things someone deliberately added.
--
-- `date` is a plain YYYY-MM-DD and `time` a plain HH:MM rather than a single
-- epoch column: a flat event is a wall-clock arrangement ("dinner, Friday,
-- 7:30") that shouldn't shift for whoever's phone is in another timezone.
-- A NULL `time` is what makes an event all-day.
CREATE TABLE events (
  id          TEXT PRIMARY KEY,
  flat_id     TEXT NOT NULL REFERENCES flats(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  date        TEXT NOT NULL,
  time        TEXT,
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  INTEGER NOT NULL
);

-- The calendar always queries a flat over a date window, never by id alone.
CREATE INDEX idx_events_flat_date ON events(flat_id, date);
