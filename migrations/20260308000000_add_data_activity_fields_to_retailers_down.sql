-- Migration: 20260308000000_add_data_activity_fields_to_retailers_down

BEGIN;

DROP INDEX IF EXISTS idx_retailers_last_data_date;
DROP INDEX IF EXISTS idx_retailers_data_activity_status;

ALTER TABLE retailers
  DROP CONSTRAINT IF EXISTS retailers_data_activity_status_check;

ALTER TABLE retailers
  DROP COLUMN IF EXISTS last_data_date,
  DROP COLUMN IF EXISTS data_activity_status;

DELETE FROM schema_migrations
WHERE version = '20260308000000';

COMMIT;
