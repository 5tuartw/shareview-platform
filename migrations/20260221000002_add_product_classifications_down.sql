-- Remove product classification groups from product_performance_snapshots
-- ============================================================================

BEGIN;

ALTER TABLE product_performance_snapshots
    DROP COLUMN IF EXISTS total_impressions,
    DROP COLUMN IF EXISTS total_clicks,
    DROP COLUMN IF EXISTS products_with_conversions,
    DROP COLUMN IF EXISTS products_with_clicks_no_conversions,
    DROP COLUMN IF EXISTS clicks_without_conversions,
    DROP COLUMN IF EXISTS product_classifications;

COMMIT;
