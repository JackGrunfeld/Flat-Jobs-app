-- Breaks the single shared checklist into named lists ("Shopping", "Drinks",
-- "Household", …) so a flat can group what it needs to buy. Each list is just
-- a name plus a manual `position` — the mobile bar reorders by drag, so the
-- order is user-chosen and has to be stored rather than derived.
CREATE TABLE shopping_lists (
  id          TEXT PRIMARY KEY,
  flat_id     TEXT NOT NULL REFERENCES flats(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  position    INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_shopping_lists_flat_id ON shopping_lists(flat_id, position);

-- Nullable so this can be added to a table that already has rows; the
-- backfill below fills it in, and the API adopts any stragglers on read
-- (see ensureDefaultList) rather than trusting the column to be non-null.
ALTER TABLE shopping_list_items ADD COLUMN list_id TEXT REFERENCES shopping_lists(id) ON DELETE CASCADE;
CREATE INDEX idx_shopping_list_items_list_id ON shopping_list_items(list_id);

-- Every existing flat gets the default "Shopping" list, and everything
-- already on its checklist moves into it — so nobody's list looks emptied
-- out by this migration. The id is derived from the flat id so the API can
-- recreate exactly the same row idempotently.
INSERT INTO shopping_lists (id, flat_id, name, position, created_at)
SELECT 'list-default-' || f.id, f.id, 'Shopping', 0, CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM flats f;

UPDATE shopping_list_items SET list_id = 'list-default-' || flat_id WHERE list_id IS NULL;
