-- Captures date of birth at signup so age can be derived. Nullable: OAuth
-- signups and existing accounts don't have one on file.
ALTER TABLE users ADD COLUMN birthday TEXT;
