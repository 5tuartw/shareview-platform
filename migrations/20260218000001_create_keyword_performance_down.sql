-- Migration Version: 20260218000001 DOWN
-- Description: Rollback keyword_performance table and mv_keywords_actionable view

BEGIN;

-- Drop the materialized view
DROP MATERIALIZED VIEW IF EXISTS mv_keywords_actionable CASCADE;

-- Drop the keyword_performance table
DROP TABLE IF EXISTS keyword_performance CASCADE;

COMMIT;
