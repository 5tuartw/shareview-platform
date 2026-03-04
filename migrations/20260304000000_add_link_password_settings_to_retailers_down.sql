-- Migration: 20260304000000_add_link_password_settings_to_retailers_down

BEGIN;

ALTER TABLE retailers
  DROP CONSTRAINT IF EXISTS retailers_link_password_mode_check;

ALTER TABLE retailers
  DROP COLUMN IF EXISTS shared_link_password_hash,
  DROP COLUMN IF EXISTS link_password_mode,
  DROP COLUMN IF EXISTS always_password_protect_links;

DELETE FROM schema_migrations
WHERE version = '20260304000000';

COMMIT;
