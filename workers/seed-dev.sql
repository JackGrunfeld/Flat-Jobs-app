-- Local-only dev fixtures: fills the existing flat with flatmates and data in
-- every area of the app (chores + rotation history, Splitwise expenses and
-- balances, shopping list with upvotes, settlements, calendar events, a
-- pending invite).
--
-- Apply with:
--   npx wrangler d1 execute flat-jobs-db --local --file seed-dev.sql
--
-- NEVER run this against --remote. The seeded users have NULL password
-- columns, so they can't be logged into — they exist to be flatmates.
--
-- Re-runnable: every statement is idempotent (DELETE of the seeded rows first,
-- then INSERT OR REPLACE), so applying it twice doesn't double up.
--
-- Period indices below are pinned to 2026-08-17 against rosterHelpers'
-- baseDate of 2026-05-04: week 15, day 105, month 3. Chore completions are
-- keyed by getPeriodIndex(frequency, date), which is the *day* index for Daily
-- chores and the *month* index for Monthly ones — not the week.

-- ---------------------------------------------------------------------------
-- Clean out anything a previous run of this file created.
-- ---------------------------------------------------------------------------
DELETE FROM shopping_list_item_upvotes WHERE user_id LIKE 'seed-%' OR item_id LIKE 'seed-%';
DELETE FROM shopping_item_splits       WHERE user_id LIKE 'seed-%' OR item_id LIKE 'seed-%';
DELETE FROM chore_completions          WHERE chore_id LIKE 'seed-%';
DELETE FROM chore_members              WHERE chore_id LIKE 'seed-%' OR user_id LIKE 'seed-%';
DELETE FROM chores                     WHERE id LIKE 'seed-%';
DELETE FROM shopping_items             WHERE id LIKE 'seed-%';
DELETE FROM shopping_list_items        WHERE id LIKE 'seed-%';
DELETE FROM settlements                WHERE id LIKE 'seed-%';
DELETE FROM events                     WHERE id LIKE 'seed-%';
DELETE FROM flat_invites               WHERE id LIKE 'seed-%';
DELETE FROM flat_members               WHERE user_id LIKE 'seed-%';
DELETE FROM users                      WHERE id LIKE 'seed-%';

-- ---------------------------------------------------------------------------
-- Flatmates. Password columns stay NULL (same shape as an OAuth-only account).
-- Birthdays are spread so the calendar's derived birthday events land across
-- the year, including one within days of 2026-08-17 to exercise "next up".
-- ---------------------------------------------------------------------------
INSERT OR REPLACE INTO users (id, email, display_name, created_at, birthday, country, terms_accepted_at, terms_version) VALUES
  ('seed-user-mia',   'mia@example.com',   'Mia Kowalski',   1780000000000, '1999-08-21', 'NZ', 1780000000000, '1.0'),
  ('seed-user-tane',  'tane@example.com',  'Tane Ropata',    1780000000000, '2000-11-03', 'NZ', 1780000000000, '1.0'),
  ('seed-user-priya', 'priya@example.com', 'Priya Nair',     1780000000000, '1998-02-14', 'IN', 1780000000000, '1.0'),
  ('seed-user-liam',  'liam@example.com',  'Liam O''Connor', 1780000000000, '2001-06-30', 'IE', 1780000000000, '1.0');

-- Colours are MEMBER_PRESETS entries, spaced around the hue circle so avatars
-- are easy to tell apart.
INSERT OR REPLACE INTO flat_members (flat_id, user_id, color, joined_at) VALUES
  ('45866f20-5d16-4a62-9b0f-e0687d191330', 'seed-user-mia',   '#53de8d', 1780000000000),
  ('45866f20-5d16-4a62-9b0f-e0687d191330', 'seed-user-tane',  '#3cb6e9', 1780000000000),
  ('45866f20-5d16-4a62-9b0f-e0687d191330', 'seed-user-priya', '#e76fe7', 1780000000000),
  ('45866f20-5d16-4a62-9b0f-e0687d191330', 'seed-user-liam',  '#eea30d', 1780000000000);

-- Give the owner a colour too, so every avatar on the roster is filled.
UPDATE flat_members
   SET color = '#f17641'
 WHERE user_id = 'ca5ee514-5318-4936-a766-35863b063404' AND color IS NULL;

-- ---------------------------------------------------------------------------
-- Chores, across all three frequencies.
-- ---------------------------------------------------------------------------
INSERT OR REPLACE INTO chores (id, flat_id, name, description, frequency, created_at) VALUES
  ('seed-chore-dishes',  '45866f20-5d16-4a62-9b0f-e0687d191330', 'Dishes',           'Empty the rack too, not just the sink.', 'Daily',   1780000000000),
  ('seed-chore-bins',    '45866f20-5d16-4a62-9b0f-e0687d191330', 'Rubbish & recycling', 'Kerbside Tuesday night.',             'Weekly',  1780000100000),
  ('seed-chore-bathroom','45866f20-5d16-4a62-9b0f-e0687d191330', 'Bathroom',         'Shower, sink, mirror, floor.',           'Weekly',  1780000200000),
  ('seed-chore-vacuum',  '45866f20-5d16-4a62-9b0f-e0687d191330', 'Vacuum common areas', NULL,                                  'Weekly',  1780000300000),
  ('seed-chore-oven',    '45866f20-5d16-4a62-9b0f-e0687d191330', 'Deep clean oven',  'The one nobody wants.',                  'Monthly', 1780000400000),
  ('seed-chore-fridge',  '45866f20-5d16-4a62-9b0f-e0687d191330', 'Clear out fridge', 'Bin anything past its date.',            'Monthly', 1780000500000);

-- An empty chore_members set means "whole flat rotation pool", so two chores
-- are deliberately left unassigned to exercise that path. The rest are scoped
-- to a subset.
INSERT OR REPLACE INTO chore_members (chore_id, user_id) VALUES
  ('seed-chore-bins',     'ca5ee514-5318-4936-a766-35863b063404'),
  ('seed-chore-bins',     'seed-user-tane'),
  ('seed-chore-bins',     'seed-user-liam'),
  ('seed-chore-bathroom', 'seed-user-mia'),
  ('seed-chore-bathroom', 'seed-user-priya'),
  ('seed-chore-oven',     'ca5ee514-5318-4936-a766-35863b063404'),
  ('seed-chore-oven',     'seed-user-mia'),
  ('seed-chore-oven',     'seed-user-tane'),
  ('seed-chore-oven',     'seed-user-priya'),
  ('seed-chore-oven',     'seed-user-liam');

-- Completion history. Keyed by (chore_id, period) where period is the day
-- index for Daily, week index for Weekly, month index for Monthly.
-- Current: day 105, week 15, month 3.
INSERT OR REPLACE INTO chore_completions (chore_id, week, assigned_user_id, done, updated_at) VALUES
  -- Daily dishes: the last five days, mostly done, today still outstanding.
  ('seed-chore-dishes',   101, 'seed-user-mia',                        1, 1786800000000),
  ('seed-chore-dishes',   102, 'seed-user-tane',                       1, 1786886400000),
  ('seed-chore-dishes',   103, 'seed-user-priya',                      1, 1786972800000),
  ('seed-chore-dishes',   104, 'seed-user-liam',                       1, 1787059200000),
  ('seed-chore-dishes',   105, 'ca5ee514-5318-4936-a766-35863b063404', 0, 1787145600000),
  -- Weekly chores: previous weeks done, this week a mix.
  ('seed-chore-bins',      13, 'seed-user-tane',                       1, 1786000000000),
  ('seed-chore-bins',      14, 'seed-user-liam',                       1, 1786600000000),
  ('seed-chore-bins',      15, 'ca5ee514-5318-4936-a766-35863b063404', 0, 1787145600000),
  ('seed-chore-bathroom',  14, 'seed-user-mia',                        1, 1786600000000),
  ('seed-chore-bathroom',  15, 'seed-user-priya',                      1, 1787100000000),
  ('seed-chore-vacuum',    14, 'seed-user-priya',                      1, 1786600000000),
  ('seed-chore-vacuum',    15, 'seed-user-tane',                       0, 1787145600000),
  -- Monthly: last month done, this month outstanding.
  ('seed-chore-oven',       2, 'seed-user-liam',                       1, 1784000000000),
  ('seed-chore-oven',       3, 'seed-user-mia',                        0, 1787145600000),
  ('seed-chore-fridge',     3, 'seed-user-priya',                      1, 1787000000000);

-- ---------------------------------------------------------------------------
-- Splitwise-style expenses. Every category is represented, and the splits are
-- uneven on purpose so the balances screen has something real to net out.
-- ---------------------------------------------------------------------------
INSERT OR REPLACE INTO shopping_items (id, flat_id, name, cost_cents, added_by_user_id, category, created_at) VALUES
  ('seed-exp-groceries', '45866f20-5d16-4a62-9b0f-e0687d191330', 'Countdown shop',       14250, 'ca5ee514-5318-4936-a766-35863b063404', 'Food',      1786500000000),
  ('seed-exp-power',     '45866f20-5d16-4a62-9b0f-e0687d191330', 'Power bill — July',    18600, 'seed-user-mia',                        'Utilities', 1786550000000),
  ('seed-exp-internet',  '45866f20-5d16-4a62-9b0f-e0687d191330', 'Internet — August',     8999, 'seed-user-tane',                       'Utilities', 1786600000000),
  ('seed-exp-cleaning',  '45866f20-5d16-4a62-9b0f-e0687d191330', 'Cleaning supplies',     3480, 'seed-user-priya',                      'Household', 1786650000000),
  ('seed-exp-toiletpaper','45866f20-5d16-4a62-9b0f-e0687d191330','Toilet paper (bulk)',   2999, 'seed-user-liam',                       'Household', 1786700000000),
  ('seed-exp-pizza',     '45866f20-5d16-4a62-9b0f-e0687d191330', 'Friday pizza',          6200, 'ca5ee514-5318-4936-a766-35863b063404', 'Food',      1786750000000),
  ('seed-exp-water',     '45866f20-5d16-4a62-9b0f-e0687d191330', 'Water rates',           9100, 'seed-user-mia',                        'Utilities', 1786800000000),
  ('seed-exp-lightbulbs','45866f20-5d16-4a62-9b0f-e0687d191330', 'Lightbulbs + batteries',1850, 'seed-user-tane',                       'Other',     1786850000000);

INSERT OR REPLACE INTO shopping_item_splits (item_id, user_id) VALUES
  -- Whole flat.
  ('seed-exp-groceries', 'ca5ee514-5318-4936-a766-35863b063404'),
  ('seed-exp-groceries', 'seed-user-mia'),
  ('seed-exp-groceries', 'seed-user-tane'),
  ('seed-exp-groceries', 'seed-user-priya'),
  ('seed-exp-groceries', 'seed-user-liam'),
  ('seed-exp-power',     'ca5ee514-5318-4936-a766-35863b063404'),
  ('seed-exp-power',     'seed-user-mia'),
  ('seed-exp-power',     'seed-user-tane'),
  ('seed-exp-power',     'seed-user-priya'),
  ('seed-exp-power',     'seed-user-liam'),
  ('seed-exp-internet',  'ca5ee514-5318-4936-a766-35863b063404'),
  ('seed-exp-internet',  'seed-user-mia'),
  ('seed-exp-internet',  'seed-user-tane'),
  ('seed-exp-internet',  'seed-user-priya'),
  ('seed-exp-internet',  'seed-user-liam'),
  ('seed-exp-water',     'ca5ee514-5318-4936-a766-35863b063404'),
  ('seed-exp-water',     'seed-user-mia'),
  ('seed-exp-water',     'seed-user-tane'),
  ('seed-exp-water',     'seed-user-priya'),
  ('seed-exp-water',     'seed-user-liam'),
  ('seed-exp-cleaning',  'ca5ee514-5318-4936-a766-35863b063404'),
  ('seed-exp-cleaning',  'seed-user-mia'),
  ('seed-exp-cleaning',  'seed-user-tane'),
  ('seed-exp-cleaning',  'seed-user-priya'),
  ('seed-exp-cleaning',  'seed-user-liam'),
  ('seed-exp-toiletpaper','ca5ee514-5318-4936-a766-35863b063404'),
  ('seed-exp-toiletpaper','seed-user-mia'),
  ('seed-exp-toiletpaper','seed-user-tane'),
  ('seed-exp-toiletpaper','seed-user-priya'),
  ('seed-exp-toiletpaper','seed-user-liam'),
  -- Partial splits: only the people who were actually there / involved.
  ('seed-exp-pizza',     'ca5ee514-5318-4936-a766-35863b063404'),
  ('seed-exp-pizza',     'seed-user-tane'),
  ('seed-exp-pizza',     'seed-user-liam'),
  ('seed-exp-lightbulbs','seed-user-tane'),
  ('seed-exp-lightbulbs','seed-user-priya');

-- ---------------------------------------------------------------------------
-- Settlements — partial paybacks, so balances are netted rather than raw.
-- ---------------------------------------------------------------------------
INSERT OR REPLACE INTO settlements (id, flat_id, from_user_id, to_user_id, amount_cents, note, created_at) VALUES
  ('seed-settle-1', '45866f20-5d16-4a62-9b0f-e0687d191330', 'seed-user-liam',  'ca5ee514-5318-4936-a766-35863b063404', 2500, 'Half of the pizza', 1786900000000),
  ('seed-settle-2', '45866f20-5d16-4a62-9b0f-e0687d191330', 'seed-user-priya', 'seed-user-mia',                        4000, 'Power, partial',    1786950000000),
  ('seed-settle-3', '45866f20-5d16-4a62-9b0f-e0687d191330', 'ca5ee514-5318-4936-a766-35863b063404', 'seed-user-tane',  1800, NULL,                1787000000000);

-- ---------------------------------------------------------------------------
-- Shared shopping checklist (no cost, no split — the other tab).
-- ---------------------------------------------------------------------------
INSERT OR REPLACE INTO shopping_list_items (id, flat_id, name, added_by_user_id, purchased, created_at) VALUES
  ('seed-list-milk',    '45866f20-5d16-4a62-9b0f-e0687d191330', 'Milk',              'seed-user-mia',                        0, 1786900000000),
  ('seed-list-coffee',  '45866f20-5d16-4a62-9b0f-e0687d191330', 'Coffee beans',      'ca5ee514-5318-4936-a766-35863b063404', 0, 1786910000000),
  ('seed-list-dish',    '45866f20-5d16-4a62-9b0f-e0687d191330', 'Dishwasher tablets','seed-user-tane',                       0, 1786920000000),
  ('seed-list-bread',   '45866f20-5d16-4a62-9b0f-e0687d191330', 'Sourdough',         'seed-user-priya',                      0, 1786930000000),
  ('seed-list-oliveoil','45866f20-5d16-4a62-9b0f-e0687d191330', 'Olive oil',         'seed-user-liam',                       1, 1786940000000),
  ('seed-list-sponges', '45866f20-5d16-4a62-9b0f-e0687d191330', 'Sponges',           'seed-user-mia',                        1, 1786950000000);

-- Upvotes drive the list's ordering, so they're deliberately lopsided: coffee
-- is near-unanimous, milk has a couple, sourdough has none.
INSERT OR REPLACE INTO shopping_list_item_upvotes (id, item_id, flat_id, user_id, created_at) VALUES
  ('seed-vote-1', 'seed-list-coffee', '45866f20-5d16-4a62-9b0f-e0687d191330', 'seed-user-mia',                        1786960000000),
  ('seed-vote-2', 'seed-list-coffee', '45866f20-5d16-4a62-9b0f-e0687d191330', 'seed-user-tane',                       1786960100000),
  ('seed-vote-3', 'seed-list-coffee', '45866f20-5d16-4a62-9b0f-e0687d191330', 'seed-user-priya',                      1786960200000),
  ('seed-vote-4', 'seed-list-coffee', '45866f20-5d16-4a62-9b0f-e0687d191330', 'seed-user-liam',                       1786960300000),
  ('seed-vote-5', 'seed-list-milk',   '45866f20-5d16-4a62-9b0f-e0687d191330', 'ca5ee514-5318-4936-a766-35863b063404', 1786960400000),
  ('seed-vote-6', 'seed-list-milk',   '45866f20-5d16-4a62-9b0f-e0687d191330', 'seed-user-liam',                       1786960500000),
  ('seed-vote-7', 'seed-list-dish',   '45866f20-5d16-4a62-9b0f-e0687d191330', 'seed-user-priya',                      1786960600000);

-- ---------------------------------------------------------------------------
-- Calendar. Covers every category, all four recurrences, a multi-day span, an
-- all-day event (NULL time), and a past event. Birthdays are NOT here — the
-- client derives those from users.birthday.
-- ---------------------------------------------------------------------------
INSERT OR REPLACE INTO events (id, flat_id, title, date, end_date, time, recurrence, category, created_by, created_at) VALUES
  ('seed-ev-rent',      '45866f20-5d16-4a62-9b0f-e0687d191330', 'Rent due',              '2026-08-03', NULL,         NULL,    'weekly',      'rent',     'ca5ee514-5318-4936-a766-35863b063404', 1786000000000),
  ('seed-ev-power',     '45866f20-5d16-4a62-9b0f-e0687d191330', 'Power bill',            '2026-08-20', NULL,         NULL,    'monthly',     'power',    'seed-user-mia',                        1786000100000),
  ('seed-ev-internet',  '45866f20-5d16-4a62-9b0f-e0687d191330', 'Internet bill',         '2026-08-12', NULL,         NULL,    'monthly',     'internet', 'seed-user-tane',                       1786000200000),
  ('seed-ev-water',     '45866f20-5d16-4a62-9b0f-e0687d191330', 'Water rates',           '2026-08-28', NULL,         NULL,    'monthly',     'water',    'seed-user-mia',                        1786000300000),
  ('seed-ev-bins',      '45866f20-5d16-4a62-9b0f-e0687d191330', 'Bins out',              '2026-08-04', NULL,         '20:00', 'fortnightly', 'rubbish',  'seed-user-liam',                       1786000400000),
  ('seed-ev-dinner',    '45866f20-5d16-4a62-9b0f-e0687d191330', 'Flat dinner',           '2026-08-21', NULL,         '19:30', NULL,          'social',   'seed-user-priya',                      1786000500000),
  ('seed-ev-tane-away', '45866f20-5d16-4a62-9b0f-e0687d191330', 'Tane away (Wellington)','2026-08-18', '2026-08-23', NULL,    NULL,          NULL,       'seed-user-tane',                       1786000600000),
  ('seed-ev-inspection','45866f20-5d16-4a62-9b0f-e0687d191330', 'Flat inspection',       '2026-08-26', NULL,         '10:00', NULL,          NULL,       'ca5ee514-5318-4936-a766-35863b063404', 1786000700000),
  ('seed-ev-housewarm', '45866f20-5d16-4a62-9b0f-e0687d191330', 'Housewarming',          '2026-08-08', NULL,         '18:00', NULL,          'social',   'seed-user-mia',                        1786000800000),
  ('seed-ev-lease',     '45866f20-5d16-4a62-9b0f-e0687d191330', 'Lease renewal',         '2026-11-01', NULL,         NULL,    'yearly',      NULL,       'ca5ee514-5318-4936-a766-35863b063404', 1786000900000);

-- ---------------------------------------------------------------------------
-- A pending invite, so Settings' invite section isn't empty.
-- ---------------------------------------------------------------------------
INSERT OR REPLACE INTO flat_invites (id, flat_id, email, invited_by, created_at) VALUES
  ('seed-invite-1', '45866f20-5d16-4a62-9b0f-e0687d191330', 'sam@example.com', 'ca5ee514-5318-4936-a766-35863b063404', 1786970000000);
