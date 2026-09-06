-- Manual drag order for items within a list, same idea as shopping_lists'
-- own `position` for categories. Sort stays upvote-count-first (that's the
-- point of upvoting), with position only breaking ties among items with the
-- same vote count — so this only ever reorders within a tier, never above a
-- more-upvoted item.
ALTER TABLE shopping_list_items ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

-- Backfill so existing items keep their current relative order (oldest
-- first) within each list rather than all colliding at 0.
UPDATE shopping_list_items
SET position = (
  SELECT COUNT(*)
  FROM shopping_list_items AS earlier
  WHERE earlier.list_id = shopping_list_items.list_id
    AND (earlier.created_at < shopping_list_items.created_at
         OR (earlier.created_at = shopping_list_items.created_at AND earlier.id < shopping_list_items.id))
);
