-- Migration: 20260326000000_add_brand_type_to_brands_down

BEGIN;

DROP INDEX IF EXISTS idx_brands_brand_type_retailer_id;
DROP INDEX IF EXISTS idx_brands_brand_type;

ALTER TABLE brands
  DROP CONSTRAINT IF EXISTS brands_brand_type_retailer_check,
  DROP CONSTRAINT IF EXISTS brands_brand_type_check,
  DROP COLUMN IF EXISTS brand_type_retailer_id,
  DROP COLUMN IF EXISTS brand_type;

DELETE FROM schema_migrations
WHERE version = '20260326000000';

COMMIT;