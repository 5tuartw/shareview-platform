-- Migration: 20260323000000_add_keyword_word_analysis_snapshots_down

BEGIN;

DROP TABLE IF EXISTS keyword_word_analysis_snapshots;

DELETE FROM schema_migrations
WHERE version = '20260323000000';

COMMIT;