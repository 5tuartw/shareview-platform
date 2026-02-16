-- Migration Version: 20260216000001
-- Description: Add classified_at timestamps to snapshot tables

BEGIN;

ALTER TABLE keywords_snapshots
    ADD COLUMN IF NOT EXISTS classified_at TIMESTAMP;

ALTER TABLE category_performance_snapshots
    ADD COLUMN IF NOT EXISTS classified_at TIMESTAMP;

ALTER TABLE product_performance_snapshots
    ADD COLUMN IF NOT EXISTS classified_at TIMESTAMP;

ALTER TABLE auction_insights_snapshots
    ADD COLUMN IF NOT EXISTS classified_at TIMESTAMP;

ALTER TABLE product_coverage_snapshots
    ADD COLUMN IF NOT EXISTS classified_at TIMESTAMP;

COMMIT;
