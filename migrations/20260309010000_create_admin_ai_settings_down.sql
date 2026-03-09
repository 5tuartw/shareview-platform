-- Migration: 20260309010000_create_admin_ai_settings_down

BEGIN;

DROP TABLE IF EXISTS admin_ai_settings;

DELETE FROM schema_migrations
WHERE version = '20260309010000';

COMMIT;
