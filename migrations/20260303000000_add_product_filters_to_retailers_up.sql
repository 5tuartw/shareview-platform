-- Migration: 20260303000000_add_product_filters_to_retailers_up
-- Adds retailer-level product exclusion filters to mirror keyword exclusions.

BEGIN;

ALTER TABLE retailers
  ADD COLUMN IF NOT EXISTS product_filters TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE retailers
SET product_filters = ARRAY[]::TEXT[]
WHERE product_filters IS NULL;

INSERT INTO schema_migrations (version, description, applied_at)
VALUES ('20260303000000', 'Add product_filters to retailers config', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;
