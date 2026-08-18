-- Onboarding profile + terms acceptance.
--
-- `country` is collected on the post-signup profile step (alongside full name
-- and birthday, which already exist). Nullable because every account created
-- before this migration predates the step — the client treats a NULL country
-- as "profile incomplete" and routes those users through the same screen on
-- their next launch.
ALTER TABLE users ADD COLUMN country TEXT;

-- Terms & Conditions acceptance, recorded at account creation. Storing the
-- timestamp and the version (rather than a bare boolean) so a future revision
-- of the terms can re-prompt only the users who accepted an older one.
ALTER TABLE users ADD COLUMN terms_accepted_at INTEGER;
ALTER TABLE users ADD COLUMN terms_version TEXT;
