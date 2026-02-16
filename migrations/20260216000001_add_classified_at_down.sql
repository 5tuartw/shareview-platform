-- Migration Version: 20260216000001
-- Description: Remove classified_at timestamps from snapshot tables

BEGIN;

ALTER TABLE keywords_snapshots
    DROP COLUMN IF EXISTS classified_at;

ALTER TABLE category_performance_snapshots
    DROP COLUMN IF EXISTS classified_at;

ALTER TABLE product_performance_snapshots
    DROP COLUMN IF EXISTS classified_at;

ALTER TABLE auction_insights_snapshots
    DROP COLUMN IF EXISTS classified_at;

ALTER TABLE product_coverage_snapshots
    DROP COLUMN IF EXISTS classified_at;

COMMIT;
