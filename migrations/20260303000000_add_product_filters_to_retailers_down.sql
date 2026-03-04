-- Migration: 20260303000000_add_product_filters_to_retailers_down

BEGIN;

ALTER TABLE retailers
  DROP COLUMN IF EXISTS product_filters;

DELETE FROM schema_migrations
WHERE version = '20260303000000';

COMMIT;
