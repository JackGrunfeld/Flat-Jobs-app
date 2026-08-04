-- Splitwise expenses get a category (Food / Utilities / Household / Other)
-- so the list reads as organised shared spending, not an arbitrary item
-- feed. Defaulted rather than nullable so existing rows stay valid.
ALTER TABLE shopping_items ADD COLUMN category TEXT NOT NULL DEFAULT 'Other';
