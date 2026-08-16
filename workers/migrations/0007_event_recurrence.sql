-- Three things a flat calendar needs that a single dated row can't say:
-- how long the thing lasts, whether it comes back, and what kind of thing it
-- is. All three are nullable, so every row written before this migration is
-- still a valid single-day, one-off, uncategorised event.
--
-- `end_date` is the INCLUSIVE last day of the span. NULL means it starts and
-- ends the same day, which is the overwhelmingly common case and is worth not
-- having to duplicate `date` into.
ALTER TABLE events ADD COLUMN end_date TEXT;

-- The rule, not the occurrences. A weekly rent event is one row, and the dates
-- it falls on are worked out against whatever window the calendar is asking
-- for — see mobile/src/utils/calendarEvents.ts. Storing expanded rows instead
-- would mean deciding up front how far into the future to write, and rewriting
-- them all whenever the series is edited. NULL means it happens once.
-- One of: 'weekly' | 'fortnightly' | 'monthly' | 'yearly'.
ALTER TABLE events ADD COLUMN recurrence TEXT;

-- What kind of thing it is, which is what lets the calendar mark a rent day as
-- a rent day rather than as a generic "something's on". NULL is untyped and
-- reads as the flatmate's own colour, the way every event did before this.
-- One of: 'rent' | 'power' | 'internet' | 'water' | 'rubbish' | 'social'.
ALTER TABLE events ADD COLUMN category TEXT;

-- The window query now has to catch a series that STARTS before the window and
-- repeats into it, so it can no longer lean on `date` alone being in range —
-- see the comment on the list route. This index still serves the flat_id half
-- and the ordering; the recurrence rows are a small minority of the table.
