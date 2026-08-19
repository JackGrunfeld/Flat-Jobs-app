-- Seed fixtures for "Jacks flat". Every id is prefixed seed- (plus the
-- default list) so unseed-my-flat.sql can take them all back out again.

INSERT OR REPLACE INTO users (id, email, display_name, created_at, birthday, country, terms_accepted_at, terms_version) VALUES
  ('seed-user-priya', 'priya.raman@testflat.app', 'Priya Raman', 1777885200000, '1997-03-12', 'NZ', 1777885200000, '1.0'),
  ('seed-user-tom', 'tom.whitaker@testflat.app', 'Tom Whitaker', 1777885200000, '1995-09-02', 'NZ', 1777885200000, '1.0'),
  ('seed-user-mia', 'mia.okafor@testflat.app', 'Mia Okafor', 1777885200000, '1999-12-24', 'NZ', 1777885200000, '1.0');

INSERT OR REPLACE INTO flat_members (flat_id, user_id, color, joined_at) VALUES
  ('a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'seed-user-priya', '#53de8d', 1777885200000),
  ('a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'seed-user-tom', '#3cb6e9', 1777885200000),
  ('a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'seed-user-mia', '#e76fe7', 1777885200000);

UPDATE flat_members SET color = '#f17641' WHERE flat_id = 'a66f4f06-b2ac-4827-ae41-3b7350d29fce' AND user_id = '577e7222-d408-4ac1-8726-52fdcfe705f0' AND color IS NULL;

INSERT OR REPLACE INTO chores (id, flat_id, name, description, frequency, created_at) VALUES
  ('seed-chore-dishes', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Wash dishes', 'After dinner, including the pans', 'Daily', 1777885200000),
  ('seed-chore-bins', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Take out bins', 'Tuesday night, kerbside by 7am', 'Weekly', 1777885201000),
  ('seed-chore-vacuum', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Vacuum lounge', 'Rug and under the couch', 'Weekly', 1777885202000),
  ('seed-chore-bath', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Clean bathroom', 'Shower, sink, floor', 'Weekly', 1777885203000),
  ('seed-chore-oven', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Clean oven', 'Deep clean, trays included', 'Monthly', 1777885204000),
  ('seed-chore-recycle', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Sort recycling', 'Flatten boxes, rinse the glass', 'Monthly', 1777885205000);

INSERT OR REPLACE INTO chore_members (chore_id, user_id) VALUES
  ('seed-chore-bath', '577e7222-d408-4ac1-8726-52fdcfe705f0'),
  ('seed-chore-bath', 'seed-user-priya'),
  ('seed-chore-recycle', 'seed-user-tom'),
  ('seed-chore-recycle', 'seed-user-mia');

INSERT OR REPLACE INTO chore_completions (chore_id, week, assigned_user_id, done, updated_at) VALUES
  ('seed-chore-dishes', 102, 'seed-user-tom', 1, 1786698000000),
  ('seed-chore-dishes', 103, 'seed-user-mia', 1, 1786784400000),
  ('seed-chore-dishes', 104, '577e7222-d408-4ac1-8726-52fdcfe705f0', 1, 1786870800000),
  ('seed-chore-dishes', 105, 'seed-user-priya', 1, 1786957200000),
  ('seed-chore-dishes', 106, 'seed-user-tom', 1, 1787043600000),
  ('seed-chore-bins', 12, '577e7222-d408-4ac1-8726-52fdcfe705f0', 1, 1785142800000),
  ('seed-chore-vacuum', 12, 'seed-user-priya', 1, 1785142800000),
  ('seed-chore-bath', 12, '577e7222-d408-4ac1-8726-52fdcfe705f0', 1, 1785142800000),
  ('seed-chore-bins', 13, 'seed-user-priya', 1, 1785747600000),
  ('seed-chore-vacuum', 13, 'seed-user-tom', 1, 1785747600000),
  ('seed-chore-bath', 13, 'seed-user-priya', 1, 1785747600000),
  ('seed-chore-bins', 14, 'seed-user-tom', 1, 1786352400000),
  ('seed-chore-vacuum', 14, 'seed-user-mia', 1, 1786352400000),
  ('seed-chore-bath', 14, '577e7222-d408-4ac1-8726-52fdcfe705f0', 1, 1786352400000),
  ('seed-chore-bins', 15, 'seed-user-mia', 1, 1787043600000),
  ('seed-chore-oven', 1, 'seed-user-priya', 1, 1781514000000),
  ('seed-chore-oven', 2, 'seed-user-tom', 1, 1784106000000);

INSERT OR REPLACE INTO events (id, flat_id, title, date, time, category, recurrence, end_date, created_by, created_at) VALUES
  ('seed-event-rent', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Rent due', '2026-08-01', NULL, 'rent', 'monthly', NULL, '577e7222-d408-4ac1-8726-52fdcfe705f0', 1777885200000),
  ('seed-event-power', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Power bill', '2026-08-20', NULL, 'power', 'monthly', NULL, 'seed-user-tom', 1777885200000),
  ('seed-event-internet', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Internet bill', '2026-08-24', NULL, 'internet', 'monthly', NULL, 'seed-user-tom', 1777885200000),
  ('seed-event-water', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Water bill', '2026-09-02', NULL, 'water', 'monthly', NULL, 'seed-user-priya', 1777885200000),
  ('seed-event-rubbish', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Rubbish collection', '2026-08-18', '07:00', 'rubbish', 'weekly', NULL, 'seed-user-mia', 1777885200000),
  ('seed-event-dinner', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Flat dinner', '2026-08-21', '19:30', 'social', NULL, NULL, 'seed-user-priya', 1777885200000),
  ('seed-event-movie', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Movie night', '2026-08-26', '20:00', 'social', 'fortnightly', NULL, 'seed-user-mia', 1777885200000),
  ('seed-event-inspect', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Landlord inspection', '2026-09-08', '10:00', NULL, NULL, NULL, '577e7222-d408-4ac1-8726-52fdcfe705f0', 1777885200000),
  ('seed-event-trip', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Mia away — Queenstown', '2026-08-28', NULL, NULL, NULL, '2026-08-31', 'seed-user-mia', 1777885200000),
  ('seed-event-party', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Flat warming', '2026-09-12', '18:00', 'social', NULL, NULL, '577e7222-d408-4ac1-8726-52fdcfe705f0', 1777885200000);

INSERT OR REPLACE INTO shopping_lists (id, flat_id, name, position, created_at) VALUES
  ('list-default-a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Shopping', 0, 1777885200000),
  ('seed-list-drinks', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Drinks', 1, 1777885200000),
  ('seed-list-household', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Household', 2, 1777885200000),
  ('seed-list-bbq', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'BBQ Saturday', 3, 1777885200000);

INSERT OR REPLACE INTO shopping_list_items (id, flat_id, list_id, name, added_by_user_id, purchased, created_at) VALUES
  ('seed-li-milk', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'list-default-a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Milk (2L, blue top)', '577e7222-d408-4ac1-8726-52fdcfe705f0', 0, 1777885200000),
  ('seed-li-bread', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'list-default-a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Sourdough', 'seed-user-priya', 0, 1777885201000),
  ('seed-li-eggs', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'list-default-a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Free range eggs', 'seed-user-tom', 0, 1777885202000),
  ('seed-li-coffee', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'list-default-a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Coffee beans', 'seed-user-mia', 0, 1777885203000),
  ('seed-li-pasta', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'list-default-a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Pasta', '577e7222-d408-4ac1-8726-52fdcfe705f0', 1, 1777885204000),
  ('seed-li-spinach', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'list-default-a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Baby spinach', 'seed-user-priya', 0, 1777885205000),
  ('seed-li-beer', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'seed-list-drinks', 'Lager, 12 pack', 'seed-user-tom', 0, 1777885206000),
  ('seed-li-wine', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'seed-list-drinks', 'Sav blanc', 'seed-user-mia', 0, 1777885207000),
  ('seed-li-tonic', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'seed-list-drinks', 'Tonic water', '577e7222-d408-4ac1-8726-52fdcfe705f0', 1, 1777885208000),
  ('seed-li-dish', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'seed-list-household', 'Dishwasher tablets', '577e7222-d408-4ac1-8726-52fdcfe705f0', 0, 1777885209000),
  ('seed-li-loo', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'seed-list-household', 'Toilet paper', 'seed-user-priya', 0, 1777885210000),
  ('seed-li-bin', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'seed-list-household', 'Bin liners', 'seed-user-tom', 1, 1777885211000),
  ('seed-li-bulb', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'seed-list-household', 'Hallway light bulb', 'seed-user-mia', 0, 1777885212000),
  ('seed-li-snags', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'seed-list-bbq', 'Sausages', 'seed-user-mia', 0, 1777885213000),
  ('seed-li-buns', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'seed-list-bbq', 'Buns', '577e7222-d408-4ac1-8726-52fdcfe705f0', 0, 1777885214000),
  ('seed-li-salad', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'seed-list-bbq', 'Bag salad', 'seed-user-tom', 0, 1777885215000),
  ('seed-li-ice', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'seed-list-bbq', 'Ice', 'seed-user-priya', 0, 1777885216000);

INSERT OR REPLACE INTO shopping_list_item_upvotes (id, item_id, flat_id, user_id, created_at) VALUES
  ('seed-vote-0', 'seed-li-coffee', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', '577e7222-d408-4ac1-8726-52fdcfe705f0', 1777885200000),
  ('seed-vote-1', 'seed-li-coffee', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'seed-user-tom', 1777885201000),
  ('seed-vote-2', 'seed-li-coffee', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'seed-user-priya', 1777885202000),
  ('seed-vote-3', 'seed-li-milk', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'seed-user-mia', 1777885203000),
  ('seed-vote-4', 'seed-li-beer', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', '577e7222-d408-4ac1-8726-52fdcfe705f0', 1777885204000),
  ('seed-vote-5', 'seed-li-beer', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'seed-user-mia', 1777885205000),
  ('seed-vote-6', 'seed-li-loo', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', '577e7222-d408-4ac1-8726-52fdcfe705f0', 1777885206000),
  ('seed-vote-7', 'seed-li-snags', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'seed-user-tom', 1777885207000);

INSERT OR REPLACE INTO shopping_items (id, flat_id, name, cost_cents, added_by_user_id, category, created_at) VALUES
  ('seed-exp-groceries', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Weekly groceries', 8450, '577e7222-d408-4ac1-8726-52fdcfe705f0', 'Food', 1786784400000),
  ('seed-exp-power', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Power bill (July)', 14290, 'seed-user-tom', 'Utilities', 1785920400000),
  ('seed-exp-internet', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Internet (August)', 8500, 'seed-user-tom', 'Utilities', 1786179600000),
  ('seed-exp-cleaning', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Cleaning supplies', 3260, 'seed-user-priya', 'Household', 1786438800000),
  ('seed-exp-takeaway', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Friday takeaways', 6800, 'seed-user-mia', 'Food', 1786698000000),
  ('seed-exp-toilet', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Toilet paper (24)', 2199, '577e7222-d408-4ac1-8726-52fdcfe705f0', 'Household', 1785661200000),
  ('seed-exp-bbq', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'BBQ gas bottle', 4500, 'seed-user-priya', 'Other', 1785315600000),
  ('seed-exp-coffee', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'Coffee beans (1kg)', 3400, 'seed-user-mia', 'Food', 1786957200000);

INSERT OR REPLACE INTO shopping_item_splits (item_id, user_id) VALUES
  ('seed-exp-groceries', '577e7222-d408-4ac1-8726-52fdcfe705f0'),
  ('seed-exp-groceries', 'seed-user-priya'),
  ('seed-exp-groceries', 'seed-user-tom'),
  ('seed-exp-groceries', 'seed-user-mia'),
  ('seed-exp-power', '577e7222-d408-4ac1-8726-52fdcfe705f0'),
  ('seed-exp-power', 'seed-user-priya'),
  ('seed-exp-power', 'seed-user-tom'),
  ('seed-exp-power', 'seed-user-mia'),
  ('seed-exp-internet', '577e7222-d408-4ac1-8726-52fdcfe705f0'),
  ('seed-exp-internet', 'seed-user-priya'),
  ('seed-exp-internet', 'seed-user-tom'),
  ('seed-exp-internet', 'seed-user-mia'),
  ('seed-exp-cleaning', '577e7222-d408-4ac1-8726-52fdcfe705f0'),
  ('seed-exp-cleaning', 'seed-user-priya'),
  ('seed-exp-cleaning', 'seed-user-tom'),
  ('seed-exp-cleaning', 'seed-user-mia'),
  ('seed-exp-takeaway', '577e7222-d408-4ac1-8726-52fdcfe705f0'),
  ('seed-exp-takeaway', 'seed-user-mia'),
  ('seed-exp-takeaway', 'seed-user-tom'),
  ('seed-exp-toilet', '577e7222-d408-4ac1-8726-52fdcfe705f0'),
  ('seed-exp-toilet', 'seed-user-priya'),
  ('seed-exp-toilet', 'seed-user-tom'),
  ('seed-exp-toilet', 'seed-user-mia'),
  ('seed-exp-bbq', '577e7222-d408-4ac1-8726-52fdcfe705f0'),
  ('seed-exp-bbq', 'seed-user-priya'),
  ('seed-exp-bbq', 'seed-user-tom'),
  ('seed-exp-bbq', 'seed-user-mia'),
  ('seed-exp-coffee', '577e7222-d408-4ac1-8726-52fdcfe705f0'),
  ('seed-exp-coffee', 'seed-user-mia');

INSERT OR REPLACE INTO settlements (id, flat_id, from_user_id, to_user_id, amount_cents, note, created_at) VALUES
  ('seed-settle-1', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', '577e7222-d408-4ac1-8726-52fdcfe705f0', 'seed-user-tom', 4000, 'Part of the power bill', 1786525200000),
  ('seed-settle-2', 'a66f4f06-b2ac-4827-ae41-3b7350d29fce', 'seed-user-mia', '577e7222-d408-4ac1-8726-52fdcfe705f0', 1500, 'Groceries last week', 1786870800000);

