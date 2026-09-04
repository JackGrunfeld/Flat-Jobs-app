-- Home Hub fields: free-text info about the flat itself, editable from
-- Settings and (address only) seeded at flat creation. All nullable — no
-- flat has any of this until someone fills it in.
ALTER TABLE flats ADD COLUMN address TEXT;
ALTER TABLE flats ADD COLUMN wifi_name TEXT;
ALTER TABLE flats ADD COLUMN wifi_password TEXT;
ALTER TABLE flats ADD COLUMN landlord_details TEXT;
ALTER TABLE flats ADD COLUMN important_info TEXT;
