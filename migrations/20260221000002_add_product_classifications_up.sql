-- Add product classification groups to product_performance_snapshots
-- Similar to keywords quadrants but tailored for product performance analysis
-- ============================================================================

BEGIN;

-- Add classification columns
ALTER TABLE product_performance_snapshots
    ADD COLUMN IF NOT EXISTS total_impressions BIGINT,
    ADD COLUMN IF NOT EXISTS total_clicks BIGINT,
    ADD COLUMN IF NOT EXISTS products_with_conversions INT,
    ADD COLUMN IF NOT EXISTS products_with_clicks_no_conversions INT,
    ADD COLUMN IF NOT EXISTS clicks_without_conversions INT,
    ADD COLUMN IF NOT EXISTS product_classifications JSONB;

-- Update comments
COMMENT ON COLUMN product_performance_snapshots.product_classifications IS 'JSONB with 4 classification groups: {top_converters: [], lowest_converters: [], top_click_through: [], high_impressions_no_clicks: []}';
COMMENT ON COLUMN product_performance_snapshots.products_with_conversions IS 'Count of products that had at least one conversion';
COMMENT ON COLUMN product_performance_snapshots.products_with_clicks_no_conversions IS 'Count of products with clicks but zero conversions';
COMMENT ON COLUMN product_performance_snapshots.clicks_without_conversions IS 'Total clicks on products with zero conversions';

COMMIT;
