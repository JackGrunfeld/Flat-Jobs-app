-- Local-only dev fixtures for "Test Flat" (id 4301f781-b18c-442e-aafc-62a88c33e81d,
-- owner 70fbdb1e-213a-44be-9ddc-3a51567ce3e6 / b29576@t.com). Fills it with
-- flatmates, chores + rotation history, a shopping checklist with upvotes,
-- Splitwise-style bills/expenses, settlements, and calendar events so the app
-- looks lived-in when signed in as that account against local wrangler dev.
--
-- Apply with:
--   npx wrangler d1 execute flat-jobs-db --local --file seed-test-flat.sql
--
-- NEVER run this against --remote. The seeded users have NULL password
-- columns, so they can't be logged into — they exist to be flatmates.
--
-- Re-runnable: every statement is idempotent (DELETE of the seeded rows first,
-- then INSERT OR REPLACE), so applying it twice doesn't double up.
--
-- Period indices below are pinned to 2026-09-04 against roster.ts's baseDate
-- of 2026-05-04: day 123, week 17, month 4. Chore completions are keyed by
-- getPeriodIndex(frequency, date), which is the *day* index for Daily chores
-- and the *month* index for Monthly ones — not the week.

-- ---------------------------------------------------------------------------
-- Clean out anything a previous run of this file created.
-- ---------------------------------------------------------------------------
DELETE FROM shopping_list_item_upvotes WHERE user_id LIKE 'seed-tf-%' OR item_id LIKE 'seed-tf-%';
DELETE FROM shopping_item_splits       WHERE user_id LIKE 'seed-tf-%' OR item_id LIKE 'seed-tf-%';
DELETE FROM chore_completions          WHERE chore_id LIKE 'seed-tf-%';
DELETE FROM chore_members              WHERE chore_id LIKE 'seed-tf-%' OR user_id LIKE 'seed-tf-%';
DELETE FROM chores                     WHERE id LIKE 'seed-tf-%';
DELETE FROM shopping_items             WHERE id LIKE 'seed-tf-%';
DELETE FROM shopping_list_items        WHERE id LIKE 'seed-tf-%';
DELETE FROM shopping_lists             WHERE id LIKE 'seed-tf-%';
DELETE FROM settlements                WHERE id LIKE 'seed-tf-%';
DELETE FROM events                     WHERE id LIKE 'seed-tf-%';
DELETE FROM flat_invites               WHERE id LIKE 'seed-tf-%';
DELETE FROM flat_members               WHERE user_id LIKE 'seed-tf-%';
DELETE FROM users                      WHERE id LIKE 'seed-tf-%';

-- ---------------------------------------------------------------------------
-- Flatmates. Password columns stay NULL (same shape as an OAuth-only account).
-- ---------------------------------------------------------------------------
INSERT OR REPLACE INTO users (id, email, display_name, created_at, birthday, country, terms_accepted_at, terms_version) VALUES
  ('seed-tf-ana',  'ana@example.com',  'Ana Petrov',   1782864000000, '1998-04-12', 'NZ', 1782864000000, '1.0'),
  ('seed-tf-noah', 'noah@example.com', 'Noah Baxter',  1782864000000, '1997-09-01', 'NZ', 1782864000000, '1.0'),
  ('seed-tf-zoe',  'zoe@example.com',  'Zoe Marsh',    1782864000000, '2000-12-05', 'AU', 1782864000000, '1.0');

-- Colours are MEMBER_PRESETS entries, spaced around the hue circle.
INSERT OR REPLACE INTO flat_members (flat_id, user_id, color, joined_at) VALUES
  ('4301f781-b18c-442e-aafc-62a88c33e81d', 'seed-tf-ana',  '#53de8d', 1782864000000),
  ('4301f781-b18c-442e-aafc-62a88c33e81d', 'seed-tf-noah', '#3cb6e9', 1782864000000),
  ('4301f781-b18c-442e-aafc-62a88c33e81d', 'seed-tf-zoe',  '#e76fe7', 1782864000000);

-- Give the owner a colour too, so every avatar on the roster is filled.
UPDATE flat_members
   SET color = '#f17641'
 WHERE user_id = '70fbdb1e-213a-44be-9ddc-3a51567ce3e6' AND color IS NULL;

-- ---------------------------------------------------------------------------
-- Chores, across all three frequencies.
-- ---------------------------------------------------------------------------
INSERT OR REPLACE INTO chores (id, flat_id, name, description, frequency, created_at) VALUES
  ('seed-tf-chore-dishes',   '4301f781-b18c-442e-aafc-62a88c33e81d', 'Dishes',              'Empty the rack too, not just the sink.', 'Daily',   1782864000000),
  ('seed-tf-chore-bins',     '4301f781-b18c-442e-aafc-62a88c33e81d', 'Rubbish & recycling', 'Kerbside Tuesday night.',                'Weekly',  1782864100000),
  ('seed-tf-chore-bathroom', '4301f781-b18c-442e-aafc-62a88c33e81d', 'Bathroom',            'Shower, sink, mirror, floor.',           'Weekly',  1782864200000),
  ('seed-tf-chore-vacuum',   '4301f781-b18c-442e-aafc-62a88c33e81d', 'Vacuum common areas', NULL,                                     'Weekly',  1782864300000),
  ('seed-tf-chore-oven',     '4301f781-b18c-442e-aafc-62a88c33e81d', 'Deep clean oven',     'The one nobody wants.',                  'Monthly', 1782864400000),
  ('seed-tf-chore-fridge',   '4301f781-b18c-442e-aafc-62a88c33e81d', 'Clear out fridge',    'Bin anything past its date.',            'Monthly', 1782864500000);

-- An empty chore_members set means "whole flat rotation pool" — bins and
-- fridge are left unassigned to exercise that path. The rest are scoped.
INSERT OR REPLACE INTO chore_members (chore_id, user_id) VALUES
  ('seed-tf-chore-bathroom', 'seed-tf-ana'),
  ('seed-tf-chore-bathroom', 'seed-tf-zoe'),
  ('seed-tf-chore-vacuum',   '70fbdb1e-213a-44be-9ddc-3a51567ce3e6'),
  ('seed-tf-chore-vacuum',   'seed-tf-noah'),
  ('seed-tf-chore-oven',     '70fbdb1e-213a-44be-9ddc-3a51567ce3e6'),
  ('seed-tf-chore-oven',     'seed-tf-ana'),
  ('seed-tf-chore-oven',     'seed-tf-noah'),
  ('seed-tf-chore-oven',     'seed-tf-zoe');

-- Completion history. Keyed by (chore_id, period) where period is the day
-- index for Daily, week index for Weekly, month index for Monthly.
-- Current: day 123, week 17, month 4.
INSERT OR REPLACE INTO chore_completions (chore_id, week, assigned_user_id, done, updated_at) VALUES
  -- Daily dishes: the last five days, mostly done, today still outstanding.
  ('seed-tf-chore-dishes',   119, 'seed-tf-ana',                          1, 1788048000000),
  ('seed-tf-chore-dishes',   120, 'seed-tf-noah',                         1, 1788134400000),
  ('seed-tf-chore-dishes',   121, 'seed-tf-zoe',                          1, 1788220800000),
  ('seed-tf-chore-dishes',   122, '70fbdb1e-213a-44be-9ddc-3a51567ce3e6', 1, 1788307200000),
  ('seed-tf-chore-dishes',   123, 'seed-tf-ana',                          0, 1788393600000),
  -- Weekly chores: previous weeks done, this week a mix.
  ('seed-tf-chore-bins',      15, 'seed-tf-noah',                         1, 1787184000000),
  ('seed-tf-chore-bins',      16, 'seed-tf-zoe',                          1, 1787788800000),
  ('seed-tf-chore-bins',      17, '70fbdb1e-213a-44be-9ddc-3a51567ce3e6', 0, 1788393600000),
  ('seed-tf-chore-bathroom',  16, 'seed-tf-ana',                          1, 1787788800000),
  ('seed-tf-chore-bathroom',  17, 'seed-tf-zoe',                          1, 1788307200000),
  ('seed-tf-chore-vacuum',    16, '70fbdb1e-213a-44be-9ddc-3a51567ce3e6', 1, 1787788800000),
  ('seed-tf-chore-vacuum',    17, 'seed-tf-noah',                         0, 1788393600000),
  -- Monthly: last month done, this month outstanding.
  ('seed-tf-chore-oven',       3, 'seed-tf-zoe',                          1, 1786000000000),
  ('seed-tf-chore-oven',       4, 'seed-tf-ana',                          0, 1788393600000),
  ('seed-tf-chore-fridge',     3, 'seed-tf-noah',                         1, 1786500000000);

-- ---------------------------------------------------------------------------
-- Shared shopping checklist, split across the default list plus a couple of
-- named ones.
-- ---------------------------------------------------------------------------
INSERT OR REPLACE INTO shopping_lists (id, flat_id, name, position, created_at) VALUES
  ('list-default-4301f781-b18c-442e-aafc-62a88c33e81d', '4301f781-b18c-442e-aafc-62a88c33e81d', 'Shopping',  0, 1782864000000),
  ('seed-tf-list-drinks',                                '4301f781-b18c-442e-aafc-62a88c33e81d', 'Drinks',    1, 1782864000000),
  ('seed-tf-list-household',                             '4301f781-b18c-442e-aafc-62a88c33e81d', 'Household', 2, 1782864000000);

INSERT OR REPLACE INTO shopping_list_items (id, flat_id, list_id, name, added_by_user_id, purchased, created_at) VALUES
  ('seed-tf-li-milk',    '4301f781-b18c-442e-aafc-62a88c33e81d', 'list-default-4301f781-b18c-442e-aafc-62a88c33e81d', 'Milk',               'seed-tf-ana',                          0, 1787616000000),
  ('seed-tf-li-coffee',  '4301f781-b18c-442e-aafc-62a88c33e81d', 'list-default-4301f781-b18c-442e-aafc-62a88c33e81d', 'Coffee beans',       '70fbdb1e-213a-44be-9ddc-3a51567ce3e6', 0, 1787702400000),
  ('seed-tf-li-bread',   '4301f781-b18c-442e-aafc-62a88c33e81d', 'list-default-4301f781-b18c-442e-aafc-62a88c33e81d', 'Sourdough',          'seed-tf-noah',                         0, 1787788800000),
  ('seed-tf-li-eggs',    '4301f781-b18c-442e-aafc-62a88c33e81d', 'list-default-4301f781-b18c-442e-aafc-62a88c33e81d', 'Free range eggs',    'seed-tf-zoe',                          1, 1787875200000),
  ('seed-tf-li-beer',    '4301f781-b18c-442e-aafc-62a88c33e81d', 'seed-tf-list-drinks',                                'Lager, 12 pack',     'seed-tf-noah',                         0, 1787961600000),
  ('seed-tf-li-wine',    '4301f781-b18c-442e-aafc-62a88c33e81d', 'seed-tf-list-drinks',                                'Sav blanc',          'seed-tf-zoe',                          0, 1788048000000),
  ('seed-tf-li-dish',    '4301f781-b18c-442e-aafc-62a88c33e81d', 'seed-tf-list-household',                             'Dishwasher tablets', '70fbdb1e-213a-44be-9ddc-3a51567ce3e6', 0, 1788134400000),
  ('seed-tf-li-loo',     '4301f781-b18c-442e-aafc-62a88c33e81d', 'seed-tf-list-household',                             'Toilet paper',       'seed-tf-ana',                          1, 1788220800000);

-- Upvotes drive the list's ordering, so they're deliberately lopsided.
INSERT OR REPLACE INTO shopping_list_item_upvotes (id, item_id, flat_id, user_id, created_at) VALUES
  ('seed-tf-vote-1', 'seed-tf-li-coffee', '4301f781-b18c-442e-aafc-62a88c33e81d', 'seed-tf-ana',                          1788300000000),
  ('seed-tf-vote-2', 'seed-tf-li-coffee', '4301f781-b18c-442e-aafc-62a88c33e81d', 'seed-tf-noah',                         1788300100000),
  ('seed-tf-vote-3', 'seed-tf-li-coffee', '4301f781-b18c-442e-aafc-62a88c33e81d', 'seed-tf-zoe',                          1788300200000),
  ('seed-tf-vote-4', 'seed-tf-li-milk',   '4301f781-b18c-442e-aafc-62a88c33e81d', '70fbdb1e-213a-44be-9ddc-3a51567ce3e6', 1788300300000),
  ('seed-tf-vote-5', 'seed-tf-li-beer',   '4301f781-b18c-442e-aafc-62a88c33e81d', 'seed-tf-zoe',                          1788300400000);

-- ---------------------------------------------------------------------------
-- Splitwise-style expenses/bills. Every category is represented, splits are
-- uneven on purpose so the balances screen has something real to net out.
-- ---------------------------------------------------------------------------
INSERT OR REPLACE INTO shopping_items (id, flat_id, name, cost_cents, added_by_user_id, category, created_at) VALUES
  ('seed-tf-exp-groceries',  '4301f781-b18c-442e-aafc-62a88c33e81d', 'Countdown shop',        13580, '70fbdb1e-213a-44be-9ddc-3a51567ce3e6', 'Food',      1787616000000),
  ('seed-tf-exp-power',      '4301f781-b18c-442e-aafc-62a88c33e81d', 'Power bill — August',   17200, 'seed-tf-ana',                          'Utilities', 1787702400000),
  ('seed-tf-exp-internet',   '4301f781-b18c-442e-aafc-62a88c33e81d', 'Internet — August',      8999, 'seed-tf-noah',                         'Utilities', 1787788800000),
  ('seed-tf-exp-cleaning',   '4301f781-b18c-442e-aafc-62a88c33e81d', 'Cleaning supplies',      3150, 'seed-tf-zoe',                          'Household', 1787875200000),
  ('seed-tf-exp-toiletpaper','4301f781-b18c-442e-aafc-62a88c33e81d', 'Toilet paper (bulk)',    2899, '70fbdb1e-213a-44be-9ddc-3a51567ce3e6', 'Household', 1787961600000),
  ('seed-tf-exp-takeaway',   '4301f781-b18c-442e-aafc-62a88c33e81d', 'Friday takeaways',       6450, 'seed-tf-noah',                         'Food',      1788048000000),
  ('seed-tf-exp-water',      '4301f781-b18c-442e-aafc-62a88c33e81d', 'Water rates',            8900, 'seed-tf-ana',                          'Utilities', 1788134400000),
  ('seed-tf-exp-lightbulbs', '4301f781-b18c-442e-aafc-62a88c33e81d', 'Lightbulbs + batteries', 1750, 'seed-tf-zoe',                          'Other',     1788220800000);

INSERT OR REPLACE INTO shopping_item_splits (item_id, user_id) VALUES
  -- Whole flat.
  ('seed-tf-exp-groceries', '70fbdb1e-213a-44be-9ddc-3a51567ce3e6'),
  ('seed-tf-exp-groceries', 'seed-tf-ana'),
  ('seed-tf-exp-groceries', 'seed-tf-noah'),
  ('seed-tf-exp-groceries', 'seed-tf-zoe'),
  ('seed-tf-exp-power',     '70fbdb1e-213a-44be-9ddc-3a51567ce3e6'),
  ('seed-tf-exp-power',     'seed-tf-ana'),
  ('seed-tf-exp-power',     'seed-tf-noah'),
  ('seed-tf-exp-power',     'seed-tf-zoe'),
  ('seed-tf-exp-internet',  '70fbdb1e-213a-44be-9ddc-3a51567ce3e6'),
  ('seed-tf-exp-internet',  'seed-tf-ana'),
  ('seed-tf-exp-internet',  'seed-tf-noah'),
  ('seed-tf-exp-internet',  'seed-tf-zoe'),
  ('seed-tf-exp-water',     '70fbdb1e-213a-44be-9ddc-3a51567ce3e6'),
  ('seed-tf-exp-water',     'seed-tf-ana'),
  ('seed-tf-exp-water',     'seed-tf-noah'),
  ('seed-tf-exp-water',     'seed-tf-zoe'),
  ('seed-tf-exp-cleaning',  '70fbdb1e-213a-44be-9ddc-3a51567ce3e6'),
  ('seed-tf-exp-cleaning',  'seed-tf-ana'),
  ('seed-tf-exp-cleaning',  'seed-tf-noah'),
  ('seed-tf-exp-cleaning',  'seed-tf-zoe'),
  ('seed-tf-exp-toiletpaper','70fbdb1e-213a-44be-9ddc-3a51567ce3e6'),
  ('seed-tf-exp-toiletpaper','seed-tf-ana'),
  ('seed-tf-exp-toiletpaper','seed-tf-noah'),
  ('seed-tf-exp-toiletpaper','seed-tf-zoe'),
  -- Partial splits: only the people who were actually there / involved.
  ('seed-tf-exp-takeaway',   'seed-tf-noah'),
  ('seed-tf-exp-takeaway',   'seed-tf-zoe'),
  ('seed-tf-exp-lightbulbs', 'seed-tf-ana'),
  ('seed-tf-exp-lightbulbs', 'seed-tf-zoe');

-- ---------------------------------------------------------------------------
-- Settlements — partial paybacks, so balances are netted rather than raw.
-- ---------------------------------------------------------------------------
INSERT OR REPLACE INTO settlements (id, flat_id, from_user_id, to_user_id, amount_cents, note, created_at) VALUES
  ('seed-tf-settle-1', '4301f781-b18c-442e-aafc-62a88c33e81d', 'seed-tf-noah', '70fbdb1e-213a-44be-9ddc-3a51567ce3e6', 3000, 'Half of groceries', 1788134400000),
  ('seed-tf-settle-2', '4301f781-b18c-442e-aafc-62a88c33e81d', 'seed-tf-zoe',  'seed-tf-ana',                          4000, 'Power, partial',    1788220800000);

-- ---------------------------------------------------------------------------
-- Calendar. Covers rent/bills/social/rubbish categories, recurrence, a
-- multi-day span, an all-day event, and a past event.
-- ---------------------------------------------------------------------------
INSERT OR REPLACE INTO events (id, flat_id, title, date, end_date, time, recurrence, category, created_by, created_at) VALUES
  ('seed-tf-ev-rent',      '4301f781-b18c-442e-aafc-62a88c33e81d', 'Rent due',             '2026-09-01', NULL,         NULL,    'monthly',     'rent',     '70fbdb1e-213a-44be-9ddc-3a51567ce3e6', 1786000000000),
  ('seed-tf-ev-power',     '4301f781-b18c-442e-aafc-62a88c33e81d', 'Power bill',           '2026-09-20', NULL,         NULL,    'monthly',     'power',    'seed-tf-ana',                          1786000100000),
  ('seed-tf-ev-internet',  '4301f781-b18c-442e-aafc-62a88c33e81d', 'Internet bill',        '2026-09-12', NULL,         NULL,    'monthly',     'internet', 'seed-tf-noah',                         1786000200000),
  ('seed-tf-ev-water',     '4301f781-b18c-442e-aafc-62a88c33e81d', 'Water rates',          '2026-09-28', NULL,         NULL,    'monthly',     'water',    'seed-tf-ana',                          1786000300000),
  ('seed-tf-ev-bins',      '4301f781-b18c-442e-aafc-62a88c33e81d', 'Bins out',             '2026-09-08', NULL,         '20:00', 'fortnightly', 'rubbish',  'seed-tf-zoe',                          1786000400000),
  ('seed-tf-ev-dinner',    '4301f781-b18c-442e-aafc-62a88c33e81d', 'Flat dinner',          '2026-09-11', NULL,         '19:30', NULL,          'social',   'seed-tf-noah',                         1786000500000),
  ('seed-tf-ev-away',      '4301f781-b18c-442e-aafc-62a88c33e81d', 'Noah away (Wellington)','2026-09-15', '2026-09-19', NULL,   NULL,          NULL,       'seed-tf-noah',                         1786000600000),
  ('seed-tf-ev-inspection','4301f781-b18c-442e-aafc-62a88c33e81d', 'Flat inspection',      '2026-09-24', NULL,         '10:00', NULL,          NULL,       '70fbdb1e-213a-44be-9ddc-3a51567ce3e6', 1786000700000),
  ('seed-tf-ev-housewarm', '4301f781-b18c-442e-aafc-62a88c33e81d', 'Housewarming',         '2026-08-29', NULL,         '18:00', NULL,          'social',   'seed-tf-ana',                          1786000800000),
  ('seed-tf-ev-lease',     '4301f781-b18c-442e-aafc-62a88c33e81d', 'Lease renewal',        '2026-12-01', NULL,         NULL,    'yearly',      NULL,       '70fbdb1e-213a-44be-9ddc-3a51567ce3e6', 1786000900000);

-- ---------------------------------------------------------------------------
-- A pending invite, so Settings' invite section isn't empty.
-- ---------------------------------------------------------------------------
INSERT OR REPLACE INTO flat_invites (id, flat_id, email, invited_by, created_at) VALUES
  ('seed-tf-invite-1', '4301f781-b18c-442e-aafc-62a88c33e81d', 'sam@example.com', '70fbdb1e-213a-44be-9ddc-3a51567ce3e6', 1788300000000);
