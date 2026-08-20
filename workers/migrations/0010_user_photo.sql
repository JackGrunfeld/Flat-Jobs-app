-- Profile photo, stored inline on the user row as a `data:image/jpeg;base64,…`
-- URI rather than in object storage.
--
-- The client downscales to a 256px square before uploading, which lands around
-- 15–25KB of base64 — small enough to ride along on /auth/me and the flat
-- members list without a second round trip per avatar, and well inside D1's
-- row limit. If photos ever need to be full-size, this becomes an R2 key and
-- the column holds a URL instead; nothing outside these two endpoints reads it.
ALTER TABLE users ADD COLUMN photo TEXT;
