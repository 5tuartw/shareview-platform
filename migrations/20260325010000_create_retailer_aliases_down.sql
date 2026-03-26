-- Migration: 20260325010000_create_retailer_aliases_down

BEGIN;

DROP TABLE IF EXISTS retailer_aliases;

DELETE FROM schema_migrations
WHERE version = '20260325010000';

COMMIT;