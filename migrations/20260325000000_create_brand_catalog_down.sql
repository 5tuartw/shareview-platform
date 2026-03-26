-- Migration: 20260325000000_create_brand_catalog_down

BEGIN;

DROP TABLE IF EXISTS retailer_brand_presence;
DROP TABLE IF EXISTS brand_aliases;
DROP TABLE IF EXISTS brands;

DELETE FROM schema_migrations
WHERE version = '20260325000000';

COMMIT;