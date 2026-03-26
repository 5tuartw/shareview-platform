-- Migration: 20260326010000_add_keyword_brand_split_snapshots_down

BEGIN;

DROP TABLE IF EXISTS keyword_brand_split_term_snapshots;
DROP TABLE IF EXISTS keyword_brand_split_snapshots;

DELETE FROM schema_migrations
WHERE version = '20260326010000';

COMMIT;