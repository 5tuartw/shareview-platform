-- Migration: 20260326000000_add_brand_type_to_brands_up

BEGIN;

ALTER TABLE brands
  ADD COLUMN brand_type VARCHAR(32) NOT NULL DEFAULT '3rd_party',
  ADD COLUMN brand_type_retailer_id VARCHAR(50) REFERENCES retailers(retailer_id) ON DELETE SET NULL;

ALTER TABLE brands
  ADD CONSTRAINT brands_brand_type_check CHECK (
    brand_type IN ('3rd_party', 'retailer_exclusive', 'retailer_owned')
  ),
  ADD CONSTRAINT brands_brand_type_retailer_check CHECK (
    (brand_type = '3rd_party' AND brand_type_retailer_id IS NULL)
    OR (brand_type <> '3rd_party' AND brand_type_retailer_id IS NOT NULL)
  );

CREATE INDEX idx_brands_brand_type
  ON brands (brand_type);

CREATE INDEX idx_brands_brand_type_retailer_id
  ON brands (brand_type_retailer_id)
  WHERE brand_type_retailer_id IS NOT NULL;

COMMENT ON COLUMN brands.brand_type IS
  'ShareView brand classification for staff workflows: 3rd_party, retailer_exclusive, or retailer_owned.';

COMMENT ON COLUMN brands.brand_type_retailer_id IS
  'Retailer associated with a retailer_exclusive or retailer_owned brand classification.';

INSERT INTO schema_migrations (version, description, applied_at)
VALUES ('20260326000000', 'Add brand classification fields to brands', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;