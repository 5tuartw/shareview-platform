-- Migration: 20260309000000_add_profile_last_ai_response_to_retailers_down

BEGIN;

DROP INDEX IF EXISTS idx_retailers_profile_last_ai_model;

ALTER TABLE retailers
  DROP COLUMN IF EXISTS profile_last_ai_model,
  DROP COLUMN IF EXISTS profile_last_ai_response;

DELETE FROM schema_migrations
WHERE version = '20260309000000';

COMMIT;
