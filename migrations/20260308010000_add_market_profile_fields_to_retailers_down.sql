-- Migration: 20260308010000_add_market_profile_fields_to_retailers_down

BEGIN;

DROP INDEX IF EXISTS idx_retailers_profile_domains;
DROP INDEX IF EXISTS idx_retailers_profile_last_ai_at;
DROP INDEX IF EXISTS idx_retailers_profile_status;

ALTER TABLE retailers
  DROP CONSTRAINT IF EXISTS retailers_profile_assignment_mode_check,
  DROP CONSTRAINT IF EXISTS retailers_profile_status_check;

ALTER TABLE retailers
  DROP COLUMN IF EXISTS profile_last_ai_at,
  DROP COLUMN IF EXISTS profile_confirmed_at,
  DROP COLUMN IF EXISTS profile_updated_at,
  DROP COLUMN IF EXISTS profile_domains,
  DROP COLUMN IF EXISTS profile_assignment_mode,
  DROP COLUMN IF EXISTS profile_status;

DELETE FROM schema_migrations
WHERE version = '20260308010000';

COMMIT;
