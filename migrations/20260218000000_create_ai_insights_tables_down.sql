-- Migration Version: 20260218000000
-- Description: Drop AI insights tables

BEGIN;

DROP TABLE IF EXISTS insights_generation_jobs CASCADE;
DROP TABLE IF EXISTS ai_insights CASCADE;

COMMIT;
