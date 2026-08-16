-- purchase_date was added to CREATE TABLE home_assets after
-- some databases already existed. CREATE TABLE IF NOT EXISTS
-- does not add columns to existing tables.

ALTER TABLE home_assets
ADD COLUMN IF NOT EXISTS purchase_date DATE;
