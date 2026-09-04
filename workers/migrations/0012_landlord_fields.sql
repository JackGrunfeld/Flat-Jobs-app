-- Splits the single landlord_details blob into its three actual fields —
-- name, phone, email — each independently editable from Home Info. The old
-- column is dropped: nothing had shipped reading it outside this feature.
ALTER TABLE flats DROP COLUMN landlord_details;
ALTER TABLE flats ADD COLUMN landlord_name TEXT;
ALTER TABLE flats ADD COLUMN landlord_phone TEXT;
ALTER TABLE flats ADD COLUMN landlord_email TEXT;
