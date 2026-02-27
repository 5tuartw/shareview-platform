-- Migration Version: 20260227000000
-- Description: Add include_insights, insights_require_approval, is_archived to reports;
--              add report_id FK to retailer_access_tokens

BEGIN;

ALTER TABLE reports ADD COLUMN include_insights BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE reports ADD COLUMN insights_require_approval BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE reports ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE retailer_access_tokens ADD COLUMN report_id INTEGER REFERENCES reports(id) ON DELETE SET NULL;

CREATE INDEX idx_retailer_access_tokens_report_id ON retailer_access_tokens(report_id);

COMMIT;
