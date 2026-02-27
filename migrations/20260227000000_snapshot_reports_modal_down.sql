-- Migration Version: 20260227000000 (down)
-- Description: Revert include_insights, insights_require_approval, is_archived and report_id FK

BEGIN;

DROP INDEX IF EXISTS idx_retailer_access_tokens_report_id;

ALTER TABLE retailer_access_tokens DROP COLUMN IF EXISTS report_id;

ALTER TABLE reports DROP COLUMN IF EXISTS is_archived;
ALTER TABLE reports DROP COLUMN IF EXISTS insights_require_approval;
ALTER TABLE reports DROP COLUMN IF EXISTS include_insights;

COMMIT;
