-- Removes everything seed-my-flat.sql added. Ordered children-first because
-- D1 does not enforce ON DELETE CASCADE unless foreign keys are on.
--
--   npx wrangler d1 execute flat-jobs-db --remote --file unseed-my-flat.sql

DELETE FROM shopping_list_item_upvotes WHERE id LIKE 'seed-%';
DELETE FROM shopping_list_items        WHERE id LIKE 'seed-%';
DELETE FROM shopping_lists             WHERE id LIKE 'seed-%';
DELETE FROM shopping_item_splits       WHERE item_id LIKE 'seed-%';
DELETE FROM shopping_items             WHERE id LIKE 'seed-%';
DELETE FROM settlements                WHERE id LIKE 'seed-%';
DELETE FROM chore_completions          WHERE chore_id LIKE 'seed-%';
DELETE FROM chore_members              WHERE chore_id LIKE 'seed-%';
DELETE FROM chores                     WHERE id LIKE 'seed-%';
DELETE FROM events                     WHERE id LIKE 'seed-%';
DELETE FROM flat_members               WHERE user_id LIKE 'seed-user-%';
DELETE FROM users                      WHERE id LIKE 'seed-user-%';

-- The default list and anything still in it are left alone: the app recreates
-- that list on read anyway, so dropping it here would only churn its id.
