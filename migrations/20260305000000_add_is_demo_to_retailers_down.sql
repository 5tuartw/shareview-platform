-- Migration: 20260305000000_add_is_demo_to_retailers_down

BEGIN;

ALTER TABLE retailers
  DROP COLUMN IF EXISTS is_demo;

DELETE FROM schema_migrations
WHERE version = '20260305000000';

COMMIT;
