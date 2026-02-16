-- Migration Version: 20260216000000
-- Description: Rollback snapshot tables for ShareView Platform analytics data
-- Dependencies: None

BEGIN;

-- Drop insight tables first (due to foreign key dependencies)
DROP TABLE IF EXISTS insight_evidence CASCADE;
DROP TABLE IF EXISTS insight_runs CASCADE;

-- Drop snapshot tables
DROP TABLE IF EXISTS product_coverage_snapshots CASCADE;
DROP TABLE IF EXISTS auction_insights_snapshots CASCADE;
DROP TABLE IF EXISTS product_performance_snapshots CASCADE;
DROP TABLE IF EXISTS category_performance_snapshots CASCADE;
DROP TABLE IF EXISTS keywords_snapshots CASCADE;

-- Remove snapshot configuration columns from retailer_metadata
ALTER TABLE retailer_metadata 
    DROP COLUMN IF EXISTS snapshot_retention_days,
    DROP COLUMN IF EXISTS snapshot_detail_level,
    DROP COLUMN IF EXISTS snapshot_default_ranges,
    DROP COLUMN IF EXISTS snapshot_enabled;

COMMIT;
