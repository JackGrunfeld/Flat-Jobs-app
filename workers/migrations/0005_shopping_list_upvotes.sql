-- Lets flatmates upvote a shopping list item instead of re-adding a
-- duplicate row (the API auto-casts a vote when someone adds a name that's
-- already on the list); also what the list sorts "top of the list" by. One
-- row per (item, user), toggled on/off from the client.
CREATE TABLE shopping_list_item_upvotes (
  id          TEXT PRIMARY KEY,
  item_id     TEXT NOT NULL REFERENCES shopping_list_items(id) ON DELETE CASCADE,
  flat_id     TEXT NOT NULL REFERENCES flats(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id),
  created_at  INTEGER NOT NULL,
  UNIQUE(item_id, user_id)
);
CREATE INDEX idx_shopping_list_item_upvotes_item_id ON shopping_list_item_upvotes(item_id);
