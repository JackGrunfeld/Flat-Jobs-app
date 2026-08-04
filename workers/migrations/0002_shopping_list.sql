-- Plain shared checklist ("need to buy this"), deliberately separate from
-- shopping_items (which is really a Splitwise-style expense ledger — cost
-- and a split are required on every row there). Two independent features
-- under the same mobile "Shopping" tab, so two independent tables here.
CREATE TABLE shopping_list_items (
  id                TEXT PRIMARY KEY,
  flat_id           TEXT NOT NULL REFERENCES flats(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  added_by_user_id  TEXT NOT NULL REFERENCES users(id),
  purchased         INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL
);
CREATE INDEX idx_shopping_list_items_flat_id ON shopping_list_items(flat_id);
